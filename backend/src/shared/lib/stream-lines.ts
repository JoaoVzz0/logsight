import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'

export async function* streamLines(input: Readable): AsyncGenerator<string> {
  const reader = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY })

  try {
    for await (const line of reader) {
      yield line
    }
  } finally {
    reader.close()
    input.destroy()
  }
}
