import { Skeleton } from '../../../shared/ui/skeleton'

import { GRID_COLUMNS } from './issue-row'

const PLACEHOLDER_ROWS = 8

export function IssuesSkeleton() {
  return (
    <div
      data-testid="issues-skeleton"
      aria-hidden="true"
      className="overflow-hidden rounded-md border border-border bg-surface"
    >
      <div
        className={`h-8 items-center border-b border-border-strong bg-surface-raised ${GRID_COLUMNS}`}
      >
        <div className="pl-3">
          <Skeleton className="h-3 w-24" />
        </div>
        <div>
          <Skeleton className="h-3 w-16" />
        </div>
        <div>
          <Skeleton className="h-3 w-10" />
        </div>
        <div>
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
      {Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
        <div
          key={index}
          data-testid="skeleton-row"
          className={`items-center border-b border-border py-2 ${GRID_COLUMNS}`}
        >
          <div className="pl-3">
            <Skeleton className="h-3 w-3/4" />
          </div>
          <div>
            <Skeleton className="h-3 w-16" />
          </div>
          <div>
            <Skeleton className="h-3 w-8" />
          </div>
          <div>
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  )
}
