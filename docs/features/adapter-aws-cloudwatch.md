# AWS CloudWatch Logs adapter

Translates a CloudWatch Logs export into canonical `LogRecord`s. Implements
the `LogSourceAdapter` port (`detect` + `parse`), so an import of a CloudWatch
file produces the same normalized records every other source produces, with
`source_type` `aws-cloudwatch`.

## Governed by

- ADR 0004 — Adapters per source: single adapter contract; `parse` returns
  `LogRecord | ParseError` and never throws; an invalid line becomes a
  counted `ParseError` carrying the original content and the import continues;
  the pipeline knows no format. `detect` returns a 0–1 confidence.
- ADR 0002 — Canonical log model: fields map to the OpenTelemetry-based
  `LogRecord`; `raw` is kept verbatim; each adapter owns its severity mapping;
  `source_type` is the adapter id.
- ADR 0005 — Event grouping: an undeterminable severity is not coerced to the
  lowest level; it stays null and the fingerprint sentinel is applied
  downstream, not by the adapter.
- ADR 0006 — Asynchronous ingestion: the worker streams the file and the
  adapter normalizes one event at a time; the importer explodes a CloudWatch
  export's `logEvents[]` into per-event lines before calling `parse`.
- ADR 0008 — Modular monolith with hexagonal core: the adapter lives in
  `domains/ingestion/infra/adapters/`, implements a port, and never imports
  from `http/` or another domain's `core/`.

Consumed, not re-specified here: [canonical-log-record.md](canonical-log-record.md)
(assembly, `observedAt`, fingerprint, optional-field defaulting, module
boundary) and [severity-normalization.md](severity-normalization.md) (the
OpenTelemetry mapping, the name rules, the numeric-convention contract).

## Done when

### Input unit

- [x] `parse` accepts one per-event line — a JSON object carrying `logGroup`,
      `logStream`, `timestamp`, `message`, and optionally `id` — and returns a
      single `LogRecord` or a single `ParseError`.
- [x] `parse` returns a result and never throws for any input string,
      including empty, non-JSON, a JSON array, a JSON scalar, and truncated
      JSON.

### `body` and `raw`

- [x] A line whose `message` is a plain string produces a record whose `body`
      is that string unchanged.
- [x] A line whose `message` is a JSON object produces a record whose `body`
      is that object serialized in a canonical, deterministic form; `body`
      does not promise the original key order — `raw` is where verbatim
      fidelity lives.
- [x] The canonical serialization is stable across runs: the same `message`
      object produces the same `body` every time.
- [x] A line with no `message` key, or an empty-string `message`, produces a
      record whose `body` is an empty string (not a `ParseError`).
- [x] `raw` on the produced record is the exact line string passed to `parse`,
      character for character.

### `timestamp`

- [x] A line with an integer `timestamp` greater than 0 produces a record
      whose event time is that value read as epoch milliseconds.
- [x] A line whose `timestamp` is absent produces a `ParseError`, not a
      record.
- [x] A line whose `timestamp` is not a number, is not an integer, or is
      less than or equal to 0 produces a `ParseError`, not a record.

### `service_name` and resource fields

- [x] A line whose `logGroup` matches `/aws/<service>/<name>` produces a
      record whose `service_name` is the `<name>` segment (the part after
      `/aws/<service>/`).
- [x] A line whose `logGroup` does not match that pattern produces a record
      whose `service_name` is null; no other segment is guessed.
- [x] `host` on every produced record is null; `logStream` is never mapped to
      `host`.
- [x] `environment`, `trace_id` and `span_id` are null on every produced
      record.

### `attributes`

- [x] The produced record's `attributes` carries `logGroup`, `logStream`, and
      `id` when `id` is present on the line, and no key that has a typed field
      of its own.
- [x] When `message` is a JSON object, keys of that object other than the
      level key are not lifted into `attributes`; they remain only in `body`
      and `raw`.
- [x] The `level`/`severity` key read for severity is neither copied into
      `attributes` (it is read, not promoted) nor removed from `body` or
      `raw` (it stays in the original `message`); it exists once, in
      `body`/`raw`.

### Severity

- [x] A line whose `message` is a plain string, or a JSON object with no
      `level` and no `severity` key, produces a record with `severity_number`
      null and `severity_text` null.
