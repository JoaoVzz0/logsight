# Logs list endpoint

`GET /logs` returns log records newest-first, narrowed by optional filters and
a text search, and paginated forward through an opaque keyset cursor. It is the
read surface the logs table will consume.

## Governed by

- ADR 0001 — Stack: Fastify with `fastify-type-provider-zod` at the HTTP
  boundary, a global `setErrorHandler`, and `@fastify/swagger` for OpenAPI.
- ADR 0002 / ADR 0003 — Canonical model and storage: `severity_number` and
  `service_name` may be null; the `pg_trgm` GIN index on `body`, the BRIN
  index on `timestamp`, and the composite
  `(service_name, severity_number, timestamp DESC)` index already exist.
- ADR 0005 — Grouping: total log count is a vanity metric; the response does
  not carry one. `raw` is reserved for the occurrence detail.
- ADR 0008 — Domain architecture: reads do not pass through `core/`. `logs/`
  has only `queries/` and `http/`; the query object projects the row straight
  to the response shape without hydrating an entity or a repository.
- ADR 0009 — Data access: keyset pagination of the logs table uses the Prisma
  native client — a `WHERE` comparison built from the query builder's operators
  plus composite `orderBy` and `take`, not the `cursor` argument; no
  depth-scaling `OFFSET`; `$queryRaw` is restricted to `analytics/queries/`.
- ADR 0012 — API contract: every request and response schema is a named Zod
  schema with an explicit identifier; the response schema carries no
  refinement or coercion that fails to translate to JSON Schema.
- `.claude/rules/performance.md` — keyset cursor `(timestamp, id)`, no
  `OFFSET`, index chosen from the access pattern and verified with a plan.
- `.claude/rules/frontend.md` — composite cursor `(timestamp, id)`; a
  timestamp-only cursor skips or duplicates rows sharing a millisecond.
- `.claude/rules/code-style.md` — domain errors are typed classes with a
  stable `code`; the HTTP layer maps codes to status in one place.

## Done when

### Fastify base

- [x] A Fastify instance boots reading `PORT` and `DATABASE_URL` from the
      environment.
- [x] `fastify-type-provider-zod` is wired: a request that violates a route's
      Zod schema returns 400 naming the offending fields and never reaches the
      handler.
- [x] One global error handler maps a domain error to its HTTP status by the
      error's stable `code`; no route maps a status code locally.
- [x] `@fastify/swagger-ui` serves the generated document at `/docs`, and
      `GET /logs` appears there with its query parameters and response schema.

### Projection and default page

- [x] With no query parameters, the endpoint returns the most recent records
      ordered by `timestamp` descending, at most 50, each projected straight
      to the response shape without constructing a domain entity.
- [x] The response body is an object with a records array and a `nextCursor`
      that is an opaque string when more records follow and `null` on the last
      page.
- [x] A record in the response omits `raw`.
- [x] Two records sharing one `timestamp` are returned in a stable total order
      (`timestamp` desc, then `id` desc).

### Filters — all optional, all Zod-validated

- [x] `level` accepts one or more values; a record is returned only when its
      `severity_number` equals one of them.
- [x] The literal `unknown` among the `level` values matches records whose
      `severity_number` is null; without it, null-severity records are
      excluded whenever `level` is supplied.
- [x] `from` filters `timestamp` inclusively and `to` filters it exclusively
      (`from <= timestamp < to`); either bound may be supplied alone.
- [x] `from` later than `to` returns an empty records array with `nextCursor`
      null and status 200.
- [x] `service` returns only records whose `service_name` equals the supplied
      value exactly.
- [x] Supplied filters combine with AND: a record is returned only when it
      satisfies every one of them.

### Text search — `q`

- [x] `q` of at least 3 characters returns only records whose `body` contains
      it as a case-insensitive substring.
- [x] `q` shorter than 3 characters, absent, or empty applies no text filter
      and does not error.

### Pagination — composite keyset cursor

