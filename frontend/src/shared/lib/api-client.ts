import type { paths } from 'api-client'
import createClient from 'openapi-fetch'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

export const api = createClient<paths>({ baseUrl })

export type LogListResponse =
  paths['/logs']['get']['responses'][200]['content']['application/json']

export type LogRecord = LogListResponse['records'][number]

export type LogListQuery = NonNullable<
  paths['/logs']['get']['parameters']['query']
>
