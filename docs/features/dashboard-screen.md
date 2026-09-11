# Dashboard screen

Trends and aggregate signals over a time window. Cards over the analytics
queries. Consumes the generated api-client.

## Governed by
- ADR 0005 — new issues, spikes, distribution are the metrics; total log
  count is never a headline.
- ADR 0010 — one query per card, each loads and fails independently.
- ADR 0011 — chart colors from CSS variables; series distinguishable without
  color alone; severity never by color alone.
- frontend.md — Recharts, no useEffect, empty/error/loading states,
  responsive desktop-first.

## Done when
- [x] Route / renders the dashboard.
- [x] A time-range selector applies to every card; the selection lives in the
      URL searchParams (shareable) and every card refetches on change.
- [x] Error-rate card: a line/area chart of error ratio over time from
      GET /analytics/error-rate; empty buckets render as zero, the line does
      not break.
- [x] New-issues card: lists issues first seen in the window
      (GET /analytics/new-issues), each showing the normalized pattern,
      count, service.
- [x] Top-issues card: ranks issues by event_count (GET /analytics/top-issues).
- [x] Spikes card: lists issues over the previous window with the multiplier
      (GET /analytics/spikes).
- [x] By-service card: distribution across services (GET /analytics/by-service),
      the "unknown" bucket shown for null service.
- [x] Each card issues its own query, renders its own skeleton, and a failing
      card shows an error state without breaking the others.
- [x] Selecting an issue from any card navigates to it (to /logs filtered, or
      a placeholder if issue detail isn't built — link to logs is acceptable).
- [x] Chart colors come from CSS variables and change with the theme.
- [x] Total log count is not shown as a headline figure.
- [x] Cards go from multiple columns to one column below the breakpoint.
- [x] Empty (no data in window), error, loading states on the screen and per
      card.

## Out of scope
- Custom dashboards, alert thresholds, drill-into-issue detail panel.
- Auto-refresh/polling — loaded on demand per time window.
- Exporting charts.

## Notes
Uses the shadcn primitives from shared/ui/ (Card, Select, Skeleton) — does
not re-implement them. Recharts reads colors as hsl(var(--chart-N)), never a
literal. The time-range selector in the URL means a dashboard view is
shareable by link, consistent with the logs screen.

The time-range URL param (`range`, one of `1h`/`24h`/`7d`/`30d`) holds the
preset, not raw `from`/`to`. `from`/`to` are derived at read time against a
`now` sampled once per page mount (`useState(() => new Date())`, no
`useEffect`), so every card in the same visit queries the identical window
and an incidental re-render never drifts the query key.

`IssueList` is shared by the new-issues, top-issues and spikes cards (the
third occurrence justifies the extraction); spikes supplies the multiplier
through its `renderMeta` slot rather than a fourth near-duplicate list.
Since `GET /logs` has no fingerprint filter, "selecting an issue" resolves to
the DoD's explicit fallback — a link to `/logs?service=<first affected
service>` (or plain `/logs` when an issue has none).

Two backend adjustments landed with this feature, both to the already-shipped
`analytics-queries` feature:
- `IssueSummary` (new-issues/top-issues/spikes) gained `services: string[]`,
  sourced from the existing `Issue.affectedServices` domain field — it was
  populated but not yet projected into the analytics response, and this
  screen's new-issues card needs it.
- `NewIssuesResponse` and `TopIssuesResponse` are structurally identical Zod
  schemas; fastify-swagger's `$ref` resolver was silently collapsing both to
  one component name (whichever schema was registered last), so the
  generated client mistyped the new-issues call. Disambiguated with
  `.describe(...)` on each schema — metadata only, no wire-shape change.

All five analytics query hooks set `retry: false`, matching `useLogs` — a
card's own retry button is the recovery path; TanStack Query's default
retries would otherwise delay `isError` well past what a card's failure
state should take to appear.

`vite.config.ts` gained `optimizeDeps.include: ['recharts']`: without it,
Recharts being pulled in for the first time triggers the dev server's
on-demand dependency pre-bundling mid-session, which forces a full reload
that can race an in-flight render (surfaced as a React Router context crash
in a couple of e2e runs). Pre-bundling it up front removes the race.