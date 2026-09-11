import { useState } from 'react'

import { useSearchParams } from 'react-router-dom'

import { ByServiceCard } from '../components/by-service-card'
import { CustomRangeFields } from '../components/custom-range-fields'
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
    if (preset === 'custom') {
      setSearchParams(
        timeRangeToSearchParams({
          preset: 'custom',
          from: range.from,
          to: range.to,
        }),
      )
      return
    }
    setSearchParams(timeRangeToSearchParams({ preset }))
  }

  function applyCustomBound(field: 'from' | 'to', iso: string | null) {
    if (iso === null) {
      return
    }
    const next =
      field === 'from' ? { from: iso, to: range.to } : { from: range.from, to: iso }
    if (new Date(next.from) >= new Date(next.to)) {
      return
    }
    setSearchParams(timeRangeToSearchParams({ preset: 'custom', ...next }))
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
        <div className="flex flex-wrap items-end gap-3">
          <TimeRangeSelector value={range.preset} onChange={applyPreset} />
          {range.preset === 'custom' && (
            <CustomRangeFields range={range} onChangeBound={applyCustomBound} />
          )}
        </div>
      </header>

      <ErrorRateCard range={range} />

      <DashboardGrid>
        <NewIssuesCard range={range} />
        <TopIssuesCard range={range} />
        <SpikesCard range={range} />
        <ByServiceCard range={range} />
      </DashboardGrid>
    </section>
  )
}
