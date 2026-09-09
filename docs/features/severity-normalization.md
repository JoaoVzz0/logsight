# Severity normalization

Maps the severity vocabulary of each source onto the OpenTelemetry severity
scale, so that filtering by "errors" and comparing severity across sources
behaves the same regardless of where a record came from. The source's own
label is kept untouched alongside the normalized number.

## Governed by

- ADR 0002 — Canonical log model: severity is normalized to the OpenTelemetry
  scale (`severity_number`, 1–24) and the original label is preserved verbatim
  in `severity_text`; each adapter owns the mapping for its source.
- ADR 0005 — Event grouping: an absent or undeterminable severity is not
  coerced to the lowest level; it stays undeterminable and is represented as
  such.
- ADR 0004 — Adapters per source: a value the mapping does not recognize is
  handled, never thrown, and the import continues.
- ADR 0001 — Stack: the severity level set has a single typed definition
  (`packages/domain-constants`).

## Done when

### Output contract

- [x] A recognized severity produces a `severity_number` that is one of the
      six OpenTelemetry band base values — 1, 5, 9, 13, 17, 21 — and never any
      other integer.
- [x] `severity_text` holds the source's original severity token exactly as it
      appeared, with its spelling and letter case unchanged.
- [x] A record whose source carries no severity field produces
      `severity_number` null and `severity_text` null.
- [x] A severity value the mapping does not recognize produces
      `severity_number` null while `severity_text` keeps the unrecognized value
      verbatim; no error is raised and no `ParseError` is recorded for it.
- [x] Normalizing a numeric severity level takes the scale convention (for
      example `syslog` or `pino`) as an explicit input supplied by the adapter;
      the normalizer does not infer the scale from the value itself.
- [x] Normalizing any input returns a result rather than raising, including
      empty, non-string, and out-of-range values.

### GCP Cloud Logging

- [x] A `LogEntry` severity of `DEBUG`, `INFO`, `NOTICE`, `WARNING`, `ERROR`,
      `CRITICAL`, `ALERT`, or `EMERGENCY` produces, respectively,
      `severity_number` 5, 9, 9, 13, 17, 21, 21, 21.
- [x] A `LogEntry` with severity `DEFAULT` produces `severity_number` null,
      with `severity_text` still `DEFAULT`.
- [x] A `LogEntry` with no `severity` field produces `severity_number` null
      and `severity_text` null.

### nginx

- [x] An `access` record produces `severity_number` 9 and an `error` record
      produces `severity_number` 17, each with `severity_text` carrying the
      channel token verbatim.

### CloudWatch

- [x] A CloudWatch event that carries no explicit severity field produces
      `severity_number` null and `severity_text` null.
- [x] A CloudWatch event that carries an explicit textual severity is mapped
      by the same name rules as json-lines; a numeric severity is mapped only
      under the scale convention the adapter declares, exactly as for
      json-lines.

### json-lines

- [x] A level name — `trace`, `debug`, `verbose`, `info`, `informational`,
      `notice`, `warn`, `warning`, `error`, `err`, `fatal`, `critical`,
      `crit`, `alert`, `emerg`, `emergency`, `panic` — maps to `severity_number`
      1, 5, 5, 9, 9, 9, 13, 13, 17, 17, 21, 21, 21, 21, 21, 21, 21
      respectively.
- [x] A level name is recognized regardless of letter case, so `ERROR`,
      `Error`, and `error` all produce `severity_number` 17.
- [x] Surrounding whitespace around a level name is ignored.
- [x] With the `syslog` convention declared by the adapter, an integer level
      0–7 maps per RFC 5424: 0, 1, 2 produce 21; 3 produces 17; 4 produces 13;
      5, 6 produce 9; 7 produces 5.
- [x] With the `pino` convention declared by the adapter, an integer level of
      10, 20, 30, 40, 50, or 60 produces `severity_number` 1, 5, 9, 13, 17, 21
      respectively.
- [x] An integer level outside the valid range of the declared convention is
      unrecognized: `severity_number` null, `severity_text` the value verbatim.
- [x] A numeric level with no convention declared is unrecognized, not
      guessed: `severity_number` null, `severity_text` the value verbatim.
- [x] A record with no level or severity key produces `severity_number` null
      and `severity_text` null.

### Determinism

- [x] The same source value produces the same `severity_number` and
      `severity_text` on every run, independent of process or ordering.

## Out of scope

- syslog as a source: no syslog adapter exists yet
  (`.claude/rules/architecture.md` lists GCP, CloudWatch, json-lines, nginx).
  The PRI→OpenTelemetry mapping ships with the syslog adapter if that adapter is ever built; the numeric 0–7 rule above applies only when a json-lines adapter declares the syslog convention for its level field, and never to a syslog PRI header on its own. ADR 0004
  now carries a "Próxima fonte" note recording syslog as the natural next
  adapter and the PRI→OTel mapping as the only normalization it adds.
- CloudWatch severity inference from message text. ADR 0002 allows a heuristic
  over the message or payload; it is deliberately not taken here. Without an
  explicit severity field a CloudWatch record is undeterminable, and the
  import-time override is the correction path.
- Within-band gradations. Only the six base numbers are emitted; distinctions
  such as GCP `NOTICE` vs `INFO` or `ALERT` vs `CRITICAL` are not preserved in
  `severity_number`. They remain visible in `severity_text`.
- Numeric forms of GCP severity (0–800). GCP exports in scope use the string
  enum; a numeric GCP severity falls under the unrecognized-value rule.
- The import-time severity override (ADR 0002). It belongs to the import flow,
  not the normalizer.
- The fingerprint sentinel for a null severity (ADR 0005), specified in
  `message-fingerprint.md`.
- Reprocessing already-stored records from `raw` when the mapping changes
  (ADR 0002).
- Persisting or indexing `severity_number` (ADR 0003) and any query or
  dashboard surface that reads it.

## Notes

The scale itself — `TRACE` 1, `DEBUG` 5, `INFO` 9, `WARN` 13, `ERROR` 17,
`FATAL` 21 — already has one typed home in `packages/domain-constants`. This
feature consumes that definition; it does not add a second.

A numeric level carries no self-evident scale: `5` is `DEBUG` on the syslog
scale but below the lowest pino level, and `30` is `INFO` for pino but outside
syslog entirely. The adapter for the source declares which convention applies,
and that declaration — not a guess from the value's range — is what keeps an
integer that could belong to more than one scale from being classified wrong.
Textual level names are unambiguous and stay recognized by the shared
normalizer without any declaration.

Keeping `severity_text` verbatim is what lets an operator see that a record
mapped to `FATAL` was originally a GCP `ALERT`, and is what makes a corrected
mapping possible later from `raw`.
