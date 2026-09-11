import { memo } from 'react'

import type { IssueListItem } from '../../../shared/lib/api-client'
import { formatAbsoluteTime, formatRelativeTime } from '../../../shared/lib/relative-time'
import { Badge } from '../../../shared/ui/badge'
import { SeverityBand, SeverityTag } from '../../../shared/ui/severity-tag'

export const GRID_COLUMNS =
  'grid grid-cols-[minmax(16rem,1fr)_10rem_6rem_8.5rem] gap-x-3 pr-3'

type IssueRowProps = {
  readonly issue: IssueListItem
}

function IssueRowComponent({ issue }: IssueRowProps) {
  const deEmphasized = issue.status === 'resolved' || issue.status === 'ignored'

  return (
    <div
      data-testid="issue-row"
      className={`items-center border-b border-border py-2 text-xs transition-colors hover:bg-secondary/40 ${GRID_COLUMNS} ${
        deEmphasized ? 'opacity-60' : ''
      }`}
    >
      <div className="relative flex min-w-0 flex-col gap-1 truncate pl-3">
        <div className="flex items-center gap-2">
          <SeverityBand severityNumber={issue.severityNumber} />
          <span className="truncate font-mono">{issue.sampleMessage}</span>
        </div>
        <div className="flex items-center gap-2 pl-0.5">
          <SeverityTag severityNumber={issue.severityNumber} />
          {issue.regression ? <Badge variant="destructive">Regression</Badge> : null}
          {issue.status === 'resolved' ? (
            <Badge variant="secondary">Resolved</Badge>
          ) : null}
          {issue.status === 'ignored' ? (
            <Badge variant="outline">Ignored</Badge>
          ) : null}
        </div>
      </div>
      <div className="truncate text-muted-foreground">
        {issue.affectedServices.length > 0
          ? issue.affectedServices.join(', ')
          : '—'}
      </div>
      <div className="tabular text-right font-semibold text-foreground">
        {issue.eventCount.toLocaleString()}
      </div>
      <div className="tabular truncate text-muted-foreground">
        <span title={formatAbsoluteTime(issue.lastSeen)}>
          {formatRelativeTime(issue.lastSeen)}
        </span>
      </div>
    </div>
  )
}

export const IssueRow = memo(IssueRowComponent)
