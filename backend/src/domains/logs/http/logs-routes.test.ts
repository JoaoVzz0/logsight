import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../../http/app'

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.logRecord.deleteMany()
  await prisma.issue.deleteMany()
  await prisma.importJob.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})

type SwaggerParameter = { readonly name: string }

type SwaggerDocument = {
  readonly components: {
    readonly schemas: Record<
      string,
      { readonly properties?: Record<string, unknown> }
    >
  }
  readonly paths: Record<
    string,
    {
      readonly get?: {
        readonly parameters?: readonly SwaggerParameter[]
        readonly responses?: Record<
          string,
          {
            readonly content?: Record<
              string,
              { readonly schema?: { readonly $ref?: string } }
            >
          }
        >
      }
    }
  >
}

describe('GET /logs', () => {
  it('rejects a query parameter that violates the schema with 400 naming the field', async () => {
    const app = await buildApp({ prisma })
    const response = await app.inject({
      method: 'GET',
      url: '/logs?from=not-a-timestamp',
    })

    expect(response.statusCode).toBe(400)
    expect(response.body).toContain('from')
    await app.close()
  })

  it('rejects a limit outside the 1..200 range with 400', async () => {
    const app = await buildApp({ prisma })
    const response = await app.inject({ method: 'GET', url: '/logs?limit=201' })

    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('rejects a malformed cursor with 400 rather than an empty page or a 500', async () => {
    const app = await buildApp({ prisma })
    const response = await app.inject({
      method: 'GET',
      url: '/logs?cursor=not-a-real-cursor',
    })

    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('returns an empty page with status 200 when the time range is inverted', async () => {
    const app = await buildApp({ prisma })
    const response = await app.inject({
      method: 'GET',
      url: '/logs?from=2026-01-02T00:00:00.000Z&to=2026-01-01T00:00:00.000Z',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ records: [], nextCursor: null })
    await app.close()
  })

  it('serves the openapi document at /docs and describes GET /logs with its query parameters', async () => {
    const app = await buildApp({ prisma })
    await app.ready()

    const docs = await app.inject({ method: 'GET', url: '/docs' })
    expect(docs.statusCode).not.toBe(404)

    const document = app.swagger() as unknown as SwaggerDocument
    const names = (document.paths['/logs']?.get?.parameters ?? []).map(
      (parameter) => parameter.name,
    )
    expect(names).toEqual(
      expect.arrayContaining([
        'level',
        'from',
        'to',
        'service',
        'q',
        'limit',
        'cursor',
      ]),
    )
    await app.close()
  })

  it('exposes the request and response contract as named schemas', async () => {
    const app = await buildApp({ prisma })
    await app.ready()

    const document = app.swagger() as unknown as SwaggerDocument
    expect(document.components.schemas.LogListQuery).toBeDefined()
    expect(
      document.components.schemas.LogListResponse?.properties?.records,
    ).toBeDefined()

    const content = document.paths['/logs']?.get?.responses?.['200']?.content
    const ref = content
      ? Object.values(content)[0]?.schema?.$ref
      : undefined
    expect(ref).toBe('#/components/schemas/LogListResponse')
    await app.close()
  })
})
