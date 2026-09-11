import type { PrismaClient } from '@prisma/client'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { listIssues } from '../queries/list-issues'

import { issueListQuerySchema, issueListResponseSchema } from './issue-list-schema'

export type IssuesRoutesOptions = {
  readonly prisma: PrismaClient
}

export const issuesRoutes: FastifyPluginAsyncZod<IssuesRoutesOptions> = async (
  app,
  options,
) => {
  app.get(
    '/issues',
    {
      schema: {
        querystring: issueListQuerySchema,
        response: { 200: issueListResponseSchema },
      },
    },
    (request) => {
      const { service, severity } = request.query

      return listIssues(options.prisma, {
        ...(service !== undefined ? { service } : {}),
        ...(severity !== undefined ? { severity } : {}),
      })
    },
  )
}
