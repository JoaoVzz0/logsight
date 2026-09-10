# Async import endpoint

`POST /imports` accepts a log file upload, stores it, starts processing it in
the background, and returns a job id immediately. `GET /imports/:id` reports
that job's progress and final result for the import screen to poll.
`GET /imports` lists past imports, newest first.

## Governed by

- ADR 0006 — Asynchronous ingestion (deliberate, documented deviation): the
  endpoint writes the file to storage, creates the job, and responds `202`
  with the job id without waiting for processing; the file is read as a
  stream and never held whole in memory; the pipeline reports progress per
  batch and the screen polls it. ADR 0006 mandates BullMQ over Redis with a
  separate worker process — within the delivery scope the handler runs the
  pipeline in the same process as an unawaited task. The `JobQueue` port is
  created and stands as the seam ADR 0006's evolution swaps: BullMQ becomes a
  second implementation, not a rewrite. `docs/features/ingestion-pipeline.md`
  already records this scope choice.
- ADR 0006 — a job with consultable state: the job carries `status`,
  `total_lines`, `processed_lines`, `parse_errors`, and on completion an
  ingestion rate and elapsed processing time — the fields the ADR's
  "Processando… 340 mil de 1,2 milhão de linhas · 28% · 4 erros" line needs.
- ADR 0004 — Adapters and detection: `sourceType` is an optional override;
  detection runs over the sample when it is absent. An override matching no
  registered adapter is rejected — detection is not authority, but a bad
  override is a caller error, not something to silently ignore.
- ADR 0008 — Boundaries and the `FileStorage` port: `FileStorage` is created
  now with its filesystem implementation; the second implementation (GCS
  signed URL) is ADR 0007's Cloud Run path. The route and the background
  dispatch are orchestration in `ingestion/http/` and `ingestion/application/`;
  they drive the pipeline through its existing ports and never reach into
  another module's `core/`.
- ADR 0009 — Data access: job creation, progress updates, the single-job read
  and the history list use the Prisma native client; no `$queryRaw` outside
  `analytics/queries/`. The reads project the row straight to the response
  shape without hydrating an entity or passing through a repository.
- ADR 0012 / `architecture.md` "API contract": every request and response
  schema is a named Zod schema with an explicit identifier
  (`CreateImportResponse`, `ImportStatusResponse`, `ImportListResponse`),
  registered in the OpenAPI document; a response schema carries no refinement
  or coercion that fails to translate to JSON Schema. After the routes land,
  `pnpm generate:client` is run and the generated artifacts are committed.
- ADR 0007 — Cloud Run request limit (context, not in scope): the 32 MB
  HTTP/1 limit and the signed-URL path are a Cloud Run concern; locally the
  upload goes straight to the API, which is the path this feature builds.
- `.claude/rules/code-style.md`: domain errors are typed classes with a
  stable `code`; the HTTP layer maps codes to status in one place
  (`error-handler.ts`). A new dependency (`@fastify/multipart`) carries a
  recorded justification (gate G0).
- `.claude/rules/testing.md`: the background dispatch is tested against
  in-memory port fakes; the routes and the completion path are exercised by
  the critical-path E2E (upload → job completes → records appear in the list).

## Done when

### Upload — `POST /imports`

- [x] The route consumes `multipart/form-data`, streams the file part
      directly to `FileStorage` as bytes arrive, and never buffers the whole
      file in memory — a file larger than the process heap uploads
      successfully.
- [x] The upload size limit is generous (≈500 MB) and configurable; a file
      exceeding it is rejected with 413 while streaming, not after buffering
      the whole body.
- [x] A request with no file part returns 400 naming the missing field; a
      request whose file part is empty returns 400.
- [x] An optional `sourceType` field is accepted; a value matching no adapter
      in the registry returns 400 naming the field and listing the accepted
      values; a valid value is carried to the pipeline as the detection
      override.
- [x] On a valid upload the route creates an `ImportJob` with status
      `pending`, the original filename, the byte size written to storage, and
      the `sourceType` when supplied.
- [x] The route responds `202` with a body carrying the job id as soon as the
      file is stored and the job row exists — before any line is parsed. The
      response does not wait for processing and a large file does not time the
      request out.
- [x] `total_lines` is counted while the file streams to storage, so it is
      populated on the job before processing starts; it is null only between
      row creation and the end of the upload write.

### Background processing

- [x] After responding, the route enqueues the job on the `JobQueue` port;
      the in-process implementation runs the registered handler as an
      unawaited task, so the HTTP response is already sent when processing
      begins.
- [x] The handler invokes the existing ingestion pipeline with the stored
      file streamed line by line, the counted `total_lines`, and the
      `sourceType` override when present — it does not reimplement reading,
      batching, or persistence.
- [x] As the pipeline processes batches, the job's `processed_lines` and
      `parse_errors` advance and are visible to a concurrent `GET /imports/:id`.
- [x] The job ends at `completed` on success, recording the ingested-record
      count and the elapsed processing time; it ends at `failed` with a
      stored reason if the pipeline throws.
- [x] A parse error on a single line does not fail the job — it is counted in
      `parse_errors` and processing continues (inherited from the pipeline).
