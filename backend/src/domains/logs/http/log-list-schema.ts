import { z } from 'zod'

import { DEFAULT_LIMIT, MAX_LIMIT } from '../queries/list-logs'

const MIN_SEVERITY_NUMBER = 1
const MAX_SEVERITY_NUMBER = 24

const severityLevel = z.union([
  z.literal('unknown'),
  z.coerce.number().int().min(MIN_SEVERITY_NUMBER).max(MAX_SEVERITY_NUMBER),
])

export const logListQuerySchema = z.object({
  level: z
    .union([severityLevel, z.array(severityLevel)])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  service: z.string().min(1).optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: z.string().optional(),
})

export const logRecordSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }),
  observedAt: z.string().datetime({ offset: true }),
  severityNumber: z.number().int().nullable(),
  severityText: z.string().nullable(),
  body: z.string(),
  serviceName: z.string().nullable(),
  host: z.string().nullable(),
  environment: z.string().nullable(),
  traceId: z.string().nullable(),
  spanId: z.string().nullable(),
  sourceType: z.string(),
  fingerprint: z.string(),
})

export const logListResponseSchema = z.object({
  records: z.array(logRecordSchema),
  nextCursor: z.string().nullable(),
})

export type LogListQuery = z.infer<typeof logListQuerySchema>
export type LogListResponse = z.infer<typeof logListResponseSchema>
