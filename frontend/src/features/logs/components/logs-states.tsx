import { Link } from 'react-router-dom'

import { Button, buttonVariants } from '../../../shared/ui/button'
import { Card } from '../../../shared/ui/card'

const PANEL = 'flex flex-col items-center gap-1 p-10 text-center text-sm'

export function LogsError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card data-testid="logs-error" role="alert" className={PANEL}>
      <p className="font-medium text-foreground">Could not load logs</p>
      <p className="text-muted-foreground">
        The request to the logs service failed.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
        Retry
      </Button>
    </Card>
  )
}

export function LogsEmpty() {
  return (
    <Card data-testid="logs-empty" className={PANEL}>
      <p className="font-medium text-foreground">No logs yet</p>
      <p className="text-muted-foreground">
        Import a log file to start exploring records here.
      </p>
      <Link
        to="/imports"
        className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-3' })}
      >
        Go to imports
      </Link>
    </Card>
  )
}

export function LogsNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <Card data-testid="logs-no-matches" className={PANEL}>
      <p className="font-medium text-foreground">No logs match these filters</p>
      <p className="text-muted-foreground">
        Widen the time range or drop a filter to see more.
      </p>
      <Button variant="outline" size="sm" onClick={onClear} className="mt-3">
        Clear filters
      </Button>
    </Card>
  )
}
