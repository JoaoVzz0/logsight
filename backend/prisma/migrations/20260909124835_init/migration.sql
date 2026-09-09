-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('UNRESOLVED', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "log_records" (
    "id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity_number" INTEGER NOT NULL,
    "severity_text" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "service_name" TEXT,
    "host" TEXT,
    "environment" TEXT,
    "trace_id" TEXT,
    "span_id" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "source_type" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "import_job_id" UUID NOT NULL,

    CONSTRAINT "log_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "fingerprint" TEXT NOT NULL,
    "sample_message" TEXT NOT NULL,
    "severity_number" INTEGER NOT NULL,
    "first_seen" TIMESTAMPTZ(3) NOT NULL,
    "last_seen" TIMESTAMPTZ(3) NOT NULL,
    "event_count" BIGINT NOT NULL DEFAULT 0,
    "affected_services" TEXT[],
    "status" "IssueStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "issues_pkey" PRIMARY KEY ("fingerprint")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "source_type" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "total_lines" INTEGER,
    "processed_lines" INTEGER NOT NULL DEFAULT 0,
    "parse_errors" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "log_records_service_name_severity_number_timestamp_idx" ON "log_records"("service_name", "severity_number", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "log_records_fingerprint_timestamp_idx" ON "log_records"("fingerprint", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "issues_status_last_seen_idx" ON "issues"("status", "last_seen" DESC);

-- AddForeignKey
ALTER TABLE "log_records" ADD CONSTRAINT "log_records_fingerprint_fkey" FOREIGN KEY ("fingerprint") REFERENCES "issues"("fingerprint") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_records" ADD CONSTRAINT "log_records_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
