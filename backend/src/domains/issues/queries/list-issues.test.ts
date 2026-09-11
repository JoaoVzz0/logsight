import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { listIssues } from './list-issues'

const prisma = new PrismaClient()

type SeedRow = {
  readonly fingerprint: string
  readonly sampleMessage?: string
  readonly severityNumber?: number | null
  readonly firstSeen: string
  readonly lastSeen: string
  readonly eventCount?: number
  readonly affectedServices?: string[]
  readonly status?: 'UNRESOLVED' | 'RESOLVED' | 'IGNORED'
  readonly regression?: boolean
}

beforeEach(async () => {
  await prisma.logRecord.deleteMany()
  await prisma.issue.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function seed(rows: readonly SeedRow[]): Promise<void> {
  for (const row of rows) {
    await prisma.issue.create({
      data: {
        fingerprint: row.fingerprint,
        sampleMessage: row.sampleMessage ?? `sample for ${row.fingerprint}`,
        severityNumber: row.severityNumber ?? null,
        firstSeen: new Date(row.firstSeen),
        lastSeen: new Date(row.lastSeen),
        eventCount: BigInt(row.eventCount ?? 1),
        affectedServices: row.affectedServices ?? [],
        status: row.status ?? 'UNRESOLVED',
        regression: row.regression ?? false,
      },
    })
  }
}

describe('listIssues', () => {
  it('projects issue rows straight to the DTO with the expected fields', async () => {
    await seed([
      {
        fingerprint: 'fp-1',
        sampleMessage: 'checkout failed for order 4471',
        severityNumber: 17,
        firstSeen: '2026-09-08T10:00:00.000Z',
        lastSeen: '2026-09-08T12:00:00.000Z',
        eventCount: 42,
        affectedServices: ['checkout', 'billing'],
        status: 'RESOLVED',
        regression: true,
      },
    ])

    const result = await listIssues(prisma, {})

    expect(result.issues).toEqual([
      {
        fingerprint: 'fp-1',
        sampleMessage: 'checkout failed for order 4471',
        severityNumber: 17,
        eventCount: 42,
        firstSeen: '2026-09-08T10:00:00.000Z',
        lastSeen: '2026-09-08T12:00:00.000Z',
        affectedServices: ['checkout', 'billing'],
        status: 'resolved',
        regression: true,
      },
    ])
  })

  it('orders issues by lastSeen descending by default', async () => {
    await seed([
      { fingerprint: 'fp-old', firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z' },
      { fingerprint: 'fp-new', firstSeen: '2026-01-02T00:00:00.000Z', lastSeen: '2026-03-01T00:00:00.000Z' },
      { fingerprint: 'fp-mid', firstSeen: '2026-01-03T00:00:00.000Z', lastSeen: '2026-02-01T00:00:00.000Z' },
    ])

    const result = await listIssues(prisma, {})

    expect(result.issues.map((issue) => issue.fingerprint)).toEqual([
      'fp-new',
      'fp-mid',
      'fp-old',
    ])
  })

  it('filters by the supplied service and severity levels together', async () => {
    await seed([
      {
        fingerprint: 'fp-a',
        firstSeen: '2026-01-01T00:00:00.000Z',
        lastSeen: '2026-01-01T00:00:00.000Z',
        affectedServices: ['checkout'],
        severityNumber: 17,
      },
      {
        fingerprint: 'fp-b',
        firstSeen: '2026-01-01T00:00:00.000Z',
        lastSeen: '2026-01-02T00:00:00.000Z',
        affectedServices: ['billing'],
        severityNumber: 17,
      },
      {
        fingerprint: 'fp-c',
        firstSeen: '2026-01-01T00:00:00.000Z',
        lastSeen: '2026-01-03T00:00:00.000Z',
        affectedServices: ['checkout'],
        severityNumber: 9,
      },
    ])

    const byService = await listIssues(prisma, { service: 'billing' })
    expect(byService.issues.map((issue) => issue.fingerprint)).toEqual(['fp-b'])

    const bySeverity = await listIssues(prisma, { severity: [17] })
    expect(bySeverity.issues.map((issue) => issue.fingerprint).sort()).toEqual([
      'fp-a',
      'fp-b',
    ])

    const byBoth = await listIssues(prisma, {
      service: 'checkout',
      severity: [17],
    })
    expect(byBoth.issues.map((issue) => issue.fingerprint)).toEqual(['fp-a'])
  })
})
