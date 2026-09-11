import { z } from 'zod'

const MIN_SEVERITY_NUMBER = 1
const MAX_SEVERITY_NUMBER = 24

const issueStatus = z.enum(['unresolved', 'resolved', 'ignored'])

const severityLevel = z.union([
  z.literal('unknown'),
  z.coerce.number().int().min(MIN_SEVERITY_NUMBER).max(MAX_SEVERITY_NUMBER),
])

export const issueListQuerySchema = z.object({
  service: z.string().min(1).optional(),
  severity: z
    .union([severityLevel, z.array(severityLevel)])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .optional(),
})

export const issueListItemSchema = z.object({
  fingerprint: z.string(),
  sampleMessage: z.string(),
  severityNumber: z.number().int().nullable(),
  eventCount: z.number(),
  firstSeen: z.string().datetime({ offset: true }),
  lastSeen: z.string().datetime({ offset: true }),
  affectedServices: z.array(z.string()),
  status: issueStatus,
  regression: z.boolean(),
})

export const issueListResponseSchema = z.object({
  issues: z.array(issueListItemSchema),
})

export type IssueListQuery = z.infer<typeof issueListQuerySchema>
export type IssueListResponse = z.infer<typeof issueListResponseSchema>
