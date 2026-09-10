import type { SelectHTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export type SelectOption = {
  readonly value: string
  readonly label: string
}

type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'children'
> & {
  readonly options: readonly SelectOption[]
}

export function Select({ options, className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'h-9 rounded-md border border-border bg-surface-raised px-2 text-sm text-foreground',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
