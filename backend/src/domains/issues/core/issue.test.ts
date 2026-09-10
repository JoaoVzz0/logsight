import { describe, expect, it } from 'vitest'

import { Issue } from './issue'
import type { Occurrence } from './occurrence'

const occurrence = (overrides: Partial<Occurrence> = {}): Occurrence => ({
  fingerprint: 'a1b2c3',
  message: 'checkout failed for order 4471',
  severityNumber: 17,
  serviceName: 'checkout',
  occurredAt: new Date('2026-09-08T10:00:00.000Z'),
  ...overrides,
})

describe('Issue', () => {
  it('opens from the first occurrence with count 1, both timestamps at the occurrence time, the service, unresolved status, and the sample message and severity', () => {
    const issue = Issue.open(
      occurrence({
        message: 'db connection lost',
        severityNumber: 21,
        serviceName: 'billing',
        occurredAt: new Date('2026-09-08T12:00:00.000Z'),
      }),
    )

    expect(issue.snapshot).toMatchObject({
      eventCount: 1,
      firstSeen: new Date('2026-09-08T12:00:00.000Z'),
      lastSeen: new Date('2026-09-08T12:00:00.000Z'),
      affectedServices: ['billing'],
      status: 'unresolved',
      sampleMessage: 'db connection lost',
      severityNumber: 21,
    })
  })

  it('increments the count and advances last_seen for a later occurrence, never moves it earlier, and leaves first_seen fixed', () => {
    const issue = Issue.open(
      occurrence({ occurredAt: new Date('2026-09-08T10:00:00.000Z') }),
    )

    issue.record(occurrence({ occurredAt: new Date('2026-09-08T12:00:00.000Z') }))
    issue.record(occurrence({ occurredAt: new Date('2026-09-08T09:00:00.000Z') }))

    expect(issue.snapshot).toMatchObject({
      eventCount: 3,
      firstSeen: new Date('2026-09-08T10:00:00.000Z'),
      lastSeen: new Date('2026-09-08T12:00:00.000Z'),
    })
  })

  it('adds a new service on a later occurrence without duplicating one already present', () => {
    const issue = Issue.open(occurrence({ serviceName: 'checkout' }))

    issue.record(occurrence({ serviceName: 'checkout' }))
    issue.record(occurrence({ serviceName: 'billing' }))

    expect(issue.snapshot.affectedServices).toEqual(['checkout', 'billing'])
  })

  it('returns a resolved issue to unresolved as a regression when it recurs, and leaves an ignored issue ignored', () => {
    const regressed = Issue.open(occurrence())
    regressed.resolve(new Date('2026-09-08T11:00:00.000Z'))
    regressed.record(occurrence({ occurredAt: new Date('2026-09-08T13:00:00.000Z') }))

    expect(regressed.snapshot).toMatchObject({
      status: 'unresolved',
      regression: true,
    })

    const silenced = Issue.open(occurrence())
    silenced.ignore()
    silenced.record(occurrence({ occurredAt: new Date('2026-09-08T13:00:00.000Z') }))

    expect(silenced.snapshot.status).toBe('ignored')
  })

  it('makes every status transition explicit and sets resolved_at on resolve, clearing it when the issue reopens', () => {
    const issue = Issue.open(occurrence())

    issue.resolve(new Date('2026-09-08T11:00:00.000Z'))
    expect(issue.snapshot).toMatchObject({
      status: 'resolved',
      resolvedAt: new Date('2026-09-08T11:00:00.000Z'),
    })

    issue.record(occurrence({ occurredAt: new Date('2026-09-08T12:00:00.000Z') }))
    expect(issue.snapshot).toMatchObject({ status: 'unresolved', resolvedAt: null })

    issue.ignore()
    expect(issue.snapshot.status).toBe('ignored')

    issue.reopen()
    expect(issue.snapshot.status).toBe('unresolved')
  })

  it('does not let a caller set event_count, first_seen or last_seen directly', () => {
    const issue = Issue.open(occurrence())
    const snapshot = issue.snapshot

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(() => {
      ;(snapshot as { eventCount: number }).eventCount = 99
    }).toThrow()
    expect(issue.snapshot.eventCount).toBe(1)
  })
})
