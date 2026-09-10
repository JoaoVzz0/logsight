import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const source = (): string =>
  readFileSync(new URL('./issue-repository.ts', import.meta.url), 'utf8')

describe('IssueRepository port', () => {
  it('declares batch upsert-by-fingerprint and lookup by fingerprint in domain terms, importing no driver', () => {
    const text = source()

    expect(text).toMatch(/upsertBatch\s*\(\s*occurrences:\s*readonly Occurrence\[\]/)
    expect(text).toMatch(/findByFingerprint\s*\(\s*fingerprint:\s*string\s*\)/)

    const specifiers = [
      ...text.matchAll(/^\s*import[^'"]+['"]([^'"]+)['"]/gm),
    ].map((match) => match[1])

    for (const specifier of specifiers) {
      expect(specifier).not.toMatch(
        /(^|\/)(infra|http|platform)(\/|$)|^(fastify|bullmq|ioredis|@prisma\/client)$/,
      )
    }
  })
})
