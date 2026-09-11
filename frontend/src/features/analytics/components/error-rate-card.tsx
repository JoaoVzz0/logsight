import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useErrorRate } from '../hooks/use-error-rate'
import type { TimeRange } from '../model/time-range'

import { DashboardCard } from './dashboard-card'

export function ErrorRateCard({ range }: { readonly range: TimeRange }) {
  const query = useErrorRate(range)

  return (
    <DashboardCard
      title="Error rate"
      testId="error-rate-card"
      query={query}
      isEmpty={(data) => data.buckets.length === 0}
      emptyMessage="No events in this window."
    >
      {(data) => (
        <div data-testid="error-rate-chart" className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.buckets}>
              <XAxis
                dataKey="bucket"
                tickFormatter={formatTick}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                domain={[0, 1]}
                tickFormatter={formatRatio}
                width={40}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={formatRatio} labelFormatter={formatTick} />
              <Line
                type="monotone"
                dataKey="ratio"
                stroke="hsl(var(--chart-1))"
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </DashboardCard>
  )
}

function formatTick(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRatio(value: number): string {
  return `${Math.round(value * 100)}%`
}
