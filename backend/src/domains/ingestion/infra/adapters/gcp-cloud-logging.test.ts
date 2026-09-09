import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { LogRecord } from '../../core/log-record'
import { normalizeSeverity } from '../../core/services/severity'
import type { ParseError, ParseResult } from '../../ports/log-source-adapter'

import { gcpCloudLoggingAdapter } from './gcp-cloud-logging'

const fixtures = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/gcp-cloud-logging.json', import.meta.url),
    'utf8',
  ),
) as Record<string, Record<string, unknown>>

const fixture = (name: string): Record<string, unknown> => {
  const entry = fixtures[name]
  if (entry === undefined) {
    throw new Error(`missing fixture: ${name}`)
  }
  return entry
}

const lineOf = (name: string): string => JSON.stringify(fixture(name))

const isParseError = (result: ParseResult): result is ParseError =>
  'kind' in result && result.kind === 'parse-error'

const record = (name: string): LogRecord => {
  const result = gcpCloudLoggingAdapter.parse(lineOf(name))
  if (isParseError(result)) {
    throw new Error(`expected a record for ${name}, got ${result.code}`)
  }
  return result
}

const parsed = (entry: Record<string, unknown>): ParseResult =>
  gcpCloudLoggingAdapter.parse(JSON.stringify(entry))

describe('gcpCloudLoggingAdapter.detect', () => {
  it('returns high confidence for a JSON object carrying the LogEntry markers', () => {
    expect(gcpCloudLoggingAdapter.detect([lineOf('cloudRunError')])).toBeGreaterThanOrEqual(
      0.9,
    )
  })

  it('returns low or zero confidence for a plain JSON object with no LogEntry markers', () => {
    expect(
      gcpCloudLoggingAdapter.detect(['{"message":"checkout failed","level":"error"}']),
    ).toBeLessThan(0.5)
  })
})

describe('gcpCloudLoggingAdapter.parse — payload to body', () => {
  it('uses textPayload as body when present', () => {
    expect(record('cloudRunError').body).toBe(
      'checkout failed for order 4471: payment gateway timeout',
    )
  })

  it('uses the jsonPayload message field as body', () => {
    expect(record('k8sJsonMessage').body).toBe(
      'cache miss for key user:8829 region eu-west-1',
    )
  })

  it('uses the serialized jsonPayload as body when there is no message field', () => {
    expect(record('gceJsonNoMessage').body).toBe(
      JSON.stringify(fixture('gceJsonNoMessage').jsonPayload),
    )
  })

  it('prefers textPayload over jsonPayload when, against spec, both are present', () => {
    expect(record('bothPayloads').body).toBe('text payload wins')
  })
})

describe('gcpCloudLoggingAdapter.parse — timestamp', () => {
  it('maps the RFC 3339 LogEntry timestamp to the record timestamp', () => {
    expect(record('cloudRunError').timestamp).toEqual(
      new Date('2026-09-08T10:15:30.123456789Z'),
    )
  })

  it('yields a ParseError, not a record, for an absent or unparseable timestamp', () => {
    expect(parsed(fixture('noTimestamp'))).toMatchObject({ kind: 'parse-error' })
    expect(parsed({ ...fixture('cloudRunError'), timestamp: 'not-a-date' })).toMatchObject({
      kind: 'parse-error',
    })
  })
})

describe('gcpCloudLoggingAdapter.parse — resource to service', () => {
  it('derives service_name from resource.labels by resource.type', () => {
    expect(record('cloudRunError').serviceName).toBe('checkout')
    expect(record('k8sJsonMessage').serviceName).toBe('api')
    expect(record('gceJsonNoMessage').serviceName).toBe('8829374652901234')
    expect(record('gaeText').serviceName).toBe('default')
  })

  it('leaves service_name null for an uncovered resource.type and still assembles the record', () => {
    const result = record('unmappedResource')

    expect(result.serviceName).toBeNull()
    expect(result.body).toBe('message 112233 published to order-events')
  })

  it('does not duplicate a resource label into attributes once it is promoted to a typed field', () => {
    const labels = record('cloudRunError').attributes.labels

    expect(labels).not.toHaveProperty('service_name')
    expect(labels).toHaveProperty('revision_name', 'checkout-00042-hex')
  })
})

