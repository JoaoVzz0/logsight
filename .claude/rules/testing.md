# Testing rules

## Coverage is scoped, not uniform

Test-first is mandatory where logic is pure and the cost is low. It is not
applied uniformly, because uniform coverage inside a three-day budget
produces mediocre coverage everywhere.

| Area | Approach |
|---|---|
| `core/` — entities, value objects, domain services | test-first, mandatory |
| `queries/` — analytical SQL | test against a seeded database |
| `application/` — use cases | test with in-memory port fakes |
| `infra/` — adapters | fixture-driven, real sample payloads |
| Frontend components | no unit tests |
| Critical path | one Playwright E2E |

Unit-testing React components inside this timebox has poor return. The UI is
covered by a single end-to-end test of the path that matters.

## The four highest-value tests

Written before anything else in their area:

1. **Adapter fixtures** — a real GCP `LogEntry` sample and a real CloudWatch
   export mapping to the expected `LogRecord`, including severity
   normalization.
2. **Fingerprint cases** — messages that must group together, and messages
   that must not. This is the core of the product; it gets the most cases.
3. **Cursor collision** — three records sharing one timestamp, paginated
   across the boundary, asserting no record is skipped or duplicated. This is
   the failure mode a timestamp-only cursor produces.
4. **Critical path E2E** — upload a file, the job completes, the issue
   appears in the list.

## Fixtures

- Real payload samples live in `__fixtures__/` next to the adapter they
  exercise
- One file per source format, named for its origin (`gcp-cloud-logging.json`)
- Fixtures are committed, never generated at test time
- Redact anything resembling a real credential or address before committing

## Ports in tests

Application services are tested against in-memory implementations of their
ports, never against a mocking library. Writing an in-memory
`IssueRepository` is cheap and it is also the second implementation that
justifies the port existing at all.

## Database tests

Query objects run against a real PostgreSQL instance from the compose stack,
seeded per test file and torn down after. Do not mock the database to test
SQL — the SQL is the thing under test.

## What not to test

- Framework behavior (that Fastify routes, that Prisma connects)
- Getters, constructors, or types the compiler already guarantees
- Generated code

A test that cannot fail for a real reason is maintenance cost with no return.

## Naming

```
describe('normalizeMessage')
  it('replaces a uuid with a placeholder')
  it('groups two messages differing only by ip')
  it('does not group messages from different services')
```

The test name states the behavior, not the implementation.
