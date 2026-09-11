import type { ReactNode } from 'react'

import { Link } from 'react-router-dom'

import type { IssueSummary } from '../../../shared/lib/api-client'
import { formatEventCount } from '../model/format-event-count'

type IssueListProps<T extends IssueSummary> = {
  readonly issues: readonly T[]
  readonly testId: string
  readonly renderMeta?: (issue: T) => ReactNode
}

export function IssueList<T extends IssueSummary>({
  issues,
  testId,
  renderMeta,
}: IssueListProps<T>) {
  return (
    <ul data-testid={testId} className="flex flex-col divide-y divide-border">
      {issues.map((issue) => (
        <li key={issue.fingerprint} data-testid={`${testId}-row`}>
          <Link
            to={issueHref(issue)}
            className="flex items-start justify-between gap-3 py-2.5 text-sm hover:bg-secondary"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span
                className="truncate font-mono text-xs text-foreground"
                data-col="pattern"
              >
                {issue.sampleMessage}
              </span>
              <span className="text-xs text-muted-foreground" data-col="service">
                {issue.services[0] ?? 'unknown'}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {renderMeta?.(issue)}
              <span
                className="tabular text-sm font-semibold text-foreground"
                data-col="count"
              >
                {formatEventCount(issue.eventCount)}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function issueHref(issue: IssueSummary): string {
  const service = issue.services[0]
  return service !== undefined
    ? `/logs?service=${encodeURIComponent(service)}`
    : '/logs'
}
