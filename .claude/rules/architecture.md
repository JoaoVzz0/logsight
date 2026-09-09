# Architecture rules

Operational form of ADR 0008. The ADR explains why; this document states what
is enforced.

## Dependency direction

```
http/  ─┐
worker/─┼─→ application/ ─→ core/
infra/ ─┘         │            ↑
                  └─→ ports/ ──┘
```

`core/` and `application/` are the inside. Everything else points inward.

## Enforced by ESLint

`no-restricted-imports`, scoped to `src/domains/*/core/**` and
`src/domains/*/application/**`:

- No import from `**/infra/**`, `**/http/**`, `@/platform/**`
- No import of `fastify`, `@prisma/client`, `bullmq`, `ioredis`

The build fails on violation. This is the boundary — not a convention.

## Consequences to expect

Because `core/` cannot import `@prisma/client`, domain types are not Prisma
generated types. Conversion between the persisted row and the entity happens
in the repository implementation, inside `infra/`. This is the only mapper in
the project and it is the direct cost of the boundary.

## Module shape

```
domains/<name>/
├─ core/         entities, value objects, domain services
├─ ports/        interfaces
├─ application/  use cases / application services
├─ infra/        port implementations
└─ http/         Fastify routes
```

`logs/` and `analytics/` intentionally have only `queries/` and `http/`.
They are read projections, not bounded contexts — they have no invariant to
protect, so they get no `core/`. Adding one there is over-application, not
consistency.

## Cross-module access

Modules communicate through public use cases, never by importing another
module's `core/`. `ingestion` calls `issues.recordOccurrences()`; it does not
construct an `Issue`.

## Ports

Create an interface only when there are at least two plausible
implementations. Current ports and their implementations:

| Port | Implementations |
|---|---|
| `LogSourceAdapter` | GCP, CloudWatch, JSON Lines, nginx |
| `JobQueue` | BullMQ now, Pub/Sub as the documented evolution |
| `FileStorage` | local filesystem, GCS signed URL |
| `IssueRepository` | PostgreSQL, in-memory for tests |

A single-implementation interface with no plausible second is decorative
abstraction. Do not add one.

## Where logic belongs

| Kind of logic | Location |
|---|---|
| Rule owned by one concept | entity or value object |
| Rule with no single owner | `core/services/` (domain service) |
| Sequencing of steps | `application/` (application service) |
| Contract with the outside | `ports/` |
| Concrete implementation | `infra/` |
| Analytical read | `queries/`, SQL projected straight to a DTO |

Business rules do not live in application services. An application service
that decides something instead of orchestrating is producing an anemic
domain model.

## Read and write are asymmetric

Writes go through the domain. Reads project SQL directly to the response
shape without hydrating entities. This is deliberate — see ADR 0008 and
ADR 0009. Do not "fix" the asymmetry by routing dashboard queries through
repositories.

## API contract

Operational form of ADR 0012. The generated OpenAPI document is the single
contract; the frontend consumes a client generated from it.

- Every Zod request and response schema declared on a route carries an
  explicit identifier, so the generated types read as `LogListResponse`, not
  `_Get_logs_Response`.
- Response schemas avoid refinements and coercions that do not translate to
  JSON Schema. When a value needs coercion, it is coerced in the query layer,
  not in the response schema.
- The frontend never writes a manual `fetch` against the API. Every call goes
  through the generated client.
- `packages/api-client/src` and `packages/api-client/openapi.json` are
  generated artifacts and are never edited by hand. Regenerate with
  `pnpm generate:client` after changing a route.
