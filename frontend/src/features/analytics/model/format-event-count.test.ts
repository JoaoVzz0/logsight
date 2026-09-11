import { describe, expect, it } from 'vitest'

import { formatEventCount } from './format-event-count'

describe('formatEventCount', () => {
  it('uses the singular for exactly one event', () => {
    expect(formatEventCount(1)).toBe('1 event')
  })

  it('uses the plural for zero or more than one event', () => {
    expect(formatEventCount(0)).toBe('0 events')
    expect(formatEventCount(40)).toBe('40 events')
  })
})
