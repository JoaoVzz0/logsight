import { Link } from 'react-router-dom'

const PANEL = 'rounded-md border border-border bg-surface p-8 text-center text-sm'

export function LogsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="logs-error" role="alert" className={PANEL}>
      <p className="font-medium text-foreground">Could not load logs</p>
      <p className="mt-1 text-muted-foreground">
        The request to the logs service failed.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md border border-border-strong px-3 py-1.5 font-medium hover:bg-secondary"
      >
        Retry
      </button>
    </div>
  )
}

export function LogsEmpty() {
  return (
    <div data-testid="logs-empty" className={PANEL}>
      <p className="font-medium text-foreground">No logs yet</p>
      <p className="mt-1 text-muted-foreground">
        Import a log file to start exploring records here.
      </p>
      <Link
        to="/imports"
        className="mt-4 inline-block rounded-md border border-border-strong px-3 py-1.5 font-medium hover:bg-secondary"
      >
        Go to imports
      </Link>
    </div>
  )
}

export function LogsNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div data-testid="logs-no-matches" className={PANEL}>
      <p className="font-medium text-foreground">No logs match these filters</p>
      <p className="mt-1 text-muted-foreground">
        Widen the time range or drop a filter to see more.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 rounded-md border border-border-strong px-3 py-1.5 font-medium hover:bg-secondary"
      >
        Clear filters
      </button>
    </div>
  )
}
