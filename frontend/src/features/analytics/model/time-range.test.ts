import { describe, expect, it } from 'vitest'

import { parseTimeRange, timeRangeToSearchParams } from './time-range'

const NOW = new Date('2026-06-15T12:00:00.000Z')

describe('parseTimeRange', () => {
  it('defaults to 24h when the range param is missing or invalid', () => {
    expect(parseTimeRange(new URLSearchParams(''), NOW).preset).toBe('24h')
    expect(parseTimeRange(new URLSearchParams('range=bogus'), NOW).preset).toBe(
      '24h',
    )
  })

  it('resolves from/to as a window of the preset duration ending at now', () => {
    const range = parseTimeRange(new URLSearchParams('range=1h'), NOW)
    expect(range.to).toBe(NOW.toISOString())
    expect(range.from).toBe('2026-06-15T11:00:00.000Z')
  })
})

describe('timeRangeToSearchParams', () => {
  it('round-trips a preset through the url', () => {
    const params = timeRangeToSearchParams('7d')
    expect(parseTimeRange(params, NOW).preset).toBe('7d')
  })
})
