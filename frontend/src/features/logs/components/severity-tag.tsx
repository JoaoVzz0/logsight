import {
  describeSeverity,
  type SeverityKey,
  type SeverityShape,
} from '../model/severity'

const BAND_CLASS: Record<SeverityKey, string> = {
  trace: 'bg-severity-trace',
  debug: 'bg-severity-debug',
  info: 'bg-severity-info',
  warn: 'bg-severity-warn',
  error: 'bg-severity-error',
  fatal: 'bg-severity-fatal',
  unknown: 'bg-border-strong',
}

const TEXT_CLASS: Record<SeverityKey, string> = {
  trace: 'text-severity-trace',
  debug: 'text-severity-debug',
  info: 'text-severity-info',
  warn: 'text-severity-warn',
  error: 'text-severity-error',
  fatal: 'text-severity-fatal',
  unknown: 'text-muted-foreground',
}

export function SeverityBand({ severityNumber }: { severityNumber: number | null }) {
  const { key } = describeSeverity(severityNumber)
  return (
    <span
      data-testid="severity-band"
      aria-hidden="true"
      className={`absolute inset-y-0 left-0 w-[3px] ${BAND_CLASS[key]}`}
    />
  )
}

export function SeverityTag({ severityNumber }: { severityNumber: number | null }) {
  const { key, label, shape } = describeSeverity(severityNumber)
  return (
    <span className={`flex items-center gap-1.5 ${TEXT_CLASS[key]}`}>
      <SeverityIcon shape={shape} />
      <span>{label}</span>
    </span>
  )
}

function SeverityIcon({ shape }: { shape: SeverityShape }) {
  return (
    <svg
      data-testid="severity-icon"
      data-shape={shape}
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      className="shrink-0 fill-current"
    >
      <ShapePath shape={shape} />
    </svg>
  )
}

function ShapePath({ shape }: { shape: SeverityShape }) {
  switch (shape) {
    case 'triangle':
      return <path d="M6 1 L11 11 L1 11 Z" />
    case 'square':
      return <rect x="2" y="2" width="8" height="8" />
    case 'diamond':
      return <path d="M6 1 L11 6 L6 11 L1 6 Z" />
    case 'circle':
      return <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    case 'dot':
      return <circle cx="6" cy="6" r="3" />
    case 'line':
      return <rect x="1" y="5" width="10" height="2" />
    case 'dash':
      return <rect x="3" y="5" width="6" height="2" />
  }
}
