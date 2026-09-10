import { describe, expect, it } from 'vitest'

import type { ImportStatus } from '../api/get-import'

import {
  formatCount,
  formatDuration,
  isTerminal,
  percentComplete,
  progressLabel,
} from './progress'

const status = (overrides: Partial<ImportStatus>): ImportStatus => ({
  id: '00000000-0000-0000-0000-000000000000',
  filename: 'app.log',
  status: 'running',
  sourceType: null,
  totalLines: 1_000_000,
  processedLines: 280_000,
  parseErrors: 0,
  createdAt: '2026-09-10T00:00:00.000Z',
  finishedAt: null,
  error: null,
  result: null,
  ...overrides,
})

describe('formatCount', () => {
  it('abbreviates thousands and millions and drops a trailing zero', () => {
    expect(formatCount(940)).toBe('940')
    expect(formatCount(340_000)).toBe('340k')
    expect(formatCount(1_000_000)).toBe('1M')
    expect(formatCount(1_250_000)).toBe('1.3M')
  })
})

describe('percentComplete', () => {
  it('is the processed share, and null when the total is unknown', () => {
    expect(percentComplete(status({ processedLines: 280_000 }))).toBe(28)
    expect(percentComplete(status({ totalLines: null }))).toBeNull()
    expect(percentComplete(status({ totalLines: 0 }))).toBeNull()
  })
})

describe('progressLabel', () => {
  it('reads as counts, percent and a pluralised error tail', () => {
    expect(progressLabel(status({}))).toBe('280k of 1M (28%)')
    expect(progressLabel(status({ parseErrors: 1 }))).toBe(
      '280k of 1M (28%) · 1 parse error',
    )
    expect(progressLabel(status({ parseErrors: 4 }))).toBe(
      '280k of 1M (28%) · 4 parse errors',
    )
    expect(progressLabel(status({ totalLines: null }))).toBe('280k lines')
  })
})

describe('formatDuration', () => {
  it('scales from milliseconds to minutes', () => {
    expect(formatDuration(420)).toBe('420 ms')
    expect(formatDuration(2_500)).toBe('2.5 s')
    expect(formatDuration(90_000)).toBe('1m 30s')
  })
})

describe('isTerminal', () => {
  it('is true only for completed and failed', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('running')).toBe(false)
    expect(isTerminal('pending')).toBe(false)
  })
})
