import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../../http/app'
import type { ImportJobMessage, JobQueue } from '../ports/job-queue'
import { InProcessJobQueue } from '../infra/queue/in-process-job-queue'
import { LocalFileStorage } from '../infra/storage/local-file-storage'

const prisma = new PrismaClient()
const storageDirs: string[] = []
const apps: FastifyInstance[] = []

beforeEach(async () => {
  await prisma.logRecord.deleteMany()
  await prisma.issue.deleteMany()
  await prisma.importJob.deleteMany()
})

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

afterAll(async () => {
  await prisma.$disconnect()
  for (const dir of storageDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

class RecordingJobQueue implements JobQueue {
  readonly enqueued: ImportJobMessage[] = []

  async enqueue(message: ImportJobMessage): Promise<void> {
    this.enqueued.push(message)
  }

  onJob(): void {}
}

type Built = {
  app: FastifyInstance
  storageDir: string
}

const build = async (options: {
  jobQueue?: JobQueue
  maxUploadBytes?: number
} = {}): Promise<Built> => {
  const storageDir = mkdtempSync(join(tmpdir(), 'imports-routes-'))
  storageDirs.push(storageDir)
  const app = await buildApp({
    prisma,
    fileStorage: new LocalFileStorage(storageDir),
    ...(options.jobQueue === undefined ? {} : { jobQueue: options.jobQueue }),
    ...(options.maxUploadBytes === undefined
      ? {}
      : { maxUploadBytes: options.maxUploadBytes }),
  })
  apps.push(app)
  return { app, storageDir }
}

type Part =
  | { name: string; value: string }
  | { name: string; filename: string; content: string | Buffer }

const multipart = (
  parts: Part[],
): { payload: Buffer; headers: Record<string, string> } => {
  const boundary = `----test${Math.random().toString(16).slice(2)}`
  const chunks: Buffer[] = []
  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`
    if ('filename' in part) {
      head += `; filename="${part.filename}"\r\nContent-Type: application/octet-stream`
    }
    head += '\r\n\r\n'
    chunks.push(Buffer.from(head))
    chunks.push(
      'filename' in part
        ? Buffer.from(part.content)
        : Buffer.from(part.value),
    )
    chunks.push(Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}

const jsonLines = (count: number): string =>
  Array.from(
    { length: count },
    (_unused, index) =>
      `{"level":"info","time":"2026-09-08T10:00:0${index % 10}.000Z","msg":"event ${index}","service":"api"}`,
  ).join('\n') + '\n'

const postImport = (app: FastifyInstance, parts: Part[]) => {
  const { payload, headers } = multipart(parts)
  return app.inject({ method: 'POST', url: '/imports', payload, headers })
}

const pollUntilSettled = async (
  app: FastifyInstance,
  id: string,
): Promise<Record<string, unknown>> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await app.inject({ method: 'GET', url: `/imports/${id}` })
    const body = response.json() as Record<string, unknown>
    if (body.status === 'completed' || body.status === 'failed') {
      return body
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`import ${id} did not settle`)
}

describe('POST /imports', () => {
  it('streams the uploaded file to storage and accepts a payload larger than one buffer', async () => {
    const queue = new RecordingJobQueue()
    const { app, storageDir } = await build({ jobQueue: queue })
    const content = 'x'.repeat(2 * 1024 * 1024) + '\n'

    const response = await postImport(app, [
      { name: 'file', filename: 'big.log', content },
    ])

    expect(response.statusCode).toBe(202)
    const { id } = response.json() as { id: string }
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id } })
    const stored = await readFile(join(storageDir, job.storageKey), 'utf8')
    expect(stored).toBe(content)
    expect(job.sizeBytes).toBe(BigInt(content.length))
  })

  it('rejects an upload larger than the configured limit with 413', async () => {
    const { app } = await build({ jobQueue: new RecordingJobQueue(), maxUploadBytes: 64 })

    const response = await postImport(app, [
      { name: 'file', filename: 'big.log', content: 'a'.repeat(500) },
    ])

    expect(response.statusCode).toBe(413)
  })

  it('rejects a request with no file part and a request whose file is empty with 400', async () => {
    const { app } = await build({ jobQueue: new RecordingJobQueue() })

    const noFile = await postImport(app, [{ name: 'sourceType', value: 'json-lines' }])
    expect(noFile.statusCode).toBe(400)

    const emptyFile = await postImport(app, [
      { name: 'file', filename: 'empty.log', content: '' },
    ])
    expect(emptyFile.statusCode).toBe(400)
  })

  it('rejects an unknown source type with 400 listing the accepted values', async () => {
    const { app } = await build({ jobQueue: new RecordingJobQueue() })

    const response = await postImport(app, [
      { name: 'sourceType', value: 'acme-logs' },
      { name: 'file', filename: 'app.log', content: 'a\n' },
    ])

    expect(response.statusCode).toBe(400)
    expect(response.body).toContain('json-lines')
  })

  it('creates a pending job carrying the filename, byte size, source type and line count before processing runs', async () => {
    const queue = new RecordingJobQueue()
    const { app } = await build({ jobQueue: queue })

    const response = await postImport(app, [
      { name: 'sourceType', value: 'json-lines' },
      { name: 'file', filename: 'app.log', content: jsonLines(4) },
    ])

    const { id } = response.json() as { id: string }
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id } })
    expect(job).toMatchObject({
      status: 'PENDING',
      filename: 'app.log',
      sourceType: 'json-lines',
      totalLines: 4,
      processedLines: 0,
    })
    expect(job.sizeBytes).toBeGreaterThan(0n)
    expect(queue.enqueued).toHaveLength(1)
  })

  it('responds 202 with the job id without waiting for the pipeline', async () => {
    const queue = new RecordingJobQueue()
    const { app } = await build({ jobQueue: queue })

    const response = await postImport(app, [
      { name: 'file', filename: 'app.log', content: jsonLines(3) },
    ])

    expect(response.statusCode).toBe(202)
    expect((response.json() as { id: string }).id).toMatch(
      /^[0-9a-f-]{36}$/,
    )
    expect(queue.enqueued).toHaveLength(1)
  })
})

describe('import processing', () => {
  it('advances the processed and parse-error counts until the job completes', async () => {
    const { app } = await build()
    const content = `${jsonLines(6)}not json at all\n`

    const { id } = (
      await postImport(app, [{ name: 'file', filename: 'app.log', content }])
    ).json() as { id: string }

    const settled = await pollUntilSettled(app, id)
    expect(settled.status).toBe('completed')
    expect(settled.processedLines).toBe(7)
    expect(settled.parseErrors).toBe(1)
    expect(settled.result).toMatchObject({ ingestedRecords: 6 })
  })

  it('processes two uploads accepted back to back', async () => {
    const { app } = await build()

    const first = (
      await postImport(app, [{ name: 'file', filename: 'a.log', content: jsonLines(3) }])
    ).json() as { id: string }
    const second = (
      await postImport(app, [{ name: 'file', filename: 'b.log', content: jsonLines(5) }])
    ).json() as { id: string }

    expect((await pollUntilSettled(app, first.id)).status).toBe('completed')
    expect((await pollUntilSettled(app, second.id)).status).toBe('completed')
  })

  it('uploads a file, completes the job and surfaces the records in the log list', async () => {
    const { app } = await build()

    const { id } = (
      await postImport(app, [
        { name: 'file', filename: 'app.log', content: jsonLines(4) },
      ])
    ).json() as { id: string }

    const settled = await pollUntilSettled(app, id)
    expect(settled.status).toBe('completed')

    const logs = await app.inject({ method: 'GET', url: '/logs' })
    expect((logs.json() as { records: unknown[] }).records.length).toBe(4)
  })
})

describe('GET /imports/:id', () => {
  it('returns 404 for an unknown job id through the global error handler', async () => {
    const { app } = await build({ jobQueue: new RecordingJobQueue() })

    const response = await app.inject({
      method: 'GET',
      url: '/imports/00000000-0000-0000-0000-000000000000',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ error: expect.any(String), message: expect.any(String) })
  })

  it('returns 400 for a malformed job id', async () => {
    const { app } = await build({ jobQueue: new RecordingJobQueue() })

    const response = await app.inject({ method: 'GET', url: '/imports/not-a-uuid' })

    expect(response.statusCode).toBe(400)
  })
})

describe('GET /imports', () => {
  it('caps the history at the fifty newest and ignores a cursor parameter', async () => {
    for (let index = 0; index < 55; index += 1) {
      await prisma.importJob.create({
        data: {
          filename: `job-${index}.log`,
          storageKey: `key-${index}`,
          sizeBytes: 1n,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        },
      })
    }
    const { app } = await build({ jobQueue: new RecordingJobQueue() })

    const response = await app.inject({ method: 'GET', url: '/imports?cursor=whatever' })

    expect(response.statusCode).toBe(200)
    expect((response.json() as { imports: unknown[] }).imports).toHaveLength(50)
  })

  it('returns an empty history with 200 when nothing has been imported', async () => {
    const { app } = await build({ jobQueue: new RecordingJobQueue() })

    const response = await app.inject({ method: 'GET', url: '/imports' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ imports: [] })
  })
})

type SwaggerDoc = {
  readonly paths: Record<string, Record<string, unknown>>
  readonly components: { readonly schemas: Record<string, unknown> }
}

describe('import routes contract', () => {
  it('documents the three import routes in the openapi document with named schemas', async () => {
    const { app } = await build({ jobQueue: new RecordingJobQueue() })
    await app.ready()

    const doc = app.swagger() as unknown as SwaggerDoc
    expect(doc.paths['/imports']?.post).toBeDefined()
    expect(doc.paths['/imports']?.get).toBeDefined()
    expect(doc.paths['/imports/{id}']?.get).toBeDefined()
    expect(doc.components.schemas.CreateImportResponse).toBeDefined()
    expect(doc.components.schemas.ImportStatusResponse).toBeDefined()
    expect(doc.components.schemas.ImportListResponse).toBeDefined()
  })

  it('keeps the committed openapi.json in sync with the import routes', () => {
    const openapiPath = fileURLToPath(
      new URL('../../../../../packages/api-client/openapi.json', import.meta.url),
    )
    const doc = JSON.parse(readFileSync(openapiPath, 'utf8')) as SwaggerDoc
    expect(doc.paths['/imports']).toBeDefined()
    expect(doc.paths['/imports/{id}']).toBeDefined()
  })
})