- [x] `limit` is optional, defaults to 50, accepts 1 through 200, and a value
      outside that range returns 400.
- [x] The cursor is a single opaque token encoding `(timestamp, id)`, passed
      back as one query parameter; a malformed or undecodable cursor returns
      400, not an empty page or a 500.
- [x] Requesting the next page with the returned `nextCursor` repeats no
      record from the previous page and skips none.
- [x] Three records sharing one `timestamp`, with `limit` set so the page
      boundary falls between them, are each returned exactly once across the
      two pages.
- [x] The cursor composes with the filters and the search: every page of a
      filtered or searched result set applies the same predicates.

### Contract

- [x] The query and response schemas are named Zod schemas with explicit
      identifiers (e.g. `LogListQuery`, `LogListResponse`), so the generated
      types read as `LogListResponse`, not `_Get_logs_Response`.
- [x] The response schema contains no refinement or coercion that fails to
      translate to JSON Schema; any coercion (`BigInt`, dates) happens in the
      query layer.

## Out of scope

- The logs screen and the virtualized table — next feature.
- The generated `packages/api-client`: deferred by decision. For now the Zod
  response schema is the shared type; the client generation wiring is not part
  of this feature.
- `GET /issues` and every analytics / dashboard query.
- Filtering or searching inside `attributes` (JSONB) — ADR 0009 leaves the
  native-vs-raw choice there to measurement; this endpoint does not expose it.
- A total or filtered count in the response — ADR 0005 rejects it and the
  frontend does not display it.
- Any sort other than `timestamp` descending; ascending order; a
  client-selectable sort field.
- A multi-value or `unknown` bucket for `service` — only `level` gets the
  set-plus-`unknown` treatment here. `service` is a single exact match.
- `raw` and full `attributes` in a row — those belong to the occurrence
  detail surface.
- Authentication, authorization, and rate limiting on the route.
- Snapshot consistency of a scroll across concurrent inserts beyond what
  keyset over `timestamp` descending gives for free.

## Notes

Per ADR 0009 the query object is implemented with the Prisma native client
(`findMany` with `where`, a composite `orderBy`, and `take`), not `$queryRaw`.
The request's "project SQL straight to the DTO" intent is met by mapping the
query result to the response shape without a domain entity or a repository
(ADR 0008), which is what "reads do not pass through the domain" means here —
not that the SQL is hand-written.

The `EXPLAIN ANALYZE` check ran on 40k seeded rows and drove two amendments
that landed with this feature:

- **ADR 0003** gains a `(timestamp DESC, id DESC)` B-tree
  (migration `20260910160000_log_records_keyset_index`). The BRIN index on
  `timestamp` cannot return rows in order, so the unfiltered newest-first page
  and every keyset page after it were doing a sequential scan plus a sort. The
  B-tree serves that ordering directly; BRIN stays for wide analytical range
  scans.
- **ADR 0009** and `.claude/rules/performance.md` are reworded: the keyset is
  built from the query builder's comparison operators, not Prisma's `cursor`
  argument (which compiles to correlated subqueries and a full scan). The
  predicate is the sargable form `timestamp <= :ts AND (timestamp < :ts OR id
  < :id)` so the timestamp bound is an index range condition. The constant
  `OFFSET 0` Prisma always appends is not the depth-scaling `OFFSET` the rule
  forbids.

With the B-tree in place the plans are: unfiltered newest page — index scan, no
sort; keyset page at depth 30k — `Index Cond` on `timestamp`, one row removed
by filter; `service` + `level` + time window — the composite
`(service_name, severity_number, timestamp DESC)` index; `q` — the `pg_trgm`
GIN index on `body` when the term is selective.

The query object lives in `domains/logs/queries/` and the route in
`domains/logs/http/`. `logs/` has no `core/` and no `ports/` (ADR 0008).

The three-records-sharing-one-timestamp case is test #3 of the four
highest-value tests in `.claude/rules/testing.md`; `queries/` is exercised
against a seeded PostgreSQL instance from the compose stack.
