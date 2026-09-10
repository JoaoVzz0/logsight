import { describe, expect, it } from 'vitest'

import { filtersToQuery, parseLogFilters, type LogFilters } from './filters'

describe('parseLogFilters', () => {
  it('drops a searchParam that fails validation and keeps the valid ones', () => {
    const params = new URLSearchParams(
      'level=banana&level=17&service=checkout&from=not-a-date',
    )

    const filters = parseLogFilters(params)

    expect(filters.level).toEqual([17])
    expect(filters.service).toBe('checkout')
    expect(filters.from).toBeNull()
  })
})

describe('filtersToQuery', () => {
  it('maps active filters to query params and omits a search under the minimum length', () => {
    const active: LogFilters = {
      level: [17, 'unknown'],
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      service: 'api',
      q: 'timeout',
    }
    expect(filtersToQuery(active)).toEqual({
      level: [17, 'unknown'],
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      service: 'api',
      q: 'timeout',
    })

    const shortSearch: LogFilters = {
      level: [],
      from: null,
      to: null,
      service: null,
      q: 'ab',
    }
    expect(filtersToQuery(shortSearch)).toEqual({})
  })
})
