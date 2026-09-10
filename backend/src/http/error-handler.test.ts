import { describe, expect, it } from 'vitest'

import { DomainError } from '../shared/errors/domain-error'

import { httpErrorResponse } from './error-handler'

class MappedError extends DomainError {
  readonly code = 'invalid-cursor'

  constructor() {
    super('mapped')
  }
}

class UnmappedError extends DomainError {
  readonly code = 'not-in-the-table'

  constructor() {
    super('unmapped')
  }
}

describe('httpErrorResponse', () => {
  it('maps a domain error to its http status by the error code', () => {
    expect(httpErrorResponse(new MappedError()).statusCode).toBe(400)
    expect(httpErrorResponse(new UnmappedError()).statusCode).toBe(500)
  })
})
