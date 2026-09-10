import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import type { PrismaClient } from '@prisma/client'
import fastify, { type FastifyInstance } from 'fastify'
import {
  createJsonSchemaTransformObject,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'

import {
  logListQuerySchema,
  logListResponseSchema,
  logRecordSchema,
} from '../domains/logs/http/log-list-schema'
import { logsRoutes } from '../domains/logs/http/logs-routes'

import { registerErrorHandler } from './error-handler'

export type AppDependencies = {
  readonly prisma: PrismaClient
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = fastify()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registerErrorHandler(app)

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: 'log-platform API', version: '0.0.0' },
    },
    transform: jsonSchemaTransform,
    transformObject: createJsonSchemaTransformObject({
      schemas: {
        LogListQuery: logListQuerySchema,
        LogRecord: logRecordSchema,
        LogListResponse: logListResponseSchema,
      },
    }),
  })
  await app.register(fastifySwaggerUi, { routePrefix: '/docs' })

  await app.register(logsRoutes, { prisma: deps.prisma })

  return app
}
