-- Indexes that the Prisma schema language cannot express (ADR 0003, ADR 0009).
-- Each one is kept here, explicit in the repository, instead of implicit in the
-- ORM. The rationale for every index lives next to it.

-- BRIN over an append-only, naturally time-ordered column. log_records is never
-- updated and rows arrive roughly sorted by event time, so a block-range
-- summary resolves the time-window scans the dashboard and the cursor
-- pagination depend on while staying orders of magnitude smaller than the
-- equivalent B-tree. See docs/adr/0003.
CREATE INDEX "log_records_timestamp_brin_idx"
  ON "log_records"
  USING brin ("timestamp");

-- GIN over the variable JSONB tail so that filtering by an arbitrary key
-- (attributes ->> 'region' = 'us-east-1', or a containment match) uses an index
-- instead of scanning every row. The default jsonb_ops operator class is used
-- rather than jsonb_path_ops because the log filters also rely on key-existence
-- operators, not only containment. See docs/adr/0003.
CREATE INDEX "log_records_attributes_gin_idx"
  ON "log_records"
  USING gin ("attributes");

-- Text search over the message body. ADR 0003 leaves the choice between pg_trgm
-- and tsvector to measurement; trigram search is the starting point because it
-- matches partial tokens and misspellings that full-text lexemes miss, which is
-- the common case when an operator pastes a fragment of an error message.
-- The extension is created here so the environment does not need it pre-provisioned.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "log_records_body_trgm_idx"
  ON "log_records"
  USING gin ("body" gin_trgm_ops);
