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

  it('reads an explicit from/to window when the range is custom', () => {
    const range = parseTimeRange(
      new URLSearchParams(
        'range=custom&from=2026-06-01T00:00:00.000Z&to=2026-06-10T00:00:00.000Z',
      ),
      NOW,
    )
    expect(range).toEqual({
      preset: 'custom',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-10T00:00:00.000Z',
    })
  })

  it('falls back to the default preset when the custom window is incomplete or inverted', () => {
    expect(
      parseTimeRange(
        new URLSearchParams('range=custom&from=2026-06-01T00:00:00.000Z'),
        NOW,
      ).preset,
    ).toBe('24h')
    expect(
      parseTimeRange(
        new URLSearchParams(
          'range=custom&from=2026-06-10T00:00:00.000Z&to=2026-06-01T00:00:00.000Z',
        ),
        NOW,
      ).preset,
    ).toBe('24h')
  })
})

describe('timeRangeToSearchParams', () => {
  it('round-trips a preset through the url', () => {
    const params = timeRangeToSearchParams({ preset: '7d' })
    expect(parseTimeRange(params, NOW).preset).toBe('7d')
  })

  it('round-trips a custom range through the url', () => {
    const params = timeRangeToSearchParams({
      preset: 'custom',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-10T00:00:00.000Z',
    })
    expect(parseTimeRange(params, NOW)).toEqual({
      preset: 'custom',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-10T00:00:00.000Z',
    })
  })
})
