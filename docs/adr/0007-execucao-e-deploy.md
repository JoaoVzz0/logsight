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
step beyond copying `.env.example`. Services: `api`, `worker`, `web`,
`postgres`, `redis`. Migrations and sample data seeding run at startup.

**Priority two:** cloud architecture documentation in the README, with a
diagram, a multi-stage `Dockerfile` already compatible with Cloud Run, and
a described build pipeline.

**Priority three:** actual deployment, only if the functional scope is
complete.

If there is a deployment, the topology is:

| Component | Choice | Reason |
|---|---|---|
| API + Web | Cloud Run | scales to zero, direct container deploy |
| Worker | Cloud Run with continuous CPU allocation | processing outside a request |
| PostgreSQL | Neon or Supabase | free tier and connection pooling |
| Redis | Upstash | free tier |
| Files | Cloud Storage | works around the upload limit (below) |

## Alternatives considered

**Cloud SQL and Memorystore.** Would be the right choice in production and
are what the README points to as the target. Discarded within the
challenge scope due to cost: Cloud SQL has no free tier and Memorystore
starts at a tier incompatible with an evaluation project. The decision is
recorded as conscious, not as unawareness of the managed service.

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

**CPU allocation.** Cloud Run only guarantees CPU during a request. A
worker processing a file in the background is throttled under the default
model, which requires always-allocated CPU, a minimum instance, or Cloud
Run Jobs.

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
