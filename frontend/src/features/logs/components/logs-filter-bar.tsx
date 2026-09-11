import { useRef, useState, type ReactNode } from 'react'

import { Checkbox } from '../../../shared/ui/checkbox'
import { DateTimeField } from '../../../shared/ui/date-time-field'
import { Input } from '../../../shared/ui/input'
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

const FIELD = 'h-8 text-xs'

type LogsFilterBarProps = {
  readonly filters: LogFilters
  readonly onChange: (filters: LogFilters) => void
}

export function LogsFilterBar({ filters, onChange }: LogsFilterBarProps) {
  function commitSearch(value: string) {
    const next = value.length >= MIN_SEARCH_LENGTH ? value : null
    if (next !== filters.q) {
      onChange({ ...filters, q: next })
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
      <SearchField externalValue={filters.q ?? ''} onCommit={commitSearch} />
      <ServiceField
        externalValue={filters.service ?? ''}
        onCommit={commitService}
      />
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

function useDebouncedInput(
  externalValue: string,
  onSettle: (value: string) => void,
) {
  const timer = useRef<number | undefined>(undefined)
  const lastExternal = useRef(externalValue)
  const [draft, setDraft] = useState(externalValue)
  const [pending, setPending] = useState(false)
  const [focused, setFocused] = useState(false)

  if (!focused && externalValue !== lastExternal.current) {
    lastExternal.current = externalValue
    setDraft(externalValue)
    setPending(false)
  }

  function commit(value: string) {
    window.clearTimeout(timer.current)
    setPending(false)
    onSettle(value)
  }

  function onChange(value: string) {
    setDraft(value)
    setPending(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => commit(value), SEARCH_DEBOUNCE_MS)
  }

  return {
    draft,
    pending,
    onChange,
    commitNow: () => commit(draft),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  }
}

type SearchFieldProps = {
  readonly externalValue: string
  readonly onCommit: (value: string) => void
}

function SearchField({ externalValue, onCommit }: SearchFieldProps) {
  const { draft, pending, onChange, onFocus, onBlur } = useDebouncedInput(
    externalValue,
    onCommit,
  )
  const remaining = MIN_SEARCH_LENGTH - draft.length
  const hint =
    draft.length > 0 && remaining > 0
      ? `Type ${remaining} more character${remaining === 1 ? '' : 's'}`
      : pending
        ? 'Searching…'
        : null

  return (
    <Field label="Search">
      <Input
        data-testid="logs-search"
        type="search"
        aria-label="Search message"
        value={draft}
        placeholder={`Min ${MIN_SEARCH_LENGTH} characters`}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`${FIELD} w-64`}
      />
      <span
        data-testid="logs-search-hint"
        aria-live="polite"
        className="block text-[11px] text-muted-foreground"
      >
        {hint}
      </span>
    </Field>
  )
}

type ServiceFieldProps = {
  readonly externalValue: string
  readonly onCommit: (value: string) => void
}

function ServiceField({ externalValue, onCommit }: ServiceFieldProps) {
  const { draft, pending, onChange, commitNow, onFocus, onBlur } =
    useDebouncedInput(externalValue, onCommit)

  return (
    <Field label="Service">
      <Input
        data-testid="service-filter"
        aria-label="Service"
        value={draft}
        placeholder="Any service"
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commitNow()
          }
        }}
        onFocus={onFocus}
        onBlur={() => {
          onBlur()
          commitNow()
        }}
        className={`${FIELD} w-36`}
      />
      <span
        data-testid="service-filter-hint"
        aria-live="polite"
        className="block text-[11px] text-muted-foreground"
      >
        {pending ? 'Applying…' : null}
      </span>
    </Field>
  )
}
