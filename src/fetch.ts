import {info, exportVariable, debug} from '@actions/core'
import {mkdirP} from '@actions/io'
import 'cross-fetch/polyfill'
import {promises as fs} from 'fs'
import {render} from 'mustache'
import retryRequest from 'async-retry'
import {DataInterface, ExportInterface, Status} from './constants'
import {parseData} from './util'

/* Fetches or Posts data to an API. If auth is provided it will replace the mustache variables with the data from it. */
export async function retrieveData({
  debug: requestDebug,
  endpoint,
  configuration,
  auth,
  isTokenRequest,
  retry
}: DataInterface): Promise<string> {
  try {
    info(
      isTokenRequest
        ? 'Fetching credentials from the token endpoint… 🎟️'
        : 'Fetching the requested data… 📦'
    )

    const settings = configuration
      ? JSON.parse(render(configuration, auth ? parseData(auth) : null))
      : {}

    if (settings.body) {
      // Ensures the body is stringified in the case of a post request being made.
      settings.body = JSON.stringify(settings.body)
    }

    return await retryRequest(
      async () => {
        // If anything throws the request is retried.
        const response = await fetch(endpoint, settings)
        const data = await response.text()

        if (!response.ok) {
          throw new Error(data)
        }

        if (requestDebug) {
          info('📡  Request Response Debug: ')
          info(JSON.stringify(data))
        }

        return data
      },
      {
        retries: retry ? 3 : 0,
        onRetry: (error: Error) => {
          debug(error.message)
          info(`There was an error with the request, retrying… ⏳`)
        }
      }
    )
  } catch (error) {
    throw new Error(`There was an error fetching from the API: ${error} ❌`)
  }
}

/* Saves the data to the local file system and exports an environment variable containing the retrieved data. */
export async function generateExport({
  data,
  encoding,
  format,
  saveLocation,
  saveName,
  setOutput
}: ExportInterface): Promise<Status> {
  info('Saving the data... 📁')
  const file = `${saveLocation ? saveLocation : 'fetch-api-data-action'}/${
    saveName ? saveName : 'data'
  }.${format ? format : 'json'}`
  const dataEncoding = encoding ? encoding : 'utf8'

  try {
    await mkdirP(`${saveLocation ? saveLocation : 'fetch-api-data-action'}`)
    await fs.writeFile(file, data, dataEncoding)

    info(`Saved ${file} 💾`)

    if (setOutput) {
      exportVariable('fetch-api-data', data)
    }

    return Status.SUCCESS
  } catch (error) {
    throw new Error(
      `There was an error generating the export file: ${error} ❌`
    )
  }
}
