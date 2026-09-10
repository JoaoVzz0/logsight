import type { ImportJob as ImportJobRow, PrismaClient } from '@prisma/client'

import { toStatusValue, type ImportStatusValue } from './import-status'

export const IMPORT_HISTORY_LIMIT = 50

export type ImportSummary = {
  readonly id: string
  readonly filename: string
  readonly status: ImportStatusValue
  readonly createdAt: string
  readonly totalLines: number | null
  readonly processedLines: number
  readonly parseErrors: number
}

export async function listImports(
  prisma: PrismaClient,
): Promise<ImportSummary[]> {
  const rows = await prisma.importJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: IMPORT_HISTORY_LIMIT,
  })
  return rows.map(toSummary)
}

function toSummary(row: ImportJobRow): ImportSummary {
  return {
    id: row.id,
    filename: row.filename,
    status: toStatusValue(row.status),
    createdAt: row.createdAt.toISOString(),
    totalLines: row.totalLines,
    processedLines: row.processedLines,
    parseErrors: row.parseErrors,
  }
}
