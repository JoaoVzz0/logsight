# ADR 0004 — Adapters per source, with automatic format detection

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The canonical model from ADR 0002 only has value if there is a cheap,
isolated path to translate each source format into it. The natural
temptation is to spread per-format conditionals throughout the import
pipeline — which makes the cost of adding a source grow with the size of
the system.

## Decision

Define a **single adapter contract** and one implementation per source:

```ts
interface LogAdapter {
  readonly sourceType: SourceType
  /** confidence from 0 to 1 that this sample belongs to this format */
  detect(sample: string[]): number
  parse(line: string): LogRecord | ParseError
}
```

The import pipeline knows no format: it receives an adapter and applies
it. Registering a new source means adding an implementation to the
registry.

### Sources in scope

| Adapter | Input |
|---|---|
| `gcp-cloud-logging` | `LogEntry` JSON — `timestamp`, `severity`, `jsonPayload`/`textPayload`, `resource.labels`, `trace`, `insertId` |
| `aws-cloudwatch` | JSON export — `logGroup`, `logStream`, `logEvents[].timestamp/message` |
| `json-lines` | one JSON object per line, with heuristic field mapping |
| `nginx` / `syslog` | text formats, via regex — included if time permits |

Three solid adapters and one clear contract are worth more than eight
partial ones.

### Next source

syslog RFC5424 is the natural extension of this set. The single adapter
contract defined above was designed exactly for this: adding it is one new
file in `infra/adapters/` plus a fixture test, without touching the import
pipeline or the domain — this is the concrete return on the ports
decision.

The only piece of normalization that syslog adds is mapping the PRI
severity (0–7) to the six OTel bands. It was not implemented because no
source currently in scope — GCP, CloudWatch, JSON Lines, nginx — produces
severity in this format, and a mapping table with no adapter consuming it
is dead weight.

This is a future source, not technical debt: no current code depends on a
syslog adapter or the PRI mapping, and the corresponding row in the
severity table of ADR 0002 is marked as not yet supported.

### Format detection

At import time, the file's first records are offered to each adapter's
`detect`, and the highest-confidence one wins. The user can **override**
the choice on the upload screen — detection is a convenience, not an
authority.

### Parse errors do not abort the import

An invalid line becomes a `ParseError`, is counted and recorded with its
line number and original content. The import continues. The job result
reports how many records were ingested and how many failed.

This is deliberate: real log files have truncated lines, mixed formats and
inconsistent encoding. An importer that aborts on the first error is
useless in practice.

## Alternatives considered

**A user-defined, configurable regex parser.** More flexible and with no
per-source code. Discarded for pushing complexity onto the user and for
not handling nested JSON formats well, which are the majority of relevant
cases (GCP and AWS).

**Require the user to declare the format at upload, with no detection.**
Simpler to implement. Discarded for worsening the UX with no architectural
gain — detection is cheap, since streaming reads (ADR 0006) already have
the first lines in hand anyway.

**Use an off-the-shelf collector (Vector, Fluent Bit) as the normalization
layer.** Would be the right choice in production. Discarded within the
challenge scope because normalization is precisely the core being
evaluated — outsourcing it would hollow out the exercise.

## Consequences

**Positive**
- The cost of adding a source is constant and isolated: one class and one
  test.
- Each adapter is unit-testable, with real samples as fixtures.
- The domain and the UI never know about the source format.

**Negative**
- Heuristic detection can be wrong on ambiguous files; mitigated by the
  manual override.
- Real GCP and AWS exports have variations that three days of sampling do
  not cover. The `raw` field from ADR 0002 allows reprocessing once an
  adapter is fixed.

## Revisit when

The number of sources grows to the point where confidence-based detection
becomes ambiguous, or when ingestion becomes continuous instead of
file-based — in that scenario the format comes declared on the channel and
detection is no longer necessary.
