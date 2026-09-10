import type { paths } from 'api-client'

import { api } from '../../../shared/lib/api-client'

export type CreatedImport =
  paths['/imports']['post']['responses'][202]['content']['application/json']

export async function submitImport(
  file: File,
  sourceType: string | null,
): Promise<CreatedImport> {
  const form = new FormData()
  if (sourceType !== null) {
    form.append('sourceType', sourceType)
  }
  form.append('file', file)

  // The streaming upload route documents only its 202 response, so the
  // generated contract types this request body as `never`
  // (docs/features/imports-endpoint.md). The FormData still goes through the
  // generated client; only its compile-time type is widened here.
  const { data, error } = await api.POST('/imports', {
    body: form as unknown as never,
  })

  if (error !== undefined || data === undefined) {
    throw new Error('The upload failed. Check the file and try again.')
  }
  return data
}
