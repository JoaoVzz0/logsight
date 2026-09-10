import { z } from 'zod'

import { DomainError } from '../../../shared/errors/domain-error'

export class InvalidCursorError extends DomainError {
  readonly code = 'invalid-cursor'

  constructor() {
    super('the pagination cursor is malformed')
  }
}

export type LogCursor = {
  readonly timestamp: string
  readonly id: string
}

const cursorPayloadSchema = z.object({
  timestamp: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
})

export function encodeCursor(cursor: LogCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeCursor(raw: string): LogCursor {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    )
    return cursorPayloadSchema.parse(decoded)
  } catch {
    throw new InvalidCursorError()
  }
}
