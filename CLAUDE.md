# CLAUDE.md

Log analysis platform. Imports logs from heterogeneous sources (GCP Cloud
Logging, AWS CloudWatch, JSON Lines), normalizes them into a canonical
model, groups occurrences by signature, and exposes query and dashboard
surfaces.

## Before writing code

1. Read the relevant ADR in `docs/adr/`. Decisions there are **constraints**,
   not suggestions.
2. Read the applicable rule in `.claude/rules/`.
3. Follow the gates in `.claude/skills/tdd-gates/SKILL.md`.

If a task appears to require violating an ADR or a rule, **stop and raise
it**. Do not work around it, do not add a local exception, do not silently
pick an alternative path. Revisiting an architectural decision is a
conversation, not a commit.

## Documents

- `@docs/adr/README.md` — index of architectural decisions
- `@.claude/rules/architecture.md` — import boundaries and dependency direction
- `@.claude/rules/code-style.md` — naming, errors, comments, reuse
- `@.claude/rules/testing.md` — what to test, how, fixture conventions
- `@.claude/rules/frontend.md` — components, state, visual tokens
- `@.claude/rules/performance.md` — batching, in-memory aggregation, keyset pagination, indexes

## Non-negotiable

Violating any of these is a bug, not a preference:

- `domains/*/core/` and `domains/*/application/` never import from `infra/`,
  `http/` or `platform/`
- `core/` never imports `fastify`, `@prisma/client`, `bullmq` or `ioredis`
- `$queryRaw` only inside `analytics/queries/`. `$queryRawUnsafe` never
- Every raw query validates its output with Zod before returning
- No literal colors in the frontend — always CSS variables
- `useEffect` only to synchronize with an external system, never to derive
  state or sync state with state
- No inline commentary in code (see `@.claude/rules/code-style.md`)
- No new dependency without a recorded justification (gate G0)
- The frontend never writes a manual `fetch` against the API — every call
  goes through the generated client (ADR 0012)
- Generated artifacts are never edited by hand — `packages/api-client/src`
  and `packages/api-client/openapi.json` come from `pnpm generate:client`

## Language

- All code, identifiers, comments, commit messages, rules and documentation
  in **English**
- No exceptions — a comment in another language is a review blocker

## Conventions

- Small, descriptive commits in `type: description` format
- One branch per working day, integrated through a pull request

## Commands

```bash
pnpm dev            # api + web
pnpm test           # vitest
pnpm test:e2e       # playwright
pnpm check          # tsc --strict && eslint
docker compose up   # full stack
```

`pnpm check` must pass before any commit.