- [x] An exception in the background task never crashes the process or
      produces an unhandled rejection; it is caught and recorded as a failed
      job.
- [x] Two uploads accepted close together both process; neither blocks the
      other's acceptance.

### Status — `GET /imports/:id`

- [x] Returns `status`, `total_lines`, `processed_lines`, `parse_errors`,
      `filename`, and the created / finished timestamps, projected straight
      from the row.
- [x] For a `completed` job the body additionally carries the final result:
      ingested-record count, elapsed processing time, and the derived
      ingestion rate (lines per second). The elapsed time measures
      processing, not time the job spent `pending`.
- [x] For a `failed` job the body carries the failure reason.
- [x] An unknown id returns 404 through the global error handler, not 500 and
      not an empty 200.
- [x] An `:id` that is not a well-formed job id returns 400 from the route
      schema.

### History — `GET /imports`

- [x] Returns the most recent imports first, each with filename, status,
      created timestamp, `total_lines` / `processed_lines`, and
      `parse_errors`.
- [x] The list is bounded to a fixed maximum (≈50 most recent) and takes no
      cursor parameter.
- [x] An empty database returns an empty array with status 200.

### Contract

- [x] `POST /imports`, `GET /imports/:id`, and `GET /imports` appear in the
      generated OpenAPI document at `/docs` with their schemas.
- [x] Request and response schemas are named Zod schemas with explicit
      identifiers; response schemas carry no JSON-Schema-incompatible
      refinement or coercion — any coercion (`BigInt` size, dates) happens in
      the query / mapping layer.
- [x] All error responses (400, 404, 413) come from the one global error
      handler; no route sets a status code locally. `unknown-source-type` and
      the not-found code are added to the handler's code→status map.
- [x] `packages/api-client` (`openapi.json` and `src/`) is regenerated with
      `pnpm generate:client` and committed in the same change as the routes.

## Out of scope

- BullMQ and a separate restart-resilient worker process (ADR 0006
  evolution). A job left `running` when the process stops is not resumed or
  reconciled; the in-process `JobQueue` is the documented seam BullMQ
  replaces.
- Upload progress in bytes — the browser's own `progress` event covers it;
  this feature exposes processing progress via status polling only.
- SSE / WebSocket push of progress — polling `GET /imports/:id` is the
  mechanism.
- Cancelling, reprocessing, or deleting an import job, and deleting the
  stored file after processing.
- Keyset pagination or filtering on `GET /imports`.
- The signed-URL / direct-to-bucket upload path for Cloud Run (ADR 0007) —
  local upload goes straight to the API.
- The GCS `FileStorage` implementation — only the filesystem one is built
  here.
- Authentication, authorization, and rate limiting on the routes.
- The import screen that consumes these endpoints — next feature.
- The pipeline's internals (adapter selection, batching, fingerprint
  aggregation, `ParseError` handling) — specified in
  `docs/features/ingestion-pipeline.md`.

## Notes

The ports the pipeline already needs (`ImportJobStore`, `LogRecordSink`,
`IssueRepository`, the adapter registry) are reused unchanged. This feature
adds two ports, both in directories that already exist as placeholders and
both with the documented second implementation ADR 0008 requires:

- `FileStorage` — write a stream to a key, open a read stream for a key —
  filesystem implementation under `ingestion/infra/storage/`; GCS signed URL
  is the ADR 0007 Cloud Run implementation, not built here.
- `JobQueue` — `enqueue` / `onJob` — in-process implementation under
  `ingestion/infra/queue/` that runs the handler as an unawaited task; BullMQ
  is the ADR 0006 evolution implementation.

Schema gap to close in this feature: `ImportJob` has `finished_at` but no
marker for when processing *started*, so "elapsed processing time" cannot be
derived from `created_at` (which includes the pending window). Add a
`started_at` column set on `markRunning`, or persist `elapsed_ms` from the
pipeline outcome — the pipeline already computes it and `markCompleted`
currently drops it. The ingested-record count is
`processed_lines - parse_errors` and does not need its own column.

`@fastify/multipart` is a new dependency (gate G0). Justification: streaming
multipart parsing with a hard byte cap is not worth hand-rolling over
`busboy`; it is the Fastify-official plugin and is implied by the ADR 0001
stack. Record it in the G0 log with the version.

`total_lines` is counted by teeing the upload stream through a newline
counter while it is written to storage — one pass, no extra read, no
buffering. That is why the progress denominator is available before
processing starts rather than only after the pipeline's first pass, unlike
the CLI path which pre-counts with a full read.

The route validates `sourceType` against a Zod enum of the source types
registered in the adapter registry, so a bad override is a 400 at the
boundary; the registry's existing `UnknownSourceTypeError`
(`code: 'unknown-source-type'`) stays as the backstop and is mapped to 400 in
`error-handler.ts`.

The critical-path E2E (`.claude/rules/testing.md` test #4) runs end to end
through these routes: `POST /imports` a fixture file, poll `GET /imports/:id`
until `completed`, then assert the ingested records appear in the read
surface (`GET /logs` today). The background dispatch is unit-tested with an
in-memory `JobQueue` and in-memory pipeline ports so completion is
deterministic without real timing.
