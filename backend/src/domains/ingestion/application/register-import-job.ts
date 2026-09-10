import { Transform, type TransformCallback } from 'node:stream'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import {
  EmptyUploadFileError,
  UnknownSourceTypeError,
  UploadTooLargeError,
} from '../core/errors'
import type { FileStorage } from '../ports/file-storage'
import type { ImportJobStore } from '../ports/import-job-store'
import type { JobQueue } from '../ports/job-queue'

const NEWLINE_BYTE = 0x0a

export type RegisterImportJobRequest = {
  readonly filename: string
  readonly sourceType: string | null
  readonly contents: Readable
}

export type RegisterImportJobDependencies = {
  readonly fileStorage: FileStorage
  readonly importJobStore: ImportJobStore
  readonly jobQueue: JobQueue
  readonly acceptedSourceTypes: readonly string[]
  readonly maxUploadBytes: number
  readonly newStorageKey: () => string
}

export async function registerImportJob(
  request: RegisterImportJobRequest,
  deps: RegisterImportJobDependencies,
): Promise<{ importJobId: string }> {
  const sourceType = validateSourceType(
    request.sourceType,
    deps.acceptedSourceTypes,
  )

  const storageKey = deps.newStorageKey()
  const counter = new UploadCounter(deps.maxUploadBytes)
  await pipeline(
    request.contents,
    counter,
    await deps.fileStorage.createWriteStream(storageKey),
  )

  if (counter.byteCount === 0) {
    throw new EmptyUploadFileError()
  }

  const { id } = await deps.importJobStore.create({
    filename: request.filename,
    storageKey,
    sizeBytes: counter.byteCount,
    totalLines: counter.lineCount,
    sourceType,
  })

  await deps.jobQueue.enqueue({
    importJobId: id,
    storageKey,
    totalLines: counter.lineCount,
    sourceType,
  })

  return { importJobId: id }
}

function validateSourceType(
  value: string | null,
  accepted: readonly string[],
): string | null {
  if (value === null) {
    return null
  }
  if (!accepted.includes(value)) {
    throw new UnknownSourceTypeError(value, accepted)
  }
  return value
}

class UploadCounter extends Transform {
  private bytes = 0
  private newlines = 0
  private endsWithNewline = false

  constructor(private readonly limitBytes: number) {
    super()
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    done: TransformCallback,
  ): void {
    this.bytes += chunk.length
    if (this.bytes > this.limitBytes) {
      done(new UploadTooLargeError(this.limitBytes))
      return
    }
    for (const byte of chunk) {
      if (byte === NEWLINE_BYTE) {
        this.newlines += 1
      }
    }
    if (chunk.length > 0) {
      this.endsWithNewline = chunk[chunk.length - 1] === NEWLINE_BYTE
    }
    done(null, chunk)
  }

  get byteCount(): number {
    return this.bytes
  }

  get lineCount(): number {
    return this.newlines + (this.bytes > 0 && !this.endsWithNewline ? 1 : 0)
  }
}
