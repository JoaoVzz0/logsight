# Issues screen

Grouped-issue list by fingerprint — the platform's differentiator. List only,
no per-occurrence detail panel (that stays an evolution).

## Governed by
- ADR 0005 — grouping by fingerprint; new/spike/regression badges are the
  metrics; total log count is not exposed.
- ADR 0009 — reads project SQL straight to the DTO, no entity hydration;
  queries live in domains/issues/queries/ (new, following the logs/queries
  pattern).
- ADR 0010 / 0011 — filters in the URL, density, severity never by color
  alone.
- ADR 0012 — consumed through the generated api-client.

## Done when

### Backend — GET /issues
- [x] A query in domains/issues/queries/list-issues.ts projects Issue rows
      straight to the DTO: fingerprint, sampleMessage, severityNumber,
      eventCount, firstSeen, lastSeen, affectedServices, status.
- [x] Optional query params, Zod-validated: service (exact match, same as
      /logs) and severity (one level or several). Status filtering was
      dropped — see Notes.
- [x] Default ordering by lastSeen descending (most recent first).
- [x] A GET /issues route in domains/issues/http/ with a named Zod schema
      (IssueListResponse), appearing in the OpenAPI document at /docs.
- [x] api-client regenerated and committed after the route lands.

### Frontend — /issues screen
- [x] Replaces the current placeholder. Consumes GET /issues through the
      generated api-client.
- [x] Each row shows: the message (sampleMessage), eventCount as a prominent
      number, the affected services, and the relative time of lastSeen.
- [x] Severity as a left-edge band plus icon plus text label (never color
      alone), reusing the logs table pattern.
- [x] A badge where applicable: "regression" (a reopened issue), and resolved
      / ignored issues visually de-emphasized.
- [x] Service and severity filters live in the URL (searchParams).
- [x] Empty (no issues), error (with retry) and loading (skeleton) states.
- [x] Colors from CSS variables, responsive, uses the shadcn primitives.
- [x] Update all docs that mention that issues is not implemented

## Out of scope
- The issue detail panel (individual occurrences, timeline, trace) — evolution.
- Resolve / ignore actions from the UI — the aggregate supports the
  transitions, but exposing them via a PATCH endpoint and UI controls is out
  of scope for this pass.
- Pagination — the grouped issue count is low-cardinality (hundreds, not
  millions); a bounded list of the most recent is enough, no cursor.
- Per-issue navigation to its logs (filtering /logs by fingerprint) —
  evolution.

## Notes
The backend Issue aggregate and its repository already exist; this adds only
the read query and the HTTP route on top, plus the screen. domains/issues/http/
and domains/issues/queries/ are new folders following the read-projection
pattern of logs/ and analytics/.

Status filtering (unresolved/resolved/ignored) was implemented, then dropped
before shipping: there is no PATCH endpoint or UI control that can ever move
an issue to resolved or ignored (see "Out of scope" above), so a status
filter offered choices a real user could never produce, which is confusing
rather than useful. Swapped for a service filter (exact match, mirrors the
/logs screen's service filter). The status field itself is still returned
by the DTO and still drives the regression badge and the resolved/ignored
row de-emphasis — those reflect real data (reachable today only by editing
the database directly) and stay ready for when the PATCH endpoint ships.
If that endpoint lands, restoring the status filter is a small, additive
change: the query/schema plumbing was already proven once.