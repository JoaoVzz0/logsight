---
name: tdd-gates
description: Test-first workflow with sequential gates for this repository. Use for any task that adds or changes behavior in src/ — a new adapter, a domain rule, a query, an endpoint, a worker step. Do not use for pure documentation edits, dependency bumps, or formatting.
---

# Test-first gates

Behavior is added one gate at a time. **No gate is entered before the
previous one is green.** The default failure mode of a coding agent is
jumping straight to implementation; these gates exist to prevent that.

State the gate you are entering before doing the work in it.

The approved Definition of Done is the only manual approval in this workflow.
Once a DoD exists in `docs/features/` and the user has approved it, G0
through G4 run in sequence with no per-gate confirmation.

---

## G0 — Contract

Before any code:

1. Confirm an approved DoD exists at `docs/features/<slug>.md`. If it does
   not, stop and tell the user to run `/dod` for this feature first. Do not
   invent acceptance criteria here.
2. Name the ADR that governs this change. If none applies, say so explicitly
   rather than assuming.
3. Name the rule file that applies (`.claude/rules/`).
4. Define the shape: the interface, the Zod schema, or the function
   signature. Types before behavior.
5. If the change needs a new dependency, state the dependency, what it
   replaces, and roughly how many lines it saves. Fewer than fifty lines is
   not a justification. **Wait for approval before installing.**

Stop and raise it if the task appears to require violating an ADR or a rule.
Do not route around the constraint.

**Exit:** the approved DoD is named, the contract is written, and the
governing documents are named.

---

## G1 — Red

Translate the DoD into failing tests. This step is mechanical, not a
judgement call.

- Write exactly one test per item under `Done when`. No item is skipped and
  no extra test is added for behavior the DoD does not list.
- Every test fails at this point, and each fails for the right reason — run
  them and confirm the failure message matches the intent, not a typo or a
  missing import.
- Each test expresses the observable behavior in its DoD item, never an
  implementation detail.
- Test placement follows `.claude/rules/testing.md`: mandatory in `core/`,
  fixture-driven in `infra/`, in-memory fakes in `application/`, none for
  frontend components.

If a DoD item cannot be expressed as a single failing test, stop and return
to `/dod` — the criterion is wrong, not the test.

**Exit:** one failing test per `Done when` item, each failing for the
intended reason.

---

## G2 — Green

Write the minimum implementation that passes.

- No speculative generality, no configuration option nobody asked for
- No abstraction introduced "for later" — the third occurrence justifies
  extraction, not the first
- No new port unless a second implementation is plausible today

**Exit:** the test passes; no previously passing test broke.

---

## G3 — Static

```bash
pnpm check
```

`tsc --strict` and ESLint, including the import boundary rules from
`.claude/rules/architecture.md`.

Never satisfy the type checker with `any`, a non-null assertion, or a cast to
silence it. If the types resist, the design is wrong — return to G0.

An ESLint boundary violation is never suppressed with an inline disable
comment. It means the code is in the wrong layer.

**Exit:** `pnpm check` passes with no suppressions added.

---

## G4 — Review

Read the diff against `.claude/rules/`, specifically:

- **Comments.** No inline commentary, no section banners, no commented-out
  code, no redundant JSDoc. If a comment explains *what*, extract a named
  function instead. English only.
- **Boundaries.** Nothing in `core/` knows about a framework or a driver.
- **Naming.** Names carry the intent that a comment would otherwise carry.
- **Duplication.** Third occurrence extracted, second left alone.
- **Errors.** Domain errors are typed; adapters translate at the boundary.

Refactor now, with the test as the safety net. This is the only gate where
restructuring is free.

Then check off every satisfied item in `docs/features/<slug>.md`, changing
`- [ ]` to `- [x]`. An item is checked only when its test passes. If any
item is still unchecked, the feature is not done.

**Exit:** the diff conforms, tests still pass, and every `Done when` item is
checked.

---

## Commit

One commit per completed gate sequence, in `type: description` format,
English, imperative mood. The commit body notes any ADR or rule the change
touches.

Do not batch unrelated changes into one commit — the history is part of the
deliverable.

---

## When a gate cannot be satisfied

Say so and stop. Three legitimate outcomes:

- The task is underspecified — ask for the missing constraint
- The task conflicts with an ADR — surface the conflict, propose revisiting
  the ADR
- The task is larger than one gate sequence — split it and run the gates per
  slice

Silently proceeding past a failed gate is the one prohibited outcome.
