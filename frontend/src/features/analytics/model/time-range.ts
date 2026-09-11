import { z } from 'zod'

export type FixedTimeRangePreset = '1h' | '24h' | '7d' | '30d'
export type TimeRangePreset = FixedTimeRangePreset | 'custom'

export type TimeRange = {
  readonly preset: TimeRangePreset
  readonly from: string
  readonly to: string
}

export type TimeRangeSelection =
  | { readonly preset: FixedTimeRangePreset }
  | { readonly preset: 'custom'; readonly from: string; readonly to: string }

export const DEFAULT_PRESET: FixedTimeRangePreset = '24h'

export const TIME_RANGE_OPTIONS: readonly {
  readonly value: TimeRangePreset
  readonly label: string
}[] = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
]

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const PRESET_DURATION_MS: Record<FixedTimeRangePreset, number> = {
  '1h': HOUR_MS,
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
}

const presetSchema = z.enum(['1h', '24h', '7d', '30d', 'custom'])
const isoTimestamp = z.string().datetime({ offset: true })

export function parseTimeRange(
  params: URLSearchParams,
  now: Date = new Date(),
): TimeRange {
  const raw = params.get('range')
  const result = raw === null ? undefined : presetSchema.safeParse(raw)
  const preset = result?.success === true ? result.data : DEFAULT_PRESET

  if (preset === 'custom') {
    const from = parseIso(params.get('from'))
    const to = parseIso(params.get('to'))
    if (from !== null && to !== null && new Date(from) < new Date(to)) {
      return { preset, from, to }
    }
    return resolveTimeRange(DEFAULT_PRESET, now)
  }

  return resolveTimeRange(preset, now)
}

export function resolveTimeRange(
  preset: FixedTimeRangePreset,
  now: Date = new Date(),
): TimeRange {
  return {
    preset,
    from: new Date(now.getTime() - PRESET_DURATION_MS[preset]).toISOString(),
    to: now.toISOString(),
  }
}

export function timeRangeToSearchParams(
  selection: TimeRangeSelection,
): URLSearchParams {
  const params = new URLSearchParams()
  params.set('range', selection.preset)
  if (selection.preset === 'custom') {
    params.set('from', selection.from)
    params.set('to', selection.to)
  }
  return params
}

function parseIso(raw: string | null): string | null {
  if (raw === null) {
    return null
  }
  const result = isoTimestamp.safeParse(raw)
  return result.success ? result.data : null
}
