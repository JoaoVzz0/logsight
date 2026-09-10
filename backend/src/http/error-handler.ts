import type { FastifyInstance } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'

import { DomainError } from '../shared/errors/domain-error'

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  'invalid-cursor': 400,
}

export type ErrorResponse = {
  readonly statusCode: number
  readonly body: {
    readonly error: string
    readonly message: string
    readonly issues?: unknown
  }
}

export function httpErrorResponse(error: unknown): ErrorResponse {
  if (hasZodFastifySchemaValidationErrors(error)) {
    return {
      statusCode: 400,
      body: {
        error: 'Bad Request',
        message: 'request validation failed',
        issues: error.validation,
      },
    }
  }

  if (error instanceof DomainError) {
    return {
      statusCode: STATUS_BY_CODE[error.code] ?? 500,
      body: { error: error.name, message: error.message },
    }
  }

  return {
    statusCode: 500,
    body: { error: 'Internal Server Error', message: 'internal server error' },
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = httpErrorResponse(error)
    reply.code(statusCode).send(body)
  })
}
