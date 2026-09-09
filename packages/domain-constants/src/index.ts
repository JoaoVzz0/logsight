export const SEVERITY_NUMBER = {
  TRACE: 1,
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
  FATAL: 21,
} as const

export type SeverityLabel = keyof typeof SEVERITY_NUMBER
