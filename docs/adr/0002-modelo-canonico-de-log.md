# ADR 0002 — Canonical log model based on OpenTelemetry

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The platform needs to import logs from different sources — GCP Cloud
Logging, AWS CloudWatch, nginx, syslog, generic JSON Lines. Each has its
own vocabulary: GCP calls `severity` a string, syslog uses an integer from
0 to 7, CloudWatch does not always carry an explicit severity.

Without a common model, every screen and every aggregation would have to
know every format. Filtering by "errors" would turn into an `if` per
source, and the dashboard would not be able to compare data from distinct
origins in the same series.

## Decision

Adopt a **single canonical model**, using the
[OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/)
as the reference instead of a custom format.

```
LogRecord
├─ timestamp          -- event time, as reported by the source
├─ observed_at        -- when the platform ingested it
├─ severity_number    -- OTel scale (1–24), normalized
├─ severity_text      -- original label preserved
├─ body               -- message
├─ service_name       ┐
├─ host               ├─ resource attributes
├─ environment        ┘
├─ trace_id, span_id  -- distributed correlation
├─ attributes  JSONB  -- variable tail, source-specific
├─ source_type        -- id of the source adapter (see ADR 0004)
├─ fingerprint        -- see ADR 0005
└─ raw                -- original record text, verbatim, lossless
```

The separation between **stable core** (typed columns) and **variable
tail** (`attributes` in JSONB) is the axis of the model, and it is what
underpins the database decision in ADR 0003.

`source_type` is the identifier of the adapter that produced the record —
`gcp-cloud-logging`, `aws-cloudwatch`, `json-lines`, `nginx` (ADR 0004).
Adapter ids are the single source of these values; this document does not
maintain a parallel list and does not redefine them.

### Severity normalization

Each adapter is responsible for mapping the source's severity to the OTel
scale, preserving the original label in `severity_text`:

| Source | Source field | Example |
|---|---|---|
| GCP Cloud Logging | `severity` (string) | `DEFAULT`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| AWS CloudWatch | not standardized | heuristic over the message or payload |
| Syslog RFC5424 — future source, not yet supported (see ADR 0004) | PRI (0–7) | `emerg` … `debug` |
| nginx | channel | `access` → INFO, `error` → ERROR |

### Preserving the original

The `raw` field stores the original record text, verbatim — the line as it
came from the source, without reserialization, preserving formatting and
key order. This costs space, but guarantees that a parser bug does not
destroy information, and it allows reprocessing an import with a fixed
adapter, without asking for the file again. How this value is persisted is
an infrastructure detail (ADR 0009), not part of the canonical model.

## Alternatives considered

**Custom format, purpose-built.** Would be smaller and more to the point.
Discarded because adopting an industry standard brings already-resolved
semantics (the severity scale, the separation between resource and log
attributes, the correlation fields) and makes the platform compatible with
any OTel collector in the future, without a schema migration.

**Elastic Common Schema (ECS).** Also a mature, well-documented standard.
Discarded for being more tied to the Elastic ecosystem and for having a
field surface much larger than this scope justifies.

**Store only the raw JSON and interpret it at read time.** Trivially
simple ingestion, but pushes all the cost onto the query: every severity
filter would become a JSON expression with no efficient index, and the
dashboard would become unviable at volume.

## Consequences

**Positive**
- Filters, searches and aggregations work the same regardless of source.
- Adding a new source does not touch the domain or the UI (see ADR 0004).
- `raw` allows reprocessing without reimporting.

**Negative**
- Higher storage cost from keeping both original and normalized forms.
- Normalizing severity from sources without an explicit field (CloudWatch)
  requires a heuristic, which can be wrong. Mitigated by allowing an
  override at import time and by keeping `raw`.

## Revisit when

OpenTelemetry evolves the logs data model in an incompatible way, or when
the platform starts receiving telemetry natively via OTLP — in that case
the canonical model stops being a translation and becomes the direct
input format.
