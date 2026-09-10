# Issue aggregate

Groups occurrences that share a fingerprint into one problem, tracks how many
times it happened, when it was first and last seen, which services it touched,
and its resolution status. This is the one real aggregate in the domain.

## Governed by

- ADR 0005 — Event grouping: a fingerprint identifies an issue; `event_count`
  only grows, `first_seen` is fixed once set, `last_seen` only advances,
  affected services accumulate; a resolved issue that recurs is a regression.
- ADR 0008 — Hexagonal core: `Issue` is an aggregate in
  `domains/issues/core/` with invariants and behaviour; the repository port
  is in `ports/`, the Prisma implementation in `infra/`. `core/` imports no
  driver.
- ADR 0002 / ADR 0003 — Canonical model and storage: `severity_number` on an
  issue may be null (an issue grouped from undeterminable-severity records),
  so the column must be nullable.

## Done when

### Schema debt — must ship with this feature

- [x] A migration makes `issues.severity_number` nullable; an issue whose
      records have undeterminable severity persists without violating the
      column. The migration is applied and reflected in the schema.

### Aggregate behaviour — `domains/issues/core/`

- [x] Recording the first occurrence of a fingerprint creates an issue with
      `event_count` 1, `first_seen` and `last_seen` both the occurrence time,
      the record's service in `affected_services`, status `unresolved`, and
      the sample message and severity from that record.
- [x] Recording a further occurrence increments `event_count`, advances
      `last_seen` when the new time is later, never moves it earlier, and
      leaves `first_seen` unchanged.
- [x] A new service on a later occurrence is added to `affected_services`
      without duplicating a service already present.
- [x] Recording an occurrence on an issue whose status is `resolved` returns
      the issue to `unresolved` and marks it a regression; recording on an
      `ignored` issue leaves it `ignored`.
- [x] Status transitions are explicit: `unresolved → resolved`,
      `resolved → unresolved` (regression), any → `ignored`, `ignored →
      unresolved`; `resolved_at` is set when resolving and cleared when the
      issue reopens.
- [x] The aggregate exposes its state through behaviour, not by letting a
      caller set `event_count`, `first_seen`, or `last_seen` directly.

### Repository — port in `ports/`, Prisma in `infra/`

- [x] An `IssueRepository` port declares upsert-by-fingerprint for a batch of
      occurrences and lookup by fingerprint, in domain terms, importing no
      driver.
- [x] The Prisma implementation upserts an issue by fingerprint: first
      occurrence inserts, subsequent occurrences update `event_count`,
      `last_seen`, and `affected_services` in one statement.
- [x] Occurrences of the same fingerprint arriving in one batch are
      aggregated into a single upsert, not one write per record.
- [x] An in-memory implementation of the port exists for tests; the aggregate
      and its behaviour are tested against it, without a database.

## Out of scope

- The ingestion pipeline that produces occurrences and calls the repository
  (next feature) — this delivers the aggregate and its persistence, not the
  streaming loop.
- Reading issues for the API or UI — `GET /issues`, filters, the issues
  screen (later features). This is the write side.
- Spike, new-issue, and regression *metrics* on the dashboard (analytics
  queries) — the aggregate records enough to compute them; the queries are a
  separate feature.
- Cross-module hand-off wiring from `ingestion` (`.claude/rules/architecture.md`);
  the contract is the repository port, exercised here in isolation.

## Notes

`Issue` is the one aggregate that earns tactical DDD (ADR 0008): the
counters and status form a small state machine with real invariants —
`event_count` monotonic, `first_seen` immutable, `last_seen` monotonic,
reopen-on-recurrence. Everything else in the domain is data; this is not.

The batch-upsert aggregation matters for volume: a large import produces many
occurrences of the same fingerprint, and writing one row per occurrence
instead of one upsert per distinct fingerprint per batch is the difference
between fast and unusable ingestion.

The severity-number nullability is a debt carried since the schema was first
written: the canonical model already allows a null severity, but the issues
table still refused it. Shipping the migration here closes it before the
pipeline writes the first undeterminable-severity issue.