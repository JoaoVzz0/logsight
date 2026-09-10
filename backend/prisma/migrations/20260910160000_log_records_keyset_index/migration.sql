-- Btree over the composite keyset (timestamp, id) in the exact order the logs
-- list paginates. ADR 0003 keeps BRIN on "timestamp" for wide analytical range
-- scans, but BRIN cannot return rows in order, so the logs screen's most common
-- query -- the unfiltered newest-first page and every keyset page after it --
-- would fall back to a full scan plus a sort. This index serves that ordering
-- directly. See docs/adr/0003 and docs/adr/0009.
CREATE INDEX "log_records_timestamp_id_idx"
  ON "log_records" ("timestamp" DESC, "id" DESC);
