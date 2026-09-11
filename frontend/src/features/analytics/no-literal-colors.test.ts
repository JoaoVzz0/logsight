import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const componentsDir = fileURLToPath(new URL('./components', import.meta.url))

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\([^)]*\d/

function componentSources(): { name: string; source: string }[] {
  let names: string[] = []
  try {
    names = readdirSync(componentsDir).filter((name) => name.endsWith('.tsx'))
  } catch {
    return []
  }
  return names.map((name) => ({
    name,
    source: readFileSync(`${componentsDir}/${name}`, 'utf8'),
  }))
}

describe('dashboard components', () => {
  it('carry no literal colour value — every colour comes from a CSS variable', () => {
    const sources = componentSources()
    expect(sources.length).toBeGreaterThan(0)

    const offenders = sources
      .filter(({ source }) =>
        COLOUR_LITERAL.test(source.replace(/hsl\(var\(--[^)]+\)[^)]*\)/g, '')),
      )
      .map(({ name }) => name)

    expect(offenders).toEqual([])
  })
})
