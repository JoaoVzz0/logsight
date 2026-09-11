# Architecture Decision Records

This directory records the relevant architectural decisions of the project,
in ADR (Architecture Decision Record) format.

Each ADR answers three questions: what was the context, what was decided,
and what was discarded and why. The goal is not to justify choices after
the fact, but to make the reasoning explicit — including where the decision
was a conscious trade-off against the challenge's deadline.

## Format

Each record follows the structure:

- **Context** — the force that motivated the decision
- **Decision** — what was chosen
- **Alternatives considered** — what was evaluated and discarded
- **Consequences** — what we gained and what we paid
- **Revisit when** — the trigger that invalidates the decision

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-application-stack.md) | TypeScript end to end, with Fastify on the backend | Accepted |
| [0002](0002-canonical-log-model.md) | Canonical log model based on OpenTelemetry | Accepted |
| [0003](0003-postgresql-as-primary-store.md) | PostgreSQL with JSONB as the primary store | Accepted |
| [0004](0004-adapters-per-source.md) | Adapters per source, with automatic format detection | Accepted |
| [0005](0005-fingerprint-grouping.md) | Grouping events by fingerprint | Accepted |
| [0006](0006-asynchronous-ingestion.md) | Asynchronous ingestion, in-process behind a `JobQueue` port | Accepted |
| [0007](0007-execution-and-deployment.md) | Docker Compose as delivery, cloud as demonstration | Accepted |
| [0008](0008-domain-architecture.md) | Modular monolith with hexagonal core | Accepted |
| [0009](0009-data-access.md) | Prisma as the access layer, with raw SQL in aggregations | Accepted |
| [0010](0010-frontend-architecture.md) | Frontend architecture: URL as state, virtualized table | Accepted |
| [0011](0011-readability-and-accessibility.md) | Log readability and accessibility | Accepted |
| [0012](0012-api-contract.md) | API contract via generated OpenAPI, with a client versioned in the repository | Accepted |

ADR 0001 was revised after the initial decision for NestJS was reconsidered;
the current version records the choice of Fastify and the reason for the
change.

## Time scope

All decisions were made under the constraint of **3 calendar days**. Where
this constraint was determinant, the ADR says so explicitly instead of
pretending the choice would be the same without a deadline.
