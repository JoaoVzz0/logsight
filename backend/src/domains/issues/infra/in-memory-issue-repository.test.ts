import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Occurrence } from '../core/occurrence'

import { InMemoryIssueRepository } from './in-memory-issue-repository'

const occurrence = (overrides: Partial<Occurrence> = {}): Occurrence => ({
  fingerprint: 'fp-1',
  message: 'checkout failed',
  severityNumber: 17,
  serviceName: 'checkout',
  occurredAt: new Date('2026-09-08T10:00:00.000Z'),
  ...overrides,
})

describe('InMemoryIssueRepository', () => {
  it('aggregates the issue behaviour through the port without a database', async () => {
    const repository = new InMemoryIssueRepository()

    await repository.upsertBatch([
      occurrence({ occurredAt: new Date('2026-09-08T10:00:00.000Z') }),
      occurrence({
        serviceName: 'billing',
        occurredAt: new Date('2026-09-08T12:00:00.000Z'),
      }),
    ])

    const issue = await repository.findByFingerprint('fp-1')
    expect(issue?.snapshot).toMatchObject({
      eventCount: 2,
      firstSeen: new Date('2026-09-08T10:00:00.000Z'),
      lastSeen: new Date('2026-09-08T12:00:00.000Z'),
      affectedServices: ['checkout', 'billing'],
    })
    expect(await repository.findByFingerprint('missing')).toBeNull()

    const text = readFileSync(
      new URL('./in-memory-issue-repository.ts', import.meta.url),
      'utf8',
    )
    expect(text).not.toMatch(/@prisma\/client|PrismaClient/)
  })
})
