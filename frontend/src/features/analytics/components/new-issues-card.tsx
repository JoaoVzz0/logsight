import { useNewIssues } from '../hooks/use-new-issues'
import type { TimeRange } from '../model/time-range'

import { DashboardCard } from './dashboard-card'
import { IssueList } from './issue-list'

export function NewIssuesCard({ range }: { readonly range: TimeRange }) {
  const query = useNewIssues(range)

  return (
    <DashboardCard
      title="New issues"
      testId="new-issues-card"
      query={query}
      isEmpty={(data) => data.issues.length === 0}
      emptyMessage="No new issues in this window."
    >
      {(data) => <IssueList issues={data.issues} testId="new-issues-list" />}
    </DashboardCard>
  )
}
