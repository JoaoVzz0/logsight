import { z } from 'zod'

import { DEFAULT_TOP_ISSUES_LIMIT, MAX_TOP_ISSUES_LIMIT } from '../queries/top-issues'

export const analyticsWindowQuerySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
})

export const topIssuesQuerySchema = analyticsWindowQuerySchema.extend({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_TOP_ISSUES_LIMIT)
    .default(DEFAULT_TOP_ISSUES_LIMIT),
})

const issueSummarySchema = z.object({
  fingerprint: z.string(),
  sampleMessage: z.string(),
  severity: z.number().int().nullable(),
  eventCount: z.number(),
  firstSeen: z.string().datetime({ offset: true }),
  services: z.array(z.string()),
})

export const errorRateResponseSchema = z.object({
  buckets: z.array(
    z.object({
      bucket: z.string().datetime({ offset: true }),
      total: z.number(),
      errors: z.number(),
      ratio: z.number(),
    }),
  ),
})

export const newIssuesResponseSchema = z
  .object({
    issues: z.array(issueSummarySchema),
  })
  .describe('Issues first seen within the window')

export const topIssuesResponseSchema = z
  .object({
    issues: z.array(issueSummarySchema),
  })
  .describe('Issues ranked by event count within the window')

export const spikesResponseSchema = z.object({
  issues: z.array(
    issueSummarySchema.extend({
      currentCount: z.number(),
      previousCount: z.number(),
      multiplier: z.number(),
    }),
  ),
})

export const byServiceResponseSchema = z.object({
  services: z.array(
    z.object({
      serviceName: z.string(),
      total: z.number(),
      errors: z.number(),
    }),
  ),
})

export type AnalyticsWindowQuery = z.infer<typeof analyticsWindowQuerySchema>
export type TopIssuesQuery = z.infer<typeof topIssuesQuerySchema>
export type ErrorRateResponse = z.infer<typeof errorRateResponseSchema>
export type NewIssuesResponse = z.infer<typeof newIssuesResponseSchema>
export type TopIssuesResponse = z.infer<typeof topIssuesResponseSchema>
export type SpikesResponse = z.infer<typeof spikesResponseSchema>
export type ByServiceResponse = z.infer<typeof byServiceResponseSchema>
