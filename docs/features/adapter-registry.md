# Adapter registry with automatic format detection

Given a ready sample of a file's first lines, the ingestion pipeline gets
back the single `LogSourceAdapter` that should parse the file: the one that
claims the sample with the highest confidence, or — when the caller names a
`sourceType` — that adapter directly, without detection.

## Governed by

- ADR 0004 — Adapters per source, with automatic format detection: the
  single adapter contract (`sourceType`, `detect(sample: string[]) => number`,
  `parse`); the first records of the file are offered to every adapter's
  `detect` and the highest confidence wins; the caller may override the
  choice — detection is convenience, not authority.
- ADR 0008 — Modular monolith with hexagonal core: "detecção de formato
  (consulta todos os adapters e escolhe por confiança)" is a **domain
  service** in `core/services/`. It depends only on the `LogSourceAdapter`
  port, never on a concrete adapter. The registry that enumerates the
  concrete adapter instances references the implementations and therefore
  lives in `infra/`. `core/` and `application/` never import from `infra/`,
  enforced by `no-restricted-imports` — the build fails on violation.
- ADR 0006 — Asynchronous ingestion: the worker reads the file in a stream
  and already has the first lines in hand. Reading, streaming, and choosing
  how many lines make up the sample are the pipeline's responsibility, not
  this feature's.
- ADR 0002 — Canonical log model: `source_type` is the id of the adapter
  that produced the record; the override value the caller passes is one of
  those ids.
- `domains/ingestion/ports/log-source-adapter.ts` — the `LogSourceAdapter`
  port and the `SourceType` union, merged to `main`. This feature consumes
  both unchanged; it defines no new port and adds no `SourceType`.
- Rules consulted: `.claude/rules/architecture.md` (dependency direction,
  port placement, "create an interface only when there are two plausible
  implementations" — the registry is not a port), `.claude/rules/code-style.md`
  (typed domain errors extending a shared base with a stable `code`, never a
  bare `Error` or string; no barrel files), `.claude/rules/testing.md`
  (application/domain logic tested against in-memory fakes of the port, not a
  mocking library).

## Done when

### Selection rule — domain service in `core/services/`

- [x] A pure function in `domains/ingestion/core/services/` takes a non-empty
      set of `LogSourceAdapter`, an explicitly designated fallback adapter
      drawn from that set, and a `string[]` sample, and returns exactly one
      of the adapters it was given.
- [x] When exactly one adapter's `detect` returns a value strictly greater
      than every other adapter's, that adapter is returned.
- [x] When two or more adapters share the highest `detect` score and the
      designated fallback is not among them, the adapter that appears first
      in the supplied set is returned.
- [x] When two or more adapters share the highest `detect` score and the
      designated fallback is among them, the fallback is returned.
- [x] When every adapter's `detect` returns `0` — including when the sample
      array is empty — the designated fallback is returned.
- [x] The rule compares `detect` scores relatively and applies no fixed
      threshold: an adapter scoring `0.4` against a fallback scoring `0.3`
      and all others scoring `0` is selected.
- [x] The fallback is whichever adapter the caller designates: a selection
      run configured with a fallback whose `sourceType` is not `json-lines`
      returns that adapter on a tie or all-zero sample. The rule never picks
      the fallback by testing `sourceType === 'json-lines'`.
- [x] The function returns an adapter instance it was passed — never a
      `sourceType` string alone, and it never constructs an adapter.
- [x] No file under `domains/ingestion/core/` imports a concrete adapter or
      any module under `infra/`; the selection rule references only the
      `LogSourceAdapter` port. `pnpm check` fails on violation.

### Registry — in `infra/`

- [x] The registry lives under `domains/ingestion/infra/` and enumerates the
      three existing adapter instances, with `sourceType` values
      `gcp-cloud-logging`, `aws-cloudwatch`, and `json-lines`.
- [x] The registry designates the `json-lines` adapter as the fallback and
      passes that designation to the selection rule.
- [x] Resolving with no `sourceType` and a given sample returns the adapter
      the selection rule chooses over all three registered adapters for that
      sample.
- [x] Resolving with a `sourceType` that matches a registered adapter
      returns that adapter and calls no adapter's `detect`.
- [x] Resolving with a `sourceType` that matches no registered adapter
      produces a typed domain error carrying a stable `code` and naming the
      unrecognized value (e.g. `unknown source type: acme-logs`); it does
      not fall through to detection and does not return an adapter.
- [x] The unknown-source-type error is a typed class extending the shared
      domain-error base with a stable `code`, not a bare `Error` and not a
      thrown string.
- [x] The registry's resolve entry point accepts the sample as a `string[]`
      already in hand; it exposes no parameter or method that takes a file
      path, a stream, a reader, or a sample-size count.

### Fixture-backed behaviour

- [x] A test drives the registry with the committed adapter fixtures
      (`gcp-cloud-logging.json`, the CloudWatch export, `json-lines.jsonl`)
      as samples and asserts each resolves to its own adapter with no
      `sourceType` given.
- [x] A test asserts that a sample none of the format-specific adapters
      claim resolves to the `json-lines` adapter.

## Out of scope

- Reading the file, streaming it, and deciding how many lines the sample
  contains — the ingestion pipeline's responsibility (ADR 0006).
- Any change to `domains/ingestion/ports/log-source-adapter.ts`, the
  `LogSourceAdapter` contract, or the `SourceType` union.
- The internal `detect` heuristic of any individual adapter — specified in
  `gcp-adapter.md`, `adapter-aws-cloudwatch.md`, and `json-lines-adapter.md`.
- Persisting `source_type` on the record, and the row↔record mapper
  (ADR 0009 / ADR 0003).
- The HTTP upload surface, the import-request schema, and how the caller's
  override `sourceType` reaches the worker (ADR 0012 / ADR 0006).
- A richer return shape that reports which path chose the adapter (override
  vs. detected vs. fallback) for display in the job result — deliberately
  left out; the job result reports parse counts, not detected format
  (ADR 0006).
- The `nginx` adapter and any future source (syslog RFC5424) — added later
  as one more registry entry (ADR 0004).
- Registering the same `sourceType` twice, or an empty registry — a
  programming error at the composition point, not a runtime behaviour to
  specify.
- A `Registry` interface or port — there is one implementation and no
  plausible second (`.claude/rules/architecture.md`).

## Notes

The split resolves an apparent tension between ADR 0008 and the request.
ADR 0008 places format-detection-by-confidence in `core/services/` as a
domain service; the request notes the registry "knows the implementations,
so it is not core". Both hold: the *rule* (max confidence, fallback on ties
and zeros) is pure and lives in `core/services/`, taking `LogSourceAdapter[]`
as input; the *registry* (the three concrete instances, the fallback
designation, the override lookup, the entry point the pipeline calls) wires
the implementations into that rule from `infra/`.

Tie-breaking between two format-specific adapters that claim the same line
with identical confidence is by registration order — the first in the set
wins. This is not elegant, but it is deterministic and testable, and the
case is vanishingly rare; nothing more sophisticated is worth building now.

The fallback is designated explicitly rather than found by
`sourceType === 'json-lines'` so that changing the fallback later is one
edit at the designation site, and so "fallback" is a named concept in the
code rather than an implicit consequence of a string match.

No shared domain-error base class exists in `src/shared/` yet; this feature
introduces the first one, or the gate that implements it does. The
`ParseError` in the port is a returned data type, not a thrown error, and is
unrelated.
