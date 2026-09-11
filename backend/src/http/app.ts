import { join } from 'node:path'

import fastifyMultipart from '@fastify/multipart'
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

import { analyticsRoutes } from '../domains/analytics/http/analytics-routes'
import {
  byServiceResponseSchema,
  errorRateResponseSchema,
  newIssuesResponseSchema,
  spikesResponseSchema,
  topIssuesResponseSchema,
} from '../domains/analytics/http/analytics-schema'
import { createImportProcessing } from '../domains/ingestion/infra/import-processing'
import { InProcessJobQueue } from '../domains/ingestion/infra/queue/in-process-job-queue'
import { LocalFileStorage } from '../domains/ingestion/infra/storage/local-file-storage'
import {
  createImportResponseSchema,
  importListResponseSchema,
  importStatusResponseSchema,
} from '../domains/ingestion/http/imports-schema'
import { importsRoutes } from '../domains/ingestion/http/imports-routes'
import type { FileStorage } from '../domains/ingestion/ports/file-storage'
import type { JobQueue } from '../domains/ingestion/ports/job-queue'
import {
  logListQuerySchema,
  logListResponseSchema,
  logRecordSchema,
} from '../domains/logs/http/log-list-schema'
import { logsRoutes } from '../domains/logs/http/logs-routes'

import { registerErrorHandler } from './error-handler'

const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024

export type AppDependencies = {
  readonly prisma: PrismaClient
  readonly fileStorage?: FileStorage
  readonly jobQueue?: JobQueue
  readonly maxUploadBytes?: number
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
        CreateImportResponse: createImportResponseSchema,
        ImportStatusResponse: importStatusResponseSchema,
        ImportListResponse: importListResponseSchema,
        ErrorRateResponse: errorRateResponseSchema,
        NewIssuesResponse: newIssuesResponseSchema,
        TopIssuesResponse: topIssuesResponseSchema,
        SpikesResponse: spikesResponseSchema,
        ByServiceResponse: byServiceResponseSchema,
      },
    }),
  })
  await app.register(fastifySwaggerUi, { routePrefix: '/docs' })

  const maxUploadBytes = deps.maxUploadBytes ?? resolveMaxUploadBytes()
  const fileStorage = deps.fileStorage ?? new LocalFileStorage(resolveStorageDir())
  const jobQueue = deps.jobQueue ?? new InProcessJobQueue()

  await app.register(fastifyMultipart, {
    limits: { fileSize: maxUploadBytes + 1 },
    throwFileSizeLimit: false,
  })

  await app.register(logsRoutes, { prisma: deps.prisma })
  await app.register(analyticsRoutes, { prisma: deps.prisma })
  await app.register(importsRoutes, {
    prisma: deps.prisma,
    registerImportJob: createImportProcessing({
      prisma: deps.prisma,
      fileStorage,
      jobQueue,
      maxUploadBytes,
    }),
  })

  return app
}

function resolveMaxUploadBytes(): number {
  const configured = Number(process.env.MAX_UPLOAD_BYTES)
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_UPLOAD_BYTES
}

function resolveStorageDir(): string {
  return process.env.STORAGE_LOCAL_PATH ?? join(process.cwd(), 'uploads')
}
