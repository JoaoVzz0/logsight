import { createHash } from 'node:crypto'

import {
  tokenizeMessage,
  type Span,
} from '../../../../shared/lib/tokenizer/tokenize'

export type FingerprintInput = {
  readonly body: string
  readonly serviceName: string | null
  readonly severityNumber: number | null
}

const UNIT_SEPARATOR = '\u001f'
const FIELD_SEPARATOR = '\u001e'

/**
 * Reduces a log record to a stable signature so occurrences that differ only by
 * variable values collapse to one group. The signature combines a canonical
 * serialization of the tokenized first line with the service name and severity
 * number (ADR 0005). Missing service or severity are marked structurally, so a
 * record with no origin never shares a signature with one whose service is
 * literally named `unknown`. Any input that tokenizes yields a signature;
 * nothing here throws (ADR 0004).
 */
export function computeFingerprint(input: FingerprintInput): string {
  const spans = tokenizeMessage(firstNonEmptyLine(input.body))
  const canonical = [
    serializeSpans(spans),
    field('service', input.serviceName),
    field(
      'severity',
      input.severityNumber === null ? null : String(input.severityNumber),
    ),
  ].join(FIELD_SEPARATOR)

  return createHash('sha1').update(canonical, 'utf8').digest('hex')
}

function firstNonEmptyLine(body: string): string {
  for (const line of body.split(/\r?\n/)) {
    const collapsed = line.trim().replace(/\s+/g, ' ')
    if (collapsed.length > 0) {
      return collapsed
    }
  }
  return ''
}

function serializeSpans(spans: readonly Span[]): string {
  return spans
    .map((span) =>
      span.type === 'text'
        ? span.value
        : `${UNIT_SEPARATOR}${span.kind}${UNIT_SEPARATOR}`,
    )
    .join('')
}

function field(label: string, value: string | null): string {
  return value === null
    ? `${label}${UNIT_SEPARATOR}absent`
    : `${label}${UNIT_SEPARATOR}present${UNIT_SEPARATOR}${value}`
}
