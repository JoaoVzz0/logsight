import { describe, expect, it } from 'vitest'

import type { ImportJobMessage } from '../../ports/job-queue'

import { InProcessJobQueue } from './in-process-job-queue'

const message: ImportJobMessage = {
  importJobId: 'job-1',
  storageKey: 'key-1',
  totalLines: 1,
  sourceType: null,
}

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve = (): void => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('InProcessJobQueue', () => {
  it('returns from enqueue before the job handler settles', async () => {
    const gate = deferred()
    let handlerFinished = false
    const queue = new InProcessJobQueue()
    queue.onJob(async () => {
      await gate.promise
      handlerFinished = true
    })

    await queue.enqueue(message)

    expect(handlerFinished).toBe(false)
    gate.resolve()
  })

  it('routes a handler rejection to the failure listener instead of leaking an unhandled rejection', async () => {
    const failures: unknown[] = []
    const queue = new InProcessJobQueue((error) => {
      failures.push(error)
    })
    queue.onJob(() => Promise.reject(new Error('handler blew up')))

    await queue.enqueue(message)
    await new Promise((resolve) => setImmediate(resolve))

    expect(failures).toHaveLength(1)
    expect((failures[0] as Error).message).toBe('handler blew up')
  })
})
