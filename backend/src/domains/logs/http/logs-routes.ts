import type { PrismaClient } from '@prisma/client'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { listLogs } from '../queries/list-logs'

import { logListQuerySchema, logListResponseSchema } from './log-list-schema'

export type LogsRoutesOptions = {
  readonly prisma: PrismaClient
}

export const logsRoutes: FastifyPluginAsyncZod<LogsRoutesOptions> = async (
  app,
  options,
) => {
  app.get(
    '/logs',
    {
      schema: {
        querystring: logListQuerySchema,
        response: { 200: logListResponseSchema },
      },
    },
    (request) => {
      const { level, from, to, service, q, limit, cursor } = request.query

      return listLogs(options.prisma, {
        ...(level !== undefined ? { level } : {}),
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(service !== undefined ? { service } : {}),
        ...(q !== undefined ? { q } : {}),
        limit,
        ...(cursor !== undefined ? { cursor } : {}),
      })
    },
  )
}
