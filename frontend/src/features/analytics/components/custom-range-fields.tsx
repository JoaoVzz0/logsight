import type { ReactNode } from 'react'

import { DateTimeField } from '../../../shared/ui/date-time-field'
import type { TimeRange } from '../model/time-range'

type CustomRangeFieldsProps = {
  readonly range: TimeRange
  readonly onChangeBound: (field: 'from' | 'to', iso: string | null) => void
}

export function CustomRangeFields({ range, onChangeBound }: CustomRangeFieldsProps) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <Field label="From">
        <DateTimeField
          testId="dashboard-from-filter"
          ariaLabel="From"
          value={range.from}
          onChange={(iso) => onChangeBound('from', iso)}
        />
      </Field>
      <Field label="To">
        <DateTimeField
          testId="dashboard-to-filter"
          ariaLabel="To"
          value={range.to}
          onChange={(iso) => onChangeBound('to', iso)}
        />
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
