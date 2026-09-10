import { Readable, Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { UnknownSourceTypeError } from '../core/errors'
import type { NewImportJob } from '../ports/import-job-store'
import type { ImportJobMessage } from '../ports/job-queue'

import {
  registerImportJob,
  type RegisterImportJobDependencies,
} from './register-import-job'

class InMemoryFileStorage {
  readonly written = new Map<string, Buffer>()

  async createWriteStream(key: string): Promise<Writable> {
    const chunks: Buffer[] = []
    const sink = new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        chunks.push(Buffer.from(chunk))
        done()
      },
    })
    sink.on('finish', () => {
      this.written.set(key, Buffer.concat(chunks))
    })
    return sink
  }

  async open(key: string): Promise<Readable> {
    return Readable.from(this.written.get(key) ?? Buffer.alloc(0))
  }
}

class RecordingImportJobStore {
  readonly created: NewImportJob[] = []

  async create(job: NewImportJob): Promise<{ id: string }> {
    this.created.push(job)
    return { id: `job-${this.created.length}` }
  }

  async markRunning(): Promise<void> {}
  async reportProgress(): Promise<void> {}
  async markCompleted(): Promise<void> {}
  async markFailed(): Promise<void> {}
}

class RecordingJobQueue {
  readonly enqueued: ImportJobMessage[] = []

  async enqueue(message: ImportJobMessage): Promise<void> {
    this.enqueued.push(message)
  }

  onJob(): void {}
}

type Harness = {
  fileStorage: InMemoryFileStorage
  importJobStore: RecordingImportJobStore
  jobQueue: RecordingJobQueue
  deps: RegisterImportJobDependencies
}

const harness = (
  overrides: Partial<RegisterImportJobDependencies> = {},
): Harness => {
  const fileStorage = new InMemoryFileStorage()
  const importJobStore = new RecordingImportJobStore()
  const jobQueue = new RecordingJobQueue()
  return {
    fileStorage,
    importJobStore,
    jobQueue,
    deps: {
      fileStorage,
      importJobStore,
      jobQueue,
      acceptedSourceTypes: ['gcp-cloud-logging', 'json-lines'],
      maxUploadBytes: 1_000_000,
      newStorageKey: () => 'key-1',
      ...overrides,
    },
  }
}

const upload = (body: string, sourceType: string | null = null) => ({
  filename: 'app.log',
  sourceType,
  contents: Readable.from(body),
})

describe('registerImportJob', () => {
  it('streams the upload to storage and creates a pending job with its byte size, line count and source type', async () => {
    const test = harness()

    const { importJobId } = await registerImportJob(
      upload('a\nb\nlast line', 'json-lines'),
      test.deps,
    )

    expect(importJobId).toBe('job-1')
    expect(test.fileStorage.written.get('key-1')?.toString()).toBe(
      'a\nb\nlast line',
    )
    expect(test.importJobStore.created).toEqual([
      {
        filename: 'app.log',
        storageKey: 'key-1',
        sizeBytes: 13,
        totalLines: 3,
        sourceType: 'json-lines',
      },
    ])
  })

  it('enqueues the stored job for background processing', async () => {
    const test = harness()

    await registerImportJob(upload('a\nb\n', 'json-lines'), test.deps)

    expect(test.jobQueue.enqueued).toEqual([
      {
        importJobId: 'job-1',
        storageKey: 'key-1',
        totalLines: 2,
        sourceType: 'json-lines',
      },
    ])
  })

  it('rejects an unknown source type before writing anything or enqueuing', async () => {
    const test = harness()

    await expect(
      registerImportJob(upload('x\n', 'nope'), test.deps),
    ).rejects.toBeInstanceOf(UnknownSourceTypeError)
    expect(test.fileStorage.written.size).toBe(0)
    expect(test.importJobStore.created).toHaveLength(0)
    expect(test.jobQueue.enqueued).toHaveLength(0)
  })

  it('rejects an empty upload without creating a job', async () => {
    const test = harness()

    await expect(registerImportJob(upload(''), test.deps)).rejects.toMatchObject(
      { code: 'empty-upload-file' },
    )
    expect(test.importJobStore.created).toHaveLength(0)
  })

  it('rejects an upload past the configured byte limit while streaming', async () => {
    const test = harness({ maxUploadBytes: 8 })

    await expect(
      registerImportJob(upload('123456789\n'), test.deps),
    ).rejects.toMatchObject({ code: 'upload-too-large' })
  })

  it('streams a payload larger than a single buffer without holding it in memory', async () => {
    const chunkSize = 64 * 1024
    const chunkCount = 300
    let pushed = 0
    const source = new Readable({
      read() {
        this.push(Buffer.alloc(chunkSize, 0x61))
        pushed += 1
        if (pushed === chunkCount) {
          this.push(null)
        }
      },
    })

    const test = harness({
      maxUploadBytes: chunkSize * chunkCount + 1,
      fileStorage: {
        createWriteStream: async () =>
          new Writable({ write: (_chunk, _encoding, done) => done() }),
        open: async () => Readable.from(''),
      },
    })

    await registerImportJob(
      { filename: 'big.log', sourceType: null, contents: source },
      test.deps,
    )

    expect(test.importJobStore.created[0]?.sizeBytes).toBe(
      chunkSize * chunkCount,
    )
  })
})
