import { useSpikes } from '../hooks/use-spikes'
import type { TimeRange } from '../model/time-range'

import { DashboardCard } from './dashboard-card'
import { IssueList } from './issue-list'

export function SpikesCard({ range }: { readonly range: TimeRange }) {
  const query = useSpikes(range)

  return (
    <DashboardCard
      title="Spikes"
      testId="spikes-card"
      query={query}
      isEmpty={(data) => data.issues.length === 0}
      emptyMessage="No spikes in this window."
    >
      {(data) => (
        <IssueList
          issues={data.issues}
          testId="spikes-list"
          renderMeta={(issue) => (
            <span className="font-medium text-foreground" data-col="multiplier">
              {issue.multiplier.toFixed(1)}x
            </span>
          )}
        />
      )}
    </DashboardCard>
  )
}
