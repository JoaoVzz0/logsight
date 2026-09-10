import type { Prisma } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { getImport } from './get-import'

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.logRecord.deleteMany()
  await prisma.issue.deleteMany()
  await prisma.importJob.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const createJob = (data: Partial<Prisma.ImportJobCreateInput>): Promise<string> =>
  prisma.importJob
    .create({
      data: {
        filename: 'app.log',
        storageKey: 'key-1',
        sizeBytes: 1024n,
        ...data,
      },
    })
    .then((row) => row.id)

describe('getImport', () => {
  it('projects the job row to the status shape', async () => {
    const id = await createJob({
      filename: 'gcp-export.json',
      sourceType: 'gcp-cloud-logging',
      status: 'RUNNING',
      totalLines: 500,
      processedLines: 120,
      parseErrors: 3,
    })

    const status = await getImport(prisma, id)

    expect(status).toMatchObject({
      id,
      filename: 'gcp-export.json',
      status: 'running',
      sourceType: 'gcp-cloud-logging',
      totalLines: 500,
      processedLines: 120,
      parseErrors: 3,
      finishedAt: null,
      error: null,
      result: null,
    })
    expect(status.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('reports the processing result with a rate derived from the stored elapsed time, not the time since creation', async () => {
    const id = await createJob({
      status: 'COMPLETED',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      finishedAt: new Date('2026-01-01T02:00:00.000Z'),
      totalLines: 1000,
      processedLines: 1000,
      parseErrors: 10,
      elapsedMs: 2000,
    })

    const status = await getImport(prisma, id)

    expect(status.result).toEqual({
      ingestedRecords: 990,
      elapsedMs: 2000,
      linesPerSecond: 500,
    })
  })

  it('carries the failure reason for a failed job', async () => {
    const id = await createJob({
      status: 'FAILED',
      error: 'disk full',
      finishedAt: new Date(),
    })

    const status = await getImport(prisma, id)

    expect(status.status).toBe('failed')
    expect(status.error).toBe('disk full')
    expect(status.result).toBeNull()
  })
})
