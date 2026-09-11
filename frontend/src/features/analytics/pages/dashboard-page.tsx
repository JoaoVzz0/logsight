import { useState } from 'react'

import { useSearchParams } from 'react-router-dom'

import { ByServiceCard } from '../components/by-service-card'
import { DashboardGrid } from '../components/dashboard-grid'
import { ErrorRateCard } from '../components/error-rate-card'
import { NewIssuesCard } from '../components/new-issues-card'
import { SpikesCard } from '../components/spikes-card'
import { TimeRangeSelector } from '../components/time-range-selector'
import { TopIssuesCard } from '../components/top-issues-card'
import {
  parseTimeRange,
  timeRangeToSearchParams,
  type TimeRangePreset,
} from '../model/time-range'

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [now] = useState(() => new Date())
  const range = parseTimeRange(searchParams, now)

  function applyPreset(preset: TimeRangePreset) {
    setSearchParams(timeRangeToSearchParams(preset))
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Error rate, new issues, top issues, spiking issues and distribution
            by service.
          </p>
        </div>
        <TimeRangeSelector value={range.preset} onChange={applyPreset} />
      </header>

      <DashboardGrid>
        <ErrorRateCard range={range} />
        <NewIssuesCard range={range} />
        <TopIssuesCard range={range} />
        <SpikesCard range={range} />
        <ByServiceCard range={range} />
      </DashboardGrid>
    </section>
  )
}
