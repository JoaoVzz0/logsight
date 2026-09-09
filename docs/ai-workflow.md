# AI-assisted workflow

The challenge stated that AI use is permitted and encouraged, and that the
evaluation covers how the solution is structured and how the available tools
are used. This document describes that part of the work explicitly.

## Approach

The working method is spec-driven: constraints are written before code, and
the agent operates inside them rather than deciding architecture as it goes.

Four artifacts carry the constraints:

| Artifact | Question it answers | Lifecycle |
|---|---|---|
| `docs/adr/` | Why a decision was made, and what was rejected | Written once, revised when context changes |
| `.claude/rules/` | How code is written here | Standing, applies to every file |
| `docs/features/` | What "done" means for one feature, as external behavior | One file per feature, approved before implementation |
| `.claude/skills/tdd-gates/` | In what order work proceeds | Standing, applies to every change |

Each feature runs `/dod` to draft its Definition of Done from the governing
ADRs, a human review of that file, then `/implement`, which turns every
`Done when` item into one failing test and drives it green through the gates.

The separation is deliberate. "PostgreSQL was chosen over MongoDB" is a dated
decision with alternatives — an ADR. "A query file exports one function" is a
permanent constraint with no alternative to weigh — a rule. Merging them
would make both harder to read.

`CLAUDE.md` is the entry point that binds them together.

## Rules are checkable, not aspirational

A rule that says "follow SOLID" is unusable by a person and by an agent. Each
principle is expressed as something that can be verified:

| Principle | Rule as written |
|---|---|
| Single responsibility | A file in `queries/` exports one query function |
| Dependency inversion | `core/` does not import from `infra/` — ESLint-enforced |
| Open/closed | A new log source is a new file in `adapters/`, no pipeline change |
| Don't repeat yourself | Token regexes live only in `shared/lib/tokenizer` |

Where tooling can enforce a rule, tooling enforces it. `tsc --strict`, ESLint
`no-restricted-imports` on the architecture boundary, and Prettier cover
everything they can reach. Prose rules cover only what they cannot.

## Gates

Every behavioral change runs through five gates: contract, red, green,
static, review. No gate is entered before the previous one is green.

The gates exist because the default behavior of a coding agent is to write
an implementation first and a test afterwards, if at all. Gate G1 makes the
failing test a precondition rather than a follow-up.

Gate G0 also holds a scope check: no new dependency without a stated
justification. Without it, an agent tends to add a library per problem, which
would quietly contradict the decisions recorded in the ADRs.

## Coverage is scoped on purpose

Test-first is mandatory in `core/` and in the query layer, where the logic is
pure and tests are cheap to write. Frontend components have no unit tests;
the interface is covered by a single end-to-end test of the critical path.

Uniform coverage inside a three-day budget produces uniformly shallow tests.
Concentrating the effort where correctness is hard — message normalization,
severity mapping, cursor pagination across a shared timestamp — was the
deliberate trade.

## Division of work

Delegated, because the contract was already specified:

- Source adapters after the first one, following the interface in ADR 0004
- The synthetic log generator used to produce test data
- UI components: dashboard cards, skeletons, empty and error states
- Docker configuration and scaffolding

Written or reviewed line by line, because they carry the load of the design:

- The fingerprint normalizer (ADR 0005)
- Index strategy and the analytical queries (ADR 0003, ADR 0009)
- The composite cursor and its boundary behavior
- The streaming ingestion pipeline

The dividing line is whether the decision inside the code is defensible on
its own terms. Anything that cannot be explained is treated as a defect
regardless of whether it works.

## Verification

Tests are the contract that makes delegation safe. The four written first —
adapter fixtures, fingerprint grouping cases, cursor collision, and the
critical-path E2E — are also the four that would catch a plausible regression
introduced by a later change.

The commit history is intentionally granular so that the sequence of work is
readable, not just its result.
