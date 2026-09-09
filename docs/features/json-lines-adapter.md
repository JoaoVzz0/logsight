# Generic JSON Lines adapter

Translates a file of arbitrary one-object-per-line JSON into canonical
`LogRecord`s by mapping common field names heuristically. It is the fallback
source adapter: it claims a line only when no format-specific adapter does,
and it never assumes a schema.

## Governed by

- ADR 0004 — Adapters per source: the single adapter contract
  (`sourceType`, `detect(sample: string[]) => number`,
  `parse(line: string) => ParseResult`); a line that cannot yield a valid
  record is a counted `ParseError` carrying the original content, never a
  thrown exception, and the import continues; `detect` is a confidence
  heuristic, not authority — the user can override it.
- `domains/ingestion/ports/log-source-adapter.ts` — the `LogSourceAdapter`
  port, already created and merged to `main` (commit `5eb49c8`). It defines
  `ParseResult = LogRecord | ParseError`, `ParseError`
  (`{ kind: 'parse-error'; line: string; code: ParseErrorCode }`), and the
  closed union `ParseErrorCode = 'empty-line' | 'malformed-syntax' |
  'unrecognized-shape' | 'missing-timestamp'`. This feature consumes that
  port unchanged; it does not define `ParseError` or add a code.
- ADR 0002 — Canonical log model: output is a `LogRecord` on the OpenTelemetry
  scale; `raw` holds the original line verbatim with no reserialization;
  severity is normalized with the original label kept in `severityText`;
  `sourceType` is the adapter id.
- ADR 0005 — Event grouping by fingerprint: the record's `fingerprint` is
  computed at ingestion from `body` + `serviceName` + `severityNumber`; a
  missing service or an undeterminable severity contributes a stable
  sentinel and is never coerced to the lowest band.
- ADR 0008 — Modular monolith with hexagonal core: the `LogSourceAdapter`
  port lives in `domains/ingestion/ports/`, the implementation in
  `domains/ingestion/infra/adapters/`; `core/` and `application/` never
  import the implementation.
- ADR 0006 — Asynchronous ingestion: `parse` is called per line on a stream;
  it holds no file-level or cross-line state.
- ADR 0009 — Prisma access layer: persistence of the produced record is
  infra and out of this feature.

Rules consulted: `.claude/rules/architecture.md` (dependency direction,
port placement, the ports table), `.claude/rules/testing.md` (fixture-driven
adapter tests, the adapter-fixture high-value test), `.claude/rules/code-style.md`
(typed errors with a stable `code`, no barrel files).

## Done when

### Adapter contract

- [x] The adapter implements the existing `LogSourceAdapter` port from
      `domains/ingestion/ports/log-source-adapter.ts` without modifying that
      file or the `ParseError` / `ParseErrorCode` types it exports.
- [x] The JSON Lines implementation lives in
      `domains/ingestion/infra/adapters/` and its `sourceType` is
      `json-lines`.
- [x] Every `LogRecord` the adapter returns has `sourceType` equal to
      `json-lines`.
- [x] `parse` returns a `ParseResult` — a `LogRecord` or a `ParseError` —
      for every possible string input and never throws, including an empty
      string, a non-JSON string, a JSON scalar, a deeply nested object, and a
      multi-megabyte line.
- [x] No file under `domains/ingestion/core/` or
      `domains/ingestion/application/` imports the adapter implementation;
      `pnpm check` fails on violation.
- [x] The adapter produces its record through the shared `assembleLogRecord`
      and its severity through the shared `normalizeSeverity`; it contains no
      second implementation of fingerprint, `observedAt`, or severity
      mapping.
- [x] `observedAt` on a produced record comes from an injected clock, not
      from a source field and not from an inline wall-clock read.

### Detection

- [x] `detect` returns `0` for an empty sample array and for a sample whose
      lines are all blank.
- [x] `detect` returns a value greater than `0` when a majority of the
      non-blank sample lines parse to a JSON object — a single corrupt line
      in an otherwise-valid sample does not drop the confidence to `0`.
