import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { listLogs, type LogListResult } from './list-logs'

const prisma = new PrismaClient()

type SeedRow = {
  readonly id?: string
  readonly ts: string
  readonly severityNumber?: number | null
  readonly serviceName?: string | null
  readonly body?: string
}

beforeEach(async () => {
  await prisma.logRecord.deleteMany()
  await prisma.issue.deleteMany()
  await prisma.importJob.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function seed(rows: readonly SeedRow[]): Promise<void> {
  const job = await prisma.importJob.create({
    data: { filename: 'seed', sizeBytes: 1n },
  })
  await prisma.issue.create({
    data: {
      fingerprint: 'fp-seed',
      sampleMessage: 'm',
      severityNumber: null,
      firstSeen: new Date('2026-01-01T00:00:00.000Z'),
      lastSeen: new Date('2026-01-01T00:00:00.000Z'),
      eventCount: BigInt(rows.length),
      affectedServices: [],
    },
  })
  await prisma.logRecord.createMany({
    data: rows.map((row, index) => ({
      ...(row.id !== undefined ? { id: row.id } : {}),
      timestamp: new Date(row.ts),
      observedAt: new Date(row.ts),
      severityNumber: row.severityNumber ?? null,
      severityText: null,
      body: row.body ?? `record ${index}`,
      serviceName: row.serviceName ?? null,
      host: null,
      environment: null,
      traceId: null,
      spanId: null,
      attributes: {},
      sourceType: 'json-lines',
      fingerprint: 'fp-seed',
      raw: `raw ${index}`,
      importJobId: job.id,
    })),
  })
}

function severities(result: LogListResult): number[] {
  return result.records.map((record) => record.severityNumber ?? -1)
}

function bodies(result: LogListResult): string[] {
  return result.records.map((record) => record.body)
}

describe('listLogs', () => {
  it('returns the newest records ordered by timestamp descending, capped at 50, with no query', async () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      ts: new Date(Date.UTC(2026, 1, 1, 0, index)).toISOString(),
      body: `record ${index}`,
    }))
    await seed(rows)

    const result = await listLogs(prisma, {})

    expect(result.records).toHaveLength(50)
    const times = result.records.map((record) => record.timestamp)
    expect(times).toEqual([...times].sort().reverse())
    expect(result.records[0]?.body).toBe('record 59')
  })

  it('reports an opaque next cursor while more rows remain and null on the last page', async () => {
    await seed([
      { ts: '2026-02-01T00:00:00.000Z' },
      { ts: '2026-02-01T00:01:00.000Z' },
      { ts: '2026-02-01T00:02:00.000Z' },
    ])

    const first = await listLogs(prisma, { limit: 2 })
    expect(first.records).toHaveLength(2)
    expect(typeof first.nextCursor).toBe('string')
    expect(first.nextCursor).not.toBe('')

    const second = await listLogs(prisma, {
      limit: 2,
      cursor: first.nextCursor ?? '',
    })
    expect(second.records).toHaveLength(1)
    expect(second.nextCursor).toBeNull()
  })

  it('omits raw from a returned record', async () => {
    await seed([{ ts: '2026-02-01T00:00:00.000Z' }])

    const result = await listLogs(prisma, {})

    expect(result.records[0]).toBeDefined()
    expect('raw' in (result.records[0] as object)).toBe(false)
  })

  it('orders two records sharing one timestamp by id descending', async () => {
    await seed([
      { id: '11111111-1111-1111-1111-111111111111', ts: '2026-02-01T00:00:00.000Z' },
      { id: '22222222-2222-2222-2222-222222222222', ts: '2026-02-01T00:00:00.000Z' },
    ])

    const result = await listLogs(prisma, {})

    expect(result.records.map((record) => record.id)).toEqual([
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
    ])
  })

  it('returns only records whose severity number is one of the supplied levels', async () => {
    await seed([
      { ts: '2026-02-01T00:00:00.000Z', severityNumber: 9 },
      { ts: '2026-02-01T00:01:00.000Z', severityNumber: 13 },
      { ts: '2026-02-01T00:02:00.000Z', severityNumber: 17 },
    ])

    const result = await listLogs(prisma, { level: [9, 17] })

    expect(severities(result).sort((a, b) => a - b)).toEqual([9, 17])
  })

  it('matches null-severity records only when the level list contains unknown', async () => {
    await seed([
      { ts: '2026-02-01T00:00:00.000Z', severityNumber: null },
      { ts: '2026-02-01T00:01:00.000Z', severityNumber: 9 },
    ])

    const withUnknown = await listLogs(prisma, { level: ['unknown'] })
    expect(withUnknown.records).toHaveLength(1)
    expect(withUnknown.records[0]?.severityNumber).toBeNull()

    const withoutUnknown = await listLogs(prisma, { level: [9] })
    expect(withoutUnknown.records.map((record) => record.severityNumber)).toEqual(
      [9],
    )
  })

  it('filters timestamp with an inclusive from and an exclusive to, each usable alone', async () => {
    await seed([
      { ts: '2026-03-01T00:00:00.000Z' },
      { ts: '2026-03-02T00:00:00.000Z' },
      { ts: '2026-03-03T00:00:00.000Z' },
    ])

    const fromOnly = await listLogs(prisma, { from: '2026-03-02T00:00:00.000Z' })
    expect(fromOnly.records.map((record) => record.timestamp)).toEqual([
      '2026-03-03T00:00:00.000Z',
      '2026-03-02T00:00:00.000Z',
    ])

    const toOnly = await listLogs(prisma, { to: '2026-03-03T00:00:00.000Z' })
    expect(toOnly.records.map((record) => record.timestamp)).toEqual([
      '2026-03-02T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
    ])
  })

  it('returns only records whose service name matches exactly', async () => {
    await seed([
      { ts: '2026-02-01T00:00:00.000Z', serviceName: 'checkout' },
      { ts: '2026-02-01T00:01:00.000Z', serviceName: 'billing' },
    ])

    const result = await listLogs(prisma, { service: 'checkout' })

    expect(result.records.map((record) => record.serviceName)).toEqual([
      'checkout',
    ])
  })

  it('combines the supplied filters with AND', async () => {
    await seed([
      { ts: '2026-02-01T00:00:00.000Z', serviceName: 'checkout', severityNumber: 17 },
      { ts: '2026-02-01T00:01:00.000Z', serviceName: 'checkout', severityNumber: 9 },
      { ts: '2026-02-01T00:02:00.000Z', serviceName: 'billing', severityNumber: 17 },
    ])

    const result = await listLogs(prisma, { service: 'checkout', level: [17] })

    expect(result.records).toHaveLength(1)
    expect(result.records[0]?.serviceName).toBe('checkout')
    expect(result.records[0]?.severityNumber).toBe(17)
  })

  it('matches a case-insensitive substring of body when q has at least three characters', async () => {
    await seed([
      { ts: '2026-02-01T00:00:00.000Z', body: 'Connection timeout on db' },
      { ts: '2026-02-01T00:01:00.000Z', body: 'user logged in' },
      { ts: '2026-02-01T00:02:00.000Z', body: 'TIMEOUT waiting for lock' },
    ])

    const result = await listLogs(prisma, { q: 'timeout' })

    expect(bodies(result).sort()).toEqual([
      'Connection timeout on db',
      'TIMEOUT waiting for lock',
    ])
  })

  it('applies no text filter when q is shorter than three characters or empty', async () => {
    await seed([
      { ts: '2026-02-01T00:00:00.000Z' },
      { ts: '2026-02-01T00:01:00.000Z' },
      { ts: '2026-02-01T00:02:00.000Z' },
    ])

    expect((await listLogs(prisma, { q: 'ab' })).records).toHaveLength(3)
    expect((await listLogs(prisma, { q: '' })).records).toHaveLength(3)
  })

  it('walks forward through the pages without repeating or skipping a record', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      ts: new Date(Date.UTC(2026, 3, 1, 0, index)).toISOString(),
    }))
    await seed(rows)

    const collected: string[] = []
    let cursor: string | null = null
    do {
      const page: LogListResult = await listLogs(prisma, {
        limit: 2,
        ...(cursor !== null ? { cursor } : {}),
      })
      collected.push(...page.records.map((record) => record.id))
      cursor = page.nextCursor
    } while (cursor !== null)

    expect(new Set(collected).size).toBe(5)
    expect(collected).toHaveLength(5)
  })

  it('returns three records sharing one timestamp exactly once across the page boundary', async () => {
    await seed([
      { id: '33333333-3333-3333-3333-333333333333', ts: '2026-05-01T00:00:00.000Z' },
      { id: '22222222-2222-2222-2222-222222222222', ts: '2026-05-01T00:00:00.000Z' },
      { id: '11111111-1111-1111-1111-111111111111', ts: '2026-05-01T00:00:00.000Z' },
      { id: '44444444-4444-4444-4444-444444444444', ts: '2026-04-01T00:00:00.000Z' },
      { id: '55555555-5555-5555-5555-555555555555', ts: '2026-03-01T00:00:00.000Z' },
    ])

    const collected: string[] = []
    let cursor: string | null = null
    do {
      const page: LogListResult = await listLogs(prisma, {
        limit: 2,
        ...(cursor !== null ? { cursor } : {}),
      })
      collected.push(...page.records.map((record) => record.id))
      cursor = page.nextCursor
    } while (cursor !== null)

    expect(collected).toEqual([
      '33333333-3333-3333-3333-333333333333',
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555',
    ])
  })

  it('keeps the filters applied on every page reached through the cursor', async () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, index) => ({
        ts: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
        serviceName: 'checkout',
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        ts: new Date(Date.UTC(2026, 6, 2, 0, index)).toISOString(),
        serviceName: 'billing',
      })),
    ]
    await seed(rows)

    const collected: string[] = []
    let cursor: string | null = null
    do {
      const page: LogListResult = await listLogs(prisma, {
        service: 'checkout',
        limit: 2,
        ...(cursor !== null ? { cursor } : {}),
      })
      for (const record of page.records) {
        expect(record.serviceName).toBe('checkout')
        collected.push(record.id)
      }
      cursor = page.nextCursor
    } while (cursor !== null)

    expect(new Set(collected).size).toBe(6)
  })

  it('projects a plain json result with string timestamps and no bigint', async () => {
    await seed([{ ts: '2026-02-01T00:00:00.000Z', severityNumber: 17 }])

    const result = await listLogs(prisma, {})

    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
    expect(typeof result.records[0]?.timestamp).toBe('string')
  })
})
