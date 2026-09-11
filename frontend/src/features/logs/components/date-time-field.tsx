import { useState } from 'react'

import { cn } from '../../../shared/lib/cn'
import { buttonVariants } from '../../../shared/ui/button'
import { Calendar } from '../../../shared/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '../../../shared/ui/popover'

type DateTimeFieldProps = {
  readonly testId: string
  readonly ariaLabel: string
  readonly value: string | null
  readonly onChange: (iso: string | null) => void
}

export function DateTimeField({
  testId,
  ariaLabel,
  value,
  onChange,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = value === null ? undefined : new Date(value)

  function commitDate(nextDate: Date | undefined) {
    if (nextDate === undefined) {
      onChange(null)
      return
    }
    onChange(mergeDateAndTime(nextDate, selected ?? new Date()).toISOString())
  }

  function commitTime(raw: string) {
    if (raw === '') {
      return
    }
    const [hours, minutes] = raw.split(':').map(Number)
    const base = new Date(selected ?? new Date())
    base.setHours(hours ?? 0, minutes ?? 0, 0, 0)
    onChange(base.toISOString())
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        data-testid={testId}
        aria-label={ariaLabel}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'w-44 justify-start font-normal',
          selected === undefined && 'text-muted-foreground',
        )}
      >
        {selected === undefined ? 'Any time' : formatDisplay(selected)}
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={commitDate}
          autoFocus
        />
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <input
            type="time"
            aria-label={`${ariaLabel} time`}
            value={selected === undefined ? '' : formatTimeLocal(selected)}
            onChange={(event) => commitTime(event.currentTarget.value)}
            className="h-8 rounded-md border border-border bg-surface-raised px-2 text-sm text-foreground"
          />
          {selected !== undefined && (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function mergeDateAndTime(datePart: Date, timeSource: Date): Date {
  const merged = new Date(datePart)
  merged.setHours(timeSource.getHours(), timeSource.getMinutes(), 0, 0)
  return merged
}

function formatTimeLocal(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDisplay(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
