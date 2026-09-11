# ADR 0006 — Asynchronous ingestion with BullMQ over Redis

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

Importing a log file is a long-running operation: read, detect format,
normalize line by line, batch insert and update issues. Doing this inside
the upload HTTP request is not viable — it blows the timeout, blocks the
client and does not survive a restart.

The interface needs to show progress during processing:

> Processing… 340k of 1.2 million lines · 28% · 4 parse errors

This defines the real requirement: it is not enough to hand a message to
a worker. A **job with queryable state** is needed.

## Decision

**BullMQ over Redis**, with a separate worker service.

### Flow

1. `POST /imports` saves the file, creates the job and responds `202` with
   `job_id`
2. The worker reads the file in **stream** (`readline`) — never loads it
   entirely into memory
3. The adapter (ADR 0004) normalizes in batches of ~5 thousand records
4. Bulk insertion via `COPY` or multi-row insert
5. Upsert of `issues` (ADR 0005) in the same batch and the same
   transaction
6. `job.updateProgress()` on every batch; the frontend follows via polling

### Abstract port

The queue is consumed through an interface, not directly:

```ts
interface JobQueue {
  enqueue(job: ImportJob): Promise<JobId>
  onJob(handler: (job: ImportJob) => Promise<void>): void
  getStatus(id: JobId): Promise<JobStatus>
}
```

There is one implementation (`BullMQJobQueue`). The interface exists so
that swapping the queue backend does not touch the domain.

## Alternatives considered

### Cloud Tasks

Evaluated as the natural managed GCP primitive for triggering an HTTP job.
**Discarded for two reasons.**

The first is practical and decisive: Google **does not provide an
official Cloud Tasks emulator**. The options are third-party
implementations, created precisely to fill that gap. Placing an unofficial
dependency on the critical path of the evaluator's `docker compose up` is
an unnecessary risk (see ADR 0007).

The second is about fit: Cloud Tasks delivers an HTTP request with retry.
It offers no job state, progress or listing — which is exactly what the
import screen needs.

### Cloud Pub/Sub

Better standing than Cloud Tasks on the first point: it **has an official
emulator** (`gcloud beta emulators pubsub`), which would run in the
compose stack without issue.

Discarded on the second point, which is stronger. Pub/Sub is message
delivery, not job management: no progress, no queryable state, no
execution history. We would end up reimplementing that layer on top —
that is, half of BullMQ.

There is also the *ack deadline* issue, capped at 10 minutes. A large
import that exceeds that time gets its message redelivered and the file
processed twice. It is workaroundable with chunking and idempotency, but
that is complexity that does not pay off in this scope.

**Important:** Pub/Sub is not the wrong primitive — it is the primitive
for a different phase of the problem. See "Evolution" below.

### Process within the API itself, in the background

No Redis, no separate worker. Discarded: processing would compete for CPU
with HTTP requests, would not survive a restart, and would not scale
horizontally independently of the API.

## Consequences

**Positive**
- Progress, state, retry with backoff and concurrency come out of the box.
- The worker scales independently of the API.
- Redis satisfies the job posting's NoSQL requirement out of architectural
  necessity — it also serves as a cache for dashboard aggregations — and
  not as a checklist item.

**Negative**
- One more service in the compose stack and one more operational
  dependency.
- Redis as a broker requires attention to persistence; losing the queue on
  restart is acceptable within scope, since the job is rerunnable from the
  file.
- On Cloud Run, a background worker requires care with the CPU allocation
  model (see ADR 0007).

## Evolution

The platform's natural path is to stop importing files and start
ingesting continuously: a **Log Sink** from Cloud Logging publishing to a
**Pub/Sub** topic, with the service consuming in real time.

In that scenario the correct primitive becomes Pub/Sub — a stream of small
events, no per-message state, with fan-out and retention. The `JobQueue`
port above exists so that this transition is a new implementation, not a
rewrite.

## Revisit when

Ingestion stops being by file upload, or when volume requires more than
one concurrent worker over the same file — at that point the job needs to
be sliced by offset, and coordination changes.