- [x] `detect` returns `0` when a majority of the non-blank sample lines are
      not JSON objects (invalid JSON, or a JSON array, string, number,
      boolean, or `null`).
- [x] `detect` never returns a value greater than `0.5` for any input; the
      fallback is low-confidence by design and does not outrank a
      format-specific adapter's positive match.

### Body mapping

- [x] Candidate keys for `body`, in precedence order, are `message`, `msg`,
      `body`; a line with `message` present and non-empty produces a record
      whose `body` is that string, regardless of which other candidates are
      present.
- [x] When the highest-precedence body key present is `null`, not a string,
      or an empty or whitespace-only string, the next candidate in precedence
      order is used; the field is only unusable when every candidate is.
- [x] A line that is a valid JSON object with a usable timestamp but no
      usable body candidate produces a record whose `body` is the empty
      string, with a computed `fingerprint`.

### Timestamp mapping

- [x] Candidate keys for the event time, in precedence order, are
      `timestamp`, `@timestamp`, `time`, `ts`; the first candidate that
      yields a valid instant is used, falling through on any candidate that
      does not. `timestamp` leads deliberately — it is the most common key
      and the one the GCP and CloudWatch adapters use, so a line carrying
      both `timestamp` and `time` resolves the conventional way.
- [x] An ISO 8601 string is accepted; a string without an explicit UTC
      offset is interpreted as UTC.
- [x] A number or numeric string whose absolute value is below `1e11` is
      read as epoch **seconds**; at or above `1e11` it is read as epoch
      **milliseconds**.
- [x] A timestamp value that resolves to an instant outside
      `1970-01-01T00:00:00Z` … `9999-12-31T23:59:59Z` inclusive is not
      accepted (epoch `0` is accepted; a negative epoch is not).
- [x] A line with no timestamp candidate key, or where every candidate is
      present but unparseable / out of range, produces a `ParseError` with
      `code` `missing-timestamp` carrying the original line verbatim — never
      a record and never a thrown exception.

### Severity mapping

- [x] Candidate keys for severity, in precedence order, are `level`,
      `severity`, `lvl`; the raw value of the first present candidate is
      passed to the shared normalizer.
- [x] A textual level the shared normalizer recognizes produces its
      OpenTelemetry band base in `severityNumber` and the original token,
      unchanged, in `severityText`.
- [x] A numeric or numeric-string level produces `severityNumber` `null` and
      `severityText` the value verbatim: this adapter declares no numeric
      convention and never guesses a scale.
- [x] A line with no severity candidate key produces `severityNumber` `null`
      and `severityText` `null`.

### Resource and correlation mapping

- [x] `serviceName` is taken from `service`, then `service_name`, then
      `logger`; a line carrying `service` and `logger` both produces a record
      whose `serviceName` is the `service` value.
- [x] `host` is taken from `host` then `hostname`, `environment` from `env`
      then `environment`, `traceId` from `trace_id` then `traceId`, `spanId`
      from `span_id` then `spanId`, each by that precedence; each field is
      `null` when none of its candidates is present.

### Attributes and raw

- [x] Only the single key whose value was promoted to a typed field is
      removed from `attributes`; a lower-precedence alias that lost the
      mapping and holds a different value remains in `attributes`.
- [x] Every source key not promoted to a typed field appears in
      `attributes` with its value unchanged, including nested objects and
      arrays.
- [x] `attributes` is an empty object when every source key was promoted to
      a typed field.
- [x] `raw` on a produced record is exactly the string passed to `parse`,
      character for character, including original key order and internal
      whitespace; it is never the parsed object re-serialized.

### Malformed input

- [x] A line that is not valid JSON produces a `ParseError` with `code`
      `malformed-syntax` carrying the line verbatim.
- [x] A line that is valid JSON but not an object (array, string, number,
      boolean, `null`) produces a `ParseError` with `code`
      `unrecognized-shape` carrying the line verbatim.
- [x] A blank or whitespace-only line produces a `ParseError` with `code`
      `empty-line`, never a record.
