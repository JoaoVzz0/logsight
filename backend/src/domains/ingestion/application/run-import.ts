import { streamLines } from '../../../shared/lib/stream-lines'
import type { FileStorage } from '../ports/file-storage'
import type { JobHandler } from '../ports/job-queue'

import {
  ingestLogFile,
  type IngestLogFileDependencies,
} from './ingest-log-file'

export type RunImportDependencies = IngestLogFileDependencies & {
  readonly fileStorage: FileStorage
}

export function importJobHandler(deps: RunImportDependencies): JobHandler {
  return async (message) => {
    try {
      const contents = await deps.fileStorage.open(message.storageKey)
      await ingestLogFile(
        {
          importJobId: message.importJobId,
          lines: streamLines(contents),
          totalLines: message.totalLines,
          ...(message.sourceType === null
            ? {}
            : { sourceType: message.sourceType }),
        },
        deps,
      )
    } catch (error) {
      await deps.importJobStore.markFailed(message.importJobId, reasonOf(error))
    }
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
