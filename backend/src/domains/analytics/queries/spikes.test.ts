import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  resetAnalyticsData,
  seedAnalytics,
} from './__test-helpers__/seed-analytics'
import { spikes } from './spikes'

const prisma = new PrismaClient()

beforeEach(() => resetAnalyticsData(prisma))
afterAll(() => prisma.$disconnect())

function recordsAt(
  fingerprint: string,
  timestamps: readonly string[],
): { fingerprint: string; ts: string }[] {
  return timestamps.map((ts) => ({ fingerprint, ts }))
}

describe('spikes', () => {
  it('returns only issues whose current-window rate is at least 3x the previous window, with the multiplier', async () => {
    await seedAnalytics(prisma, {
      issues: [
        { fingerprint: 'fp-spike', sampleMessage: 'spiking', firstSeen: '2026-01-01T00:00:00.000Z' },
        { fingerprint: 'fp-steady', sampleMessage: 'steady', firstSeen: '2026-01-01T00:00:00.000Z' },
      ],
      records: [
        ...recordsAt('fp-spike', [
          '2026-02-01T11:00:00.000Z',
          '2026-02-01T11:05:00.000Z',
        ]),
        ...recordsAt('fp-spike', [
          '2026-02-01T12:00:00.000Z',
          '2026-02-01T12:05:00.000Z',
          '2026-02-01T12:10:00.000Z',
          '2026-02-01T12:15:00.000Z',
          '2026-02-01T12:20:00.000Z',
          '2026-02-01T12:25:00.000Z',
        ]),
        ...recordsAt('fp-steady', [
          '2026-02-01T11:00:00.000Z',
          '2026-02-01T11:05:00.000Z',
        ]),
        ...recordsAt('fp-steady', [
          '2026-02-01T12:00:00.000Z',
          '2026-02-01T12:05:00.000Z',
          '2026-02-01T12:10:00.000Z',
        ]),
      ],
    })

    const result = await spikes(prisma, {
      from: '2026-02-01T12:00:00.000Z',
      to: '2026-02-01T13:00:00.000Z',
    })

    expect(result.issues).toEqual([
      expect.objectContaining({
        fingerprint: 'fp-spike',
        currentCount: 6,
        previousCount: 2,
        multiplier: 3,
      }),
    ])
  })

  it('compares against the window of equal duration immediately preceding the current one', async () => {
    await seedAnalytics(prisma, {
      issues: [
        { fingerprint: 'fp-a', sampleMessage: 'a', firstSeen: '2026-01-01T00:00:00.000Z' },
      ],
      records: [
        { fingerprint: 'fp-a', ts: '2026-02-01T09:59:59.999Z' },
        ...recordsAt('fp-a', [
          '2026-02-01T10:00:00.000Z',
          '2026-02-01T10:10:00.000Z',
          '2026-02-01T10:20:00.000Z',
        ]),
        ...recordsAt('fp-a', [
          '2026-02-01T11:00:00.000Z',
          '2026-02-01T11:10:00.000Z',
          '2026-02-01T11:20:00.000Z',
          '2026-02-01T11:30:00.000Z',
          '2026-02-01T11:40:00.000Z',
          '2026-02-01T11:50:00.000Z',
          '2026-02-01T11:55:00.000Z',
          '2026-02-01T11:58:00.000Z',
          '2026-02-01T11:59:00.000Z',
        ]),
      ],
    })

    const result = await spikes(prisma, {
      from: '2026-02-01T11:00:00.000Z',
      to: '2026-02-01T12:00:00.000Z',
    })

    expect(result.issues).toEqual([
      expect.objectContaining({
        fingerprint: 'fp-a',
        currentCount: 9,
        previousCount: 3,
      }),
    ])
  })
})
