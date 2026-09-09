# Message fingerprint

Turns a log record into a stable signature so that occurrences differing only
by variable values are recognized as one problem instead of thousands of
unrelated events.

## Governed by

- ADR 0005 — Event grouping by fingerprint: variable tokens are substituted
  before hashing, and the signature combines the normalized message with the
  service name and the severity number.
- ADR 0002 — Canonical log model: the fingerprint is a field of the canonical
  record, computed from `body`, `service_name` and `severity_number`.
- ADR 0004 — Adapters per source: a record the pipeline cannot handle is
  recorded, never thrown, and the import continues.

## Done when

### Derivation from the message

- [x] The signature derives from the tokenized spans of the first non-empty
      line of the body, with leading and trailing whitespace removed and runs
      of whitespace collapsed to a single space.
- [x] Two messages differing only by a UUID produce the same fingerprint.
- [x] Two messages differing only by an IPv4 or IPv6 address produce the same
      fingerprint.
- [x] Two messages differing only by a number produce the same fingerprint.
- [x] Two messages differing only by a long hexadecimal value produce the
      same fingerprint.
- [x] Two messages differing only by a timestamp produce the same
      fingerprint.
- [x] Two messages differing only by an e-mail address produce the same
      fingerprint.
- [x] Two messages differing only by the content of a quoted value produce
      the same fingerprint.
- [x] Two messages differing only by an identifier inside an otherwise
      identical path produce the same fingerprint.
- [x] Two messages whose paths differ in a fixed segment produce different
      fingerprints.
- [x] Two bodies sharing a first line produce the same fingerprint even when
      the following lines differ.
- [x] Two messages differing only by runs of whitespace, or by leading and
      trailing whitespace, produce the same fingerprint.
- [x] Two messages differing only by letter case produce different
      fingerprints.

### Composition with service and severity

- [x] Two messages of identical shape from different services produce
      different fingerprints.
- [x] Two messages of identical shape with different severity numbers
      produce different fingerprints.
- [x] Two structurally different messages sharing a service and a severity
      produce different fingerprints.

### Missing and degenerate input

- [x] A record with no service name produces a fingerprint, and two such
      records of identical shape and severity share it.
- [x] A record with no determinable severity produces a fingerprint, and two
      such records of identical shape and service share it.
- [x] A record with no service name and a record whose service name equals
      the sentinel value produce different fingerprints. The same holds for
      severity.
- [x] A body that is empty or contains only whitespace produces a
      fingerprint, and two such records sharing a service and a severity
      share it.
- [x] A body whose first line is empty uses the first non-empty line, not the
      empty one.
- [x] Any record that tokenizes produces a fingerprint; no input path returns
      an absent signature.

### Stability

- [x] The same body, service and severity produce the same fingerprint on
      every run, independent of process or ordering.
- [x] The signature is derived from the tokenizer's output rather than from a
      second set of token rules.

## Out of scope

- Tokenization itself, specified in `message-tokenizer.md`.
- The `Issue` aggregate: upsert by fingerprint, occurrence counters, first
  and last seen, affected services, status transitions (ADR 0005).
- Severity normalization to the OpenTelemetry scale, which each adapter owns
  (ADR 0002).
- Reprocessing records from `raw` when the token rules change (ADR 0002).
- Hierarchical fingerprinting that prefers a stack trace over the message,
  named in ADR 0005 as the next step and deliberately not taken here.
- Similarity or embedding based grouping, rejected in ADR 0005.
- Case-insensitive grouping. Considered and rejected: letter case carries
  meaning in log messages — error codes, class names, acronyms — while
  whitespace does not.

## Notes

Grouping by the first line trades precision for usefulness: a bare
`NullPointerException` may collect unrelated errors. Including service and
severity in the signature contains this. The refinement is hierarchical
fingerprinting, already recorded in ADR 0005.

The sentinel for a missing service or severity must be a value that cannot
occur naturally, so a service genuinely named `unknown` never collides with
records that have no origin.

Any change to these rules invalidates every fingerprint already stored, and
recovery depends on replaying `raw`.
