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

export type ErrorRateResponse =
  paths['/analytics/error-rate']['get']['responses'][200]['content']['application/json']

export type NewIssuesResponse =
  paths['/analytics/new-issues']['get']['responses'][200]['content']['application/json']

export type TopIssuesResponse =
  paths['/analytics/top-issues']['get']['responses'][200]['content']['application/json']

export type SpikesResponse =
  paths['/analytics/spikes']['get']['responses'][200]['content']['application/json']

export type ByServiceResponse =
  paths['/analytics/by-service']['get']['responses'][200]['content']['application/json']

export type IssueSummary = NewIssuesResponse['issues'][number]

export type IssueListResponse =
  paths['/issues']['get']['responses'][200]['content']['application/json']

export type IssueListItem = IssueListResponse['issues'][number]

export type IssueListQuery = NonNullable<
  paths['/issues']['get']['parameters']['query']
>
