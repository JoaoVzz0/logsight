import { Button } from '../../../shared/ui/button'
import { Skeleton } from '../../../shared/ui/skeleton'

const PANEL =
  'rounded-md border border-border bg-surface p-6 text-center text-sm'

export function ImportHistoryError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div role="alert" className={PANEL}>
      <p className="font-medium text-foreground">
        Could not load the import history
      </p>
      <p className="mt-1 text-muted-foreground">
        The request to the import service failed.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  )
}

export function ImportHistoryEmpty() {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      No imports yet. Upload a file above to get started.
    </p>
  )
}

export function ImportHistorySkeleton() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-md border border-border"
    >
      {Array.from({ length: 4 }, (_unused, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
        >
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
      ))}
    </div>
  )
}
