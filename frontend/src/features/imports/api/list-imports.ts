import type { paths } from 'api-client'

import { api } from '../../../shared/lib/api-client'

export type ImportSummary =
  paths['/imports']['get']['responses'][200]['content']['application/json']['imports'][number]

export async function fetchImports(): Promise<ImportSummary[]> {
  const { data, error } = await api.GET('/imports')

  if (error !== undefined || data === undefined) {
    throw new Error('Could not load the import history.')
  }
  return data.imports
}
