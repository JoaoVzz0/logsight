import { describe, expect, it } from 'vitest'

import { tokenizeMessage } from './tokenize'

describe('tokenizeMessage', () => {
  it('returns an ordered sequence of fixed text and typed variable spans', () => {
    const spans = tokenizeMessage(
      'User 8f3a2b1c-1111-2222-3333-444455556666 logged in',
    )

    expect(spans).toEqual([
      { type: 'text', value: 'User ' },
      {
        type: 'variable',
        kind: 'uuid',
        value: '8f3a2b1c-1111-2222-3333-444455556666',
      },
      { type: 'text', value: ' logged in' },
    ])
  })

  it('reproduces the input character for character when the spans are concatenated', () => {
    const input =
      '  User "John Doe" from 10.0.0.1\tAT 2026-09-08T00:00:00Z retried 5 times\n'

    const rebuilt = tokenizeMessage(input)
      .map((span) => span.value)
      .join('')

    expect(rebuilt).toBe(input)
  })

  it('recognizes a UUID as a single variable span', () => {
    const spans = tokenizeMessage('id 550e8400-e29b-41d4-a716-446655440000 done')

    expect(spans[1]).toEqual({
      type: 'variable',
      kind: 'uuid',
      value: '550e8400-e29b-41d4-a716-446655440000',
    })
  })

  it('recognizes an IPv4 address as a single variable span', () => {
    const spans = tokenizeMessage('request from 192.168.1.44 accepted')

    expect(spans[1]).toEqual({
      type: 'variable',
      kind: 'ipv4',
      value: '192.168.1.44',
    })
  })

  it('recognizes an IPv6 address as a single variable span', () => {
    const spans = tokenizeMessage(
      'request from 2001:0db8:85a3:0000:0000:8a2e:0370:7334 accepted',
    )

    expect(spans[1]).toEqual({
      type: 'variable',
      kind: 'ipv6',
      value: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    })
  })

  it('recognizes a standalone number as a single variable span', () => {
    const spans = tokenizeMessage('retry after 3200ms')

    expect(spans).toEqual([
      { type: 'text', value: 'retry after ' },
      { type: 'variable', kind: 'number', value: '3200' },
      { type: 'text', value: 'ms' },
    ])
  })

  it('recognizes a long hexadecimal value as a single variable span', () => {
    const spans = tokenizeMessage('object deadbeefdeadbeefdeadbeef missing')

    expect(spans[1]).toEqual({
      type: 'variable',
      kind: 'hex',
      value: 'deadbeefdeadbeefdeadbeef',
    })
  })

  it('recognizes a timestamp as one variable span rather than a sequence of number spans', () => {
    const spans = tokenizeMessage('started at 2026-09-08T12:34:56.789Z ok')

    const variables = spans.filter((span) => span.type === 'variable')
    expect(variables).toEqual([
      {
        type: 'variable',
        kind: 'timestamp',
        value: '2026-09-08T12:34:56.789Z',
      },
    ])
  })

  it('recognizes an e-mail address as a single variable span', () => {
    const spans = tokenizeMessage('notified alice.dev+ops@example.co.uk today')

    expect(spans[1]).toEqual({
      type: 'variable',
      kind: 'email',
      value: 'alice.dev+ops@example.co.uk',
    })
  })

  it('recognizes the content of a quoted value as a single variable span with the quotes left as fixed text', () => {
    const spans = tokenizeMessage('rejected "some free text 42" from queue')

    expect(spans).toEqual([
      { type: 'text', value: 'rejected "' },
      { type: 'variable', kind: 'quoted', value: 'some free text 42' },
      { type: 'text', value: '" from queue' },
    ])
  })

  it('keeps the fixed segments of a path as text and marks only the identifier as variable', () => {
    const users = tokenizeMessage('GET /api/users/8f3a-21b/profile 200')
    const orders = tokenizeMessage('GET /api/orders/8f3a-21b/profile 200')

    expect(users).toEqual([
      { type: 'text', value: 'GET /api/users/' },
      { type: 'variable', kind: 'path-id', value: '8f3a-21b' },
      { type: 'text', value: '/profile ' },
      { type: 'variable', kind: 'number', value: '200' },
    ])

    const usersText = users
      .filter((span) => span.type === 'text')
      .map((span) => span.value)
      .join('|')
    const ordersText = orders
      .filter((span) => span.type === 'text')
      .map((span) => span.value)
      .join('|')
    expect(usersText).not.toBe(ordersText)
  })

  it('lets the longer match win so a shorter pattern does not split it', () => {
    const spans = tokenizeMessage('550e8400-e29b-41d4-a716-446655440000')

    expect(spans).toEqual([
      {
        type: 'variable',
        kind: 'uuid',
        value: '550e8400-e29b-41d4-a716-446655440000',
      },
    ])
  })

  it('returns a single fixed text span for a message with no variable value', () => {
    const spans = tokenizeMessage('connection established with upstream')

    expect(spans).toEqual([
      { type: 'text', value: 'connection established with upstream' },
    ])
  })

  it('returns an empty sequence for an empty message', () => {
    expect(tokenizeMessage('')).toEqual([])
  })

  it('returns a result instead of raising for any string', () => {
    const hostile = `\u0000\uFFFF\uD800${'x'.repeat(200_000)} 2026-09-08T00:00:00Z`

    let spans: ReturnType<typeof tokenizeMessage> = []
    expect(() => {
      spans = tokenizeMessage(hostile)
    }).not.toThrow()
    expect(spans.map((span) => span.value).join('')).toBe(hostile)
  })

  it('returns the same sequence when the same input is tokenized twice', () => {
    const input =
      'User 8f3a2b1c-1111-2222-3333-444455556666 from 10.0.0.1 hit /api/users/77/profile at 2026-09-08T12:34:56Z'

    expect(tokenizeMessage(input)).toEqual(tokenizeMessage(input))
  })
})
