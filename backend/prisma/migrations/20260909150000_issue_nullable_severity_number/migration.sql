-- An issue grouped from records whose severity is undeterminable carries no
-- severity_number. The canonical model already allows a null severity
-- (ADR 0002, ADR 0005); the issues table is aligned with it here.

ALTER TABLE "issues" ALTER COLUMN "severity_number" DROP NOT NULL;
