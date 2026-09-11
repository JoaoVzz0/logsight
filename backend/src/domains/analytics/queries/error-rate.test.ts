import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  resetAnalyticsData,
  seedAnalytics,
} from './__test-helpers__/seed-analytics'
import { errorRate } from './error-rate'

const prisma = new PrismaClient()

beforeEach(() => resetAnalyticsData(prisma))
afterAll(() => prisma.$disconnect())

describe('errorRate', () => {
  it('returns per-bucket total events, error events and the error/total ratio', async () => {
    await seedAnalytics(prisma, {
      issues: [{ fingerprint: 'fp-a', firstSeen: '2026-02-01T00:00:00.000Z' }],
      records: [
        { fingerprint: 'fp-a', ts: '2026-02-01T00:10:05.000Z', severityNumber: 9 },
        { fingerprint: 'fp-a', ts: '2026-02-01T00:10:20.000Z', severityNumber: 17 },
        { fingerprint: 'fp-a', ts: '2026-02-01T00:10:40.000Z', severityNumber: 21 },
      ],
    })

    const result = await errorRate(prisma, {
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-01T01:00:00.000Z',
    })

    const bucket = result.buckets.find(
      (candidate) => candidate.total > 0,
    )
    expect(bucket).toBeDefined()
    expect(bucket?.total).toBe(3)
    expect(bucket?.errors).toBe(2)
    expect(bucket?.ratio).toBeCloseTo(2 / 3)
  })

  it('buckets a 20-minute window by minute and a 20-day window by day', async () => {
    await seedAnalytics(prisma, { issues: [], records: [] })

    const short = await errorRate(prisma, {
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-01T00:20:00.000Z',
    })
    const shortSpacingMs =
      new Date(short.buckets[1]?.bucket ?? '').getTime() -
      new Date(short.buckets[0]?.bucket ?? '').getTime()
    expect(shortSpacingMs).toBe(60_000)

    const long = await errorRate(prisma, {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-21T00:00:00.000Z',
    })
    const longSpacingMs =
      new Date(long.buckets[1]?.bucket ?? '').getTime() -
      new Date(long.buckets[0]?.bucket ?? '').getTime()
    expect(longSpacingMs).toBe(24 * 60 * 60 * 1000)
  })

  it('fills a bucket with no events as zero rather than omitting it', async () => {
    await seedAnalytics(prisma, {
      issues: [{ fingerprint: 'fp-a', firstSeen: '2026-02-01T00:00:00.000Z' }],
      records: [
        { fingerprint: 'fp-a', ts: '2026-02-01T00:00:00.000Z', severityNumber: 9 },
      ],
    })

    const result = await errorRate(prisma, {
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-01T00:05:00.000Z',
    })

    expect(result.buckets).toHaveLength(5)
    const empty = result.buckets.slice(1)
    for (const bucket of empty) {
      expect(bucket.total).toBe(0)
      expect(bucket.errors).toBe(0)
      expect(bucket.ratio).toBe(0)
    }
  })
})
