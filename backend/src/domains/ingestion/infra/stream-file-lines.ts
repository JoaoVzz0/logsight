import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

export async function* streamFileLines(path: string): AsyncGenerator<string> {
  const input = createReadStream(path, { encoding: 'utf8' })
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
