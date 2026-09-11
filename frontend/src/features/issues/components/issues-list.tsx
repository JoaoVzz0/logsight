import type { IssueListItem } from '../../../shared/lib/api-client'

import { GRID_COLUMNS, IssueRow } from './issue-row'

type IssuesListProps = {
  readonly issues: readonly IssueListItem[]
}

export function IssuesList({ issues }: IssuesListProps) {
  return (
    <div
      data-testid="issues-list"
      aria-label="Issues"
      className="w-full min-w-0 overflow-auto rounded-md border border-border bg-surface"
    >
      <div className="min-w-[44rem]">
        <div
          className={`sticky top-0 z-10 h-8 items-center border-b border-border-strong bg-surface-raised text-[11px] font-medium uppercase tracking-wide text-foreground/70 ${GRID_COLUMNS}`}
        >
          <div className="pl-3">Issue</div>
          <div>Services</div>
          <div className="text-right">Events</div>
          <div>Last seen</div>
        </div>

        {issues.map((issue) => (
          <IssueRow key={issue.fingerprint} issue={issue} />
        ))}
      </div>
    </div>
  )
}
