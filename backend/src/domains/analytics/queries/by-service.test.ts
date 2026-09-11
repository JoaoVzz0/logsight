import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  resetAnalyticsData,
  seedAnalytics,
} from './__test-helpers__/seed-analytics'
import { byService } from './by-service'

const prisma = new PrismaClient()

beforeEach(() => resetAnalyticsData(prisma))
afterAll(() => prisma.$disconnect())

describe('byService', () => {
  it('returns total and error counts per service, ordered by volume, with a null service as its own unknown bucket', async () => {
    await seedAnalytics(prisma, {
      issues: [{ fingerprint: 'fp-a', firstSeen: '2026-02-01T00:00:00.000Z' }],
      records: [
        { fingerprint: 'fp-a', ts: '2026-02-01T00:00:00.000Z', serviceName: 'checkout', severityNumber: 9 },
        { fingerprint: 'fp-a', ts: '2026-02-01T00:01:00.000Z', serviceName: 'checkout', severityNumber: 17 },
        { fingerprint: 'fp-a', ts: '2026-02-01T00:02:00.000Z', serviceName: 'checkout', severityNumber: 21 },
        { fingerprint: 'fp-a', ts: '2026-02-01T00:03:00.000Z', serviceName: 'billing', severityNumber: 9 },
        { fingerprint: 'fp-a', ts: '2026-02-01T00:04:00.000Z', serviceName: null, severityNumber: 17 },
      ],
    })

    const result = await byService(prisma, {
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-01T01:00:00.000Z',
    })

    expect(result.services).toEqual([
      { serviceName: 'checkout', total: 3, errors: 2 },
      { serviceName: 'billing', total: 1, errors: 0 },
      { serviceName: 'unknown', total: 1, errors: 1 },
    ])
  })
})
