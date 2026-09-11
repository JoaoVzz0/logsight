import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Occurrence } from '../core/occurrence'

import { PrismaIssueRepository } from './prisma-issue-repository'

const prisma = new PrismaClient()

const occurrence = (overrides: Partial<Occurrence> = {}): Occurrence => ({
  fingerprint: 'fp-prisma',
  message: 'checkout failed for order 4471',
  severityNumber: 17,
  serviceName: 'checkout',
  occurredAt: new Date('2026-09-08T10:00:00.000Z'),
  ...overrides,
})

beforeEach(async () => {
  await prisma.logRecord.deleteMany()
  await prisma.issue.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('PrismaIssueRepository', () => {
  it('inserts the issue on the first occurrence and updates event_count, last_seen and affected_services on later ones', async () => {
    const repository = new PrismaIssueRepository(prisma)

    await repository.upsertBatch([occurrence()])
    await repository.upsertBatch([
      occurrence({
        serviceName: 'billing',
        occurredAt: new Date('2026-09-08T12:00:00.000Z'),
      }),
    ])

    const row = await prisma.issue.findUniqueOrThrow({
      where: { fingerprint: 'fp-prisma' },
    })
    expect(Number(row.eventCount)).toBe(2)
    expect(row.lastSeen).toEqual(new Date('2026-09-08T12:00:00.000Z'))
    expect(row.affectedServices).toEqual(['checkout', 'billing'])
  })

  it('aggregates many occurrences of one fingerprint in a batch into a single write', async () => {
    const writes: string[] = []
    const logged = new PrismaClient({
      log: [{ level: 'query', emit: 'event' }],
    })
    logged.$on('query', (event) => {
      const sql = event.query
      if (/"public"\."issues"/i.test(sql) && !/^\s*select/i.test(sql)) {
        writes.push(sql)
      }
    })
    const repository = new PrismaIssueRepository(logged)

    await repository.upsertBatch([
      occurrence({ occurredAt: new Date('2026-09-08T10:00:00.000Z') }),
      occurrence({ occurredAt: new Date('2026-09-08T11:00:00.000Z') }),
      occurrence({ occurredAt: new Date('2026-09-08T12:00:00.000Z') }),
    ])

    expect(writes).toHaveLength(1)

    const issue = await repository.findByFingerprint('fp-prisma')
    expect(issue?.snapshot.eventCount).toBe(3)

    await logged.$disconnect()
  })

  it('persists a regression across batches so it survives a restore from the database', async () => {
    const repository = new PrismaIssueRepository(prisma)

    await repository.upsertBatch([occurrence()])
    await prisma.issue.update({
      where: { fingerprint: 'fp-prisma' },
      data: { status: 'RESOLVED', resolvedAt: new Date('2026-09-08T11:00:00.000Z') },
    })

    await repository.upsertBatch([
      occurrence({ occurredAt: new Date('2026-09-08T12:00:00.000Z') }),
    ])

    const row = await prisma.issue.findUniqueOrThrow({
      where: { fingerprint: 'fp-prisma' },
    })
    expect(row.regression).toBe(true)

    const regressed = await repository.findByFingerprint('fp-prisma')
    expect(regressed?.snapshot.regression).toBe(true)
  })
})
