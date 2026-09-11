import { Badge, type BadgeProps } from '../../../shared/ui/badge'
import type { ImportPhase } from '../model/progress'

const CONFIG: Record<
  ImportPhase,
  { readonly label: string; readonly variant: NonNullable<BadgeProps['variant']> }
> = {
  pending: { label: 'Queued', variant: 'outline' },
  running: { label: 'Processing', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
}

export function ImportStatusBadge({ status }: { readonly status: ImportPhase }) {
  const { label, variant } = CONFIG[status]
  return (
    <Badge variant={variant}>
      <StatusDot status={status} />
      {label}
    </Badge>
  )
}

function StatusDot({ status }: { readonly status: ImportPhase }) {
  if (status === 'running') {
    return (
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
      />
    )
  }
  return <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
}
