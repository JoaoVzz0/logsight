import type { paths } from 'api-client'

import { api } from '../../../shared/lib/api-client'

export type ImportStatus =
  paths['/imports/{id}']['get']['responses'][200]['content']['application/json']

export async function fetchImport(id: string): Promise<ImportStatus> {
  const { data, error } = await api.GET('/imports/{id}', {
    params: { path: { id } },
  })

  if (error !== undefined || data === undefined) {
    throw new Error('Could not load the import status.')
  }
  return data
}
