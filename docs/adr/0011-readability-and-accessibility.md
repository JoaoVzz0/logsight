# ADR 0011 — Log readability and accessibility

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The problem the platform solves is not storing logs — it is reading them.
Raw logs are free text: identifiers, addresses and durations mixed into
the message, with no visual hierarchy, no alignment, no separation between
what varies and what is constant.

A table that just displays the file's lines as HTML solves nothing that
`cat` did not already solve. The decisions below treat readability and
accessibility as a product requirement, not a finishing touch.

## Decision

### The fingerprint tokenizer is also the visual highlighter

ADR 0005 defines normalization rules that identify UUID, IP, number,
hexadecimal, timestamp, path and email within the message, in order to
compute the grouping signature.

**The frontend consumes the typed spans produced by that normalization**
and chooses the visual representation of each kind. There is no separate
highlighting regex, and the message is not re-parsed at the presentation
layer: the span's kind has already been decided. Identifier, numeric value
and cause receive distinct visual treatment:

```
User 8f3a-21b failed login from 192.168.1.44 after 3200ms — upstream refused
     └ id                       └ ip                └ duration  └ cause
```

One function, two uses: it groups on the backend, gives visual structure
on the frontend. The platform does not receive ready-made structure — it
**infers** structure and displays it.

Tokenization is memoized per line or applied as data arrives, never
recomputed on every scroll frame.

### In the issues list, show the pattern, not the sample

The issue shows the normalized form, with variable spans styled as
elements distinct from the fixed text. The brackets below are this
document's notation, not the stored value — the choice of delimiter, or of
none, is a rendering decision (ADR 0005):

```
User ⟨id⟩ failed login from ⟨ip⟩ after ⟨num⟩ms
47,291 occurrences · 3 services · first seen 3 days ago
```

This is the readable representation of the problem. The concrete
occurrence belongs to the detail view, not the list.

### Attributes as a clickable table, never raw JSON

The `attributes` field (JSONB, ADR 0002) is rendered as key/value pairs.
Clicking a value **adds the corresponding filter** and writes it to the
URL (ADR 0010).

This is what turns "I saw an error" into "I saw every error in this
region" with one click, and it is what gives interface value to the
JSONB, not just storage value. The original JSON remains available in a
collapsed section, with a copy action — this is the `raw` field, present
for auditing without cluttering the reading experience.

### Density and alignment

- Monospaced font in the log body; fixed-width columns
- `font-variant-numeric: tabular-nums` on numbers, so the eye can scan the
  column vertically without re-reading
- Severity as a **left-edge stripe**, not the whole colored row — a fully
  colored row becomes noise at high density
- Relative time visible, absolute time in the `title`
- Fixed header while scrolling

### Progressive disclosure

Closed row: severity, time, service and truncated message.
Detail panel: full tokenized message, attributes as a table, linkable
`trace_id` and collapsed original JSON.

`trace_id` filters every record from the same trace, across services —
distributed correlation making use of the field already provided for in
the canonical model.

### Accessibility

**Virtualized list.** The DOM only contains the visible rows, so a screen
reader would announce "row 1 of 30" for a set of hundreds of thousands.
The container declares `role="grid"` with a real `aria-rowcount`, and each
row declares `aria-rowindex`. This is the specific trap of virtualized
tables and it is handled explicitly.

**Severity never by color alone.** Color, text label and a distinctly
shaped icon (triangle for error, circle for warning). About 8% of men have
some form of color perception deficiency, and an error panel that relies
on red and yellow is unusable for them.

**Contrast verified in both themes.** Severity tokens are checked against
each theme's background; Tailwind's default red on a medium gray
background often falls below 4.5:1.

**Keyboard navigation.** Arrow keys traverse the table, `Enter` opens the
detail, `Esc` closes it. Focus is always visible — the outline is not
removed without a replacement.

**`aria-live="polite"`** on import progress, to announce completion
without interrupting.

**`prefers-reduced-motion`** disables panel-opening transitions.

## Alternatives considered

**Display the message as plain text, with no tokenization.** Simpler and
with no risk of incorrect highlighting. Discarded because it is exactly
the problem the platform sets out to solve.

**A frontend-only tokenizer, separate from the fingerprint one.** Would
allow richer highlighting rules than grouping needs. Discarded for
duplicating domain rules in two places, with the risk of divergence.

**Syntax highlighting via a generic library** (Highlight.js, Prism).
Discarded for being oriented toward programming languages, not log
formats.

**Render attributes as formatted JSON.** More faithful to the original
data. Discarded for not allowing click-to-filter interaction, which is
what accelerates exploration.

**Fixed severity colors across the whole row.** Common in older tools.
Discarded for hurting readability at high density.

## Consequences

**Positive**
- The normalization rule has a single owner and two consumers.
- Filter-based exploration is accessible in one click, with no query
  typing.
- The interface is usable by keyboard and screen reader, including the
  hard case of the virtualized list.

**Negative**
- Incorrect highlighting is possible when the token heuristic is wrong;
  the text remains readable, just without proper emphasis.
- `aria-rowcount` in a virtualized list requires attention on every
  pagination change, and is easy to break during refactoring.
- Verifying contrast in both themes is manual work, with no automation in
  this scope.

## Revisit when

The set of sources grows to the point where the token rules diverge
between grouping and highlighting — at which point the shared tokenizer
would need to expose two modes instead of one.
