---
description: Generate a Definition of Done for a feature before implementing it
---

Use the `write-dod` skill to produce a Definition of Done for: $ARGUMENTS

Before writing anything, identify the ADRs in `docs/adr/` that govern this
feature and read them in full. Derive the acceptance criteria from those
obligations plus the description above.

Write `docs/features/<slug>.md` from `docs/features/_template.md` and stop.
Do not write a test, an implementation, or any other code. End by reporting
the path of the file and that it awaits review.
