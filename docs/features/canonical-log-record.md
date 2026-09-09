# Canonical log record

Defines the single normalized shape every source is translated into — the
`LogRecord` — and the one function that assembles it from the fields an
adapter has already extracted. Every screen, filter and aggregation downstream
sees this shape and never a source format.

## Governed by

- ADR 0002 — Canonical log model: the field set (`timestamp`, `observed_at`,
  `severity_number`, `severity_text`, `body`, `service_name`, `host`,
  `environment`, `trace_id`, `span_id`, `attributes`, `source_type`,
  `fingerprint`, `raw`), the stable-core / variable-tail split, severity
  normalized to the OpenTelemetry scale with the original label preserved,
  `raw` kept verbatim, `source_type` as the adapter id.
- ADR 0008 — Modular monolith with hexagonal core: `LogRecord` is data, not an
  aggregate — no invariants, no lifecycle. It lives in `domains/ingestion/core/`
  and depends on nothing in `infra/`, `http/`, `platform/`, nor on
  `@prisma/client`, `fastify`, `bullmq`, `ioredis`. It is not a Prisma type;
  the row↔record mapper is in `infra/`.
- ADR 0005 — Event grouping by fingerprint: the record's `fingerprint` is
  computed at ingestion from `body` + `service_name` + `severity_number`; a
  missing service or severity contributes a stable sentinel, never the lowest
  level.
- ADR 0004 — Adapters per source: `parse` returns `LogRecord | ParseError`; a
  line that cannot yield a valid record — including one with no parseable
  event time — is a counted `ParseError` raised in the adapter, never a thrown
  exception, and never reaches assembly.
- ADR 0003 — PostgreSQL storage: the typed core mirrors the columns of the
  store; the persistence form of each field is infra, not the canonical model.
- ADR 0009 — Prisma access layer: the mapping between the persisted row and the
  canonical record is the project's one mapper and lives in `infra/`.

## Done when

### Field surface

- [x] A `LogRecord` exposes exactly the canonical fields of ADR 0002 and no
      others: `timestamp`, `observedAt`, `severityNumber`, `severityText`,
      `body`, `serviceName`, `host`, `environment`, `traceId`, `spanId`,
      `attributes`, `sourceType`, `fingerprint`, `raw`. It carries no `id` and
      no `importJobId`.
- [x] `attributes` holds only source-specific keys; no value that has a typed
      field of its own (`serviceName`, `host`, `environment`, `traceId`,
      `spanId`) also appears inside `attributes`.

### Assembly

- [x] Assembling a `LogRecord` from a complete set of adapter-provided fields
      returns a record and never throws, for any field values — including an
      empty or whitespace-only `body` and every optional field absent.
- [x] Every assembled `LogRecord` exposes a non-null `timestamp`; no assembly
      path produces a record without an event time.
- [x] `observedAt` is taken from an injected time source at assembly time and
      is independent of every source field.
- [x] The optional fields `serviceName`, `host`, `environment`, `traceId` and
      `spanId` are `null` on the record when the caller supplies no value for
      them.
- [x] `attributes` is an empty map on the record when the caller supplies no
      tail keys.
- [x] `raw` on the record is the original record text passed by the caller,
      unchanged — no reserialization, trimming, or reformatting.
- [x] `sourceType` on the record is one of the ADR 0004 adapter identifiers
      (`gcp-cloud-logging`, `aws-cloudwatch`, `json-lines`, `nginx`) and is
      carried through unchanged.

### Severity representation

- [x] `severityNumber` on the record is either `null` or one of the six
      OpenTelemetry band base values; `severityText` is either `null` or the
      source's original label verbatim.
- [x] The severity pair is taken from the caller unchanged; assembly does not
      re-run severity normalization (each adapter owns its mapping, ADR 0002).

### Fingerprint

- [x] The record's `fingerprint` equals the value the shared fingerprint
      implementation computes for `{ body, serviceName, severityNumber }` read
      from that same record.
- [x] Two field sets that differ only in `serviceName`, or only in
      `severityNumber`, produce records with different `fingerprint`s.
- [x] Two field sets that differ only in a field other than `body`,
      `serviceName` or `severityNumber` produce records with identical
      `fingerprint`s.
- [x] A record assembled from an empty or whitespace-only `body` still has a
      `fingerprint`.

### Boundary

- [x] The `LogRecord` type and its assembly reside in
      `domains/ingestion/core/` and import nothing from `infra/`, `http/`,
      `platform/`, nor `@prisma/client`, `fastify`, `bullmq`, or `ioredis`;
      `pnpm check` fails on violation.

## Out of scope

- Severity normalization itself — the OpenTelemetry mapping and the numeric
  scale conventions (`severity-normalization.md`, ADR 0002). Assembly consumes
  the already-normalized pair.
- Tokenization and the fingerprint algorithm (`message-tokenizer.md`,
  `message-fingerprint.md`, ADR 0005). Assembly consumes the shared
  `computeFingerprint`.
- Each adapter's extraction of canonical fields from its source payload —
  which payload field becomes `body`, how `timestamp` is derived, the
  CloudWatch severity heuristic (ADR 0004). Those belong to the per-adapter
  feature docs.
- The `ParseError` path for a malformed or timestamp-less line (ADR 0004) —
  raised in the adapter before assembly; specified with the adapter work.
- Persistence mechanics: the row↔record mapper in `ingestion/infra/` (written
  during implementation), and the query/read path (ADR 0008 / 0009). The
  Prisma model, migration and ADR 0003 were already aligned with this model
  ahead of implementation — `severity_number` / `severity_text` nullable and
  `raw` as `TEXT`.
- `observedAt` as a queryable or displayed value, and any dashboard or
  log-table surface that reads a `LogRecord` (ADR 0009 / 0010).
- Cross-module hand-off: `ingestion` calling `issues.recordOccurrences()` with
  assembled records (`.claude/rules/architecture.md`).
- Batch and streaming assembly, and the ~5k-record ingestion batches
  (ADR 0006).
- The import-time `source_type` or severity override (ADR 0002 / 0004).
- Reprocessing stored records from `raw` when token or mapping rules change
  (ADR 0002 / 0005).
- Which source keys an adapter promotes to a typed field versus leaves in the
  tail, beyond the invariant that a typed field is never duplicated into
  `attributes`.

## Notes

ADR 0008 classifies `LogRecord` as data, not an aggregate. This feature
delivers an immutable typed structure plus one assembly function that composes
the normalized severity pair and the fingerprint, stamps `observedAt` from an
injected clock, and defaults the optional fields. It introduces no second
implementation of severity or fingerprint rules.

The assembly function is the unit under test. A bare type would have nothing
to assert that the compiler does not already guarantee
(`.claude/rules/testing.md`); every criterion above is a property of
assembly or of the module boundary.

Documentation and schema changes that shipped alongside this DoD:

- ADR 0002 — `source_type` is defined as the adapter id, with the adapter ids
  named the single source of truth (ADR 0004); `raw` is described as verbatim
  original text.
- ADR 0003 — `raw` is `TEXT` (not JSONB, no index); `severity_number` /
  `severity_text` are nullable when severity is undeterminable.
- `schema.prisma` + migration `20260909140000_log_record_nullable_severity_text_raw`
  — `severityNumber` / `severityText` nullable, `raw` as `String`.

Still open, in the `issues` domain and out of scope here: `issues.severity_number`
is still `NOT NULL`, which an issue grouped from records with undeterminable
severity cannot satisfy. It belongs to the `Issue` aggregate's own DoD.
