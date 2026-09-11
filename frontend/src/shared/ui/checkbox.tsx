import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'

import { cn } from '../lib/cn'

export const Checkbox = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer grid h-4 w-4 shrink-0 place-content-center rounded-sm border border-border-strong shadow-sm transition-colors',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
      <CheckIcon />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
      <path
        d="M2 6.2 L4.8 9 L10 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
