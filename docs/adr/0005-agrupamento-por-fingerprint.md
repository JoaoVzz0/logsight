# ADR 0005 — Grouping events by fingerprint

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

A platform that only lists and filters logs delivers little analytical
value. A screen with 1.2 million lines and a total-volume chart does not
answer the question the operations team actually asks: *what is broken,
since when, and is it getting worse?*

The problem is that the same error appears thousands of times with
irrelevant variations — a different UUID, another IP, another duration in
ms. Counted as distinct events, they become noise. Grouped, they become a
problem.

This is the core concept of tools like Sentry, and it is what turns volume
into information.

## Decision

Compute a **fingerprint** per record at ingestion time and maintain an
`Issue` entity aggregating all events with the same signature.

### Message normalization

Before hashing, the message is tokenized. The result of normalization is
an **ordered sequence of typed spans**: fixed text chunks interleaved with
variable spans, each carrying its own kind. The signature comes from a
canonical serialization of that sequence — a derived string, an internal
detail of the computation, which is neither displayed nor persisted.

```
"User 8f3a-21b failed login from 192.168.1.44 after 3200ms"
                        ↓
[text "User "] [uuid] [text " failed login from "] [ip]
[text " after "] [num] [text "ms"]
                        ↓
fingerprint = sha1(canonical serialization + service_name + severity_number)
```

Recognized kinds: UUID, IP (v4 and v6), number, long hexadecimal,
timestamp, path with identifier, email, and quoted values.

The `<uuid>`, `<ip>`, `<num>` notation used in this document — and the
`⟨id⟩` notation used in ADR 0011 — is **illustrative**. No bracket form is
a stored value; both describe the same span sequence. The renderer
chooses the visual representation of each kind (ADR 0011).

### Scope of the body considered

Grouping uses the **first non-empty line of the body**, with runs of
whitespace collapsed. The full body is preserved in `raw` (ADR 0002) and
shown in the occurrence detail.

The trade-off is accepted: the first line over-groups when the top
message is generic — `Internal server error` covers distinct causes. This
is contained by the presence of `service_name` and `severity_number` in
the signature, and the already-planned refinement is the hierarchical
fingerprint described in *Revisit when*.

### Missing service and severity

Not every source carries a service, and not every severity is
determinable (ADR 0002). Each absence contributes a **stable sentinel** to
the signature, chosen so that it cannot naturally occur as a real value.
Records without a service group among themselves and are never confused
with an existing service; the same applies to severity.

The lowest level of the scale is not assumed in place of missing severity.
That would turn "unclassified" into a real level, would mix records with
no severity with records genuinely at the minimum level, and would distort
the error rate the dashboard computes.

### Issue entity

```
issue
├─ fingerprint        (unique)
├─ sample_message     representative sample
├─ severity_number
├─ first_seen         first occurrence
├─ last_seen          last occurrence
├─ event_count        counter
├─ affected_services  distinct services affected
└─ status             unresolved | resolved | ignored
```

The upsert by `fingerprint` happens in the same batch as the event
insertion, within the same transaction.

### What this enables on the dashboard

Metrics that only exist because there is grouping:

- **New issues** — fingerprints seen for the first time in the window. It
  is the most useful signal the platform produces.
- **Regression** — an issue marked resolved that occurred again.
- **Spike** — an issue growing N× above the previous window's average.
- **Blast radius** — how many distinct services or hosts the same issue
  affects.

The alternative to these metrics would be "total logs" and level
distribution, which are vanity numbers: they always change and indicate
no action.

## Alternatives considered

**Group by exact message.** Trivial to implement. Useless in practice: any
dynamic identifier in the message produces one group per event.

**Group by textual similarity (trigram, Levenshtein) at query time.** More
tolerant of variations that regex normalization does not anticipate.
Discarded for cost: pairwise comparison does not scale, and grouping needs
to be ready at ingestion time for the dashboard to be responsive.

**Clustering by embedding.** Would capture semantic, not just syntactic,
similarity. Discarded for adding model dependency, cost and ingestion
latency, with marginal gain over regex normalization in the log domain —
which is highly formulaic.

**Do not group.** Discarded: this is the decision that separates this
project from a CRUD app for logs with a filter.

## Consequences

**Positive**
- Reduces the dashboard from millions of events to dozens of actionable
  problems.
- Enables the family of trend metrics (new, regression, spike).
- The cost is paid once at ingestion, not on every query.

**Negative**
- Regex normalization is heuristic: it can over-group (two distinct
  errors with the same shape) or under-group (an unanticipated variation).
  Mitigated by including `service_name` and severity in the hash, and by
  keeping the sample visible for inspection.
- Changing normalization rules invalidates existing fingerprints. A
  reprocessing from `raw` would be needed — another reason for the
  decision in ADR 0002.

## Revisit when

The rate of improper grouping becomes noticeable in operation. The next
step would be a hierarchical fingerprint (group by stack trace when
present, fall back to the message when not), as Sentry does.
