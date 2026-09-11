# ADR 0006 — Asynchronous ingestion, in-process

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

**In-process asynchronous processing behind a `JobQueue` port**, with a
single implementation, `InProcessJobQueue`, and no external broker.

### Flow

1. `POST /imports` saves the file, creates the `ImportJob` row and responds
   `202` with `importJobId`
2. `JobQueue.enqueue()` hands the message to the handler registered via
   `onJob()` and returns immediately — the handler runs on the same event
   loop, fire-and-forget, without blocking the HTTP response
3. The handler reads the file in **stream** (`readline`) — never loads it
   entirely into memory
4. The adapter (ADR 0004) normalizes in batches of ~5 thousand records
5. Bulk insertion via `createMany`
6. Upsert of `issues` (ADR 0005) in the same batch and the same
   transaction
7. Progress is written to the `ImportJob` row on every batch; the frontend
   follows via polling `GET /imports/:id`

### Port

The queue is consumed through an interface, not directly:

```ts
export interface JobQueue {
  enqueue(message: ImportJobMessage): Promise<void>
  onJob(handler: JobHandler): void
}
```

Progress and status are not part of this port — they live in
`ImportJobStore`, a separate port backed by the `ImportJob` table. The
queue's only job is getting a message to a handler; job state is a
persistence concern, not a queue concern.

There is one implementation, `InProcessJobQueue`. The interface exists so
that adding a real broker later is a second implementation, not a rewrite
of `application/` or `core/`.

## Alternatives considered

### BullMQ over Redis, with a separate worker service

This was the original design: a dedicated worker process consuming a
BullMQ queue backed by Redis, with `job.updateProgress()` and `getStatus()`
giving queryable state out of the box.

**Descoped**, not discarded on technical grounds. Within the 3-day window,
it added a service, a broker and an operational dependency (persistence,
reconnection handling) for a volume this evaluation does not exercise. The
`JobQueue` port was kept exactly so this remains a live option: swapping
`InProcessJobQueue` for a `BullMQJobQueue` behind the same interface does
not touch `application/` or `core/`. See "Evolution" below.

Redis was removed from the stack entirely rather than kept as a dependency
serving nothing — an unused tool sitting in `docker-compose.yml` is a
liability during evaluation, not evidence of foresight.

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
execution history. We would end up reimplementing that layer on top.

There is also the *ack deadline* issue, capped at 10 minutes. A large
import that exceeds that time gets its message redelivered and the file
processed twice. It is workaroundable with chunking and idempotency, but
that is complexity that does not pay off in this scope.

**Important:** Pub/Sub is not the wrong primitive — it is the primitive
for a different phase of the problem. See "Evolution" below.

## Consequences

**Positive**
- No extra service, no broker, no operational dependency beyond
  PostgreSQL.
- The `JobQueue` port isolates the decision: `application/` and `core/`
  do not know that processing runs in-process.
- Progress is a database row, queried the same way regardless of which
  `JobQueue` implementation is behind the port.

**Negative**
- Processing competes for CPU and memory with the HTTP server inside the
  same process. Acceptable at the volume this evaluation exercises; the
  first thing to break under real load is this, not the parsing logic.
- No retry and no concurrency control. A crash mid-import leaves the job
  `RUNNING` with no automatic recovery; it must be rerun from the file,
  which the `ImportJob` row still references.
- Does not scale horizontally independently of the API — there is nothing
  to scale independently, since there is no separate service.

## Evolution

Two independent axes, both left open by the `JobQueue` port:

**Same shape, real broker.** If import volume or reliability requirements
grow, `InProcessJobQueue` is replaced by a `BullMQJobQueue` (or equivalent)
behind the same port, running in a separate worker service. This is the
natural next step and the one the port was designed for.

**Different shape, continuous ingestion.** Further out, the platform's
natural path is to stop importing files and start ingesting continuously:
a **Log Sink** from Cloud Logging publishing to a **Pub/Sub** topic, with
the service consuming in real time. In that scenario the correct primitive
becomes Pub/Sub — a stream of small events, no per-message state, with
fan-out and retention.

## Revisit when

Import volume or concurrency makes in-process processing compete
noticeably with request handling, or ingestion stops being by file upload.
At that point the job needs a real broker, and for continuous ingestion,
coordination changes further still.
