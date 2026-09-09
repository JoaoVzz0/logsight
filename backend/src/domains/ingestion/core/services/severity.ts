import { SEVERITY_NUMBER } from 'domain-constants'

export type NumericSeverityConvention = 'syslog' | 'pino'

export type NormalizedSeverity = {
  readonly severityNumber: number | null
  readonly severityText: string | null
}

const UNDETERMINED: NormalizedSeverity = {
  severityNumber: null,
  severityText: null,
}

const NAME_BANDS: Readonly<Record<string, number>> = {
  trace: SEVERITY_NUMBER.TRACE,
  debug: SEVERITY_NUMBER.DEBUG,
  verbose: SEVERITY_NUMBER.DEBUG,
  info: SEVERITY_NUMBER.INFO,
  informational: SEVERITY_NUMBER.INFO,
  notice: SEVERITY_NUMBER.INFO,
  access: SEVERITY_NUMBER.INFO,
  warn: SEVERITY_NUMBER.WARN,
  warning: SEVERITY_NUMBER.WARN,
  error: SEVERITY_NUMBER.ERROR,
  err: SEVERITY_NUMBER.ERROR,
  fatal: SEVERITY_NUMBER.FATAL,
  critical: SEVERITY_NUMBER.FATAL,
  crit: SEVERITY_NUMBER.FATAL,
  alert: SEVERITY_NUMBER.FATAL,
  emerg: SEVERITY_NUMBER.FATAL,
  emergency: SEVERITY_NUMBER.FATAL,
  panic: SEVERITY_NUMBER.FATAL,
}

const NUMERIC_BANDS: Readonly<
  Record<NumericSeverityConvention, Readonly<Record<number, number>>>
> = {
  syslog: {
    0: SEVERITY_NUMBER.FATAL,
    1: SEVERITY_NUMBER.FATAL,
    2: SEVERITY_NUMBER.FATAL,
    3: SEVERITY_NUMBER.ERROR,
    4: SEVERITY_NUMBER.WARN,
    5: SEVERITY_NUMBER.INFO,
    6: SEVERITY_NUMBER.INFO,
    7: SEVERITY_NUMBER.DEBUG,
  },
  pino: {
    10: SEVERITY_NUMBER.TRACE,
    20: SEVERITY_NUMBER.DEBUG,
    30: SEVERITY_NUMBER.INFO,
    40: SEVERITY_NUMBER.WARN,
    50: SEVERITY_NUMBER.ERROR,
    60: SEVERITY_NUMBER.FATAL,
  },
}

export function normalizeSeverity(
  value: unknown,
  convention?: NumericSeverityConvention,
): NormalizedSeverity {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeNumericLevel(value, String(value), convention)
  }

  if (typeof value !== 'string') {
    return UNDETERMINED
  }

  const token = value.trim()
  if (token.length === 0) {
    return UNDETERMINED
  }

  const namedBand = NAME_BANDS[token.toLowerCase()]
  if (namedBand !== undefined) {
    return { severityNumber: namedBand, severityText: value }
  }

  if (/^-?\d+$/.test(token)) {
    return normalizeNumericLevel(Number(token), value, convention)
  }

  return { severityNumber: null, severityText: value }
}

function normalizeNumericLevel(
  level: number,
  text: string,
  convention: NumericSeverityConvention | undefined,
): NormalizedSeverity {
  if (convention === undefined || !Number.isInteger(level)) {
    return { severityNumber: null, severityText: text }
  }

  return {
    severityNumber: NUMERIC_BANDS[convention][level] ?? null,
    severityText: text,
  }
}