- [x] A line whose `message` is a JSON object with a recognized textual
      `level` (or `severity`) value produces a record whose `severity_number`
      is the matching OpenTelemetry band and whose `severity_text` is the
      original token verbatim, matched case-insensitively and ignoring
      surrounding whitespace (the shared name rules).
- [x] A line whose `message` is a JSON object with a numeric `level` (or
      `severity`) value produces a record with `severity_number` null and
      `severity_text` the value verbatim — the adapter declares no numeric
      scale convention.
- [x] A line whose `message` is a JSON object with an unrecognized textual
      `level` value produces a record with `severity_number` null and
      `severity_text` that value verbatim; no `ParseError` is raised for it.
- [x] Severity is never derived by scanning `message` text for words like
      `error` or `timeout`.

### `source_type` and determinism

- [x] Every produced record has `source_type` `aws-cloudwatch`.
- [x] The same line produces an identical record — same `body`, `timestamp`,
      `service_name`, `severity_number`, `severity_text`, `fingerprint` — on
      every run, independent of ordering.

### `ParseError`

- [x] A returned `ParseError` carries the offending line's original text
      verbatim and a stable reason `code`; it is a value returned from
      `parse`, never a thrown exception.

### `detect`

- [x] `detect` given a sample of CloudWatch per-event lines returns a higher
      confidence than `detect` given a sample of GCP `LogEntry` lines.
- [x] `detect` returns a higher confidence for a line carrying `logGroup`
      AND `logStream` AND an integer epoch-millis `timestamp` together (the
      joint CloudWatch markers) than for a generic JSON line without those
      markers; the json-lines adapter, as the fallback, loses this contest by
      design.
- [x] `detect` given an empty sample returns 0.

### Fixtures

- [x] A real, credential-redacted CloudWatch export sample is committed under
      `__fixtures__/` next to the adapter, and a test maps it (post-split)
      to the expected records, severity included.

## Out of scope

- Splitting a raw CloudWatch export (`{ logGroup, logStream, logEvents[] }`)
  into per-event lines — that is the importer's job (ADR 0006); the adapter
  is fed one event line at a time.
- Cross-adapter format detection and the adapter registry that consumes
  `detect` (your note; ADR 0004 describes it). Only this adapter's own
  `detect` is delivered.
- Inferring severity from `message` text — a heuristic ADR 0002 permits but
  [severity-normalization.md](severity-normalization.md) deliberately
  declines; the import-time override is the correction path.
- Numeric level scales for CloudWatch. The adapter declares no convention, so
  a numeric `level` is undeterminable rather than guessed. Revisit if a real
  sample establishes a dominant producer convention.
- Lifting a structured JSON `message`'s fields into `attributes` — only a
  `level`/`severity` key is read, for severity only. Full structured-payload
  promotion is the json-lines adapter's concern.
- A plausible-epoch sanity window on `timestamp` (rejecting seconds-vs-millis
  mistakes). Only absent / non-numeric / non-integer / `<= 0` are rejected.
- Requiring `message` to be present or a string — a missing or empty
  `message` yields an empty `body`, consistent with
  [canonical-log-record.md](canonical-log-record.md).
- Assembly-level guarantees — `observed_at` from an injected clock, the
  fingerprint value, typed-key exclusion from `attributes`, the
  `core/` boundary — specified in
  [canonical-log-record.md](canonical-log-record.md).
- The fingerprint sentinel for a null `service_name` or severity (ADR 0005),
  specified in [message-fingerprint.md](message-fingerprint.md).
- Persistence, batching (~5k records), and progress reporting (ADR 0006).
- Reprocessing stored records from `raw` when the adapter is corrected
  (ADR 0002).

## Notes

The `LogSourceAdapter` port does not exist yet; this is the first adapter and
it introduces the port. Per `.claude/rules/architecture.md` the port is
justified by four plausible implementations (GCP, CloudWatch, json-lines,
nginx), not by this feature alone.

A CloudWatch `logEvents[]` entry natively carries only `id`, `timestamp` and
`message`. The `logGroup` / `logStream` context lives on the enclosing export
object, so the importer must attach it to each per-event line for
`service_name` derivation to be possible in `parse`. The DoD assumes that
contract; if the importer split is later specified to preserve only the bare
event entry, the `service_name` and `attributes` criteria above move to the
importer.

`level` and `severity` are both accepted as the key name inside a structured
`message` so a pino-style (`level`) and a bunyan/GCP-style (`severity`)
payload both resolve; the value is handed to the shared `normalizeSeverity`
with no convention argument.
