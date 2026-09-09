# api-client

The single source of truth for the HTTP contract between `backend` and
`frontend`.

## Generated, never hand-edited

Both of these are build products and are committed so that a fresh clone can
build the frontend without starting the API:

- `openapi.json` — the OpenAPI document, serialized from the Fastify route
  schemas by `@fastify/swagger`.
- `src/` — the TypeScript client, generated from `openapi.json`.

Do not edit either by hand. A manual change is lost on the next generation
and diverges the contract from the backend.

## Regenerating

Run from the repository root after changing any route or its schema:

```bash
pnpm generate:client
```

This dumps the OpenAPI document from the backend and regenerates `src/` from
it. Commit the resulting diff together with the route change.
