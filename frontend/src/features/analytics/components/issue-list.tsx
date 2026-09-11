import type { ReactNode } from 'react'

import { Link } from 'react-router-dom'

import type { IssueSummary } from '../../../shared/lib/api-client'

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
            className="flex flex-col gap-0.5 py-2 text-sm hover:bg-secondary"
          >
            <span
              className="truncate font-mono text-xs text-foreground"
              data-col="pattern"
            >
              {issue.sampleMessage}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular" data-col="count">
                {issue.eventCount} events
              </span>
              <span data-col="service">{issue.services[0] ?? 'unknown'}</span>
              {renderMeta?.(issue)}
            </span>
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
