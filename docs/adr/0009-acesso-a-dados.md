# ADR 0009 — Prisma as the access layer, with raw SQL in aggregations

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

ADR 0003 decided **which** database to use. This one decides **how** to
access it, which is a separate question with its own trade-offs.

There are two very distinct access profiles in the system:

- **Write and simple query** — batch insertion at ingestion, issue upsert
  by fingerprint, paginated log listing with filters. High call volume,
  predictable shape.
- **Analytical aggregation** — the dashboard queries. Few in number (four
  or five), but with needs that an ORM's API does not express.

## Decision

**Prisma as the default**, with targeted raw SQL where the client falls
short.

### Native client — the project's default

Covers the vast majority of data access:

```ts
await prisma.issue.upsert({
  where: { fingerprint },
  create: { fingerprint, firstSeen: ts, lastSeen: ts, eventCount: 1 },
  update: { lastSeen: ts, eventCount: { increment: 1 } },
})
```

Also: `createMany` for batch insertion at ingestion, and the logs table's
keyset pagination. In these cases, native is more readable than
hand-written SQL and equally efficient.

The keyset does **not** use Prisma's `cursor` argument: it compiles to
correlated subqueries and a sequential scan. It uses the composite
comparator built with the query builder's operators, in the sargable form
that keeps the `timestamp` bound as an index range:

```ts
await prisma.logRecord.findMany({
  where: {
    AND: [
      { timestamp: { lte: cursorTs } },
      { OR: [{ timestamp: { lt: cursorTs } }, { id: { lt: cursorId } }] },
    ],
  },
  orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
  take: pageSize + 1,
})
```

The fixed `OFFSET 0` that Prisma's `findMany` always appends to the SQL is
not the `OFFSET` the performance rule prohibits — that one grows with page
depth; this one is constant, and the keyset `WHERE` is what advances the
page. See `@.claude/rules/performance.md`.

### `$queryRaw` — the exception, restricted to `analytics`

Four capabilities required by the dashboard that the client does not
express:

| Need | Where it is used |
|---|---|
| `GROUP BY` by expression (`date_trunc`) | event time series |
| Conditional aggregation (`count(*) FILTER`) | error rate in the same pass |
| Window function (`LAG`, CTE) | spike detection between windows |
| `generate_series` + `LEFT JOIN` | eventless buckets in the chart |

Interpolation with a tagged template (`` $queryRaw`... ${value}` ``) is
parameterized by Prisma. **`$queryRawUnsafe` is not used anywhere.**

### Output validation with Zod

The return of `$queryRaw` is typed only by declaration — Prisma checks
nothing at runtime. Every raw query validates its output:

```ts
const ErrorRateRow = z.object({
  bucket: z.coerce.date(),
  total: z.coerce.number(),
  errors: z.coerce.number(),
})

return z.array(ErrorRateRow).parse(rows)
```

This is not formality. `count(*)` in PostgreSQL returns `BigInt`, which
`JSON.stringify` does not serialize — `z.coerce` resolves it at the
boundary, once, instead of producing a runtime error in the HTTP response.

The output schema of each query object **is** the API contract: one
definition serves as database validation, backend type and frontend type.

In the native client, the type is already inferred from the schema, and
validating again would be redundant — Zod applies only to raw queries.

### Indexes outside the Prisma schema

BRIN and GIN (ADR 0003) are not expressed by the Prisma schema and are
created in a manual SQL migration, with a comment justifying each one.
They stay explicit in the repository instead of implicit in the tool.

## Alternatives considered

**Kysely.** A typed query builder that would give SQL with type inference
derived from the schema and would cover the middle ground between the
client and raw SQL. Technically appealing. **Discarded due to schedule
risk:** it is a tool the team does not already know, and introducing new
learning onto the critical path of a three-day deadline is the same risk
that motivated other decisions in this set.

**TypeORM.** Discarded in favor of Prisma: more reliable migrations,
better type inference and a more stable maintenance track record.

**Raw SQL for all access**, no ORM. Would give full control and remove the
mapper from ADR 0008. Discarded because it would lose versioned
migrations, generated typing and the readable upsert — with no gain where
the client is already adequate.

**Native client for everything, no raw SQL.** Would require multiple
queries per time bucket and aggregation in JavaScript. Discarded: it would
shift analytical work from the database to the application, against the
performance criterion.

## Consequences

**Positive**
- Versioned migrations and generated types on the main path.
- The database does the analytical work, not the application.
- Runtime validation at the database boundary — a stronger guarantee than
  the compile-time type promise, precisely where the type is declared by
  hand.

**Negative**
- Two access styles coexist; the convention needs to be clear (raw SQL
  only in `analytics/queries/`).
- The raw queries are PostgreSQL-specific, which ties down read-side
  portability. Trade-off accepted.
- `attributes` (JSONB) is typed as `Prisma.JsonValue`, weak by nature;
  refined with Zod on read.

## Open point, to be decided by measurement

Filtering by key inside JSONB is supported by the client
(`attributes: { path: [...], equals: ... }`), but the execution plan does
not always take advantage of the GIN index. The implementation starts with
the native client and migrates to `$queryRaw` if `EXPLAIN ANALYZE`
indicates a sequential scan — a decision by measurement, not anticipation.

## Revisit when

The number of raw queries grows beyond the `analytics` module, a sign that
a typed query builder would start to be worth its adoption cost.
