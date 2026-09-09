import { describe, expect, it } from 'vitest'

import { normalizeSeverity, type NormalizedSeverity } from './severity'

describe('normalizeSeverity', () => {
  describe('output contract', () => {
    it('maps every recognized severity to one of the six OpenTelemetry band base values', () => {
      const baseValues = [1, 5, 9, 13, 17, 21]
      const recognized = [
        normalizeSeverity('trace'),
        normalizeSeverity('info'),
        normalizeSeverity('WARNING'),
        normalizeSeverity('error'),
        normalizeSeverity('emergency'),
        normalizeSeverity(3, 'syslog'),
        normalizeSeverity(30, 'pino'),
      ]

      for (const result of recognized) {
        expect(baseValues).toContain(result.severityNumber)
      }
    })

    it('keeps severity_text as the source token with spelling and letter case unchanged', () => {
      expect(normalizeSeverity('WaRnInG').severityText).toBe('WaRnInG')
      expect(normalizeSeverity('Weird-Level').severityText).toBe('Weird-Level')
    })

    it('yields null severity_number and null severity_text when no severity value is present', () => {
      expect(normalizeSeverity(null)).toEqual({
        severityNumber: null,
        severityText: null,
      })
      expect(normalizeSeverity(undefined)).toEqual({
        severityNumber: null,
        severityText: null,
      })
    })

    it('yields null severity_number but keeps an unrecognized value verbatim, without raising', () => {
      let result: NormalizedSeverity | undefined

      expect(() => {
        result = normalizeSeverity('banana')
      }).not.toThrow()

      expect(result).toEqual({ severityNumber: null, severityText: 'banana' })
    })

    it('maps a numeric level only under the convention the caller supplies, never inferring it from the value', () => {
      expect(normalizeSeverity(5, 'syslog').severityNumber).toBe(9)
      expect(normalizeSeverity(5, 'pino').severityNumber).toBeNull()
      expect(normalizeSeverity(5).severityNumber).toBeNull()
    })

    it('returns a result for empty, non-string, and out-of-range input rather than raising', () => {
      const inputs: unknown[] = [
        '',
        '   ',
        {},
        [],
        true,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        -1,
        999,
        3.5,
      ]

      for (const input of inputs) {
        let result: NormalizedSeverity | undefined

        expect(() => {
          result = normalizeSeverity(input)
        }).not.toThrow()

        expect(result).toHaveProperty('severityNumber')
        expect(result).toHaveProperty('severityText')
        expect(result?.severityNumber).toBeNull()
      }
    })
  })

  describe('GCP Cloud Logging', () => {
    it('maps the GCP LogEntry severity enum to the expected band numbers', () => {
      const cases: ReadonlyArray<readonly [string, number]> = [
        ['DEBUG', 5],
        ['INFO', 9],
        ['NOTICE', 9],
        ['WARNING', 13],
        ['ERROR', 17],
        ['CRITICAL', 21],
        ['ALERT', 21],
        ['EMERGENCY', 21],
      ]

      for (const [token, expected] of cases) {
        expect(normalizeSeverity(token).severityNumber).toBe(expected)
      }
    })

    it('treats GCP DEFAULT as undeterminable while keeping severity_text DEFAULT', () => {
      expect(normalizeSeverity('DEFAULT')).toEqual({
        severityNumber: null,
        severityText: 'DEFAULT',
      })
    })

    it('yields null and null for a GCP entry with no severity field', () => {
      expect(normalizeSeverity(undefined)).toEqual({
        severityNumber: null,
        severityText: null,
      })
    })
  })

  describe('nginx', () => {
    it('maps the access and error channels to 9 and 17 with the channel token kept verbatim', () => {
      expect(normalizeSeverity('access')).toEqual({
        severityNumber: 9,
        severityText: 'access',
      })
      expect(normalizeSeverity('error')).toEqual({
        severityNumber: 17,
        severityText: 'error',
      })
    })
  })

  describe('CloudWatch', () => {
    it('yields null and null for a CloudWatch event with no explicit severity field', () => {
      expect(normalizeSeverity(undefined)).toEqual({
        severityNumber: null,
        severityText: null,
      })
    })

    it('maps a CloudWatch textual severity by the json-lines name rules and a numeric one only under a declared convention', () => {
      expect(normalizeSeverity('warn')).toEqual({
        severityNumber: 13,
        severityText: 'warn',
      })
      expect(normalizeSeverity(30).severityNumber).toBeNull()
      expect(normalizeSeverity(30, 'pino').severityNumber).toBe(9)
    })
  })

  describe('json-lines', () => {
    it('maps each level name to its band number', () => {
      const cases: ReadonlyArray<readonly [string, number]> = [
        ['trace', 1],
        ['debug', 5],
        ['verbose', 5],
        ['info', 9],
        ['informational', 9],
        ['notice', 9],
        ['warn', 13],
        ['warning', 13],
        ['error', 17],
        ['err', 17],
        ['fatal', 21],
        ['critical', 21],
        ['crit', 21],
        ['alert', 21],
        ['emerg', 21],
        ['emergency', 21],
        ['panic', 21],
      ]

      for (const [token, expected] of cases) {
        expect(normalizeSeverity(token).severityNumber).toBe(expected)
      }
    })

    it('recognizes a level name regardless of letter case', () => {
      for (const token of ['ERROR', 'Error', 'error']) {
        expect(normalizeSeverity(token).severityNumber).toBe(17)
      }
    })

    it('ignores whitespace surrounding a level name', () => {
      expect(normalizeSeverity('  error\t').severityNumber).toBe(17)
    })

    it('maps an integer 0-7 under the syslog convention per RFC 5424', () => {
      const cases: ReadonlyArray<readonly [number, number]> = [
        [0, 21],
        [1, 21],
        [2, 21],
        [3, 17],
        [4, 13],
        [5, 9],
        [6, 9],
        [7, 5],
      ]

      for (const [level, expected] of cases) {
        expect(normalizeSeverity(level, 'syslog').severityNumber).toBe(expected)
      }
    })

    it('maps an integer 10-60 under the pino convention', () => {
      const cases: ReadonlyArray<readonly [number, number]> = [
        [10, 1],
        [20, 5],
        [30, 9],
        [40, 13],
        [50, 17],
        [60, 21],
      ]

      for (const [level, expected] of cases) {
        expect(normalizeSeverity(level, 'pino').severityNumber).toBe(expected)
      }
    })

    it('treats an integer outside the declared convention range as unrecognized, keeping it verbatim', () => {
      expect(normalizeSeverity(8, 'syslog')).toEqual({
        severityNumber: null,
        severityText: '8',
      })
      expect(normalizeSeverity(70, 'pino')).toEqual({
        severityNumber: null,
        severityText: '70',
      })
    })

    it('does not guess a numeric level when no convention is declared', () => {
      expect(normalizeSeverity(30)).toEqual({
        severityNumber: null,
        severityText: '30',
      })
    })

    it('yields null and null for a record with no level or severity key', () => {
      expect(normalizeSeverity(undefined)).toEqual({
        severityNumber: null,
        severityText: null,
      })
    })
  })

  describe('determinism', () => {
    it('produces the same result for the same value on every call regardless of ordering', () => {
      const first = normalizeSeverity('WARNING')
      normalizeSeverity(3, 'syslog')
      normalizeSeverity('nonsense')
      normalizeSeverity(50, 'pino')
      const second = normalizeSeverity('WARNING')

      expect(second).toEqual(first)
      expect(normalizeSeverity(4, 'syslog')).toEqual(
        normalizeSeverity(4, 'syslog'),
      )
    })
  })
})
