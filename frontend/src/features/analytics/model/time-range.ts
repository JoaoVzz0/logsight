import { z } from 'zod'

export type TimeRangePreset = '1h' | '24h' | '7d' | '30d'

export type TimeRange = {
  readonly preset: TimeRangePreset
  readonly from: string
  readonly to: string
}

export const DEFAULT_PRESET: TimeRangePreset = '24h'

export const TIME_RANGE_OPTIONS: readonly {
  readonly value: TimeRangePreset
  readonly label: string
}[] = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const PRESET_DURATION_MS: Record<TimeRangePreset, number> = {
  '1h': HOUR_MS,
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
}

const presetSchema = z.enum(['1h', '24h', '7d', '30d'])

export function parseTimeRange(
  params: URLSearchParams,
  now: Date = new Date(),
): TimeRange {
  const raw = params.get('range')
  const result = raw === null ? undefined : presetSchema.safeParse(raw)
  const preset = result?.success === true ? result.data : DEFAULT_PRESET
  return resolveTimeRange(preset, now)
}

export function resolveTimeRange(
  preset: TimeRangePreset,
  now: Date = new Date(),
): TimeRange {
  return {
    preset,
    from: new Date(now.getTime() - PRESET_DURATION_MS[preset]).toISOString(),
    to: now.toISOString(),
  }
}

export function timeRangeToSearchParams(
  preset: TimeRangePreset,
): URLSearchParams {
  const params = new URLSearchParams()
  params.set('range', preset)
  return params
}
