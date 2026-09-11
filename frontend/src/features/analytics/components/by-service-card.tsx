import { useByService } from '../hooks/use-by-service'
import type { TimeRange } from '../model/time-range'

import { DashboardCard } from './dashboard-card'

export function ByServiceCard({ range }: { readonly range: TimeRange }) {
  const query = useByService(range)

  return (
    <DashboardCard
      title="By service"
      testId="by-service-card"
      query={query}
      fixedHeight
      isEmpty={(data) => data.services.length === 0}
      emptyMessage="No events in this window."
    >
      {(data) => (
        <ul
          data-testid="by-service-list"
          className="flex flex-col divide-y divide-border"
        >
          {data.services.map((row) => (
            <li
              key={row.serviceName}
              data-testid="by-service-row"
              className="flex items-center justify-between py-2 text-sm"
            >
              <span data-col="service">{row.serviceName}</span>
              <span className="tabular text-muted-foreground">
                <span data-col="total">{row.total}</span>
                {' · '}
                <span data-col="errors">{row.errors} errors</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
