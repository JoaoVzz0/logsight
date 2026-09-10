import type { Readable, Writable } from 'node:stream'

export interface FileStorage {
  createWriteStream(key: string): Promise<Writable>

  open(key: string): Promise<Readable>
}
