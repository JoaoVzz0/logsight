# ADR 0012 — API contract via generated OpenAPI

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

ADR 0001 decided on TypeScript on both ends and recorded, as a positive
consequence, that "a single Zod schema serves as validation, backend type,
frontend type and OpenAPI documentation." In practice this promise was
implemented by sharing the response Zod schemas through a workspace
package (`packages/contracts`), consumed directly by the frontend.

That arrangement shares the **data shape**, but not the rest of the
contract. The route, the HTTP method, the path format, the query
parameters and the status codes stay outside the shared type. The frontend
still writes the `fetch` call by hand, and a URL or method mistake only
shows up at runtime. The shared schema gives a false sense of coverage.

At the same time, the backend already produces a complete OpenAPI document
via `@fastify/swagger`, derived from the same Zod schemas. That document
describes the entire contract, not just the response body.

## Decision

The **OpenAPI document generated from the Fastify routes' Zod schemas is
the single source of truth for the API contract.**

- The backend serializes the document with `@fastify/swagger`. The script
  `pnpm --filter backend openapi:dump` boots a Fastify instance in
  schema-only mode and writes `packages/api-client/openapi.json`.
- A TypeScript client is generated from that document into
  `packages/api-client/src/` with `openapi-typescript`.
- `pnpm generate:client`, at the root, runs the dump and the generation in
  sequence.
- `openapi.json` and the generated client are **versioned and committed**.
  A fresh clone builds the frontend without booting the API, and
  `docker compose up` keeps working from a clean repository.
- Generation is **manual**, run after changing a route, and is not part
  of the build.
- The frontend consumes only the generated client. No manual `fetch` call
  against the API.
- `packages/contracts` was renamed to `packages/domain-constants` and now
  holds only domain constants that are not transport contract — currently,
  the OTel severity scale. It no longer contains any HTTP request or
  response type.

The conventions this decision imposes on the backend's Zod schemas are in
`.claude/rules/architecture.md`, section *API contract*.

## Alternatives considered

**Zod schema shared via a workspace package.** The previous approach.
Shares the data shape, but not the route or method, leaving the `fetch`
call outside the contract. Discarded for covering only half the problem
and masking the other half.

**tRPC.** Gives the best end-to-end type safety in a TypeScript monorepo,
with no generation step. Discarded because it couples frontend and backend
to the same runtime and produces no OpenAPI document. The brief assumes a
backend that is documented and independently consumable (see ADR 0001);
having the API described by an open contract is worth more here than
tRPC's ergonomics.

**Hand-written client.** No tooling cost. Discarded because it silently
diverges from the backend: nothing guarantees the client and the routes
agree, and the divergence only shows up at runtime.

**Automatic generation on build.** Would keep the client always up to
date. Discarded for the time cost on every build and for making the
frontend build depend on the API being up, which would break the build
from a clean clone and inside `docker compose`.

## Consequences

**Positive**
- The entire contract — route, method, path, query, status, shape — is
  checked at compile time on the frontend, not just the response body.
- A single document serves as contract, frontend type and interactive
  documentation (`/docs` via `@fastify/swagger-ui`).
- The versioned client and `openapi.json` allow building the frontend
  without the API running.
- The coupling between the two ends is a generated file, reviewable in the
  diff.

**Negative**
- A generated artifact enters version control, with the diff noise that
  brings.
- Generation needs to be run after every route change. Forgetting leaves
  the client stale until someone notices — the risk is real and there is
  no automatic guard, by choice.
- The quality of the generated types depends on the Zod schemas
  translating well to JSON Schema. Refinements and coercions in the
  response schema produce poor types or lose information; the rule in
  `architecture.md` exists because of this.

## Revisit when

The number of routes grows to the point where manual generation is
forgotten frequently — a sign that generation should move into a
pre-commit hook or CI check —, or when ingestion starts exposing a surface
that OpenAPI 3.1 does not describe well (streaming, for example), in which
case part of the contract would stop fitting this mechanism.
