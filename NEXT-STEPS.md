# Next steps

Scaffold only — no application code yet. Suggested order, following the gates
in `.claude/skills/tdd-gates/SKILL.md`.

## Before writing code

1. `cp .env.example .env`
2. `pnpm install`
3. `docker compose up postgres redis -d` — confirm both are healthy now, not
   on day three
4. Verify the boundary rule actually fires: add an import of `@prisma/client`
   inside a file under `domains/*/core/`, run `pnpm check`, confirm it fails,
   then remove it
5. Commit the scaffold and the docs before any implementation, so the history
   shows constraints came first

## Day 1 — ingestion end to end

- `shared/lib/tokenizer` — token regexes, test-first (ADR 0005)
- `domains/ingestion/core` — `LogRecord`, `Severity`, `Fingerprint`
- `domains/ingestion/infra/adapters` — GCP adapter with a real fixture
- Prisma migration, plus the manual SQL migration for BRIN and GIN (ADR 0003)
- Streaming pipeline: read, normalize, batch insert, upsert issues
- A synthetic log generator to produce test files

## Day 2 — issues and the table

- Issue aggregate with its state transitions (ADR 0008)
- `POST /imports`, job status endpoint, BullMQ worker
- Issues list, filters in the URL, virtualized log table with the composite
  cursor (ADR 0010)

## Day 3 — dashboard and delivery

- Analytics queries: error rate, new issues, spikes, distribution by service
- Dashboard cards, one query each
- Empty, error and loading states on every surface
- Docker compose verified from a clean clone
- README, screenshots, final pass over the ADRs

## Trim first, if time runs short

Side panel becomes a modal, then the import history loses live progress, then
the nginx and syslog adapters are dropped. Do not trim: the issues screen,
the virtualized table, or the empty/error/loading states.

## Keep the docs honest

The ADRs promise the ESLint boundary rule, `aria-rowcount` on the virtualized
list, the composite cursor, and contrast checked in both themes. Anything not
implemented gets edited out of its ADR before delivery. A document that
overstates the code is worse than a missing feature.
