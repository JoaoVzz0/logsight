import { useRef, useState, type ReactNode } from 'react'

import type { SeverityKey } from '../../../shared/lib/severity'
import { Checkbox } from '../../../shared/ui/checkbox'
import { Input } from '../../../shared/ui/input'
import { type IssueFilters, type SeverityLevelFilter } from '../model/filters'

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

type IssuesFilterBarProps = {
  readonly filters: IssueFilters
  readonly onChange: (filters: IssueFilters) => void
}

export function IssuesFilterBar({ filters, onChange }: IssuesFilterBarProps) {
  function toggleSeverity(values: SeverityLevelFilter[], checked: boolean) {
    const remaining = filters.severity.filter(
      (severity) => !values.includes(severity),
    )
    onChange({
      ...filters,
      severity: checked ? [...remaining, ...values] : remaining,
    })
  }

  function commitService(raw: string) {
    const value = raw.trim()
    onChange({ ...filters, service: value === '' ? null : value })
  }

  return (
    <div
      data-testid="issues-filters"
      className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-border pb-4"
    >
      <ServiceField
        externalValue={filters.service ?? ''}
        onCommit={commitService}
      />
      <Field label="Severity">
        <div
          data-testid="severity-filter"
          className="flex h-8 flex-wrap items-center gap-x-3 gap-y-1.5"
        >
          {SEVERITY_OPTIONS.map((option) => (
            <label
              key={option.key}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Checkbox
                checked={option.values.every((value) =>
                  filters.severity.includes(value),
                )}
                onCheckedChange={(checked) =>
                  toggleSeverity(option.values, checked === true)
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

type ServiceFieldProps = {
  readonly externalValue: string
  readonly onCommit: (value: string) => void
}

function ServiceField({ externalValue, onCommit }: ServiceFieldProps) {
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
    onCommit(value)
  }

  function onChange(value: string) {
    setDraft(value)
    setPending(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => commit(value), SEARCH_DEBOUNCE_MS)
  }

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
            commit(draft)
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit(draft)
        }}
        className={`${FIELD} w-56`}
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
