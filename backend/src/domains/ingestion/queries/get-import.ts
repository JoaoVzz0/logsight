import type { ImportJob as ImportJobRow, PrismaClient } from '@prisma/client'

import { ImportJobNotFoundError } from '../core/errors'

import { toStatusValue, type ImportStatusValue } from './import-status'

export type ImportResult = {
  readonly ingestedRecords: number
  readonly elapsedMs: number
  readonly linesPerSecond: number
}

export type ImportStatus = {
  readonly id: string
  readonly filename: string
  readonly status: ImportStatusValue
  readonly sourceType: string | null
  readonly totalLines: number | null
  readonly processedLines: number
  readonly parseErrors: number
  readonly createdAt: string
  readonly finishedAt: string | null
  readonly error: string | null
  readonly result: ImportResult | null
}

export async function getImport(
  prisma: PrismaClient,
  id: string,
): Promise<ImportStatus> {
  const row = await prisma.importJob.findUnique({ where: { id } })
  if (row === null) {
    throw new ImportJobNotFoundError(id)
  }
  return toImportStatus(row)
}

function toImportStatus(row: ImportJobRow): ImportStatus {
  return {
    id: row.id,
    filename: row.filename,
    status: toStatusValue(row.status),
    sourceType: row.sourceType,
    totalLines: row.totalLines,
    processedLines: row.processedLines,
    parseErrors: row.parseErrors,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    error: row.error,
    result: toResult(row),
  }
}

function toResult(row: ImportJobRow): ImportResult | null {
  if (row.status !== 'COMPLETED' || row.elapsedMs === null) {
    return null
  }
  return {
    ingestedRecords: row.processedLines - row.parseErrors,
    elapsedMs: row.elapsedMs,
    linesPerSecond: linesPerSecond(row.processedLines, row.elapsedMs),
  }
}

function linesPerSecond(lines: number, elapsedMs: number): number {
  if (elapsedMs <= 0) {
    return lines
  }
  return Math.round(lines / (elapsedMs / 1000))
}
