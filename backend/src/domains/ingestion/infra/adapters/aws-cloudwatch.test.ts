import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { LogRecord } from '../../core/log-record'
import type {
  ParseError,
  ParseResult,
} from '../../ports/log-source-adapter'
import { createAwsCloudWatchAdapter } from './aws-cloudwatch'

const adapter = createAwsCloudWatchAdapter(
  () => new Date('2026-09-09T00:00:00.000Z'),
)

const perEventLine = (overrides: Record<string, unknown> = {}): string => {
  return JSON.stringify({
    logGroup: '/aws/lambda/checkout-api',
    logStream: '2026/09/08/[$LATEST]abcdef1234567890',
    id: '39000000000000000000000000000000000000000000000001',
    timestamp: 1757325600000,
    message: 'checkout failed for order 4471',
    ...overrides,
  })
}

const asRecord = (result: ParseResult): LogRecord => {
  if ('kind' in result) {
    throw new Error(`expected a LogRecord, got ParseError ${result.code}`)
  }
  return result
}

const asError = (result: ParseResult): ParseError => {
  if (!('kind' in result)) {
    throw new Error('expected a ParseError, got a LogRecord')
  }
  return result
}

const gcpSample = [
  JSON.stringify({
    insertId: 'abc-1',
    timestamp: '2026-09-08T10:00:00Z',
    severity: 'ERROR',
    resource: { type: 'gce_instance', labels: { zone: 'us-central1-a' } },
    textPayload: 'connection reset',
  }),
]

const genericJsonLine = JSON.stringify({ msg: 'hello', level: 'info', ts: 123 })

