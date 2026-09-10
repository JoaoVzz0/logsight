import type {
  ImportJobMessage,
  JobHandler,
  JobQueue,
} from '../../ports/job-queue'

export type JobFailureListener = (
  error: unknown,
  message: ImportJobMessage,
) => void

const reportToStderr: JobFailureListener = (error, message) => {
  process.stderr.write(
    `import job ${message.importJobId} failed in the background: ${String(error)}\n`,
  )
}

export class InProcessJobQueue implements JobQueue {
  private handler: JobHandler | undefined

  constructor(private readonly onFailure: JobFailureListener = reportToStderr) {}

  onJob(handler: JobHandler): void {
    this.handler = handler
  }

  async enqueue(message: ImportJobMessage): Promise<void> {
    const handler = this.handler
    if (handler === undefined) {
      throw new Error('no job handler is registered on the in-process queue')
    }
    void this.run(handler, message)
  }

  private async run(
    handler: JobHandler,
    message: ImportJobMessage,
  ): Promise<void> {
    try {
      await handler(message)
    } catch (error) {
      this.onFailure(error, message)
    }
  }
}
