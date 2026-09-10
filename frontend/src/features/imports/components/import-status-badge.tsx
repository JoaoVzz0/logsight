import { cn } from '../../../shared/lib/cn'
import type { ImportPhase } from '../model/progress'

const CONFIG: Record<
  ImportPhase,
  { readonly label: string; readonly icon: string; readonly className: string }
> = {
  pending: { label: 'Queued', icon: '○', className: 'text-muted-foreground' },
  running: { label: 'Processing', icon: '◐', className: 'text-severity-info' },
  completed: { label: 'Completed', icon: '●', className: 'text-foreground' },
  failed: { label: 'Failed', icon: '▲', className: 'text-severity-error' },
}

export function ImportStatusBadge({ status }: { readonly status: ImportPhase }) {
  const { label, icon, className } = CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        className,
      )}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  )
}
