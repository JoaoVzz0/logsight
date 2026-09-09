# Message normalization for fingerprint

Turns a log message into a stable signature so that occurrences differing
only by variable values — an identifier, an address, a duration — are
recognized as one problem instead of thousands of unrelated events.

## Governed by

- ADR 0005 — Event grouping by fingerprint: variable tokens are substituted
  before hashing, and the signature combines the normalized message with the
  service name and the severity number.
- ADR 0011 — Log readability and accessibility: the same token rules that
  group in the backend produce the visual structure in the frontend, from a
  single definition site.
- ADR 0002 — Canonical log model: the fingerprint is a field of the canonical
  record, computed from `body`, `service_name` and `severity_number`.
- ADR 0004 — Adapters per source: a record the pipeline cannot handle is
  recorded, never thrown, and the import continues.

## Done when

- [ ] Two messages differing only by a UUID produce the same fingerprint.
- [ ] Two messages differing only by an IPv4 address produce the same
      fingerprint.
- [ ] Two messages differing only by an IPv6 address produce the same
      fingerprint.
- [ ] Two messages differing only by a number produce the same fingerprint.
- [ ] Two messages differing only by a long hexadecimal value produce the
      same fingerprint.
- [ ] Two messages differing only by a timestamp produce the same
      fingerprint.
- [ ] Two messages differing only by a filesystem path carrying an
      identifier produce the same fingerprint.
- [ ] Two messages differing only by an e-mail address produce the same
      fingerprint.
- [ ] Two messages differing only by the content of a quoted value produce
      the same fingerprint.
- [ ] A message containing a timestamp yields one timestamp token rather
      than a sequence of number tokens.
- [ ] A message containing a path that embeds a UUID yields one path token
      rather than a path split around a UUID token.
- [ ] Two structurally different messages sharing a service and a severity
      produce different fingerprints.
- [ ] Two messages of identical shape from different services produce
      different fingerprints.
- [ ] Two messages of identical shape with different severity numbers
      produce different fingerprints.
- [ ] The same message, service and severity produce the same fingerprint on
      every run, independent of process or ordering.
- [ ] A body whose first line matches another body's first line produces the
      same fingerprint even when the following lines differ.
- [ ] A record with no service name produces a fingerprint, and two such
      records of identical shape and severity share it.
- [ ] A record with no determinable severity produces a fingerprint, and two
      such records of identical shape and service share it.
- [ ] A body that is empty or only whitespace produces a fingerprint, and
      two such records sharing a service and a severity share it.
- [ ] Two messages differing only by runs of whitespace, or by leading and
      trailing whitespace, produce the same fingerprint.
- [ ] Two messages differing only by letter case produce different
      fingerprints.
- [ ] Tokenizing a message returns an ordered sequence of typed variable
      spans and fixed text spans.
- [ ] Concatenating the returned spans reproduces the original message
      character for character.
- [ ] Tokenizing any string, including control characters and malformed
      input, returns a result instead of raising.

## Out of scope

- The `Issue` aggregate itself — upsert by fingerprint, occurrence counters,
  first and last seen, affected services, status transitions (ADR 0005).
- Reprocessing records from `raw` when the token rules change (ADR 0002).
- Frontend rendering of the spans: colors, placeholder styling, severity
  icons and the issue-list pattern display (ADR 0011).
- Severity normalization to the OpenTelemetry scale, which each adapter owns
  (ADR 0002).
- Hierarchical fingerprinting that prefers a stack trace over the message,
  named in ADR 0005 as the next step and deliberately not taken here.
- Similarity or embedding based grouping, rejected in ADR 0005.
- Capping or truncating very long bodies before normalization. Raised during
  the interview and left undecided; it needs a measurement first.

## Notes

The token rules have exactly one definition site, consumed by the
fingerprint and by the frontend highlighter. A second set of token regexes
anywhere in the tree contradicts ADR 0011 and the reuse rule in
`.claude/rules/code-style.md`.

ADR 0005 writes placeholders as `<uuid>` and ADR 0011 writes them as
`⟨id⟩`. The disagreement is resolved by treating both as notation rather
than as a stored format: normalization returns typed spans, the string that
gets hashed is internal, and the issue list re-tokenizes the stored sample
to render the pattern. Neither bracket form is a persisted value.

The path-with-UUID criterion is derived from the longest-pattern-first rule
stated in `.claude/rules/code-style.md`, not from an interview answer. It
merits explicit attention during review, because it decides whether a route
carrying an identifier reads as a route or disappears into a single path
placeholder.

Any change to these rules invalidates every fingerprint already stored, and
recovery depends on replaying `raw`.
