# Code style

Enforced by `tsc --strict`, ESLint and Prettier where possible. This document
covers what tooling cannot check.

## Comments

**The code is the explanation. Comments are the exception.**

Never write:

- Inline commentary restating what the next line does
  (`// increment counter`, `// fetch the user`)
- Section banners (`// ---- helpers ----`)
- Commented-out code — delete it, git remembers
- Redundant JSDoc that repeats the signature in prose
- `TODO` or `FIXME` without a linked issue

Write a comment only when the **why** cannot be inferred from the code:

- A non-obvious constraint from an external system
- A workaround, with the reason it exists
- A deliberate deviation from an ADR or rule, with the justification

If a comment is needed to explain **what** the code does, the code is wrong.
Extract a function with a descriptive name instead.

### JSDoc

Reserved for functions whose contract is genuinely non-obvious: complex
algorithms, security-sensitive parsing, or exported APIs where the parameter
semantics are not evident from types.

Examples in this project that warrant JSDoc: the fingerprint normalizer, the
adapter confidence scoring, the composite-cursor comparison.

```ts
/**
 * Replaces variable tokens (uuid, ip, number, timestamp, path, email) with
 * placeholders so that structurally identical messages hash to the same
 * fingerprint. Order matters: longer patterns are substituted first to avoid
 * a partial match swallowing a wider one.
 */
export function normalizeMessage(body: string): string
```

Do not JSDoc a function whose name and types already say everything.

## Language

All comments, identifiers, commit messages and documentation in English.

## Naming

- Files: `kebab-case.ts`
- Types and classes: `PascalCase`
- Functions and variables: `camelCase`
- No `I` prefix on interfaces — `IssueRepository`, not `IIssueRepository`
- No abbreviations except widely understood ones (`id`, `url`, `db`)
- Boolean names read as predicates: `hasNextPage`, `isResolved`

## Functions

- One level of abstraction per function. Mixing orchestration with parsing
  detail is a signal to extract
- Prefer early return over nested conditionals
- Arguments beyond three become an options object
- No default export except where a framework requires it

## Errors

- Domain errors are typed classes extending a shared base, carrying a stable
  `code`
- Never throw a bare string or a plain `Error` from `core/`
- Adapters translate infrastructure errors into domain errors at the boundary
- A parse failure on a single log line is a recorded `ParseError`, never a
  thrown exception — see ADR 0004
- HTTP layer maps domain error codes to status codes in one place

## Reuse

- A rule of thumb: extract on the third occurrence, not the second
- Shared domain logic lives in `shared/` only when used by more than one
  domain; otherwise it stays in its own domain
- The token regexes have exactly one home, `shared/lib/tokenizer`, consumed by
  both the fingerprint and the UI highlighter (ADR 0011)
- No barrel files (`index.ts` re-exporting a folder) — they obscure the
  dependency graph the architecture rules depend on

## Dependencies

No new dependency without a recorded justification. Prefer the standard
library, then an existing dependency, then a new one. A dependency added to
save fewer than roughly fifty lines is not worth its supply chain.
