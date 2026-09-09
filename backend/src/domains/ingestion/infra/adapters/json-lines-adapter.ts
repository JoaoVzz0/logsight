import {
  assembleLogRecord,
  type LogRecordDraft,
} from '../../core/log-record'
import {
  normalizeSeverity,
  type NormalizedSeverity,
} from '../../core/services/severity'
import type {
  LogSourceAdapter,
  ParseErrorCode,
  ParseResult,
} from '../../ports/log-source-adapter'

const SOURCE_TYPE = 'json-lines'
const FALLBACK_CONFIDENCE = 0.3
const SECONDS_TO_MILLIS_BOUNDARY = 1e11
const MAX_EPOCH_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999)

const BODY_KEYS = ['message', 'msg', 'body'] as const
const TIMESTAMP_KEYS = ['timestamp', '@timestamp', 'time', 'ts'] as const
const SEVERITY_KEYS = ['level', 'severity', 'lvl'] as const
const SERVICE_KEYS = ['service', 'service_name', 'logger'] as const
const HOST_KEYS = ['host', 'hostname'] as const
const ENVIRONMENT_KEYS = ['env', 'environment'] as const
const TRACE_KEYS = ['trace_id', 'traceId'] as const
const SPAN_KEYS = ['span_id', 'spanId'] as const

const ISO_8601 =
  /^(\d{4}-\d{2}-\d{2})([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/
const NUMERIC = /^-?\d+(\.\d+)?$/

type PlainObject = Record<string, unknown>

type PickedString = { readonly key: string; readonly value: string }

export function createJsonLinesAdapter(clock: () => Date): LogSourceAdapter {
  return {
    sourceType: SOURCE_TYPE,
    detect,
    parse(line: string): ParseResult {
      const object = readObject(line)
      if (typeof object === 'string') {
        return { kind: 'parse-error', line, code: object }
      }

      const draft = toDraft(object, line)
      if (draft === null) {
        return { kind: 'parse-error', line, code: 'missing-timestamp' }
      }

      return assembleLogRecord(draft, clock)
    },
  }
}

function detect(sample: string[]): number {
  const meaningful = sample.filter((line) => line.trim().length > 0)
  if (meaningful.length === 0) {
    return 0
  }

  const objects = meaningful.filter(isJsonObject).length
  return objects * 2 > meaningful.length ? FALLBACK_CONFIDENCE : 0
}

function isJsonObject(line: string): boolean {
  try {
    return isPlainObject(JSON.parse(line))
  } catch {
    return false
  }
}

function readObject(line: string): PlainObject | ParseErrorCode {
  if (line.trim().length === 0) {
    return 'empty-line'
  }

  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return 'malformed-syntax'
  }

  return isPlainObject(value) ? value : 'unrecognized-shape'
}

function toDraft(object: PlainObject, line: string): LogRecordDraft | null {
  const consumed = new Set<string>()

  const timestamp = resolveTimestamp(object, consumed)
  if (timestamp === null) {
    return null
  }

  const body = pickString(object, BODY_KEYS)
  const service = pickString(object, SERVICE_KEYS)
  const host = pickString(object, HOST_KEYS)
  const environment = pickString(object, ENVIRONMENT_KEYS)
  const trace = pickString(object, TRACE_KEYS)
  const span = pickString(object, SPAN_KEYS)
  const severity = resolveSeverity(object, consumed)

  for (const picked of [body, service, host, environment, trace, span]) {
    if (picked !== null) {
      consumed.add(picked.key)
    }
  }

  return {
    timestamp,
    body: body?.value ?? '',
    severity,
    sourceType: SOURCE_TYPE,
    raw: line,
    serviceName: service?.value ?? null,
    host: host?.value ?? null,
    environment: environment?.value ?? null,
    traceId: trace?.value ?? null,
    spanId: span?.value ?? null,
    attributes: omit(object, consumed),
  }
}

function resolveTimestamp(
  object: PlainObject,
  consumed: Set<string>,
): Date | null {
  for (const key of TIMESTAMP_KEYS) {
    if (!(key in object)) {
      continue
    }

    const instant = toInstant(object[key])
    if (instant !== null) {
      consumed.add(key)
      return instant
    }
  }

  return null
}

function toInstant(value: unknown): Date | null {
  if (typeof value === 'number') {
    return fromEpoch(value)
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  return NUMERIC.test(trimmed) ? fromEpoch(Number(trimmed)) : fromIso(trimmed)
}

function fromEpoch(value: number): Date | null {
  if (!Number.isFinite(value)) {
    return null
  }

  const millis =
    Math.abs(value) < SECONDS_TO_MILLIS_BOUNDARY ? value * 1000 : value
  return withinRange(millis)
}

function fromIso(value: string): Date | null {
  const match = ISO_8601.exec(value)
  if (match === null) {
    return null
  }

  const hasTime = match[2] !== undefined
  const hasZone = match[5] !== undefined
  const spaceless = value.replace(' ', 'T')
  const normalized = hasTime && !hasZone ? `${spaceless}Z` : spaceless

  const millis = Date.parse(normalized)
  return Number.isNaN(millis) ? null : withinRange(millis)
}

function withinRange(millis: number): Date | null {
  if (millis < 0 || millis > MAX_EPOCH_MS) {
    return null
  }

  return new Date(millis)
}

function resolveSeverity(
  object: PlainObject,
  consumed: Set<string>,
): NormalizedSeverity {
  for (const key of SEVERITY_KEYS) {
    if (!(key in object)) {
      continue
    }

    const normalized = normalizeSeverity(object[key])
    if (normalized.severityText !== null || normalized.severityNumber !== null) {
      consumed.add(key)
    }
    return normalized
  }

  return normalizeSeverity(undefined)
}

function pickString(
  object: PlainObject,
  keys: readonly string[],
): PickedString | null {
  for (const key of keys) {
    const value = object[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return { key, value }
    }
  }

  return null
}

function omit(object: PlainObject, keys: ReadonlySet<string>): PlainObject {
  const rest: PlainObject = {}
  for (const [key, value] of Object.entries(object)) {
    if (!keys.has(key)) {
      rest[key] = value
    }
  }

  return rest
}

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
