---
description: Implement a feature from its approved Definition of Done, running the TDD gates
---

$ARGUMENTS is the slug of a Definition of Done in `docs/features/`.

Read `docs/features/$ARGUMENTS.md`. If it does not exist, stop and tell the
user to run `/dod` for this feature first.

Otherwise, use the `tdd-gates` skill against that file, starting at G0. Run
G0 through G4 in sequence: one failing test per `Done when` item, then the
minimum implementation, then static checks, then review and the checkbox
update in the DoD file.
