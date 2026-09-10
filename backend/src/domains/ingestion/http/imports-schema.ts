import { z } from 'zod'

const importStatusValue = z.enum(['pending', 'running', 'completed', 'failed'])

export const importParamsSchema = z.object({
  id: z.string().uuid(),
})

export const createImportResponseSchema = z.object({
  id: z.string().uuid(),
})

export const importResultSchema = z.object({
  ingestedRecords: z.number().int(),
  elapsedMs: z.number().int(),
  linesPerSecond: z.number(),
})

export const importStatusResponseSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  status: importStatusValue,
  sourceType: z.string().nullable(),
  totalLines: z.number().int().nullable(),
  processedLines: z.number().int(),
  parseErrors: z.number().int(),
  createdAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }).nullable(),
  error: z.string().nullable(),
  result: importResultSchema.nullable(),
})

export const importSummarySchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  status: importStatusValue,
  createdAt: z.string().datetime({ offset: true }),
  totalLines: z.number().int().nullable(),
  processedLines: z.number().int(),
  parseErrors: z.number().int(),
})

export const importListResponseSchema = z.object({
  imports: z.array(importSummarySchema),
})

export type CreateImportResponse = z.infer<typeof createImportResponseSchema>
export type ImportStatusResponse = z.infer<typeof importStatusResponseSchema>
export type ImportListResponse = z.infer<typeof importListResponseSchema>
