import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../../http/app'

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.logRecord.deleteMany()
  await prisma.issue.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})

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

describe('GET /issues', () => {
  it('rejects a severity value outside the range with 400 naming the field', async () => {
    const app = await buildApp({ prisma })
    const response = await app.inject({
      method: 'GET',
      url: '/issues?severity=99',
    })

    expect(response.statusCode).toBe(400)
    expect(response.body).toContain('severity')
    await app.close()
  })

  it('returns issues ordered by lastSeen descending as named IssueListResponse in the OpenAPI document at /docs', async () => {
    await prisma.issue.create({
      data: {
        fingerprint: 'fp-http',
        sampleMessage: 'checkout failed',
        severityNumber: 17,
        firstSeen: new Date('2026-09-08T10:00:00.000Z'),
        lastSeen: new Date('2026-09-08T10:00:00.000Z'),
        eventCount: 1n,
        affectedServices: [],
      },
    })

    const app = await buildApp({ prisma })
    await app.ready()

    const docs = await app.inject({ method: 'GET', url: '/docs' })
    expect(docs.statusCode).not.toBe(404)

    const document = app.swagger() as unknown as SwaggerDocument
    expect(document.components.schemas.IssueListResponse?.properties?.issues).toBeDefined()

    const content = document.paths['/issues']?.get?.responses?.['200']?.content
    const ref = content ? Object.values(content)[0]?.schema?.$ref : undefined
    expect(ref).toBe('#/components/schemas/IssueListResponse')

    const response = await app.inject({ method: 'GET', url: '/issues' })
    expect(response.statusCode).toBe(200)
    expect(response.json().issues[0]).toMatchObject({ fingerprint: 'fp-http' })

    await app.close()
  })
})
