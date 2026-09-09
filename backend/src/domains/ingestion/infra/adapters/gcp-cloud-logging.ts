import { z } from 'zod'

import { assembleLogRecord, type LogRecordDraft } from '../../core/log-record'
import { normalizeSeverity } from '../../core/services/severity'
import type {
  LogSourceAdapter,
  ParseError,
  ParseResult,
} from '../../ports/log-source-adapter'

const SOURCE_TYPE = 'gcp-cloud-logging' as const

const logEntrySchema = z
  .object({
    logName: z.string().optional(),
    timestamp: z.string().optional(),
    severity: z.string().optional(),
    textPayload: z.string().optional(),
    jsonPayload: z.record(z.unknown()).optional(),
    protoPayload: z.record(z.unknown()).optional(),
    resource: z
      .object({
        type: z.string().optional(),
        labels: z.record(z.string()).optional(),
      })
      .optional(),
    labels: z.record(z.string()).optional(),
    httpRequest: z.record(z.unknown()).optional(),
    operation: z.record(z.unknown()).optional(),
    insertId: z.string().optional(),
    trace: z.string().optional(),
    spanId: z.string().optional(),
  })
  .passthrough()

type LogEntry = z.infer<typeof logEntrySchema>

const SERVICE_LABEL_BY_RESOURCE_TYPE: Readonly<Record<string, string>> = {
  cloud_run_revision: 'service_name',
  k8s_container: 'container_name',
  gce_instance: 'instance_id',
  gae_app: 'module_id',
}

const TRACE_PATH = /^projects\/[^/]+\/traces\/(.+)$/

export const gcpCloudLoggingAdapter: LogSourceAdapter = {
  sourceType: SOURCE_TYPE,

  detect(sample: string[]): number {
    if (sample.length === 0) {
      return 0
    }

    const matching = sample.filter(carriesLogEntryMarkers).length
    return matching / sample.length
  },

  parse(line: string): ParseResult {
    if (line.trim().length === 0) {
      return parseError(line, 'empty-line')
    }

    const json = tryParseJson(line)
    if (json === undefined) {
      return parseError(line, 'malformed-syntax')
    }

    const entry = logEntrySchema.safeParse(json)
    if (!entry.success) {
      return parseError(line, 'unrecognized-shape')
    }

    return assemble(entry.data, line)
  },
}

function assemble(entry: LogEntry, raw: string): ParseResult {
  const eventTime = entry.timestamp ? new Date(entry.timestamp) : null
  if (eventTime === null || Number.isNaN(eventTime.getTime())) {
    return parseError(raw, 'missing-timestamp')
  }

  const promotedLabel = serviceLabelKey(entry.resource?.type)
  const sourceLabels: Record<string, string> = entry.resource?.labels ?? {}
  const serviceName =
    promotedLabel === null ? null : sourceLabels[promotedLabel] ?? null

  const draft: LogRecordDraft = {
    timestamp: eventTime,
    body: resolveBody(entry),
    severity: normalizeSeverity(entry.severity),
    sourceType: SOURCE_TYPE,
    raw,
    serviceName,
    traceId: resolveTraceId(entry.trace),
    spanId: entry.spanId ?? null,
    attributes: buildAttributes(entry, promotedLabel),
  }

  return assembleLogRecord(draft, () => new Date())
}

function resolveBody(entry: LogEntry): string {
  if (entry.textPayload !== undefined) {
    return entry.textPayload
  }

  const jsonPayload = entry.jsonPayload
  if (jsonPayload === undefined) {
    return ''
  }

  const message = jsonPayload.message
  return typeof message === 'string' ? message : JSON.stringify(jsonPayload)
}

function resolveTraceId(trace: string | undefined): string | null {
  if (trace === undefined) {
    return null
  }

  return TRACE_PATH.exec(trace)?.[1] ?? trace
}

function buildAttributes(
  entry: LogEntry,
  promotedLabel: string | null,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(entry.jsonPayload ?? {})) {
    if (key !== 'message') {
      attributes[key] = value
    }
  }

  const labels = mergeLabels(entry, promotedLabel)
  if (Object.keys(labels).length > 0) {
    attributes.labels = labels
  }

  if (entry.httpRequest !== undefined) {
    attributes.httpRequest = entry.httpRequest
  }
  if (entry.operation !== undefined) {
    attributes.operation = entry.operation
  }
  if (entry.insertId !== undefined) {
    attributes.insertId = entry.insertId
  }

  return attributes
}

function mergeLabels(
  entry: LogEntry,
  promotedLabel: string | null,
): Record<string, string> {
  const merged: Record<string, string> = {}

  const sourceLabels: Record<string, string> = entry.resource?.labels ?? {}
  for (const [key, value] of Object.entries(sourceLabels)) {
    if (key !== promotedLabel) {
      merged[key] = value
    }
  }

  const topLevelLabels: Record<string, string> = entry.labels ?? {}
  for (const [key, value] of Object.entries(topLevelLabels)) {
    merged[key] = value
  }

  return merged
}

function serviceLabelKey(resourceType: string | undefined): string | null {
  if (resourceType === undefined) {
    return null
  }

  return SERVICE_LABEL_BY_RESOURCE_TYPE[resourceType] ?? null
}

function carriesLogEntryMarkers(line: string): boolean {
  const json = tryParseJson(line)
  if (json === undefined) {
    return false
  }

  const entry = logEntrySchema.safeParse(json)
  if (!entry.success) {
    return false
  }

  const data = entry.data
  const hasPayload =
    data.jsonPayload !== undefined ||
    data.textPayload !== undefined ||
    data.protoPayload !== undefined

  return data.logName !== undefined && data.timestamp !== undefined && hasPayload
}

function tryParseJson(line: string): unknown {
  try {
    return JSON.parse(line) as unknown
  } catch {
    return undefined
  }
}

function parseError(line: string, code: ParseError['code']): ParseError {
  return { kind: 'parse-error', line, code }
}
