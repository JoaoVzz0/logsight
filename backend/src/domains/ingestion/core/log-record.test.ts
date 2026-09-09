import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { computeFingerprint } from './services/fingerprint'
import type { NormalizedSeverity } from './services/severity'
import {
  assembleLogRecord,
  type LogRecordDraft,
  type SourceType,
} from './log-record'

const undetermined: NormalizedSeverity = {
  severityNumber: null,
  severityText: null,
}

const fixedClock = (iso: string): (() => Date) => {
  return () => new Date(iso)
}

const draft = (overrides: Partial<LogRecordDraft> = {}): LogRecordDraft => ({
  timestamp: new Date('2026-09-08T10:00:00.000Z'),
  body: 'checkout failed for order 4471',
  severity: { severityNumber: 17, severityText: 'ERROR' },
  sourceType: 'json-lines',
  raw: '{"msg":"checkout failed for order 4471","level":"error"}',
  ...overrides,
})

const CANONICAL_FIELDS = [
  'timestamp',
  'observedAt',
  'severityNumber',
  'severityText',
  'body',
  'serviceName',
  'host',
  'environment',
  'traceId',
  'spanId',
  'attributes',
  'sourceType',
  'fingerprint',
  'raw',
]

describe('assembleLogRecord', () => {
  it('exposes exactly the canonical fields and no others', () => {
    const record = assembleLogRecord(draft(), fixedClock('2026-09-08T11:00:00.000Z'))

    expect(Object.keys(record).sort()).toEqual([...CANONICAL_FIELDS].sort())
  })

  it('keeps out of attributes any key that has a typed field of its own', () => {
    const record = assembleLogRecord(
      draft({
        serviceName: 'checkout',
        attributes: {
          serviceName: 'spoofed',
          host: 'spoofed-host',
          environment: 'spoofed-env',
          traceId: 'spoofed-trace',
          spanId: 'spoofed-span',
          region: 'us-east-1',
        },
      }),
      fixedClock('2026-09-08T11:00:00.000Z'),
    )

    expect(record.attributes).toEqual({ region: 'us-east-1' })
  })

  it('returns a record and never throws for an empty body with every optional field absent', () => {
    let record
    expect(() => {
      record = assembleLogRecord(
        draft({ body: '', severity: undetermined }),
        fixedClock('2026-09-08T11:00:00.000Z'),
      )
    }).not.toThrow()
    expect(record).toBeTypeOf('object')
  })

  it('exposes the event time it was given as a non-null timestamp', () => {
    const eventTime = new Date('2026-09-08T10:00:00.000Z')
    const record = assembleLogRecord(
      draft({ timestamp: eventTime }),
      fixedClock('2026-09-08T11:00:00.000Z'),
    )

    expect(record.timestamp).toEqual(eventTime)
  })

  it('takes observedAt from the injected clock, independent of every source field', () => {
    const observed = new Date('2030-01-01T00:00:00.000Z')
    const record = assembleLogRecord(
      draft({ timestamp: new Date('1999-12-31T23:59:59.000Z') }),
      () => observed,
    )

    expect(record.observedAt).toEqual(observed)
  })

  it('defaults the optional resource fields to null when the caller supplies none', () => {
    const record = assembleLogRecord(draft(), fixedClock('2026-09-08T11:00:00.000Z'))

    expect({
      serviceName: record.serviceName,
      host: record.host,
      environment: record.environment,
      traceId: record.traceId,
      spanId: record.spanId,
    }).toEqual({
      serviceName: null,
      host: null,
      environment: null,
      traceId: null,
      spanId: null,
    })
  })

  it('defaults attributes to an empty map when the caller supplies no tail keys', () => {
    const record = assembleLogRecord(draft(), fixedClock('2026-09-08T11:00:00.000Z'))

    expect(record.attributes).toEqual({})
  })

  it('carries raw through byte for byte, without reserialization or trimming', () => {
    const raw = '  {"a":1,\n"b":  2}  \t'
    const record = assembleLogRecord(
      draft({ raw }),
      fixedClock('2026-09-08T11:00:00.000Z'),
    )

    expect(record.raw).toBe(raw)
  })

  it('carries every adapter identifier through as the source type unchanged', () => {
    const ids: SourceType[] = [
      'gcp-cloud-logging',
      'aws-cloudwatch',
      'json-lines',
      'nginx',
    ]

    for (const id of ids) {
      const record = assembleLogRecord(
        draft({ sourceType: id }),
        fixedClock('2026-09-08T11:00:00.000Z'),
      )
      expect(record.sourceType).toBe(id)
    }
  })

  it('represents severity as null or one of the six OpenTelemetry band base values', () => {
    const bands = [1, 5, 9, 13, 17, 21, null]

    for (const severityNumber of bands) {
      const record = assembleLogRecord(
        draft({ severity: { severityNumber, severityText: 'whatever' } }),
        fixedClock('2026-09-08T11:00:00.000Z'),
      )
      expect(record.severityNumber).toBe(severityNumber)
    }
  })

  it('takes the severity pair from the caller unchanged rather than re-normalizing it', () => {
    const record = assembleLogRecord(
      draft({ severity: { severityNumber: null, severityText: 'ERROR' } }),
      fixedClock('2026-09-08T11:00:00.000Z'),
    )

    expect({
      severityNumber: record.severityNumber,
      severityText: record.severityText,
    }).toEqual({ severityNumber: null, severityText: 'ERROR' })
  })

  it('sets fingerprint to what the shared implementation computes for its own body, service and severity', () => {
    const record = assembleLogRecord(
      draft({ serviceName: 'checkout', severity: { severityNumber: 13, severityText: 'WARN' } }),
      fixedClock('2026-09-08T11:00:00.000Z'),
    )

    expect(record.fingerprint).toBe(
      computeFingerprint({
        body: record.body,
        serviceName: record.serviceName,
        severityNumber: record.severityNumber,
      }),
    )
  })

  it('produces a different fingerprint when only the service or only the severity differs', () => {
    const clock = fixedClock('2026-09-08T11:00:00.000Z')
    const base = assembleLogRecord(draft({ serviceName: 'checkout' }), clock)

    const otherService = assembleLogRecord(draft({ serviceName: 'billing' }), clock)
    const otherSeverity = assembleLogRecord(
      draft({ serviceName: 'checkout', severity: { severityNumber: 21, severityText: 'FATAL' } }),
      clock,
    )

    expect(base.fingerprint).not.toBe(otherService.fingerprint)
    expect(base.fingerprint).not.toBe(otherSeverity.fingerprint)
  })

  it('produces the same fingerprint when only a field outside the signature differs', () => {
    const clock = fixedClock('2026-09-08T11:00:00.000Z')
    const base = assembleLogRecord(draft(), clock)
    const shifted = assembleLogRecord(
      draft({
        timestamp: new Date('2000-01-01T00:00:00.000Z'),
        host: 'other-host',
        environment: 'staging',
        traceId: 'abc',
        spanId: 'def',
        sourceType: 'nginx',
        raw: 'a completely different raw line',
        attributes: { region: 'eu-west-1' },
      }),
      clock,
    )

    expect(shifted.fingerprint).toBe(base.fingerprint)
  })

  it('still produces a fingerprint for an empty or whitespace-only body', () => {
    const clock = fixedClock('2026-09-08T11:00:00.000Z')

    for (const body of ['', '   \t ']) {
      const record = assembleLogRecord(draft({ body }), clock)
      expect(record.fingerprint).toMatch(/^[0-9a-f]{40}$/)
    }
  })

  it('imports nothing from infra, http, platform or a framework/driver', () => {
    const source = readFileSync(new URL('./log-record.ts', import.meta.url), 'utf8')
    const specifiers = [...source.matchAll(/^\s*import[^'"]+['"]([^'"]+)['"]/gm)].map(
      (match) => match[1],
    )

    for (const specifier of specifiers) {
      expect(specifier).not.toMatch(
        /(^|\/)(infra|http|platform)(\/|$)|^(fastify|bullmq|ioredis|@prisma\/client)$/,
      )
    }
  })
})
