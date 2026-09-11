# ADR 0001 — TypeScript end to end, with Fastify on the backend

- **Status:** Accepted
- **Date:** 2026-09-08
- **Replaces:** previous version of this decision, which adopted NestJS

## Context

The challenge requires a ReactJS frontend and a Python or Node.js backend,
without restricting the framework. The evaluation criteria include project
organization, architecture, performance, error handling and validation.

The weight of the work in this project **is not in the HTTP layer**. There
are around ten endpoints. The real effort is in three places: the
normalization and grouping pipeline, the analytical queries with their
indexing strategy, and the high-volume frontend. The framework choice
should minimize time spent outside these three.

A second factor weighs equally: import processing runs in a **separate
worker** (ADR 0006), not in an HTTP request. The domain needs to be
consumable by both processes without bootstrap ceremony.

## Decision

TypeScript on both ends:

- **Frontend:** React with Vite, TanStack Query for server state,
  TanStack Virtual for the high-volume table, Recharts for charts.
- **Backend:** Node.js with **Fastify**, `fastify-type-provider-zod` for
  validation and types at the HTTP boundary, `@fastify/swagger` for OpenAPI.
- **Data access:** Prisma (see ADR 0009).
- **API contract:** the OpenAPI document generated from the Zod schemas is
  the single source, and the frontend consumes a client generated from it
  (see ADR 0012).

The worker is a plain Node process that imports the same domain functions,
without instantiating an HTTP server or a dependency injection container.

## Alternatives considered

### NestJS

This was the initial choice and it was reverted. In favor: project
structure already decided, exception filters and validation pipe covering
two evaluation criteria, first-class integration with BullMQ.

Discarded for three reasons.

**The scale at which NestJS pays off is not reached here.** The structural
return shows up with many endpoints and multiple teams. With ten endpoints
and one developer, you pay the ceremony cost without reaping the benefit.

**The structure would stop being evidence.** In a NestJS project, the
folder organization is what the CLI generated — it does not distinguish
someone who designed layers from someone who followed the framework's
pattern. Since "architecture" and "project organization" are explicit
evaluation criteria, a deliberately chosen structure communicates more
(see ADR 0008).

**The worker would end up coupled to the DI container.** Running processing
outside a request would require `NestFactory.createApplicationContext()`.
With Fastify, the domain is plain TypeScript and the worker just imports
it — which is also the architectural decision of ADR 0008, not just
convenience.

What is lost by leaving NestJS out — validation, error handling and
automatic documentation — is recovered with Zod, a global
`setErrorHandler` and `@fastify/swagger`, without the rest of the ceremony.

### Express

Discarded. It is the weakest of the three against the evaluated criteria:
no native validation, does not propagate async errors without a wrapper,
and offers no schema generation. There is no advantage that offsets that.

### Python (FastAPI)

Richer ecosystem for data processing, and Pydantic is excellent for
validation. Discarded because the type shared between front and back is
the main coherence gain in this domain, and because the heavy work here is
I/O — reading a large file, batch inserting — not CPU.

### Next.js unifying front and back

Deliberately discarded: the brief assumes distinct containers and a
backend consumable independently. Merging the layers would make the
boundary less legible for evaluation.

## Justification that does NOT apply

Fastify **was not** chosen for routing performance. The bottleneck of this
application is PostgreSQL and file parsing; the HTTP throughput difference
between frameworks is irrelevant at the p95 of this system. Recording this
avoids a justification that would not hold up under scrutiny.

## Consequences

**Positive**
- The domain is free of framework, and the worker consumes it without
  bootstrap.
- A single Zod schema serves as validation, backend type, frontend type
  and OpenAPI documentation.
- The project structure is an explicit, defensible decision (ADR 0008).

**Negative**
- Structure, error handling and test organization need to be decided
  rather than inherited. Mitigated by fixing them in ADR 0008 before
  writing code.
- Without the framework's dependency injection, dependency composition is
  manual — acceptable at the current scale, and explicit as a result.

## Revisit when

The number of business contexts grows to the point where manual dependency
composition becomes cumbersome, or when more than one team starts working
in the same repository — a scenario where the uniformity imposed by an
opinionated framework becomes worth more than the ceremony savings.
