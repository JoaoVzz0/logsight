# Performance rules

These rules exist because of a real regression, not a hypothetical one. The
issue upsert ran one database round trip per fingerprint inside a loop over
the occurrence batch. Ingestion fell to ~7000 lines/s. Batching the write
removed the loop and the ceiling with it.

The rules below prevent that class of problem. Each one is checkable in
review or with a query plan — none of them ask for a benchmark to apply.

## No database operation inside a loop over records

A collection becomes one operation, never an `await` per item:

- `createMany` for inserts
- a bulk upsert (`INSERT ... ON CONFLICT ... DO UPDATE`) for merge-on-key
- a single `WHERE ... IN (...)` for lookups

```ts
for (const occ of batch) {
  await prisma.issue.upsert({ where: { fingerprint: occ.fingerprint }, ... })
}
```

is a bug. The batch has one write.

## Aggregate in memory before writing

When processing a batch, deduplicate and sum in memory first — a `Map` keyed
by fingerprint holding the rolled-up count and the min/max timestamps — then
emit the minimum number of writes. One row per distinct fingerprint, not one
write per occurrence.

## Key lookup uses a Map or Set

Building a `Map`/`Set` once and reading it is O(1) per access. `Array.find`,
`Array.includes` or `Array.indexOf` called inside a loop is O(n) per access
and O(n²) over the loop. If a lookup happens more than once, index it first.

## One transaction per dependent batch

Operations of a single batch that depend on each other — a bulk upsert whose
result feeds the next write — run in one transaction, not in separate
transactions per operation. Independent batches stay independent.

## Analytical reads aggregate in the database

`GROUP BY`, `count(*) FILTER (WHERE ...)`, window functions — the aggregation
happens in SQL. Pulling rows into JavaScript to sum, count or bucket them is
a violation of ADR 0009 and of this rule. See `@.claude/rules/architecture.md`
("Analytical read") and `analytics/queries/`.

## Volume queries paginate by keyset cursor

Pagination over a large table uses a composite keyset cursor `(timestamp, id)`:
the next page is a `WHERE` comparison against the cursor, ordered by
`timestamp DESC, id DESC`, with `take`. The predicate is built from the Prisma
query builder's operators, not the `cursor` argument — that argument compiles
to correlated subqueries and a sequential scan.

A **depth-scaling** `OFFSET` — one that grows as the caller pages deeper — is
never used: its cost grows with the offset because the database still scans and
discards the skipped rows. The fixed `OFFSET 0` that Prisma's `findMany` always
appends to the SQL is not that offset and is not a violation; the keyset
`WHERE` is what advances the page.

The predicate is written in the sargable form
`timestamp <= :ts AND (timestamp < :ts OR id < :id)` so the timestamp bound is
an index range condition, not a filter applied from the top of the table. The
`EXPLAIN ANALYZE` check for a deep cursor must show an `Index Cond` on
`timestamp` — not `Rows Removed by Filter` in the thousands. This access path
has its own `(timestamp DESC, id DESC)` B-tree (ADR 0003); the BRIN index on
`timestamp` cannot serve an ordered scan.

See `@.claude/rules/frontend.md` ("Table") for the cursor shape and ADR 0009
for the query shape.

## Indexes follow the access pattern and are verified

An index is chosen from how the query filters and orders, not added by
reflex. When a query is on a hot path, its plan is checked with
`EXPLAIN ANALYZE` before the change lands. A sequential scan on a large table
is a finding to investigate — a missing or unused index, a non-sargable
predicate — not something to leave in place. BRIN and GIN indexes live in
manual SQL migrations with a comment justifying each (ADR 0003, ADR 0009).
