import { Button } from '../../../shared/ui/button'
import { Card } from '../../../shared/ui/card'
import { Skeleton } from '../../../shared/ui/skeleton'

export function ImportHistoryError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Card role="alert" className="flex flex-col items-center gap-1 p-8 text-center text-sm">
      <p className="font-medium text-foreground">
        Could not load the import history
      </p>
      <p className="text-muted-foreground">
        The request to the import service failed.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
        Retry
      </Button>
    </Card>
  )
}

export function ImportHistoryEmpty() {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      No imports yet. Upload a file above to get started.
    </p>
  )
}

export function ImportHistorySkeleton() {
  return (
    <Card
      aria-hidden="true"
      className="overflow-hidden border-border/60 shadow-none"
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
    </Card>
  )
}
