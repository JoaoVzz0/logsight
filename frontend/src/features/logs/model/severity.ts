export type SeverityKey =
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal'
  | 'unknown'

export type SeverityShape =
  | 'dot'
  | 'line'
  | 'circle'
  | 'diamond'
  | 'triangle'
  | 'square'
  | 'dash'

export type SeverityDescriptor = {
  readonly key: SeverityKey
  readonly label: string
  readonly shape: SeverityShape
}

const DESCRIPTORS: Record<SeverityKey, SeverityDescriptor> = {
  trace: { key: 'trace', label: 'Trace', shape: 'dot' },
  debug: { key: 'debug', label: 'Debug', shape: 'line' },
  info: { key: 'info', label: 'Info', shape: 'circle' },
  warn: { key: 'warn', label: 'Warn', shape: 'diamond' },
  error: { key: 'error', label: 'Error', shape: 'triangle' },
  fatal: { key: 'fatal', label: 'Fatal', shape: 'square' },
  unknown: { key: 'unknown', label: 'Unknown', shape: 'dash' },
}

export function describeSeverity(
  severityNumber: number | null,
): SeverityDescriptor {
  return DESCRIPTORS[severityKey(severityNumber)]
}

function severityKey(severityNumber: number | null): SeverityKey {
  if (severityNumber === null) {
    return 'unknown'
  }
  if (severityNumber >= 21) {
    return 'fatal'
  }
  if (severityNumber >= 17) {
    return 'error'
  }
  if (severityNumber >= 13) {
    return 'warn'
  }
  if (severityNumber >= 9) {
    return 'info'
  }
  if (severityNumber >= 5) {
    return 'debug'
  }
  return 'trace'
}
