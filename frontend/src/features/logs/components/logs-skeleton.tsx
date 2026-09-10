import { GRID_COLUMNS } from './log-row'

const PLACEHOLDER_ROWS = 14

export function LogsSkeleton() {
  return (
    <div
      data-testid="logs-skeleton"
      aria-hidden="true"
      className="overflow-hidden rounded-md border border-border bg-surface"
    >
      <div
        className={`h-8 items-center border-b border-border-strong bg-surface-raised ${GRID_COLUMNS}`}
      >
        <div className="pl-3">
          <div className="h-3 w-16 rounded bg-muted" />
        </div>
        <div>
          <div className="h-3 w-12 rounded bg-muted" />
        </div>
        <div>
          <div className="h-3 w-14 rounded bg-muted" />
        </div>
        <div>
          <div className="h-3 w-20 rounded bg-muted" />
        </div>
      </div>
      {Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
        <div
          key={index}
          data-testid="skeleton-row"
          className={`h-row items-center border-b border-border ${GRID_COLUMNS}`}
        >
          <div className="pl-3">
            <div className="h-3 w-14 rounded bg-muted" />
          </div>
          <div>
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
          <div>
            <div className="h-3 w-20 rounded bg-muted" />
          </div>
          <div>
            <div className="h-3 w-3/4 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}
