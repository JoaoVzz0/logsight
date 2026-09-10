# Ingestion pipeline

Reads a log file as a stream, picks an adapter through the registry, turns
each line into a `LogRecord`, persists records in batches, and upserts the
issues they belong to. This is where ingestion and issues meet.

## Governed by

- ADR 0006 — Asynchronous ingestion: the file is read as a stream, never
  loaded whole; records are processed in batches (~5k); the pipeline owns
  reading, sample extraction, batching, and progress; a `ParseError` is
  counted and does not stop the run.
- ADR 0004 — Adapters and detection: the pipeline asks the registry for the
  adapter — by the caller's `sourceType` override, or by detection over a
  sample of the first lines — and applies `parse` per line.
- ADR 0005 / Issue aggregate: records of the same fingerprint are grouped and
  the issue repository is upserted per batch, not per record.
- ADR 0008 — Boundaries: the pipeline is application/infra orchestration; it
  calls the issues module through its repository port, never reaches into its
  `core/`.
- ADR 0009 — Prisma: record persistence is bulk insert; the row↔record mapper
  lives in `ingestion/infra/`.

## Done when

### Reading and adapter selection

- [x] The pipeline reads the file line by line from a stream and never loads
      the whole file into memory.
- [x] It extracts a sample of the first non-blank lines and resolves an
      adapter through the registry; a caller-supplied `sourceType` bypasses
      detection.
- [x] A CloudWatch export (`{ logGroup, logStream, logEvents[] }`) is split
      into per-event lines, each carrying the envelope's `logGroup` and
      `logStream`, before being handed to the adapter — the split lives here,
      not in the adapter.

### Processing

- [x] Each line is turned into a `LogRecord` or a `ParseError` by the chosen
      adapter; a `ParseError` is counted and the run continues.
- [x] Records are persisted in batches by bulk insert, not one row per line.
- [x] Within a batch, occurrences of the same fingerprint are aggregated and
      the issue repository is upserted once per distinct fingerprint, not once
      per record.
- [x] Each persisted record is linked to its import job.

### Job state

- [x] The import job advances through `pending → running → completed`, or to
      `failed` on an unrecoverable error, with `total_lines`,
      `processed_lines`, and `parse_errors` updated as the run progresses.
- [x] The job result reports how many records were ingested and how many
      lines failed to parse.

### Throughput

- [x] On completion the job records the elapsed time, so an ingestion rate
      (lines per second) can be shown — the visible evidence of volume
      handling.

## Out of scope

- The HTTP upload endpoint and the worker that invokes the pipeline — next
  feature; the pipeline is callable in isolation (e.g. from the CLI).
- The BullMQ queue and a separate worker process (ADR 0006): for the delivery
  scope the pipeline may run synchronously within the request/CLI; the
  `JobQueue` port stays the documented seam for async.
- Reading, filtering, and the issues/logs screens — the read side.
- The adapters' internal parsing and the issue aggregate's invariants —
  consumed here, specified elsewhere.

## Notes

This feature is the spine: it makes "importação", "processamento",
"classificação" and "armazenamento" real end to end. Everything before it was
components; this is the first point where a file goes in and grouped issues
come out.

The batch-level fingerprint aggregation is the performance-critical step.
A large file yields many occurrences of few fingerprints; upserting once per
fingerprint per batch instead of once per record is what keeps ingestion fast
on volume — the challenge's explicit criterion.

Synchronous execution is a deliberate scope choice, not an architectural one:
ADR 0006 designs for an async worker over BullMQ, and the `JobQueue` port
exists for it, but within the delivery timebox the pipeline runs inline. The
seam is in place; the async implementation is the documented next step.