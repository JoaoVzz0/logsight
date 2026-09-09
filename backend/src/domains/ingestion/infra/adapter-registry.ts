import { DomainError } from '../../../shared/errors/domain-error'

import { selectAdapter } from '../core/services/adapter-selection'
import type { LogSourceAdapter } from '../ports/log-source-adapter'

import { createAwsCloudWatchAdapter } from './adapters/aws-cloudwatch'
import { gcpCloudLoggingAdapter } from './adapters/gcp-cloud-logging'
import { createJsonLinesAdapter } from './adapters/json-lines-adapter'

export class UnknownSourceTypeError extends DomainError {
  readonly code = 'unknown-source-type'

  constructor(readonly sourceType: string) {
    super(`unknown source type: ${sourceType}`)
  }
}

const wallClock = (): Date => new Date()

const jsonLinesAdapter = createJsonLinesAdapter(wallClock)

export const registeredAdapters: readonly LogSourceAdapter[] = [
  gcpCloudLoggingAdapter,
  createAwsCloudWatchAdapter(wallClock),
  jsonLinesAdapter,
]

export const fallbackAdapter: LogSourceAdapter = jsonLinesAdapter

export function resolveAdapter(
  sample: string[],
  sourceType?: string,
): LogSourceAdapter {
  if (sourceType === undefined) {
    return selectAdapter(registeredAdapters, fallbackAdapter, sample)
  }

  const named = registeredAdapters.find(
    (adapter) => adapter.sourceType === sourceType,
  )
  if (named === undefined) {
    throw new UnknownSourceTypeError(sourceType)
  }

  return named
}
