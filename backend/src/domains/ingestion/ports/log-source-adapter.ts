import type { LogRecord, SourceType } from '../core/log-record'

export type { SourceType }

export type ParseErrorCode =
  | 'empty-line'
  | 'malformed-syntax'
  | 'unrecognized-shape'
  | 'missing-timestamp'

export type ParseError = {
  readonly kind: 'parse-error'
  readonly line: string
  readonly code: ParseErrorCode
}

export type ParseResult = LogRecord | ParseError

export interface LogSourceAdapter {
  readonly sourceType: SourceType

  detect(sample: string[]): number

  parse(line: string): ParseResult
}
