-- The Issue aggregate already computes `regression` (ADR 0005: an issue
-- marked resolved that occurred again) in `core/issue.ts`, but the upsert
-- never persisted it and `resolvedAt` is cleared on regression exactly like
-- an issue that was never resolved, leaving no way to recover the flag from
-- the existing columns. This column makes the value durable.

ALTER TABLE "issues" ADD COLUMN "regression" BOOLEAN NOT NULL DEFAULT false;
