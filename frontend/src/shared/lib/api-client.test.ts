import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const openapiPath = fileURLToPath(
  new URL('../../../../packages/api-client/openapi.json', import.meta.url),
)

type OpenApiDocument = {
  readonly paths: Record<string, { readonly get?: unknown }>
  readonly components: {
    readonly schemas: Record<
      string,
      { readonly properties?: Record<string, unknown> }
    >
  }
}

describe('generated api client', () => {
  it('carries the GET /logs contract in the committed openapi document', () => {
    const doc = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDocument

    expect(doc.paths['/logs']?.get).toBeDefined()
    expect(doc.components.schemas.LogListResponse?.properties?.records).toBeDefined()
    expect(doc.components.schemas.LogListQuery).toBeDefined()
  })
})
