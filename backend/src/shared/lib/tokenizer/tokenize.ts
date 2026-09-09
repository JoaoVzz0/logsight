export type VariableKind =
  | 'uuid'
  | 'ipv4'
  | 'ipv6'
  | 'number'
  | 'hex'
  | 'timestamp'
  | 'email'
  | 'quoted'
  | 'path-id'

export type Span =
  | { readonly type: 'text'; readonly value: string }
  | {
      readonly type: 'variable'
      readonly kind: VariableKind
      readonly value: string
    }

type Matcher = { readonly kind: VariableKind; readonly pattern: RegExp }

const IDENTIFIER_CHAR = /[A-Za-z0-9_]/

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const LONG_HEX = '[0-9a-fA-F]{12,}'

const SCALAR_MATCHERS: readonly Matcher[] = [
  {
    kind: 'timestamp',
    pattern:
      /\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?|\d{2}:\d{2}:\d{2}(\.\d+)?/y,
  },
  { kind: 'uuid', pattern: new RegExp(UUID, 'y') },
  { kind: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/y },
  {
    kind: 'ipv6',
    pattern:
      /([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:)+:([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}|::([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}/y,
  },
  { kind: 'ipv4', pattern: /\d{1,3}(\.\d{1,3}){3}/y },
  { kind: 'hex', pattern: new RegExp(`(0x)?${LONG_HEX}`, 'y') },
  { kind: 'number', pattern: /\d+(\.\d+)?/y },
]

const PATH = /\/[A-Za-z0-9._~%-]+(\/[A-Za-z0-9._~%-]*)*/y

/**
 * Splits a log message into an ordered sequence of fixed text spans and typed
 * variable spans, so that structurally identical messages share a structure
 * while the concrete values stay recoverable. Concatenating every span value
 * reproduces the input exactly.
 *
 * Matching is left to right. Quoted and path spans are resolved first because
 * they emit surrounding fixed text; the scalar matchers are then tried in
 * longest-pattern-first order (timestamp before its component numbers, uuid
 * before the hex or number it contains) so a shorter pattern never splits a
 * region a longer one owns.
 */
export function tokenizeMessage(message: string): Span[] {
  const spans: Span[] = []
  let pendingText = ''
  let cursor = 0

  const flushText = (): void => {
    if (pendingText.length > 0) {
      spans.push({ type: 'text', value: pendingText })
      pendingText = ''
    }
  }

  while (cursor < message.length) {
    const quoted = matchQuoted(message, cursor)
    if (quoted) {
      pendingText += quoted.quote
      flushText()
      spans.push({ type: 'variable', kind: 'quoted', value: quoted.content })
      pendingText += quoted.quote
      cursor = quoted.end
      continue
    }

    const path = matchPath(message, cursor)
    if (path) {
      for (const part of path.spans) {
        if (part.type === 'text') {
          pendingText += part.value
          continue
        }
        flushText()
        spans.push(part)
      }
      cursor = path.end
      continue
    }

    const scalar = matchScalar(message, cursor)
    if (scalar) {
      flushText()
      spans.push({ type: 'variable', kind: scalar.kind, value: scalar.value })
      cursor = scalar.end
      continue
    }

    pendingText += message.charAt(cursor)
    cursor += 1
  }

  flushText()
  return spans
}

function matchScalar(
  message: string,
  start: number,
): { kind: VariableKind; value: string; end: number } | null {
  if (start > 0 && IDENTIFIER_CHAR.test(message.charAt(start - 1))) {
    return null
  }

  for (const { kind, pattern } of SCALAR_MATCHERS) {
    pattern.lastIndex = start
    const found = pattern.exec(message)
    if (!found) {
      continue
    }

    const value = found[0]
    const end = start + value.length
    if (kind !== 'number' && IDENTIFIER_CHAR.test(message.charAt(end))) {
      continue
    }

    return { kind, value, end }
  }

  return null
}

function matchQuoted(
  message: string,
  start: number,
): { quote: string; content: string; end: number } | null {
  const quote = message.charAt(start)
  if (quote !== '"' && quote !== "'") {
    return null
  }

  const close = message.indexOf(quote, start + 1)
  if (close <= start + 1) {
    return null
  }

  return { quote, content: message.slice(start + 1, close), end: close + 1 }
}

function matchPath(
  message: string,
  start: number,
): { spans: Span[]; end: number } | null {
  PATH.lastIndex = start
  const found = PATH.exec(message)
  if (!found || !found[0].includes('/', 1)) {
    return null
  }

  const [, ...segments] = found[0].split('/')
  const spans: Span[] = []
  let fixed = ''

  for (const segment of segments) {
    if (isPathIdentifier(segment)) {
      spans.push({ type: 'text', value: `${fixed}/` })
      fixed = ''
      spans.push({ type: 'variable', kind: 'path-id', value: segment })
      continue
    }
    fixed += `/${segment}`
  }

  if (spans.length === 0) {
    return null
  }

  if (fixed.length > 0) {
    spans.push({ type: 'text', value: fixed })
  }

  return { spans, end: start + found[0].length }
}

function isPathIdentifier(segment: string): boolean {
  if (segment.length === 0) {
    return false
  }
  if (/^\d+$/.test(segment) || new RegExp(`^${UUID}$`).test(segment)) {
    return true
  }
  if (new RegExp(`^${LONG_HEX}$`).test(segment)) {
    return true
  }
  return segment.includes('-') && /\d/.test(segment)
}
