# Evidence Ingestion Usage

**Import:** `@noema/noema-core/evidence`  
**Source:** `packages/noema-core/src/evidence.ts`

## Purpose

Normalizes an immutable `SourceSnapshot` into canonical `Evidence` while preserving freshness and source-failure semantics.

## Primary exports

- `ingestSourceSnapshot(input)`
- `SourceIngestionInput`
- `SourceIngestionResult`
- `SourceIngestionSuccess`
- `SourceIngestionFailure`

## Minimal example

```ts
import { ingestSourceSnapshot } from "@noema/noema-core/evidence";

const result = ingestSourceSnapshot({
  snapshot,
  evidenceId: "evidence:issuer:nav",
  type: "API_RESPONSE",
  authority: "PRIMARY_SOURCE",
  observedAt,
  nowMs,
  maxAgeMs: 3_600_000
});
```

## Frontend-safe usage

**No.** This is an ingestion/backend boundary. Frontend should consume canonical evidence through `surfaces` or `ui`.

## Authority / non-responsibilities

This module validates snapshot ingestion requirements and derives evidence freshness. It does not fetch external URLs, decide semantic equivalence, mark claims VERIFIED, evaluate mandates, or select source authority automatically.

## Failure / uncertainty

Returns `SOURCE_FAILURE` for HTTP failure, missing/invalid content hash, missing immutable body reference, or future fetch time. Freshness is `FRESH` or `STALE`; stale evidence must remain visible downstream.

## Compatibility

Consumers must preserve the `SourceSnapshot` content hash/body-storage linkage and explicit `EvidenceAuthority` supplied by the trusted acquisition/policy layer.

## Proof

- `tests/integrity/source-ingestion.test.ts`
- `tests/integrity/source-adapters.test.ts`
- QA dependency: `evidence-lineage`
