import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { DomainError } from '../../../shared/errors/domain-error'

import { selectAdapter } from '../core/services/adapter-selection'

import {
  fallbackAdapter,
  registeredAdapters,
  resolveAdapter,
  UnknownSourceTypeError,
} from './adapter-registry'

const gcpSample = (): string[] => {
  const entries = JSON.parse(
    readFileSync(
      new URL('./adapters/__fixtures__/gcp-cloud-logging.json', import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>

  return Object.values(entries).map((entry) => JSON.stringify(entry))
}

const cloudwatchSample = (): string[] => {
  const doc = JSON.parse(
    readFileSync(
      new URL('./adapters/__fixtures__/aws-cloudwatch.json', import.meta.url),
      'utf8',
    ),
  ) as {
    logGroup: string
    logStream: string
    logEvents: { id: string; timestamp: number; message: string }[]
  }

  return doc.logEvents.map((event) =>
    JSON.stringify({
      logGroup: doc.logGroup,
      logStream: doc.logStream,
      id: event.id,
      timestamp: event.timestamp,
      message: event.message,
    }),
  )
}

const jsonLinesSample = (): string[] =>
  readFileSync(
    new URL('./adapters/__fixtures__/json-lines.jsonl', import.meta.url),
    'utf8',
  )
    .split('\n')
    .filter((line) => line.trim().length > 0)

const genericJsonSample = [
  '{"msg":"server started","lvl":"info","when":"2026-01-01T00:00:00Z"}',
  '{"msg":"request served","lvl":"info","when":"2026-01-01T00:00:01Z"}',
]

describe('adapter registry', () => {
  it('enumerates the three existing adapters by source type', () => {
    expect(registeredAdapters.map((adapter) => adapter.sourceType).sort()).toEqual(
      ['aws-cloudwatch', 'gcp-cloud-logging', 'json-lines'],
    )
  })

  it('designates the json-lines adapter as the fallback', () => {
    expect(fallbackAdapter.sourceType).toBe('json-lines')
  })

  it('resolves an undirected sample to the adapter the selection rule chooses', () => {
    const sample = gcpSample()

    expect(resolveAdapter(sample)).toBe(
      selectAdapter(registeredAdapters, fallbackAdapter, sample),
    )
    expect(resolveAdapter(sample).sourceType).toBe('gcp-cloud-logging')
  })

  it('returns the named adapter on override without consulting detection', () => {
    expect(resolveAdapter(gcpSample(), 'json-lines')).toBe(fallbackAdapter)
    expect(resolveAdapter([], 'aws-cloudwatch').sourceType).toBe('aws-cloudwatch')
  })

  it('raises a typed error for an unknown source type instead of detecting', () => {
    expect(() => resolveAdapter(gcpSample(), 'acme-logs')).toThrow(
      UnknownSourceTypeError,
    )

    try {
      resolveAdapter(gcpSample(), 'acme-logs')
      expect.unreachable('expected resolveAdapter to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownSourceTypeError)
      expect((error as UnknownSourceTypeError).message).toContain('acme-logs')
    }
  })

  it('models the unknown-source-type error as a typed domain error with a stable code', () => {
    try {
      resolveAdapter([], 'nope')
      expect.unreachable('expected resolveAdapter to throw')
    } catch (error) {
      expect(typeof error).not.toBe('string')
      expect(error).toBeInstanceOf(DomainError)
      expect(error).toBeInstanceOf(Error)
      expect((error as DomainError).code).toBe('unknown-source-type')
    }
  })

  it('accepts a ready string sample and resolves synchronously', () => {
    const result = resolveAdapter(['{"msg":"x","lvl":"info","ts":1}'])

    expect(result).not.toBeInstanceOf(Promise)
    expect(typeof result.parse).toBe('function')
  })

  it('resolves each committed adapter fixture to its own adapter', () => {
    expect(resolveAdapter(gcpSample()).sourceType).toBe('gcp-cloud-logging')
    expect(resolveAdapter(cloudwatchSample()).sourceType).toBe('aws-cloudwatch')
    expect(resolveAdapter(jsonLinesSample()).sourceType).toBe('json-lines')
  })

  it('resolves a sample no format-specific adapter claims to json-lines', () => {
    expect(resolveAdapter(genericJsonSample).sourceType).toBe('json-lines')
  })
})
