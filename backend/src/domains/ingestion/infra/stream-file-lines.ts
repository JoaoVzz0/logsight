import { createReadStream } from 'node:fs'

import { streamLines } from '../../../shared/lib/stream-lines'

export function streamFileLines(path: string): AsyncGenerator<string> {
  return streamLines(createReadStream(path, { encoding: 'utf8' }))
}
