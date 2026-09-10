# logview

Log analysis platform. Imports logs from heterogeneous sources, normalizes
them into a canonical model, groups occurrences by signature, and exposes
query and dashboard surfaces.

> Scaffold. Implementation starts at the ingestion core — see
> `docs/adr/0002` and `docs/adr/0005`.

## Running

```bash
cp .env.example .env
docker compose up
```

Web on `http://localhost:5173`, API on `http://localhost:3333`.

Local development without containers:

```bash
pnpm install
docker compose up postgres redis -d
pnpm --filter backend prisma:migrate
pnpm dev
```

After changing an API route or its schema, regenerate the typed client the
frontend consumes:

```bash
pnpm generate:client
```

This dumps the OpenAPI document from the backend to
`packages/api-client/openapi.json` and regenerates `packages/api-client/src`.
Commit the result with the route change. Interactive API documentation is
served at `http://localhost:3333/docs` via `@fastify/swagger-ui`.

## Synthetic log data

Generate a synthetic log file to exercise the platform under volume:

```bash
pnpm generate:logs --lines 1000000 --format json-lines --out big-sample.jsonl
```

- `--lines` defaults to `100000`, `--format` to `json-lines`
  (`gcp`, `cloudwatch`, `json-lines`), `--out` to `big-sample.<ext>`.
- Output is written as a stream, so a million lines takes seconds.
- Records vary by service, severity and variable values (ids, ips,
  durations) so normalization produces many distinct fingerprints, with a
  fraction of degenerate records (missing severity, empty body) and
  timestamps spread over the last seven days.

When only the containers are running, invoke the compiled script inside the
API container:

```bash
docker compose exec api node dist/scripts/generate-logs.js --lines 1000000 --format gcp
```

## Documentation

- `docs/adr/` — architectural decisions, with the alternatives considered
- `.claude/` — the rules, skills and commands the agent operates under; see `docs/ai-workflow.md`
- `docs/ai-workflow.md` — how AI was used and what was verified

## Quality gates

```bash
pnpm check      # tsc --strict && eslint, including the domain boundary rule
pnpm test       # unit and integration
pnpm test:e2e   # critical path
```

`pnpm check` must pass before any commit.

## Structure

```
backend                  fastify + worker, hexagonal core (docs/adr/0008)
frontend                 react, vite
packages/api-client      generated OpenAPI client, the API contract (docs/adr/0012)
packages/domain-constants domain constants shared across both (OTel severity scale)
```
