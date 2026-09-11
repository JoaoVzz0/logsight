import type { HTMLAttributes } from 'react'

import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../lib/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border-strong bg-transparent text-foreground',
        success: 'border-transparent bg-severity-info-subtle text-severity-info',
        destructive:
          'border-transparent bg-severity-error-subtle text-severity-error',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}
