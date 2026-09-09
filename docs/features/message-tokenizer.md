# Message tokenization

Splits a log message into an ordered sequence of fixed text and typed
variable spans. Single definition site for the token rules, consumed by the
fingerprint and by the frontend highlighter.

## Governed by

- ADR 0011 — Log readability: the same token rules that group in the backend
  produce the visual structure in the frontend, from one definition site.
- ADR 0005 — Event grouping: names the variable kinds that must be
  recognized.
- ADR 0004 — Adapters per source: malformed input is handled, never thrown.

## Done when

- [x] Tokenizing returns an ordered sequence of spans, each either fixed text
      or a variable span carrying its kind.
- [x] Concatenating the returned spans reproduces the input character for
      character, whitespace and letter case included.
- [x] A UUID is recognized as a single variable span.
- [x] An IPv4 address is recognized as a single variable span.
- [x] An IPv6 address is recognized as a single variable span.
- [x] A standalone number is recognized as a single variable span.
- [x] A long hexadecimal value is recognized as a single variable span.
- [x] A timestamp is recognized as one variable span rather than a sequence
      of number spans.
- [x] An e-mail address is recognized as a single variable span.
- [x] The content of a quoted value is recognized as a single variable span,
      with the quotes remaining fixed text.
- [x] A path containing an identifier keeps its fixed segments as fixed text
      and marks only the identifier as variable, so two different routes do
      not tokenize alike.
- [x] Where two token patterns could match the same region, the longer match
      wins and the shorter one does not split it.
- [x] A message with no variable value returns a single fixed text span.
- [x] An empty message returns an empty sequence.
- [x] Tokenizing any string — control characters, invalid encoding, very long
      lines — returns a result instead of raising.
- [x] Tokenizing the same input twice returns the same sequence, independent
      of process or ordering.

## Out of scope

- Composing the signature from the spans, which belongs to the fingerprint
  (see `message-fingerprint.md`).
- Frontend rendering of the spans: colors, placeholder styling, icons
  (ADR 0011).
- Any second set of token regexes anywhere in the tree. A duplicate
  definition contradicts ADR 0011 and the reuse rule in
  `.claude/rules/code-style.md`.
- Capping or truncating very long bodies. Raised during the interview and
  left undecided; it needs a measurement first.
- Semantic or similarity based token detection, rejected in ADR 0005.

## Notes

ADR 0005 writes placeholders as `<uuid>` and ADR 0011 writes them as `⟨id⟩`.
Both are notation, not a stored format: tokenization returns typed spans, and
any bracket form is a rendering choice made downstream.

Preserving the input exactly is what allows the frontend to highlight the
message it displays. Whitespace collapsing belongs to the fingerprint, not
here.
