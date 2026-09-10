import { DomainError } from '../../../shared/errors/domain-error'

export class UnknownSourceTypeError extends DomainError {
  readonly code = 'unknown-source-type'

  constructor(
    readonly sourceType: string,
    readonly accepted: readonly string[],
  ) {
    super(
      `unknown source type "${sourceType}"; accepted: ${accepted.join(', ')}`,
    )
  }
}

export class MissingUploadFileError extends DomainError {
  readonly code = 'missing-upload-file'

  constructor() {
    super('the request carries no file part named "file"')
  }
}

export class EmptyUploadFileError extends DomainError {
  readonly code = 'empty-upload-file'

  constructor() {
    super('the uploaded file is empty')
  }
}

export class UploadTooLargeError extends DomainError {
  readonly code = 'upload-too-large'

  constructor(readonly limitBytes: number) {
    super(`the uploaded file exceeds the ${limitBytes} byte limit`)
  }
}

export class ImportJobNotFoundError extends DomainError {
  readonly code = 'import-job-not-found'

  constructor(readonly importJobId: string) {
    super(`import job ${importJobId} does not exist`)
  }
}
