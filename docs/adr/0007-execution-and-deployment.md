# ADR 0007 — Docker Compose as delivery, cloud as demonstration

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The brief requires Docker containerization and code on GitHub, and lists
"documentation and run instructions" among the evaluation criteria. In
practice, this means **the evaluator will clone the repository and run it
locally**. If that path fails, no published environment compensates for
it.

At the same time, publishing the application has real demonstrative value,
and the project benefits from treating infrastructure as an explicit
decision rather than a delivery detail.

## Decision

**Priority one:** `docker compose up` working from scratch, with no manual
step beyond copying `.env.example`. Services: `api`, `web`, `postgres`.
Migrations and sample data seeding run at startup.

**Priority two:** cloud architecture documentation in the README, with a
diagram, a multi-stage `Dockerfile` already compatible with Cloud Run, and
a described build pipeline.

**Priority three:** actual deployment, only if the functional scope is
complete.

If there is a deployment, the topology is:

| Component | Choice | Reason |
|---|---|---|
| API + Web | Cloud Run, API with continuous CPU allocation | import processing runs in-process, outside the request (ADR 0006) |
| PostgreSQL | Neon or Supabase | free tier and connection pooling |
| Files | Cloud Storage | works around the upload limit (below) |

## Alternatives considered

**Cloud SQL.** Would be the right choice in production and is what the
README points to as the target. Discarded within the challenge scope due
to cost: Cloud SQL has no free tier. The decision is recorded as
conscious, not as unawareness of the managed service.

**Infrastructure as code (Terraform), VPC, load balancer.** Discarded as
disproportionate: in 3 days, they increase surface area without being run
by anyone during evaluation.

**Publish instead of guaranteeing the compose stack.** Discarded per the
priority order above — reversing it risks the explicit requirement to gain
a bonus.

## Known Cloud Run constraints

Three points that affect the design and are recorded here because they
change the architecture, not just the deployment:

**Request size limit.** Cloud Run limits requests to 32 MB over HTTP/1;
the limit does not apply with HTTP/2, which needs to be explicitly enabled
on the service. A log file of a few hundred MB blows past the default.

The architecturally correct way out is not to raise the limit, but to
**generate a signed URL and have the browser upload the file directly to
Cloud Storage**, with the backend reading from the bucket afterward.
Locally, the upload goes straight to the API through the compose stack.

**CPU allocation.** Cloud Run only guarantees CPU during a request. Import
processing runs in-process, fire-and-forget, after the API has already
responded `202` (ADR 0006) — under the default model that background work
is throttled once the response is sent. The API service needs
always-allocated CPU, not just during-request CPU, for the import to
actually make progress.

**Cold start.** With scale-to-zero, the first access pays startup latency.
A minimum instance solves it, at the cost of continuous billing.

## Consequences

**Positive**
- The evaluation path (`clone` + `up`) is the most tested path.
- Cloud Run's constraints are documented as an architecture decision, not
  discovered at deploy time.
- The choice of external managed database and cache is justified by cost,
  with the production target declared.

**Negative**
- The published environment, if it exists, is not identical to the local
  one — the upload path differs (direct to the API versus a signed URL to
  the bucket).
- Without IaC, the deployment is not automatically reproducible.

## Revisit when

The project moves out of demonstration scope. At that point, Cloud SQL
with a private IP, Memorystore, Terraform and separate environments stop
being disproportionate and become a requirement.
