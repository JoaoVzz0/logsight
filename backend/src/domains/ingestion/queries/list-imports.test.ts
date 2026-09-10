import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { IMPORT_HISTORY_LIMIT, listImports } from './list-imports'

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.logRecord.deleteMany()
  await prisma.issue.deleteMany()
  await prisma.importJob.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const seedJob = (index: number): Promise<unknown> =>
  prisma.importJob.create({
    data: {
      filename: `import-${index}.log`,
      storageKey: `key-${index}`,
      sizeBytes: 10n,
      status: 'COMPLETED',
      totalLines: 100 + index,
      processedLines: 100 + index,
      parseErrors: index,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    },
  })

describe('listImports', () => {
  it('returns imports newest first with their filename, status and counts', async () => {
    await seedJob(0)
    await seedJob(1)
    await seedJob(2)

    const imports = await listImports(prisma)

    expect(imports.map((entry) => entry.filename)).toEqual([
      'import-2.log',
      'import-1.log',
      'import-0.log',
    ])
    expect(imports[0]).toMatchObject({
      status: 'completed',
      totalLines: 102,
      processedLines: 102,
      parseErrors: 2,
    })
    expect(imports[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('caps the history at fifty entries', async () => {
    for (let index = 0; index < IMPORT_HISTORY_LIMIT + 5; index += 1) {
      await seedJob(index)
    }

    const imports = await listImports(prisma)

    expect(imports).toHaveLength(IMPORT_HISTORY_LIMIT)
    expect(imports[0]?.filename).toBe(`import-${IMPORT_HISTORY_LIMIT + 4}.log`)
  })
})