describe('gcpCloudLoggingAdapter.parse — severity', () => {
  it('maps a recognized severity string through the shared normalizer and keeps severity_text verbatim', () => {
    const result = record('cloudRunError')

    expect(result.severityNumber).toBe(normalizeSeverity('ERROR').severityNumber)
    expect(result.severityText).toBe('ERROR')
  })

  it('yields a null severity_number for DEFAULT, an unrecognized value, or an absent field, and still assembles', () => {
    const asDefault = record('defaultSeverity')
    expect(asDefault.severityNumber).toBeNull()
    expect(asDefault.severityText).toBe('DEFAULT')

    const unrecognized = parsed({ ...fixture('cloudRunError'), severity: 'BOGUS' })
    expect(isParseError(unrecognized)).toBe(false)
    if (!isParseError(unrecognized)) {
      expect(unrecognized.severityNumber).toBeNull()
      expect(unrecognized.severityText).toBe('BOGUS')
    }

    const absent = record('noSeverity')
    expect(absent.severityNumber).toBeNull()
    expect(absent.severityText).toBeNull()
  })
})

describe('gcpCloudLoggingAdapter.parse — trace and span', () => {
  it('extracts the trailing id from a projects/PROJECT/traces/TRACE_ID trace field', () => {
    expect(record('cloudRunError').traceId).toBe('0f8fad5bd9cb469fa16570867728950e')
  })

  it('maps the spanId field to span_id', () => {
    expect(record('cloudRunError').spanId).toBe('000000000000004a')
  })

  it('leaves trace_id and span_id null when trace and spanId are absent', () => {
    const result = record('noTrace')

    expect(result.traceId).toBeNull()
    expect(result.spanId).toBeNull()
  })
})

describe('gcpCloudLoggingAdapter.parse — attributes and raw', () => {
  it('carries labels, httpRequest, operation, insertId and unused jsonPayload keys in attributes', () => {
    const runAttributes = record('cloudRunError').attributes

    expect(runAttributes.httpRequest).toEqual(fixture('cloudRunError').httpRequest)
    expect(runAttributes.operation).toEqual(fixture('cloudRunError').operation)
    expect(runAttributes.insertId).toBe('1a2b3c4d5e6f')
    expect(runAttributes.labels).toMatchObject({ instanceId: '00bf4bf000', team: 'payments' })

    const jsonAttributes = record('k8sJsonMessage').attributes
    expect(jsonAttributes).toMatchObject({ latencyMs: 42, cacheKey: 'user:8829' })
    expect(jsonAttributes).not.toHaveProperty('message')
  })

  it('carries raw as the original line text exactly as received', () => {
    const line = `  ${lineOf('cloudRunError')}  \t`
    const result = gcpCloudLoggingAdapter.parse(line)

    expect(isParseError(result)).toBe(false)
    if (!isParseError(result)) {
      expect(result.raw).toBe(line)
    }
  })

  it('sets source_type to gcp-cloud-logging on every record', () => {
    expect(record('cloudRunError').sourceType).toBe('gcp-cloud-logging')
    expect(record('gaeText').sourceType).toBe('gcp-cloud-logging')
  })
})

describe('gcpCloudLoggingAdapter.parse — failure handling', () => {
  it('yields a ParseError carrying the line content and a reason for a line that is not valid JSON', () => {
    const line = '{ this is not json'
    const result = gcpCloudLoggingAdapter.parse(line)

    expect(isParseError(result)).toBe(true)
    if (isParseError(result)) {
      expect(result.line).toBe(line)
      expect(result.code).toBeTruthy()
    }
  })

  it('returns a ParseError as a value and never throws', () => {
    const inputs = ['', '{ broken', 'null', '"a string"', '12345', '[]']

    for (const input of inputs) {
      let result: ParseResult | undefined

      expect(() => {
        result = gcpCloudLoggingAdapter.parse(input)
      }).not.toThrow()

      expect(result && isParseError(result)).toBe(true)
    }
  })
})
