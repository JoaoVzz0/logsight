import { useRef, type KeyboardEvent } from 'react'

import {
  MIN_SEARCH_LENGTH,
  type LogFilters,
  type SeverityLevelFilter,
} from '../model/filters'
import type { SeverityKey } from '../model/severity'

const SEARCH_DEBOUNCE_MS = 300

const SEVERITY_OPTIONS: {
  key: SeverityKey
  label: string
  values: SeverityLevelFilter[]
}[] = [
  { key: 'fatal', label: 'Fatal', values: [21, 22, 23, 24] },
  { key: 'error', label: 'Error', values: [17, 18, 19, 20] },
  { key: 'warn', label: 'Warn', values: [13, 14, 15, 16] },
  { key: 'info', label: 'Info', values: [9, 10, 11, 12] },
  { key: 'debug', label: 'Debug', values: [5, 6, 7, 8] },
  { key: 'trace', label: 'Trace', values: [1, 2, 3, 4] },
  { key: 'unknown', label: 'Unknown', values: ['unknown'] },
]

const FIELD =
  'h-8 rounded-md border border-border bg-surface-raised px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline focus:outline-2 focus:outline-ring'

type LogsFilterBarProps = {
  readonly filters: LogFilters
  readonly onChange: (filters: LogFilters) => void
}

export function LogsFilterBar({ filters, onChange }: LogsFilterBarProps) {
  const searchTimer = useRef<number | undefined>(undefined)

  function commitSearch(value: string) {
    const next = value.length >= MIN_SEARCH_LENGTH ? value : null
    if (next !== filters.q) {
      onChange({ ...filters, q: next })
    }
  }

  function onSearchInput(value: string) {
    window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(
      () => commitSearch(value),
      SEARCH_DEBOUNCE_MS,
    )
  }

  function onServiceKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commitService(event.currentTarget.value)
    }
  }

  function commitService(raw: string) {
    const value = raw.trim()
    onChange({ ...filters, service: value === '' ? null : value })
  }

  function toggleLevel(values: SeverityLevelFilter[], checked: boolean) {
    const remaining = filters.level.filter((level) => !values.includes(level))
    onChange({
      ...filters,
      level: checked ? [...remaining, ...values] : remaining,
    })
  }

  function setBound(field: 'from' | 'to', localValue: string) {
    const iso = localValue === '' ? null : new Date(localValue).toISOString()
    onChange(
      field === 'from'
        ? { ...filters, from: iso }
        : { ...filters, to: iso },
    )
  }

  return (
    <div
      data-testid="logs-filters"
      className="flex flex-wrap items-center gap-2 pb-3"
    >
      <input
        key={filters.q ?? ''}
        data-testid="logs-search"
        type="search"
        aria-label="Search message"
        defaultValue={filters.q ?? ''}
        placeholder={`Search message (min ${MIN_SEARCH_LENGTH} chars)`}
        onChange={(event) => onSearchInput(event.currentTarget.value)}
        className={`${FIELD} w-64`}
      />
      <input
        key={filters.service ?? ''}
        data-testid="service-filter"
        aria-label="Service"
        defaultValue={filters.service ?? ''}
        placeholder="Service"
        onKeyDown={onServiceKeyDown}
        onBlur={(event) => commitService(event.currentTarget.value)}
        className={`${FIELD} w-40`}
      />
      <input
        key={`from-${filters.from ?? ''}`}
        data-testid="from-filter"
        type="datetime-local"
        aria-label="From"
        defaultValue={toLocalInput(filters.from)}
        onChange={(event) => setBound('from', event.currentTarget.value)}
        className={FIELD}
      />
      <input
        key={`to-${filters.to ?? ''}`}
        data-testid="to-filter"
        type="datetime-local"
        aria-label="To"
        defaultValue={toLocalInput(filters.to)}
        onChange={(event) => setBound('to', event.currentTarget.value)}
        className={FIELD}
      />
      <div data-testid="level-filter" className="flex flex-wrap items-center gap-2">
        {SEVERITY_OPTIONS.map((option) => (
          <label key={option.key} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={option.values.every((value) =>
                filters.level.includes(value),
              )}
              onChange={(event) =>
                toggleLevel(option.values, event.currentTarget.checked)
              }
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  )
}

function toLocalInput(iso: string | null): string {
  if (iso === null) {
    return ''
  }
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
