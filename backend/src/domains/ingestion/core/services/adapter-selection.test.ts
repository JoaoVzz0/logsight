import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type {
  LogSourceAdapter,
  ParseResult,
  SourceType,
} from '../../ports/log-source-adapter'

import { selectAdapter } from './adapter-selection'

type FakeOptions = {
  readonly sourceType?: SourceType
  readonly marker?: string
}

const fakeAdapter = (
  score: number,
  { sourceType = 'json-lines', marker }: FakeOptions = {},
): LogSourceAdapter & { readonly marker?: string } => ({
  sourceType,
  ...(marker === undefined ? {} : { marker }),
  detect: () => score,
  parse: (line): ParseResult => ({
    kind: 'parse-error',
    line,
    code: 'unrecognized-shape',
  }),
})

describe('selectAdapter', () => {
  it('returns one of the adapters it was given', () => {
    const chatty = fakeAdapter(0.1)
    const claimant = fakeAdapter(0.4)
    const quiet = fakeAdapter(0.2)

    const result = selectAdapter([chatty, claimant, quiet], chatty, ['line'])

    expect([chatty, claimant, quiet]).toContain(result)
  })

  it('returns the adapter with the single strictly highest detect score', () => {
    const low = fakeAdapter(0.2)
    const high = fakeAdapter(0.9)
    const lowest = fakeAdapter(0.1)

    expect(selectAdapter([low, high, lowest], lowest, ['line'])).toBe(high)
  })

  it('breaks a tie for the top score by supplied order when the fallback is not tied', () => {
    const first = fakeAdapter(0.8)
    const second = fakeAdapter(0.8)
    const fallback = fakeAdapter(0.1)

    expect(selectAdapter([first, second, fallback], fallback, ['line'])).toBe(
      first,
    )
  })

  it('returns the fallback when it shares the top score with others', () => {
    const other = fakeAdapter(0.8)
    const fallback = fakeAdapter(0.8)
    const lowest = fakeAdapter(0.1)

    expect(selectAdapter([other, fallback, lowest], fallback, ['line'])).toBe(
      fallback,
    )
  })

  it('returns the fallback when every adapter scores zero, including an empty sample', () => {
    const one = fakeAdapter(0)
    const two = fakeAdapter(0)
    const fallback = fakeAdapter(0)
    const registry = [one, two, fallback]

    expect(selectAdapter(registry, fallback, ['line'])).toBe(fallback)
    expect(selectAdapter(registry, fallback, [])).toBe(fallback)
  })

  it('selects an adapter scoring 0.4 over a fallback scoring 0.3 with no fixed threshold', () => {
    const claimant = fakeAdapter(0.4)
    const fallback = fakeAdapter(0.3)
    const silent = fakeAdapter(0)

    expect(
      selectAdapter([claimant, fallback, silent], fallback, ['line']),
    ).toBe(claimant)
  })

  it('honours whichever adapter is designated the fallback, not one named json-lines', () => {
    const gcp = fakeAdapter(0, { sourceType: 'gcp-cloud-logging' })
    const cloudwatch = fakeAdapter(0, { sourceType: 'aws-cloudwatch' })
    const nginx = fakeAdapter(0, { sourceType: 'nginx' })

    expect(
      selectAdapter([gcp, cloudwatch, nginx], cloudwatch, ['line']),
    ).toBe(cloudwatch)
  })

  it('returns the exact adapter instance passed in, never a string or a copy', () => {
    const winner = fakeAdapter(0.9, { marker: 'winner' })
    const fallback = fakeAdapter(0.1)

    const result = selectAdapter([winner, fallback], fallback, ['line']) as {
      marker?: string
    }

    expect(typeof result).toBe('object')
    expect(result).toBe(winner)
    expect(result.marker).toBe('winner')
  })

  it('imports nothing from infra or a concrete adapter', () => {
    const source = readFileSync(
      new URL('./adapter-selection.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toMatch(/from ['"][^'"]*infra/)
    expect(source).not.toMatch(/adapters\//)
  })
})