describe('createAwsCloudWatchAdapter', () => {
  describe('input unit', () => {
    it('returns a single LogRecord for one well-formed per-event line', () => {
      const record = asRecord(adapter.parse(perEventLine()))

      expect(record.sourceType).toBe('aws-cloudwatch')
      expect(record.body).toBe('checkout failed for order 4471')
      expect(record.fingerprint).toMatch(/^[0-9a-f]{40}$/)
    })

    it('returns a result and never throws for any input string', () => {
      const inputs = [
        '',
        'not json at all',
        '[1,2,3]',
        '42',
        '"a bare string"',
        '{"logGroup":"x"',
      ]

      for (const input of inputs) {
        expect(() => adapter.parse(input)).not.toThrow()
        expect('kind' in adapter.parse(input)).toBe(true)
      }
    })
  })

  describe('body and raw', () => {
    it('uses a plain-string message as body unchanged', () => {
      const record = asRecord(
        adapter.parse(perEventLine({ message: 'disk full on /var/log' })),
      )

      expect(record.body).toBe('disk full on /var/log')
    })

    it('serializes a JSON-object message into a canonical, key-sorted body', () => {
      const record = asRecord(
        adapter.parse(perEventLine({ message: '{"z":1,"a":2,"m":3}' })),
      )

      expect(record.body).toBe('{"a":2,"m":3,"z":1}')
    })

    it('produces the same body for the same object regardless of key order or run', () => {
      const first = asRecord(
        adapter.parse(perEventLine({ message: '{"a":1,"b":2}' })),
      )
      const reordered = asRecord(
        adapter.parse(perEventLine({ message: '{"b":2,"a":1}' })),
      )
      const again = asRecord(
        adapter.parse(perEventLine({ message: '{"a":1,"b":2}' })),
      )

      expect(reordered.body).toBe(first.body)
      expect(again.body).toBe(first.body)
    })

    it('produces an empty body when message is absent or an empty string', () => {
      const missing = asRecord(adapter.parse(perEventLine({ message: undefined })))
      const empty = asRecord(adapter.parse(perEventLine({ message: '' })))

      expect(missing.body).toBe('')
      expect(empty.body).toBe('')
    })

    it('carries raw as the exact line string it was given', () => {
      const line = perEventLine()

      expect(asRecord(adapter.parse(line)).raw).toBe(line)
    })
  })

  describe('timestamp', () => {
    it('reads a positive integer timestamp as epoch milliseconds', () => {
      const record = asRecord(
        adapter.parse(perEventLine({ timestamp: 1757325600123 })),
      )

      expect(record.timestamp.getTime()).toBe(1757325600123)
    })

    it('returns a ParseError when timestamp is absent', () => {
      const error = asError(adapter.parse(perEventLine({ timestamp: undefined })))

      expect(error.code).toBe('missing-timestamp')
    })

    it('returns a ParseError when timestamp is not a positive integer', () => {
      const invalid: unknown[] = ['1757325600000', 1757325600.5, 0, -5, null]

      for (const timestamp of invalid) {
        const error = asError(adapter.parse(perEventLine({ timestamp })))
        expect(error.code).toBe('invalid-timestamp')
      }
    })
  })

  describe('service name and resource fields', () => {
    it('derives service_name from the trailing segment of an /aws/<service>/<name> logGroup', () => {
      const record = asRecord(
        adapter.parse(perEventLine({ logGroup: '/aws/ecs/payments-worker' })),
      )

      expect(record.serviceName).toBe('payments-worker')
    })

    it('leaves service_name null when logGroup does not match the pattern', () => {
      const custom = asRecord(
        adapter.parse(perEventLine({ logGroup: 'my-custom-group' })),
      )
      const absent = asRecord(
        adapter.parse(perEventLine({ logGroup: undefined })),
      )

      expect(custom.serviceName).toBeNull()
      expect(absent.serviceName).toBeNull()
    })

    it('never maps logStream to host', () => {
      const record = asRecord(
        adapter.parse(perEventLine({ logStream: 'instance-42' })),
      )

      expect(record.host).toBeNull()
    })

    it('leaves environment, trace_id and span_id null on every record', () => {
      const record = asRecord(adapter.parse(perEventLine()))

      expect({
        environment: record.environment,
        traceId: record.traceId,
        spanId: record.spanId,
      }).toEqual({ environment: null, traceId: null, spanId: null })
    })
  })

  describe('attributes', () => {
    it('carries logGroup, logStream and id and nothing else', () => {
      const record = asRecord(adapter.parse(perEventLine()))

      expect(Object.keys(record.attributes).sort()).toEqual([
        'id',
        'logGroup',
        'logStream',
      ])
    })

    it('does not lift non-level keys of a JSON-object message into attributes', () => {
      const record = asRecord(
        adapter.parse(
          perEventLine({
            message: '{"level":"error","userId":"u-123","region":"us-east-1"}',
          }),
        ),
      )

      expect(record.attributes).not.toHaveProperty('userId')
      expect(record.attributes).not.toHaveProperty('region')
    })

    it('reads the level key for severity without copying it to attributes or removing it from body and raw', () => {
      const line = perEventLine({ message: '{"level":"error","msg":"boom"}' })
      const record = asRecord(adapter.parse(line))

      expect(record.attributes).not.toHaveProperty('level')
      expect(record.body).toContain('"level":"error"')
      expect(record.raw).toBe(line)
    })
  })

  describe('severity', () => {
    it('yields null severity for a plain-string message or a JSON object with no level or severity key', () => {
      const plain = asRecord(adapter.parse(perEventLine({ message: 'boom' })))
      const structured = asRecord(
        adapter.parse(perEventLine({ message: '{"msg":"boom","count":3}' })),
      )

      expect({
        n: plain.severityNumber,
        t: plain.severityText,
      }).toEqual({ n: null, t: null })
      expect({
        n: structured.severityNumber,
        t: structured.severityText,
      }).toEqual({ n: null, t: null })
    })

    it('maps a recognized textual level by the shared name rules, keeping the token verbatim', () => {
      const record = asRecord(
        adapter.parse(perEventLine({ message: '{"level":"  ErRoR  "}' })),
      )

      expect(record.severityNumber).toBe(17)
      expect(record.severityText).toBe('  ErRoR  ')
    })

    it('leaves a numeric level undeterminable, keeping the value verbatim', () => {
      const record = asRecord(
        adapter.parse(perEventLine({ message: '{"level":30}' })),
      )

      expect(record.severityNumber).toBeNull()
      expect(record.severityText).toBe('30')
    })

    it('keeps an unrecognized textual level verbatim without raising a ParseError', () => {
      const result = adapter.parse(perEventLine({ message: '{"level":"chatty"}' }))
      const record = asRecord(result)

      expect(record.severityNumber).toBeNull()
      expect(record.severityText).toBe('chatty')
    })

    it('never infers severity by scanning message text', () => {
      const record = asRecord(
        adapter.parse(
          perEventLine({ message: 'database ERROR: timeout after 5000ms' }),
        ),
      )

      expect(record.severityNumber).toBeNull()
      expect(record.severityText).toBeNull()
    })
  })

  describe('source type and determinism', () => {
    it('stamps every record with the aws-cloudwatch source type', () => {
      const plain = asRecord(adapter.parse(perEventLine()))
      const structured = asRecord(
        adapter.parse(perEventLine({ message: '{"level":"info"}' })),
      )

      expect(plain.sourceType).toBe('aws-cloudwatch')
      expect(structured.sourceType).toBe('aws-cloudwatch')
    })

    it('produces an identical record for the same line on every run', () => {
      const line = perEventLine({ message: '{"level":"warn","msg":"slow query"}' })
      const a = asRecord(adapter.parse(line))
      const b = asRecord(adapter.parse(line))

      expect({
        body: a.body,
        timestamp: a.timestamp.getTime(),
        serviceName: a.serviceName,
        severityNumber: a.severityNumber,
        severityText: a.severityText,
        fingerprint: a.fingerprint,
      }).toEqual({
        body: b.body,
        timestamp: b.timestamp.getTime(),
        serviceName: b.serviceName,
        severityNumber: b.severityNumber,
        severityText: b.severityText,
        fingerprint: b.fingerprint,
      })
    })
  })

  describe('ParseError', () => {
    it('returns, never throws, a ParseError carrying the offending line and a stable code', () => {
      const bad = 'totally not json'

      expect(() => adapter.parse(bad)).not.toThrow()
      const error = asError(adapter.parse(bad))
      expect(error.line).toBe(bad)
      expect(typeof error.code).toBe('string')
    })
  })

  describe('detect', () => {
    it('scores a CloudWatch sample above a GCP sample', () => {
      const cloudwatch = [perEventLine(), perEventLine({ id: undefined })]

      expect(adapter.detect(cloudwatch)).toBeGreaterThan(adapter.detect(gcpSample))
    })

    it('scores a line with the joint CloudWatch markers above a generic JSON line', () => {
      expect(adapter.detect([perEventLine()])).toBeGreaterThan(
        adapter.detect([genericJsonLine]),
      )
    })

    it('scores an empty sample zero', () => {
      expect(adapter.detect([])).toBe(0)
    })
  })

  describe('fixtures', () => {
    it('maps a real CloudWatch export, post-split, to the expected records', () => {
      type CloudWatchExport = {
        readonly logGroup: string
        readonly logStream: string
        readonly logEvents: readonly {
          readonly id: string
          readonly timestamp: number
          readonly message: string
        }[]
      }

      const doc = JSON.parse(
        readFileSync(
          new URL('./__fixtures__/aws-cloudwatch.json', import.meta.url),
          'utf8',
        ),
      ) as CloudWatchExport

      const records = doc.logEvents
        .map((event) =>
          JSON.stringify({
            logGroup: doc.logGroup,
            logStream: doc.logStream,
            id: event.id,
            timestamp: event.timestamp,
            message: event.message,
          }),
        )
        .map((line) => asRecord(adapter.parse(line)))

      expect(records.map((record) => record.serviceName)).toEqual([
        'checkout-api',
        'checkout-api',
        'checkout-api',
        'checkout-api',
      ])
      expect(records.map((record) => record.severityNumber)).toEqual([
        null,
        17,
        13,
        null,
      ])
      expect(records.map((record) => record.severityText)).toEqual([
        null,
        'error',
        'WARNING',
        null,
      ])
      expect(records.map((record) => record.timestamp.getTime())).toEqual([
        1757325600000, 1757325600123, 1757325600456, 1757325600789,
      ])
      expect(records[0]?.body).toContain('START RequestId')
    })
  })
})
