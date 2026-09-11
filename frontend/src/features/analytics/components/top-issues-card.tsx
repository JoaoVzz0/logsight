import { useTopIssues } from '../hooks/use-top-issues'
import type { TimeRange } from '../model/time-range'

import { DashboardCard } from './dashboard-card'
import { IssueList } from './issue-list'

export function TopIssuesCard({ range }: { readonly range: TimeRange }) {
  const query = useTopIssues(range)

  return (
    <DashboardCard
      title="Top issues"
      testId="top-issues-card"
      query={query}
      fixedHeight
      isEmpty={(data) => data.issues.length === 0}
      emptyMessage="No issues in this window."
    >
      {(data) => <IssueList issues={data.issues} testId="top-issues-list" />}
    </DashboardCard>
  )
}
