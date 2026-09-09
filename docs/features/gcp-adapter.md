# GCP Cloud Logging adapter

Translates a Google Cloud Logging `LogEntry` (exported as JSON) into a
canonical `LogRecord`. One implementation of the `LogSourceAdapter` port; it
parses and assembles, and records a `ParseError` for a line it cannot turn
into a valid record.

## Governed by

- ADR 0004 — Adapters per source: implements `detect` and `parse`; `parse`
  returns `LogRecord | ParseError`; a line that cannot yield a valid record is
  a counted `ParseError`, never a thrown exception; the import continues.
- ADR 0002 — Canonical log model: maps `LogEntry` fields onto the canonical
  shape; severity to the OpenTelemetry scale with the original label kept in
  `severity_text`; `source_type` is the adapter id; `raw` is the original line
  verbatim.
- ADR 0005 — Event grouping: the assembled record carries the fingerprint from
  `body` + `service_name` + `severity_number`; a missing service or severity
  uses the shared sentinel.
- ADR 0008 — Hexagonal core: the adapter lives in
  `domains/ingestion/infra/adapters/`, implements a port declared in
  `ports/`, and returns the `core` `LogRecord`. It is infra: it may import
  drivers, never the other way round.

## Done when

### Detection

- [x] `detect` returns high confidence for a JSON object carrying the
      `LogEntry` markers — a `logName` string and either `timestamp` plus one
      of `jsonPayload` / `textPayload` / `protoPayload`.
- [x] `detect` returns low or zero confidence for a plain JSON object with no
      `LogEntry` markers, so json-lines wins it instead.

### Payload → body

- [x] A `LogEntry` with `textPayload` uses that string as `body`.
- [x] A `LogEntry` with `jsonPayload` carrying a `message` field uses that
      field as `body`.
- [x] A `LogEntry` with `jsonPayload` and no `message` field uses the
      serialized `jsonPayload` as `body`, so no record is left with an empty
      body when a payload exists.
- [x] `textPayload` and `jsonPayload` are treated as mutually exclusive; the
      adapter never expects both and has a defined order when, against spec,
      both are present.

### Timestamp

- [x] The `LogEntry.timestamp` (RFC 3339) becomes the record `timestamp`.
- [x] A `LogEntry` with no `timestamp`, or an unparseable one, yields a
      `ParseError`, not a record — assembly requires a valid event time.

### Resource → service, host, environment

- [x] `service_name` is derived from `resource.labels` by `resource.type`:
      `cloud_run_revision` → `service_name` label; `k8s_container` →
      `container_name` label; `gce_instance` → `instance_id` label;
      `gae_app` → `module_id` label.
- [x] A `resource.type` the mapping does not cover leaves `service_name` null
      rather than guessing, and the record still assembles.
- [x] The record does not duplicate any resource label into `attributes` once
      it has been promoted to a typed field.

### Severity

- [x] A recognized `LogEntry.severity` string maps through the shared severity
      normalizer under the declared name convention, and `severity_text` keeps
      the original string verbatim.
- [x] `severity` `DEFAULT`, an unrecognized value, or an absent field yields
      `severity_number` null with `severity_text` carrying the original (or
      null when absent), and the record still assembles.

### Trace and span

- [x] A `trace` field of the form `projects/PROJECT/traces/TRACE_ID` yields a
      `trace_id` of just `TRACE_ID`, not the full path.
- [x] A `spanId` field, when present, becomes `span_id`.
- [x] Absent `trace` or `spanId` leaves the respective field null.

### Attributes and raw

- [x] Source-specific fields with no typed home — `labels`, `httpRequest`,
      `operation`, `insertId`, and `jsonPayload` keys other than the one used
      as `body` — are carried in `attributes`.
- [x] `raw` is the original line text exactly as received, not the parsed or
      reserialized object.
- [x] `source_type` on every record is `gcp-cloud-logging`.

### Failure handling

- [x] A line that is not valid JSON yields a `ParseError` carrying the line
      content and reason; the run continues.
- [x] A `ParseError` is never thrown as an exception; it is a returned value.

## Out of scope

- Automatic format detection across adapters — the registry that picks an
  adapter by confidence is a separate feature; this DoD covers only this
  adapter's own `detect`.
- The severity normalization algorithm itself (`severity-normalization.md`);
  this adapter declares the name convention and delegates.
- Tokenization and fingerprint computation (`message-tokenizer.md`,
  `message-fingerprint.md`); assembly consumes the shared implementation.
- `LogRecord` assembly rules (`canonical-log-record.md`); this adapter feeds it
  fields.
- Persistence, batching, the streaming pipeline (ADR 0006), and the row↔record
  mapper.
- `protoPayload` entries (audit logs): out of scope for this iteration; a
  `LogEntry` carrying only `protoPayload` may be treated as an unrecognized
  body shape and is not required to map cleanly.
- Numeric GCP severity (0–800): GCP exports in scope use the string enum; a
  numeric severity falls under the unrecognized-value rule.

## Notes

The four fields that most often trip up a GCP adapter are covered above:
`jsonPayload`/`textPayload` exclusivity, `resource.labels` varying by
`resource.type`, the `trace` path needing the trailing id extracted, and the
string severity. Real `LogEntry` exports vary more than any three-day sample
shows; the fixture-driven tests use committed real samples per resource type,
and anything unhandled degrades to a null typed field or a `ParseError`, never
a crash.