import type { PrismaClient } from '@prisma/client'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { byService } from '../queries/by-service'
import { errorRate } from '../queries/error-rate'
import { newIssues } from '../queries/new-issues'
import { spikes } from '../queries/spikes'
import { topIssues } from '../queries/top-issues'

import {
  analyticsWindowQuerySchema,
  byServiceResponseSchema,
  errorRateResponseSchema,
  newIssuesResponseSchema,
  spikesResponseSchema,
  topIssuesQuerySchema,
  topIssuesResponseSchema,
} from './analytics-schema'

export type AnalyticsRoutesOptions = {
  readonly prisma: PrismaClient
}

export const analyticsRoutes: FastifyPluginAsyncZod<AnalyticsRoutesOptions> = async (
  app,
  options,
) => {
  app.get(
    '/analytics/error-rate',
    {
      schema: {
        querystring: analyticsWindowQuerySchema,
        response: { 200: errorRateResponseSchema },
      },
    },
    (request) => errorRate(options.prisma, request.query),
  )

  app.get(
    '/analytics/new-issues',
    {
      schema: {
        querystring: analyticsWindowQuerySchema,
        response: { 200: newIssuesResponseSchema },
      },
    },
    (request) => newIssues(options.prisma, request.query),
  )

  app.get(
    '/analytics/top-issues',
    {
      schema: {
        querystring: topIssuesQuerySchema,
        response: { 200: topIssuesResponseSchema },
      },
    },
    (request) => topIssues(options.prisma, request.query),
  )

  app.get(
    '/analytics/spikes',
    {
      schema: {
        querystring: analyticsWindowQuerySchema,
        response: { 200: spikesResponseSchema },
      },
    },
    (request) => spikes(options.prisma, request.query),
  )

  app.get(
    '/analytics/by-service',
    {
      schema: {
        querystring: analyticsWindowQuerySchema,
        response: { 200: byServiceResponseSchema },
      },
    },
    (request) => byService(options.prisma, request.query),
  )
}
