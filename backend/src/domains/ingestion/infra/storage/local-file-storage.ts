import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Readable, Writable } from 'node:stream'

import type { FileStorage } from '../../ports/file-storage'

export class LocalFileStorage implements FileStorage {
  private readonly baseDir: string

  constructor(baseDir: string) {
    this.baseDir = resolve(baseDir)
  }

  async createWriteStream(key: string): Promise<Writable> {
    const path = this.resolveKey(key)
    await mkdir(dirname(path), { recursive: true })
    return createWriteStream(path)
  }

  async open(key: string): Promise<Readable> {
    return createReadStream(this.resolveKey(key))
  }

  private resolveKey(key: string): string {
    const path = resolve(this.baseDir, key)
    if (path !== this.baseDir && !path.startsWith(this.baseDir + sep)) {
      throw new Error(`storage key escapes the base directory: ${key}`)
    }
    return path
  }
}
