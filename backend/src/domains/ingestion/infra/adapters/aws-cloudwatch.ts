import { assembleLogRecord, type LogRecordDraft } from '../../core/log-record'
import { normalizeSeverity } from '../../core/services/severity'
import type {
  LogSourceAdapter,
  ParseError,
  ParseResult,
} from '../../ports/log-source-adapter'

const SOURCE_TYPE = 'aws-cloudwatch'
const SERVICE_NAME_PATTERN = /^\/aws\/[^/]+\/(.+)$/

const PARSE_FAILED = Symbol('parse-failed')

type PerEventLine = {
  readonly logGroup?: unknown
  readonly logStream?: unknown
  readonly id?: unknown
  readonly timestamp?: unknown
  readonly message?: unknown
}

type TimestampResult =
  | { readonly ok: true; readonly value: Date }
  | { readonly ok: false; readonly code: ParseError['code'] }

type ParsedMessage = {
  readonly body: string
  readonly level: unknown
}

export function createAwsCloudWatchAdapter(
  clock: () => Date = () => new Date(),
): LogSourceAdapter {
  return {
    sourceType: SOURCE_TYPE,
    detect,
    parse: (line) => parse(line, clock),
  }
}

function detect(sample: string[]): number {
  if (sample.length === 0) {
    return 0
  }

  const matching = sample.filter(hasCloudWatchMarkers).length
  return matching / sample.length
}

function hasCloudWatchMarkers(line: string): boolean {
  const parsed = tryParseJson(line)
  if (!isRecord(parsed)) {
    return false
  }

  return (
    typeof parsed.logGroup === 'string' &&
    typeof parsed.logStream === 'string' &&
    isPositiveInteger(parsed.timestamp)
  )
}

function parse(line: string, clock: () => Date): ParseResult {
  if (line.trim().length === 0) {
    return parseError(line, 'empty-line')
  }

  const parsed = tryParseJson(line)
  if (parsed === PARSE_FAILED) {
    return parseError(line, 'malformed-syntax')
  }
  if (!isRecord(parsed)) {
    return parseError(line, 'unrecognized-shape')
  }

  const timestamp = readTimestamp(parsed.timestamp)
  if (!timestamp.ok) {
    return parseError(line, timestamp.code)
  }

  const message = readMessage(parsed.message)
  const draft: LogRecordDraft = {
    timestamp: timestamp.value,
    body: message.body,
    severity: normalizeSeverity(message.level),
    sourceType: SOURCE_TYPE,
    raw: line,
    serviceName: readServiceName(parsed.logGroup),
    attributes: readAttributes(parsed),
  }

  return assembleLogRecord(draft, clock)
}

function readTimestamp(value: unknown): TimestampResult {
  if (value === undefined) {
    return { ok: false, code: 'missing-timestamp' }
  }
  if (!isPositiveInteger(value)) {
    return { ok: false, code: 'invalid-timestamp' }
  }
  return { ok: true, value: new Date(value) }
}

function readMessage(value: unknown): ParsedMessage {
  if (typeof value !== 'string' || value.length === 0) {
    return { body: '', level: undefined }
  }

  const structured = tryParseJson(value)
  if (isRecord(structured)) {
    return {
      body: canonicalJson(structured),
      level: structured.level ?? structured.severity,
    }
  }

  return { body: value, level: undefined }
}

function readServiceName(logGroup: unknown): string | null {
  if (typeof logGroup !== 'string') {
    return null
  }

  const match = SERVICE_NAME_PATTERN.exec(logGroup)
  return match?.[1] ?? null
}

function readAttributes(event: PerEventLine): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}

  if (typeof event.logGroup === 'string') {
    attributes.logGroup = event.logGroup
  }
  if (typeof event.logStream === 'string') {
    attributes.logStream = event.logStream
  }
  if (event.id !== undefined && event.id !== null) {
    attributes.id = event.id
  }

  return attributes
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep)
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortDeep(value[key])]),
    )
  }
  return value
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return PARSE_FAILED
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseError(line: string, code: ParseError['code']): ParseError {
  return { kind: 'parse-error', line, code }
}
