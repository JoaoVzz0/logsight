import { describe, expect, it, vi } from 'vitest'

import { tokenizeMessage } from '../../../../shared/lib/tokenizer/tokenize'
import { computeFingerprint } from './fingerprint'

vi.mock('../../../../shared/lib/tokenizer/tokenize', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../shared/lib/tokenizer/tokenize')
    >()
  return { ...actual, tokenizeMessage: vi.fn(actual.tokenizeMessage) }
})

const fingerprint = (
  body: string,
  serviceName: string | null = 'checkout',
  severityNumber: number | null = 17,
): string => computeFingerprint({ body, serviceName, severityNumber })

describe('computeFingerprint', () => {
  it('derives the signature from the first non-empty line with whitespace trimmed and runs collapsed', () => {
    expect(fingerprint('\n\n   User    logged   in   \nsecond line')).toBe(
      fingerprint('User logged in'),
    )
  })

  it('produces the same fingerprint for two messages differing only by a UUID', () => {
    expect(fingerprint('user 550e8400-e29b-41d4-a716-446655440000 signed in')).toBe(
      fingerprint('user 6ba7b810-9dad-11d1-80b4-00c04fd430c8 signed in'),
    )
  })

  it('produces the same fingerprint for two messages differing only by an IPv4 or IPv6 address', () => {
    expect(fingerprint('request from 192.168.1.10 denied')).toBe(
      fingerprint('request from 10.0.0.255 denied'),
    )
    expect(
      fingerprint('peer 2001:0db8:85a3:0000:0000:8a2e:0370:7334 closed'),
    ).toBe(fingerprint('peer fe80:0000:0000:0000:0202:b3ff:fe1e:8329 closed'))
  })

  it('produces the same fingerprint for two messages differing only by a number', () => {
    expect(fingerprint('retried 3 times')).toBe(fingerprint('retried 512 times'))
  })

  it('produces the same fingerprint for two messages differing only by a long hexadecimal value', () => {
    expect(fingerprint('object deadbeefdeadbeef missing')).toBe(
      fingerprint('object cafebabecafebabe missing'),
    )
  })

  it('produces the same fingerprint for two messages differing only by a timestamp', () => {
    expect(fingerprint('started at 2026-09-08T12:34:56.789Z ok')).toBe(
      fingerprint('started at 2020-01-01T00:00:00Z ok'),
    )
  })

  it('produces the same fingerprint for two messages differing only by an e-mail address', () => {
    expect(fingerprint('notified alice@example.com now')).toBe(
      fingerprint('notified bob.ops@test.co.uk now'),
    )
  })

  it('produces the same fingerprint for two messages differing only by the content of a quoted value', () => {
    expect(fingerprint('rejected "reason one" downstream')).toBe(
      fingerprint('rejected "a different reason" downstream'),
    )
  })

  it('produces the same fingerprint for two messages differing only by an identifier inside an otherwise identical path', () => {
    expect(fingerprint('GET /api/users/8f3a-21b/profile handled')).toBe(
      fingerprint('GET /api/users/99aa-01/profile handled'),
    )
  })

  it('produces different fingerprints for two messages whose paths differ in a fixed segment', () => {
    expect(fingerprint('GET /api/users/5/detail done')).not.toBe(
      fingerprint('GET /api/orders/5/detail done'),
    )
  })

  it('produces the same fingerprint for two bodies sharing a first line but differing afterwards', () => {
    expect(fingerprint('Connection refused\nat layer a\nfollowed by b')).toBe(
      fingerprint('Connection refused\ncompletely other\ntrailing text'),
    )
  })

  it('produces the same fingerprint for two messages differing only by runs of whitespace or by leading and trailing whitespace', () => {
    expect(fingerprint('  User   logged\tin  ')).toBe(fingerprint('User logged in'))
  })

  it('produces different fingerprints for two messages differing only by letter case', () => {
    expect(fingerprint('User Logged In')).not.toBe(fingerprint('user logged in'))
  })

  it('produces different fingerprints for two messages of identical shape from different services', () => {
    expect(fingerprint('disk pressure high', 'checkout')).not.toBe(
      fingerprint('disk pressure high', 'billing'),
    )
  })

  it('produces different fingerprints for two messages of identical shape with different severity numbers', () => {
    expect(fingerprint('disk pressure high', 'checkout', 17)).not.toBe(
      fingerprint('disk pressure high', 'checkout', 13),
    )
  })

  it('produces different fingerprints for two structurally different messages sharing a service and a severity', () => {
    expect(fingerprint('disk full', 'checkout', 17)).not.toBe(
      fingerprint('out of memory', 'checkout', 17),
    )
  })

  it('produces a fingerprint with no service name, shared by two such records of identical shape and severity', () => {
    const first = computeFingerprint({
      body: 'queue stalled',
      serviceName: null,
      severityNumber: 17,
    })
    const second = computeFingerprint({
      body: 'queue stalled',
      serviceName: null,
      severityNumber: 17,
    })

    expect(first).toMatch(/^[0-9a-f]{40}$/)
    expect(second).toBe(first)
  })

  it('produces a fingerprint with no determinable severity, shared by two such records of identical shape and service', () => {
    const first = computeFingerprint({
      body: 'queue stalled',
      serviceName: 'checkout',
      severityNumber: null,
    })
    const second = computeFingerprint({
      body: 'queue stalled',
      serviceName: 'checkout',
      severityNumber: null,
    })

    expect(first).toMatch(/^[0-9a-f]{40}$/)
    expect(second).toBe(first)
  })

  it('does not let a missing service or severity collide with a real value that stands in for one', () => {
    const missingService = computeFingerprint({
      body: 'shape',
      serviceName: null,
      severityNumber: 17,
    })
    const namedUnknown = computeFingerprint({
      body: 'shape',
      serviceName: 'unknown',
      severityNumber: 17,
    })
    expect(missingService).not.toBe(namedUnknown)

    const missingSeverity = computeFingerprint({
      body: 'shape',
      serviceName: 'checkout',
      severityNumber: null,
    })
    const lowestLevel = computeFingerprint({
      body: 'shape',
      serviceName: 'checkout',
      severityNumber: 1,
    })
    expect(missingSeverity).not.toBe(lowestLevel)
  })

  it('produces a fingerprint for an empty or whitespace-only body, shared when service and severity match', () => {
    const whitespace = computeFingerprint({
      body: '   \t  ',
      serviceName: 'checkout',
      severityNumber: 17,
    })
    const empty = computeFingerprint({
      body: '',
      serviceName: 'checkout',
      severityNumber: 17,
    })

    expect(empty).toMatch(/^[0-9a-f]{40}$/)
    expect(whitespace).toBe(empty)
  })

  it('uses the first non-empty line when the first line of the body is empty', () => {
    expect(
      computeFingerprint({
        body: '\n\nReal first line',
        serviceName: 'checkout',
        severityNumber: 17,
      }),
    ).toBe(
      computeFingerprint({
        body: 'Real first line',
        serviceName: 'checkout',
        severityNumber: 17,
      }),
    )
  })

  it('returns a fingerprint for any record that tokenizes, never an absent signature', () => {
    const bodies = ['', '   ', '\u0000\uFFFF\uD800', 'x'.repeat(100_000), '\n\n\n']

    for (const body of bodies) {
      let result = ''
      expect(() => {
        result = computeFingerprint({
          body,
          serviceName: null,
          severityNumber: null,
        })
      }).not.toThrow()
      expect(result).toMatch(/^[0-9a-f]{40}$/)
    }
  })

  it('returns the same fingerprint on every call regardless of what was tokenized before', () => {
    const input = {
      body: 'user 550e8400-e29b-41d4-a716-446655440000 hit /api/things/7 at 2026-09-08T00:00:00Z',
      serviceName: 'checkout',
      severityNumber: 17,
    }

    const before = computeFingerprint(input)
    computeFingerprint({ body: 'noise 1 2 3', serviceName: 'x', severityNumber: 5 })
    computeFingerprint({ body: 'more 4.5.6.7 noise', serviceName: null, severityNumber: null })
    const after = computeFingerprint(input)

    expect(after).toBe(before)
  })

  it('derives the signature from the shared tokenizer rather than a second set of token rules', () => {
    vi.mocked(tokenizeMessage).mockClear()

    computeFingerprint({
      body: 'User 550e8400-e29b-41d4-a716-446655440000 logged in',
      serviceName: 'checkout',
      severityNumber: 17,
    })

    expect(tokenizeMessage).toHaveBeenCalledWith(
      'User 550e8400-e29b-41d4-a716-446655440000 logged in',
    )
  })
})
