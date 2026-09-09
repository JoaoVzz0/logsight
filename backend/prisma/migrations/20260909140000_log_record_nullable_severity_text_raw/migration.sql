-- Align log_records with the canonical model (docs/features/canonical-log-record.md).
--
-- severity_number / severity_text become nullable: an absent or undeterminable
-- severity is not coerced to the lowest level, it stays undeterminable
-- (ADR 0002, ADR 0005).
--
-- raw becomes TEXT: the original record is kept verbatim as the text the source
-- produced, without reserialization (ADR 0002). It is never queried by key, so
-- it carries no index and does not need JSONB.

ALTER TABLE "log_records" ALTER COLUMN "severity_number" DROP NOT NULL;

ALTER TABLE "log_records" ALTER COLUMN "severity_text" DROP NOT NULL;

ALTER TABLE "log_records"
  ALTER COLUMN "raw" SET DATA TYPE TEXT USING "raw"::text;
