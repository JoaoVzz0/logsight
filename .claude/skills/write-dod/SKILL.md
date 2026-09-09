---
name: write-dod
description: Produce a Definition of Done for a feature before any implementation, running a short interview to close the gaps the ADRs leave open. Use when the user asks for acceptance criteria, a Definition of Done, or "what needs to be ready" for a feature before implementing it. Reads the governing ADRs, interviews only about undecided behavior, writes docs/features/<slug>.md, and stops for review.
---

# Write a Definition of Done

The output is a single file, `docs/features/<slug>.md`, listing what must be
true for the feature to be done. It is written before any test or
implementation and handed back for review.

Every criterion is behavior observable from outside the system, and each
maps to exactly one test. Implementation choices — algorithm, library,
internal structure — are never criteria.

This skill ends when the file is written. It never writes a test, an
implementation, or any application code.

---

## Procedure

Run these six steps in order.

### 1. Read the governing documents

Identify the records in `docs/adr/` that govern the feature and read them in
full. Also read the relevant files in `.claude/rules/` when the feature
touches a layer boundary or data access.

### 2. Draft the criteria the ADRs already decide

List, for yourself, the criteria that follow directly from obligations the
ADRs already impose — an index that must exist, an error that must be
recorded rather than thrown, a state transition that must be legal, a
boundary that must hold. These are settled. They are not put to the user.

### 3. Name the gaps

Identify the behavioral decisions the feature requires that no ADR covers.
Present this list of gaps to the user before asking anything, so they can
confirm or correct the scope.

### 4. Interview the user about the gaps, and only the gaps

Skip this step entirely when there are no gaps — see *When not to
interview*.

Rules for the interview:

- One question at a time. Wait for the answer before the next.
- At most five questions. Stop earlier once the gaps are closed.
- Every question is about externally observable behavior — never about
  implementation, algorithm, or library.
- Prefer concrete cases: a specific input, the expected output, what happens
  in the degenerate case.
- Prioritize edge cases, error conditions, and what to do when the input is
  malformed or partial.
- Never ask about something an ADR already decides. If an answer contradicts
  an ADR, flag the conflict and ask for an explicit decision rather than
  accepting it silently.
- Do not suggest the answer inside the question.

### 5. Write `docs/features/<slug>.md`

Derive `<slug>` from the feature name in `kebab-case`. Follow
`docs/features/_template.md`: title, `Governed by`, `Done when` as
checkboxes, `Out of scope`, optional `Notes`. Combine the criteria from
step 2 with the interview results from step 4.

- Each criterion is observable from outside and translates into exactly one
  test. If a criterion needs two tests, split it.
- Do not specify implementation.
  - Not: "uses sha1 to generate the hash"
  - Yes: "equivalent messages produce the same identifier"
- Fill in `Out of scope` explicitly, including what the interview raised and
  the user deliberately left out.
- List every ADR consulted under `Governed by`.

### 6. Stop

Do not implement. Do not write a test. Do not write application code.

The final message states the path of the file, how many criteria it
contains, and that the DoD awaits the user's review before `/implement`.

---

## When not to interview

If every behavioral decision the feature needs is already covered by the
ADRs and the user's description, skip step 4. Say there were no gaps and go
straight to writing the file. An interview with nothing to resolve wastes
the user's time.

---

## Example

Feature described by the user: "Import GCP Cloud Logging exports."

**Settled by the ADRs (step 2), not asked:**

- Severity is mapped to the OpenTelemetry scale with the original label kept
  in `severity_text` (ADR 0002).
- The original record is stored verbatim in `raw` (ADR 0002).
- A line that fails to parse becomes a counted `ParseError` with its line
  number, and the import continues (ADR 0004).

**Gaps the ADRs do not cover (step 3), taken to the interview:**

1. A `LogEntry` can carry `textPayload`, `jsonPayload`, or neither. Which one
   becomes `body`, and what is `body` when both are present?
2. A `LogEntry` may omit `timestamp` and carry only `receiveTimestamp`.
   Which one is the event time then?
3. GCP `severity` may be absent or `DEFAULT`. What severity does the record
   get?

**Resulting `Done when` items (step 5), in final form:**

- [ ] A `LogEntry` with a `textPayload` produces a record whose `body` is
      that text.
- [ ] A `LogEntry` with only a `jsonPayload` produces a record whose `body`
      is that payload rendered as a single string, with the structured
      payload also available under `attributes`.
- [ ] A `LogEntry` carrying both payloads produces a record whose `body`
      comes from `textPayload`.
- [ ] A `LogEntry` without a `timestamp` produces a record whose event time
      equals its `receiveTimestamp`.
- [ ] A `LogEntry` with `severity` absent or `DEFAULT` produces a record
      whose normalized severity is the lowest defined level.

Each line above is checkable by one test and says nothing about how the
adapter works internally. The implementation-level statements it deliberately
avoids — "serialize the payload with `JSON.stringify`", "map `DEFAULT` to
severity number 1", "pick the adapter with the highest `detect` score" — are
decisions for the gates, not the DoD.
