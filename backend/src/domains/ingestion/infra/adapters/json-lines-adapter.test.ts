import { readFileSync, readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { computeFingerprint } from '../../core/services/fingerprint'
import { normalizeSeverity } from '../../core/services/severity'
import type { LogRecord } from '../../core/log-record'
import type { ParseError, ParseResult } from '../../ports/log-source-adapter'

import { createJsonLinesAdapter } from './json-lines-adapter'

const OBSERVED_AT = new Date('2030-01-01T00:00:00.000Z')

const adapter = createJsonLinesAdapter(() => OBSERVED_AT)

const isParseError = (result: ParseResult): result is ParseError =>
  'kind' in result && result.kind === 'parse-error'

const asRecord = (result: ParseResult): LogRecord => {
  if (isParseError(result)) {
    throw new Error(`expected a record, got a parse error: ${result.code}`)
  }
  return result
}

const fixtureLines = (): string[] =>
  readFileSync(new URL('./__fixtures__/json-lines.jsonl', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)

describe('createJsonLinesAdapter', () => {
  describe('adapter contract', () => {
    it('implements the existing LogSourceAdapter port without modifying it', () => {
      const port = readFileSync(
        new URL('../../ports/log-source-adapter.ts', import.meta.url),
        'utf8',
      )

      expect(port).toContain("export type ParseErrorCode =")
      for (const code of [
        'empty-line',
        'malformed-syntax',
        'unrecognized-shape',
        'missing-timestamp',
      ]) {
        expect(port).toContain(`'${code}'`)
      }
      expect(typeof adapter.detect).toBe('function')
      expect(typeof adapter.parse).toBe('function')
    })

    it('lives in infra/adapters and reports json-lines as its source type', () => {
      expect(adapter.sourceType).toBe('json-lines')
    })

    it('stamps every produced record with the json-lines source type', () => {
      const record = asRecord(
        adapter.parse('{"message":"ok","timestamp":"2026-09-08T10:00:00Z"}'),
      )

      expect(record.sourceType).toBe('json-lines')
    })

    it('returns a ParseResult and never throws for any string input', () => {
      const inputs = [
        '',
        'not json',
        '42',
        `{"a":${'['.repeat(200)}${']'.repeat(200)},"timestamp":1757325602,"body":"x"}`,
        `{"timestamp":"2026-09-08T10:00:00Z","body":"${'x'.repeat(2_000_000)}"}`,
      ]

      for (const input of inputs) {
        let result: ParseResult | undefined
        expect(() => {
          result = adapter.parse(input)
        }).not.toThrow()
        expect(typeof result).toBe('object')
      }
    })

    it('is not imported by any file under core or application', () => {
      const domains = new URL('../../../', import.meta.url)
      const files = readdirSync(domains, {
        recursive: true,
        encoding: 'utf8',
      }).filter(
        (path) =>
          /(^|\/)(core|application)\//.test(path) &&
          path.endsWith('.ts') &&
          !path.endsWith('.test.ts'),
      )

      for (const file of files) {
        const source = readFileSync(new URL(file, domains), 'utf8')
        expect(source).not.toContain('json-lines-adapter')
      }
    })

    it('delegates fingerprint and severity to the shared implementations', () => {
      const record = asRecord(
        adapter.parse(
          '{"message":"disk full on /var/log","level":"error","service":"api","timestamp":"2026-09-08T10:00:00Z"}',
        ),
      )

      expect({
        severityNumber: record.severityNumber,
        severityText: record.severityText,
      }).toEqual(normalizeSeverity('error'))
      expect(record.fingerprint).toBe(
        computeFingerprint({
          body: record.body,
          serviceName: record.serviceName,
          severityNumber: record.severityNumber,
        }),
      )
    })

    it('takes observedAt from the injected clock, not from any source field', () => {
      const record = asRecord(
        adapter.parse(
          '{"message":"x","timestamp":"1999-01-01T00:00:00Z","observedAt":"2001-01-01T00:00:00Z"}',
        ),
      )

      expect(record.observedAt).toEqual(OBSERVED_AT)
    })
  })

  describe('detection', () => {
    it('returns 0 for an empty sample and for an all-blank sample', () => {
      expect(adapter.detect([])).toBe(0)
      expect(adapter.detect(['', '   ', '\t'])).toBe(0)
    })

    it('returns a positive value when most non-blank lines are JSON objects', () => {
      const sample = [
        '{"a":1}',
        '{"b":2}',
        'a corrupted line',
        '{"c":3}',
        '',
      ]

      expect(adapter.detect(sample)).toBeGreaterThan(0)
    })

    it('returns 0 when most non-blank lines are not JSON objects', () => {
      expect(adapter.detect(['{"a":1}', '[1,2,3]', 'plain text', '"string"'])).toBe(0)
    })

    it('never returns more than 0.5 for any input', () => {
      const samples = [
        [],
        ['{"a":1}'],
        ['{"a":1}', '{"b":2}', '{"c":3}'],
        ['nope', 'still nope'],
        ['{"a":1}', 'nope'],
      ]

      for (const sample of samples) {
        expect(adapter.detect(sample)).toBeLessThanOrEqual(0.5)
      }
    })
  })

  describe('body mapping', () => {
    it('resolves body from message, then msg, then body', () => {
      const record = asRecord(
        adapter.parse(
          '{"message":"from message","msg":"from msg","body":"from body","timestamp":"2026-09-08T10:00:00Z"}',
        ),
      )

      expect(record.body).toBe('from message')
    })

    it('falls through to the next candidate when the higher one is null, non-string or blank', () => {
      const fellThrough = asRecord(
        adapter.parse(
          '{"message":null,"msg":"   ","body":"real text","timestamp":"2026-09-08T10:00:00Z"}',
        ),
      )
      expect(fellThrough.body).toBe('real text')

      const allUnusable = asRecord(
        adapter.parse('{"message":"","msg":42,"timestamp":"2026-09-08T10:00:00Z"}'),
      )
      expect(allUnusable.body).toBe('')
    })

    it('produces an empty body with a fingerprint when no body candidate is usable', () => {
      const record = asRecord(adapter.parse('{"timestamp":"2026-09-08T10:00:00Z"}'))

      expect(record.body).toBe('')
      expect(record.fingerprint).toBe(
        computeFingerprint({ body: '', serviceName: null, severityNumber: null }),
      )
    })
  })

  describe('timestamp mapping', () => {
    it('prefers timestamp over @timestamp, time and ts', () => {
      const record = asRecord(
        adapter.parse(
          '{"body":"x","timestamp":"2026-09-08T10:00:00Z","time":"2000-01-01T00:00:00Z","ts":"1999-01-01T00:00:00Z"}',
        ),
      )

      expect(record.timestamp.toISOString()).toBe('2026-09-08T10:00:00.000Z')
    })

    it('reads an ISO 8601 string without an offset as UTC', () => {
      const record = asRecord(
        adapter.parse('{"body":"x","timestamp":"2026-09-08T10:00:00"}'),
      )

      expect(record.timestamp.toISOString()).toBe('2026-09-08T10:00:00.000Z')
    })

    it('splits epoch seconds from milliseconds at 1e11 and accepts numeric strings', () => {
      const seconds = asRecord(
        adapter.parse('{"body":"x","timestamp":1757325602}'),
      )
      const millis = asRecord(
        adapter.parse('{"body":"x","timestamp":1757325602000}'),
      )
      const numericString = asRecord(
        adapter.parse('{"body":"x","timestamp":"1757325602"}'),
      )

      expect(seconds.timestamp.getTime()).toBe(1_757_325_602_000)
      expect(millis.timestamp.getTime()).toBe(1_757_325_602_000)
      expect(numericString.timestamp.getTime()).toBe(1_757_325_602_000)
    })

    it('rejects a timestamp outside 1970-01-01..9999-12-31 and accepts epoch zero', () => {
      expect(
        adapter.parse('{"body":"x","timestamp":99999999999999999}'),
      ).toMatchObject({ code: 'missing-timestamp' })
      expect(adapter.parse('{"body":"x","timestamp":-5}')).toMatchObject({
        code: 'missing-timestamp',
      })
      expect(asRecord(adapter.parse('{"body":"x","timestamp":0}')).timestamp.getTime()).toBe(0)
    })

    it('returns a verbatim missing-timestamp error when no candidate yields an instant', () => {
      const noKey = '{"body":"x"}'
      const allBad = '{"timestamp":"not a date","time":"also not"}'

      expect(adapter.parse(noKey)).toEqual({
        kind: 'parse-error',
        line: noKey,
        code: 'missing-timestamp',
      })
      expect(adapter.parse(allBad)).toEqual({
        kind: 'parse-error',
        line: allBad,
        code: 'missing-timestamp',
      })
    })
  })

  describe('severity mapping', () => {
    it('reads severity from level, then severity, then lvl', () => {
      const record = asRecord(
        adapter.parse(
          '{"body":"x","level":"error","severity":"info","timestamp":"2026-09-08T10:00:00Z"}',
        ),
      )

      expect(record.severityText).toBe('error')
      expect(record.severityNumber).toBe(17)
    })

    it('maps a recognized textual level to its band base and keeps the original token', () => {
      const record = asRecord(
        adapter.parse('{"body":"x","level":"WARNING","timestamp":"2026-09-08T10:00:00Z"}'),
      )

      expect(record.severityNumber).toBe(13)
      expect(record.severityText).toBe('WARNING')
    })

    it('leaves a numeric or numeric-string level unresolved with the value kept verbatim', () => {
      const numeric = asRecord(
        adapter.parse('{"body":"x","level":30,"timestamp":"2026-09-08T10:00:00Z"}'),
      )
      const numericString = asRecord(
        adapter.parse('{"body":"x","level":"40","timestamp":"2026-09-08T10:00:00Z"}'),
      )

      expect(numeric).toMatchObject({ severityNumber: null, severityText: '30' })
      expect(numericString).toMatchObject({ severityNumber: null, severityText: '40' })
    })

    it('yields null severity when no severity candidate key is present', () => {
      const record = asRecord(
        adapter.parse('{"body":"x","timestamp":"2026-09-08T10:00:00Z"}'),
      )

      expect(record.severityNumber).toBeNull()
      expect(record.severityText).toBeNull()
    })
  })

  describe('resource and correlation mapping', () => {
    it('resolves serviceName from service, then service_name, then logger', () => {
      const record = asRecord(
        adapter.parse(
          '{"body":"x","service":"checkout","logger":"billing","timestamp":"2026-09-08T10:00:00Z"}',
        ),
      )

      expect(record.serviceName).toBe('checkout')
    })

    it('resolves host, environment, trace and span by precedence and defaults them to null', () => {
      const mapped = asRecord(
        adapter.parse(
          '{"body":"x","host":"h1","hostname":"h2","env":"prod","traceId":"t-1","span_id":"s-1","timestamp":"2026-09-08T10:00:00Z"}',
        ),
      )
      expect({
        host: mapped.host,
        environment: mapped.environment,
        traceId: mapped.traceId,
        spanId: mapped.spanId,
      }).toEqual({ host: 'h1', environment: 'prod', traceId: 't-1', spanId: 's-1' })

      const bare = asRecord(
        adapter.parse('{"body":"x","timestamp":"2026-09-08T10:00:00Z"}'),
      )
      expect({
        host: bare.host,
        environment: bare.environment,
        traceId: bare.traceId,
        spanId: bare.spanId,
      }).toEqual({ host: null, environment: null, traceId: null, spanId: null })
    })
  })

  describe('attributes and raw', () => {
    it('removes only the promoted key and keeps a losing alias that holds another value', () => {
      const record = asRecord(
        adapter.parse(
          '{"message":"real","msg":"different","timestamp":"2026-09-08T10:00:00Z"}',
        ),
      )

      expect(record.attributes).toEqual({ msg: 'different' })
    })

    it('keeps every unmapped key in attributes with its value unchanged', () => {
      const record = asRecord(
        adapter.parse(
          '{"body":"x","timestamp":"2026-09-08T10:00:00Z","context":{"a":1},"tags":["p","q"]}',
        ),
      )

      expect(record.attributes).toMatchObject({
        context: { a: 1 },
        tags: ['p', 'q'],
      })
    })

    it('produces empty attributes when every source key was promoted', () => {
      const record = asRecord(
        adapter.parse(
          '{"message":"x","service":"s","timestamp":"2026-09-08T10:00:00Z"}',
        ),
      )

      expect(record.attributes).toEqual({})
    })

    it('carries raw as the exact string passed to parse', () => {
      const line = '{"timestamp":"2026-09-08T10:00:00Z",  "message" :  "spaced out"  }'
      const record = asRecord(adapter.parse(line))

      expect(record.raw).toBe(line)
    })
  })

  describe('malformed input', () => {
    it('reports a line that is not valid JSON as malformed-syntax, verbatim', () => {
      const line = '{ not: valid json'

      expect(adapter.parse(line)).toEqual({
        kind: 'parse-error',
        line,
        code: 'malformed-syntax',
      })
    })

    it('reports valid JSON that is not an object as unrecognized-shape, verbatim', () => {
      for (const line of ['[1,2]', '"a string"', '42', 'true', 'null']) {
        expect(adapter.parse(line)).toEqual({
          kind: 'parse-error',
          line,
          code: 'unrecognized-shape',
        })
      }
    })

    it('reports a blank or whitespace-only line as empty-line', () => {
      expect(adapter.parse('')).toMatchObject({ code: 'empty-line' })
      expect(adapter.parse('   \t ')).toMatchObject({ code: 'empty-line' })
    })

    it('gives every parse error the verbatim line and a code from the port union', () => {
      const codes = ['empty-line', 'malformed-syntax', 'unrecognized-shape', 'missing-timestamp']
      const cases = ['', '{bad', '[1]', '{"body":"x"}']

      for (const line of cases) {
        const result = adapter.parse(line)
        if (!isParseError(result)) {
          throw new Error(`expected a parse error for ${JSON.stringify(line)}`)
        }
        expect(result.line).toBe(line)
        expect(codes).toContain(result.code)
      }
    })
  })

  describe('fixture', () => {
    it('covers the JSON Lines shapes the DoD requires', () => {
      const lines = fixtureLines()

      expect(lines.length).toBeGreaterThanOrEqual(7)
      expect(lines).toContainEqual(expect.stringContaining('"level":"info"'))
      expect(lines).toContainEqual(expect.stringContaining('"@timestamp"'))
      expect(lines.some((line) => /^\{"message":"[^"]+","timestamp":\d+\}$/.test(line))).toBe(
        true,
      )
      expect(lines).toContainEqual(expect.stringContaining('"http":{'))
      expect(lines.some((line) => /"time":\d{13}/.test(line))).toBe(true)
      expect(lines.some((line) => line.trim().length > 0 && !line.trim().startsWith('{'))).toBe(
        true,
      )
      expect(
        lines.some((line) => {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>
            return (
              typeof parsed === 'object' &&
              !('timestamp' in parsed) &&
              !('time' in parsed) &&
              !('@timestamp' in parsed) &&
              !('ts' in parsed)
            )
          } catch {
            return false
          }
        }),
      ).toBe(true)
    })

    it('maps each valid fixture line and rejects the malformed and timestamp-less ones', () => {
      const results = fixtureLines().map((line) => adapter.parse(line))
      const at = (index: number): ParseResult => {
        const result = results[index]
        if (result === undefined) {
          throw new Error(`no fixture result at index ${index}`)
        }
        return result
      }
      const [listening, declined, cacheWarm, request, poolResized, garbage, orphan] = [
        at(0),
        at(1),
        at(2),
        at(3),
        at(4),
        at(5),
        at(6),
      ]

      expect(asRecord(listening)).toMatchObject({
        body: 'server listening on port 3000',
        serviceName: 'api-gateway',
        severityNumber: 9,
        severityText: 'info',
      })
      expect(asRecord(listening).timestamp.toISOString()).toBe('2026-09-08T10:00:00.000Z')

      expect(asRecord(declined)).toMatchObject({
        body: 'payment declined for order 88213',
        serviceName: 'billing',
        severityNumber: 17,
        severityText: 'ERROR',
      })

      expect(asRecord(cacheWarm)).toMatchObject({ body: 'cache warm complete' })
      expect(asRecord(cacheWarm).timestamp.getTime()).toBe(1_757_325_602_000)

      expect(asRecord(request)).toMatchObject({ severityNumber: 13, severityText: 'warn' })
      expect(asRecord(request).timestamp.getTime()).toBe(1_757_325_603_000)
      expect(asRecord(request).attributes).toMatchObject({
        http: { method: 'GET', path: '/v1/logs', status: 200, duration_ms: 142 },
      })

      expect(asRecord(poolResized)).toMatchObject({ severityNumber: 5, severityText: 'debug' })
      expect(asRecord(poolResized).timestamp.toISOString()).toBe('2026-09-08T10:00:04.000Z')

      expect(garbage).toMatchObject({ kind: 'parse-error', code: 'malformed-syntax' })
      expect(orphan).toMatchObject({ kind: 'parse-error', code: 'missing-timestamp' })
    })
  })
})
