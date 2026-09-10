const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((Date.parse(iso) - now.getTime()) / 1000)
  const magnitude = Math.abs(seconds)

  if (magnitude < 45) {
    return 'just now'
  }
  if (magnitude < HOUR) {
    return relative.format(Math.round(seconds / MINUTE), 'minute')
  }
  if (magnitude < DAY) {
    return relative.format(Math.round(seconds / HOUR), 'hour')
  }
  return relative.format(Math.round(seconds / DAY), 'day')
}

export function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}
