import type { MultipartFile } from '@fastify/multipart'
import type { PrismaClient } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import {
  registerImportJob,
  type RegisterImportJobDependencies,
} from '../application/register-import-job'
import { MissingUploadFileError } from '../core/errors'
import { getImport } from '../queries/get-import'
import { listImports } from '../queries/list-imports'

import {
  createImportResponseSchema,
  importListResponseSchema,
  importParamsSchema,
  importStatusResponseSchema,
} from './imports-schema'

export type ImportsRoutesOptions = {
  readonly prisma: PrismaClient
  readonly registerImportJob: RegisterImportJobDependencies
}

export const importsRoutes: FastifyPluginAsyncZod<ImportsRoutesOptions> = async (
  app,
  options,
) => {
  app.post(
    '/imports',
    {
      schema: {
        consumes: ['multipart/form-data'],
        response: { 202: createImportResponseSchema },
      },
    },
    async (request, reply) => {
      const upload = await readUpload(request)
      try {
        const { importJobId } = await registerImportJob(
          {
            filename: upload.filename,
            sourceType: readSourceType(upload),
            contents: upload.file,
          },
          options.registerImportJob,
        )
        return await reply.code(202).send({ id: importJobId })
      } finally {
        upload.file.resume()
      }
    },
  )

  app.get(
    '/imports',
    { schema: { response: { 200: importListResponseSchema } } },
    async () => ({ imports: await listImports(options.prisma) }),
  )

  app.get(
    '/imports/:id',
    {
      schema: {
        params: importParamsSchema,
        response: { 200: importStatusResponseSchema },
      },
    },
    (request) => getImport(options.prisma, request.params.id),
  )
}

async function readUpload(request: FastifyRequest): Promise<MultipartFile> {
  const upload = await request.file()
  if (upload === undefined) {
    throw new MissingUploadFileError()
  }
  return upload
}

function readSourceType(upload: MultipartFile): string | null {
  const field = upload.fields.sourceType
  if (field === undefined || Array.isArray(field) || field.type !== 'field') {
    return null
  }
  return typeof field.value === 'string' ? field.value : null
}
