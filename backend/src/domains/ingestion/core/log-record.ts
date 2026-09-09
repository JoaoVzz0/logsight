import { computeFingerprint } from './services/fingerprint'
import type { NormalizedSeverity } from './services/severity'

export type SourceType =
  | 'gcp-cloud-logging'
  | 'aws-cloudwatch'
  | 'json-lines'
  | 'nginx'

export type LogRecord = {
  readonly timestamp: Date
  readonly observedAt: Date
  readonly severityNumber: number | null
  readonly severityText: string | null
  readonly body: string
  readonly serviceName: string | null
  readonly host: string | null
  readonly environment: string | null
  readonly traceId: string | null
  readonly spanId: string | null
  readonly attributes: Readonly<Record<string, unknown>>
  readonly sourceType: SourceType
  readonly fingerprint: string
  readonly raw: string
}

export type LogRecordDraft = {
  readonly timestamp: Date
  readonly body: string
  readonly severity: NormalizedSeverity
  readonly sourceType: SourceType
  readonly raw: string
  readonly serviceName?: string | null
  readonly host?: string | null
  readonly environment?: string | null
  readonly traceId?: string | null
  readonly spanId?: string | null
  readonly attributes?: Readonly<Record<string, unknown>>
}

const TYPED_ATTRIBUTE_KEYS = [
  'serviceName',
  'host',
  'environment',
  'traceId',
  'spanId',
]

export function assembleLogRecord(
  draft: LogRecordDraft,
  clock: () => Date,
): LogRecord {
  const serviceName = draft.serviceName ?? null

  return {
    timestamp: draft.timestamp,
    observedAt: clock(),
    severityNumber: draft.severity.severityNumber,
    severityText: draft.severity.severityText,
    body: draft.body,
    serviceName,
    host: draft.host ?? null,
    environment: draft.environment ?? null,
    traceId: draft.traceId ?? null,
    spanId: draft.spanId ?? null,
    attributes: withoutTypedKeys(draft.attributes),
    sourceType: draft.sourceType,
    fingerprint: computeFingerprint({
      body: draft.body,
      serviceName,
      severityNumber: draft.severity.severityNumber,
    }),
    raw: draft.raw,
  }
}

function withoutTypedKeys(
  attributes: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  const tail: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (!TYPED_ATTRIBUTE_KEYS.includes(key)) {
      tail[key] = value
    }
  }

  return tail
}
