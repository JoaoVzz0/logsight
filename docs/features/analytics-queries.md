Create docs/features/analytics-queries.md with this DoD and implement it with
tdd-gates from G1 (the DoD below is the approved G0). These are analytical SQL
queries with performance concerns — the gates and tests apply here.

# Analytics queries

Five read queries in domains/analytics/queries/, each projecting aggregated
SQL straight to its DTO. They feed the dashboard cards.

## Governed by
- ADR 0005 — new issues, regressions, spikes and distribution are the
  metrics; total log count is a vanity metric and is not exposed.
- ADR 0009 — aggregate in the database (GROUP BY, conditional aggregation,
  window functions), never pull rows to sum in JS; $queryRaw is allowed in
  analytics/queries/; validate output with Zod (count comes back as BigInt →
  z.coerce.number()).
- ADR 0012 — named Zod output schemas are the contract, consumed by the
  frontend through the generated api-client.
- performance.md — every query verified with EXPLAIN ANALYZE; a sequential
  scan on a large table is a finding to investigate.

## Done when

Every query takes a time window (from, to) and respects the same half-open
[from, to) semantics as GET /logs.

### error-rate
- [x] Returns a time series: per time bucket, total events and error events
      (severity_number >= 17), plus the error/total ratio.
- [x] The time bucket is adaptive to the window (minute/hour/day by duration)
      so the series has a legible number of points.
- [x] Buckets with no events appear as zero (generate_series + LEFT JOIN),
      not missing — the chart line does not break.

### new-issues
- [x] Returns issues whose first_seen falls within the window, with
      fingerprint, sample_message, severity, event_count, first_seen.

### top-issues
- [x] Returns issues ordered by event_count desc within the window, limited
      (e.g. top 10), with the same display fields.

### spikes
- [x] Returns issues whose rate in the current window exceeds the previous
      window of equal duration by a factor (e.g. >= 3x), with the multiplier.
- [x] The previous window is the one of equal duration immediately preceding
      the current one.

### by-service
- [x] Returns distribution by service_name within the window: total and error
      counts per service, ordered by volume. A null service_name is its own
      "unknown" bucket, not discarded.

## Contract
- [x] Each query exposes a named Zod output schema (ErrorRateResponse,
      NewIssuesResponse, TopIssuesResponse, SpikesResponse, ByServiceResponse).
- [x] GET endpoints expose each query (e.g. GET /analytics/error-rate) with
      from/to validated by Zod, appearing in the OpenAPI document at /docs.
- [x] api-client is regenerated and committed after the routes land.

## Out of scope
- The dashboard cards (frontend) — next feature.
- Total log count as a headline (ADR 0005).
- Sophisticated anomaly detection — spike is a simple window-over-window
  comparison.
- Custom dashboards, alert thresholds, comparison against an arbitrary
  historical period.
- Caching the aggregations (Redis) — an evolution; queries hit the database
  directly for now.