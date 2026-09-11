import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../../http/app'

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.logRecord.deleteMany()
  await prisma.issue.deleteMany()
  await prisma.importJob.deleteMany()
})

afterAll(() => prisma.$disconnect())

type SwaggerParameter = { readonly name: string }

type SwaggerDocument = {
  readonly components: {
    readonly schemas: Record<string, unknown>
  }
  readonly paths: Record<
    string,
    {
      readonly get?: {
        readonly parameters?: readonly SwaggerParameter[]
      }
    }
  >
}

describe('analytics routes', () => {
  it('registers a named response schema for each of the five queries', async () => {
    const app = await buildApp({ prisma })
    await app.ready()

    const document = app.swagger() as unknown as SwaggerDocument
    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining([
        'ErrorRateResponse',
        'NewIssuesResponse',
        'TopIssuesResponse',
        'SpikesResponse',
        'ByServiceResponse',
      ]),
    )
    await app.close()
  })

  it('exposes each query as a GET endpoint with from/to validated by Zod, described in the OpenAPI document', async () => {
    const app = await buildApp({ prisma })
    await app.ready()

    const document = app.swagger() as unknown as SwaggerDocument
    const routes = [
      '/analytics/error-rate',
      '/analytics/new-issues',
      '/analytics/top-issues',
      '/analytics/spikes',
      '/analytics/by-service',
    ]

    for (const route of routes) {
      const names = (document.paths[route]?.get?.parameters ?? []).map(
        (parameter) => parameter.name,
      )
      expect(names).toEqual(expect.arrayContaining(['from', 'to']))
    }

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/error-rate?from=not-a-timestamp&to=2026-01-01T00:00:00.000Z',
    })
    expect(response.statusCode).toBe(400)

    await app.close()
  })
})
