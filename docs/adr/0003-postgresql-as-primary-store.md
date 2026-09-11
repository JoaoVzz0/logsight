# ADR 0003 — PostgreSQL with JSONB as the primary store

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

Logs are often described as semi-structured data, which suggests a
document database. The question was raised explicitly: does NoSQL make
more sense?

The answer depends less on the data format and more on the **access
pattern**. And this application's access pattern is analytical, not
document-oriented:

- count per time bucket (`date_trunc`)
- error rate over the total in the same window
- grouping by `fingerprint` with `count`, `min(timestamp)`, `max(timestamp)`
- comparison between current and previous window, for spike detection
- cursor-based pagination ordered by time
- text search over the message

Furthermore, the data is not uniformly semi-structured. Per ADR 0002, it
is **hybrid**: a stable core present in every source, and a variable tail
specific to each origin.

## Decision

**PostgreSQL** as the primary store, with:

- **typed columns** for the `LogRecord` core, with `severity_number` and
  `severity_text` **nullable** when the source does not carry a
  determinable severity (ADR 0002, ADR 0005)
- **JSONB** for `attributes`, with a **GIN** index for filtering by
  arbitrary key (`attributes->>'region' = 'us-east-1'`)
- **TEXT** for `raw` — the original record preserved verbatim (ADR 0002).
  Never queried by key, so it receives no index and needs no JSONB
- **BRIN** on `timestamp` — the data is append-only and naturally ordered
  by time, so the index ends up orders of magnitude smaller than an
  equivalent B-tree. It solves scanning by time window; it does not
  deliver rows in order
- **composite index** `(service_name, severity_number, timestamp DESC)`
  for the table's most common query path
- **B-tree** `(timestamp DESC, id DESC)` for the keyset pagination of the
  logs screen. The unfiltered "most recent first" page, and each
  subsequent page by cursor, need an index that directly serves the
  keyset ordering — BRIN does not do that and the composite index above
  requires equality on `service_name`/`severity_number` as a prefix. BRIN
  and B-tree coexist: one for analytical range scans, the other for
  keyset ordering (ADR 0009)
- **`pg_trgm`** (or `tsvector`, depending on measurement) for text search
  over `body`

**No second store.** Redis was evaluated for the ingestion queue and for
an aggregation cache, but descoped along with BullMQ — see ADR 0006.
PostgreSQL is the only store in the current architecture.

## Alternatives considered

**MongoDB.** In favor: ingesting heterogeneous sources without deciding a
schema up front, native time-series collections, simpler horizontal
sharding. Against: the dashboard's core aggregations turn into verbose
pipelines, and the window-to-window comparison — which in SQL is a
one-line window function — becomes significantly more laborious. Text
search is weak outside Atlas Search. And we would lose the opportunity to
demonstrate indexing strategy, which is one of the evaluation criteria
(performance).

**ClickHouse.** Technically the correct answer for high volume — it is
what real logging systems use. Discarded due to the deadline: it would
require engine modeling, an ordering key and a merge policy that could not
be properly justified in 3 days. It is recorded as the evolution path, not
as an alternative rejected on merit.

**OpenSearch / Elasticsearch.** Excellent at text search and the market
standard for log exploration. Discarded for operational weight
disproportionate to the scope, and for making the evaluator's
`docker compose up` heavy and fragile.

Worth recording the point that guided the decision: **no reference logging
system uses a document database**. Datadog, Loki, ClickHouse and
OpenSearch are columnar or inverted-index based. If the correct answer for
scale were NoSQL, the candidate would be ClickHouse — not MongoDB.

## Consequences

**Positive**
- A single SQL query resolves each dashboard aggregation, including
  window comparison via a window function.
- `issues` (ADR 0005), with upsert by fingerprint, a counter and a
  resolve/ignore state, is pure relational modeling and gets transactions
  for free.
- Explicit, measurable indexing strategy via `EXPLAIN ANALYZE`.

**Negative**
- Vertical scaling: past some order of magnitude of volume, Postgres
  stops being adequate for long-term log retention.
- JSONB with GIN has write cost and takes up significant space.
- Time-based partitioning will not be implemented within the challenge
  scope, only documented.

## Revisit when

Retained volume passes the order of tens of millions of records per query
period, or when retention requires an automatic expiration policy. The
path is native daily partitioning first; ClickHouse afterward, if
aggregation becomes the bottleneck.
