---
description: Run static checks and tests, reporting which step failed
allowed-tools: Bash(pnpm check:*), Bash(pnpm test:*)
---

Run the project gate in two steps and report the outcome concisely.

1. Run `pnpm check`.
2. If step 1 passed, run `pnpm test`.

Reporting rules:

- If both steps pass, report `gate: pass` on one line, followed by a
  one-line summary for each step.
- If a step fails, stop at that step and report `gate: fail at <step>`,
  where `<step>` is `check` or `test`, followed by the relevant error
  lines from that step only. Do not run later steps.
- Keep the output short: the verdict, the failing step, and the minimal
  evidence needed to locate the failure.
