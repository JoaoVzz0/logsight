import { useRef, type KeyboardEvent, type ReactNode } from 'react'

import { Checkbox } from '../../../shared/ui/checkbox'
import { Input } from '../../../shared/ui/input'
import {
  MIN_SEARCH_LENGTH,
  type LogFilters,
  type SeverityLevelFilter,
} from '../model/filters'
import type { SeverityKey } from '../model/severity'

import { DateTimeField } from './date-time-field'

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

const FIELD = 'h-8 text-xs'

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

  function setBound(field: 'from' | 'to', iso: string | null) {
    onChange(
      field === 'from' ? { ...filters, from: iso } : { ...filters, to: iso },
    )
  }

  return (
    <div
      data-testid="logs-filters"
      className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-border pb-4"
    >
      <Field label="Search">
        <Input
          key={filters.q ?? ''}
          data-testid="logs-search"
          type="search"
          aria-label="Search message"
          defaultValue={filters.q ?? ''}
          placeholder={`Min ${MIN_SEARCH_LENGTH} characters`}
          onChange={(event) => onSearchInput(event.currentTarget.value)}
          className={`${FIELD} w-64`}
        />
      </Field>
      <Field label="Service">
        <Input
          key={filters.service ?? ''}
          data-testid="service-filter"
          aria-label="Service"
          defaultValue={filters.service ?? ''}
          placeholder="Any service"
          onKeyDown={onServiceKeyDown}
          onBlur={(event) => commitService(event.currentTarget.value)}
          className={`${FIELD} w-36`}
        />
      </Field>
      <Field label="From">
        <DateTimeField
          testId="from-filter"
          ariaLabel="From"
          value={filters.from}
          onChange={(iso) => setBound('from', iso)}
        />
      </Field>
      <Field label="To">
        <DateTimeField
          testId="to-filter"
          ariaLabel="To"
          value={filters.to}
          onChange={(iso) => setBound('to', iso)}
        />
      </Field>
      <Field label="Severity">
        <div
          data-testid="level-filter"
          className="flex h-8 flex-wrap items-center gap-x-3 gap-y-1.5"
        >
          {SEVERITY_OPTIONS.map((option) => (
            <label
              key={option.key}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Checkbox
                checked={option.values.every((value) =>
                  filters.level.includes(value),
                )}
                onCheckedChange={(checked) =>
                  toggleLevel(option.values, checked === true)
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </Field>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/70">
        {label}
      </span>
      {children}
    </div>
  )
}
