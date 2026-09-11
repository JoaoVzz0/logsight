import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  resetAnalyticsData,
  seedAnalytics,
} from './__test-helpers__/seed-analytics'
import { topIssues } from './top-issues'

const prisma = new PrismaClient()

beforeEach(() => resetAnalyticsData(prisma))
afterAll(() => prisma.$disconnect())

function recordsFor(
  fingerprint: string,
  count: number,
  day: string,
): { fingerprint: string; ts: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    fingerprint,
    ts: new Date(`${day}T00:${String(index % 60).padStart(2, '0')}:00.000Z`).toISOString(),
  }))
}

describe('topIssues', () => {
  it('orders issues by event count within the window, descending and limited', async () => {
    await seedAnalytics(prisma, {
      issues: [
        { fingerprint: 'fp-low', sampleMessage: 'low', firstSeen: '2026-02-01T00:00:00.000Z' },
        { fingerprint: 'fp-high', sampleMessage: 'high', firstSeen: '2026-02-01T00:00:00.000Z' },
        { fingerprint: 'fp-mid', sampleMessage: 'mid', firstSeen: '2026-02-01T00:00:00.000Z' },
      ],
      records: [
        ...recordsFor('fp-low', 1, '2026-02-01'),
        ...recordsFor('fp-high', 5, '2026-02-01'),
        ...recordsFor('fp-mid', 3, '2026-02-01'),
      ],
    })

    const result = await topIssues(prisma, {
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-02T00:00:00.000Z',
      limit: 2,
    })

    expect(result.issues).toEqual([
      expect.objectContaining({ fingerprint: 'fp-high', eventCount: 5 }),
      expect.objectContaining({ fingerprint: 'fp-mid', eventCount: 3 }),
    ])
  })
})
