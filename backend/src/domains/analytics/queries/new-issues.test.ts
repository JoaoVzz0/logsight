import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  resetAnalyticsData,
  seedAnalytics,
} from './__test-helpers__/seed-analytics'
import { newIssues } from './new-issues'

const prisma = new PrismaClient()

beforeEach(() => resetAnalyticsData(prisma))
afterAll(() => prisma.$disconnect())

describe('newIssues', () => {
  it('returns issues whose first_seen falls within the window, with the display fields', async () => {
    await seedAnalytics(prisma, {
      issues: [
        {
          fingerprint: 'fp-in',
          sampleMessage: 'connection timeout',
          severityNumber: 17,
          firstSeen: '2026-02-01T12:00:00.000Z',
          eventCount: 5,
        },
        {
          fingerprint: 'fp-before',
          firstSeen: '2026-01-01T00:00:00.000Z',
        },
        {
          fingerprint: 'fp-after',
          firstSeen: '2026-03-01T00:00:00.000Z',
        },
      ],
      records: [],
    })

    const result = await newIssues(prisma, {
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-02T00:00:00.000Z',
    })

    expect(result.issues).toEqual([
      {
        fingerprint: 'fp-in',
        sampleMessage: 'connection timeout',
        severity: 17,
        eventCount: 5,
        firstSeen: '2026-02-01T12:00:00.000Z',
      },
    ])
  })
})
