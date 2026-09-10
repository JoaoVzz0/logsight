import type { ImportStatus } from '../api/get-import'

export type ImportPhase = ImportStatus['status']

export function isTerminal(status: ImportPhase): boolean {
  return status === 'completed' || status === 'failed'
}

export function percentComplete(status: ImportStatus): number | null {
  if (status.totalLines === null || status.totalLines === 0) {
    return null
  }
  return Math.min(
    100,
    Math.round((status.processedLines / status.totalLines) * 100),
  )
}

export function formatCount(value: number): string {
  if (value < 1_000) {
    return String(value)
  }
  if (value < 1_000_000) {
    return `${trimTrailingZero(value / 1_000)}k`
  }
  return `${trimTrailingZero(value / 1_000_000)}M`
}

export function progressLabel(status: ImportStatus): string {
  const processed = formatCount(status.processedLines)
  const percent = percentComplete(status)

  const counts =
    status.totalLines === null
      ? `${processed} lines`
      : `${processed} of ${formatCount(status.totalLines)}${
          percent === null ? '' : ` (${percent}%)`
        }`

  if (status.parseErrors === 0) {
    return counts
  }
  const errors = status.parseErrors === 1 ? 'error' : 'errors'
  return `${counts} · ${status.parseErrors} parse ${errors}`
}

export function formatRate(linesPerSecond: number): string {
  return `${formatCount(Math.round(linesPerSecond))} lines/s`
}

export function formatDuration(elapsedMs: number): string {
  const seconds = elapsedMs / 1_000
  if (seconds < 1) {
    return `${elapsedMs} ms`
  }
  if (seconds < 60) {
    return `${trimTrailingZero(seconds)} s`
  }
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest}s`
}

function trimTrailingZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}