- [x] Every `ParseError` the adapter returns carries `line` equal to the
      exact string passed to `parse` and a `code` drawn from the port's
      existing `ParseErrorCode` union; the adapter introduces no new code.

### Fixture

- [x] A committed fixture `domains/ingestion/infra/adapters/__fixtures__/json-lines.jsonl`
      holds real-shape sample lines with any credential or address redacted,
      covering at least: a `{ level, time, msg, service }` line, a
      `{ "@timestamp", severity, message }` line, a bare
      `{ message, timestamp }` line, a line carrying an unmapped nested
      object, an epoch-millis timestamp, a malformed line, and a line with no
      timestamp.
- [x] A fixture-driven test asserts the full mapped `LogRecord` for each
      valid sample line and a `ParseError` for the malformed and
      timestamp-less lines, including severity normalization.

## Out of scope

- Any change to `domains/ingestion/ports/log-source-adapter.ts` — the port,
  `ParseError`, `ParseResult` and the `ParseErrorCode` union are fixed
  upstream (`5eb49c8`) and consumed as-is.
- The cross-adapter detection registry and how the winning adapter is chosen
  among all adapters' `detect` scores (ADR 0004) — this feature specifies
  only this adapter's own `detect`.
- The import-time format override and any change to the import request
  surface (ADR 0004).
- Any numeric-severity convention for this adapter, and an import option to
  declare one — deliberately excluded; a source with a known numeric scale
  is a candidate for its own dedicated adapter later.
- Line-number assignment, parse-error counting, and the failed/succeeded
  tallies in the job result (ADR 0004 / 0006) — the ingestion pipeline's
  responsibility; `parse` sees one line and does not know its position.
- Streaming, the ~5k-record batches, and bulk insertion (ADR 0006).
- The row↔record mapper and persistence of the produced record
  (ADR 0009 / ADR 0003).
- The severity mapping tables themselves (`severity-normalization.md`) and
  the tokenizer / fingerprint internals (`message-fingerprint.md`,
  `message-tokenizer.md`, ADR 0005) — consumed here, not defined here.
- Dedicated adapters for specific JSON logger shapes (pino, bunyan, winston),
  which could declare their own numeric severity scale.
- The GCP, CloudWatch, and nginx adapters.
- A pretty-printed JSON object spanning multiple physical lines — input is
  one complete object per line.

## Notes

The precedence lists are the adapter's only real design surface and are
stated above so each collision maps to one test. Listed order is precedence
order; a candidate is skipped when its value is absent, `null`, the wrong
type, or (for `body`) empty after trimming.

The `1e11` epoch cutoff cleanly separates the eras in scope: a recent-date
value in seconds (~`1e9`) reads as seconds, the same date in milliseconds
(~`1e12`) reads as milliseconds, and neither era collides with the other.
The calendar-range check is what turns an absurd number (a millisecond value
mistakenly halved, a nanosecond value) into a `ParseError` rather than a
record stamped with year 50,000.

`ParseError`, `ParseResult` and the closed `ParseErrorCode` union already
exist in `domains/ingestion/ports/log-source-adapter.ts` (merged to `main`
in `5eb49c8`). This adapter consumes them: `parse` returns a `ParseResult`,
never throws (`.claude/rules/code-style.md`), and the four codes map
one-to-one — `malformed-syntax`, `unrecognized-shape`, `empty-line`,
`missing-timestamp`. The pipeline decides what to do with a `ParseError` —
count it, attach a line number, continue (ADR 0004); whether it excludes
`empty-line` from the error tally is its decision, not the adapter's. The
`feat/adapter-jsonlines` branch predates `5eb49c8` and must be rebased onto
it before implementation so the port is present.

`detect` staying at or below `0.5` encodes "fallback": a format-specific
adapter that recognizes its own payload reports higher, so the registry
picks it; this adapter wins a line only when nothing else claims it. It also
tolerates a corrupt line or two — a real JSON Lines export often has one —
and only backs off when most of the sample is not JSON objects.
