-- The async upload endpoint (docs/features/imports-endpoint.md) streams the
-- uploaded file to FileStorage under a generated key and processes it in the
-- background. The job row records that key so the background handler can open
-- the file, and the pipeline's measured processing time so GET /imports/:id can
-- report an ingestion rate without counting the pending window against it.

ALTER TABLE "import_jobs" ADD COLUMN "storage_key" TEXT NOT NULL DEFAULT '';
ALTER TABLE "import_jobs" ALTER COLUMN "storage_key" DROP DEFAULT;

ALTER TABLE "import_jobs" ADD COLUMN "elapsed_ms" INTEGER;
