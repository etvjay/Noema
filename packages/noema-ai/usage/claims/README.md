# Noema AI Claim Extraction Usage

## Purpose

Provides the bounded backend claim-extraction job for Noema AI. It converts one immutable `SourceSnapshot` + linked `Evidence` + captured evidence text into strictly validated `ProposedClaim[]` through an injected model adapter.

**Status:** internal backend module; not yet a package export.  
**Source:** `packages/noema-ai/src/claims.ts`

## Intended consumers

Noema AI orchestration and integrity tests. Frontend code must not import this implementation directly.

## Inputs

- immutable `SourceSnapshot`;
- linked canonical `Evidence` whose `source` and `contentHash` match the snapshot;
- captured evidence content;
- a `ClaimExtractionModel` implementation.

## Output

`ProposedClaim[]` validated by `@noema/schemas/ai`. Every returned claim must carry evidence locators bounded to the supplied SourceSnapshot/Evidence pair and explicitly state `DIRECT_STATEMENT` or `INFERRED` basis.

## Minimal example

```ts
import { extractClaims } from "../../src/claims.js";

const claims = await extractClaims({
  evidenceInput: { snapshot, evidence, content },
  model
});
```

## Frontend-safe usage

None. Frontend should consume stored proposal/run provenance or canonical `ui`/`surfaces` projections. It must never execute claim extraction or promote claim proposals locally.

## Authority boundary

The model receives an instruction-neutral envelope declaring source text as data and output as proposal-only. This module cannot mark claims `VERIFIED`, mutate an EconomicObject, decide equivalence, evaluate a mandate, or execute transactions.

Model output referencing a SourceSnapshot/Evidence pair outside the bounded input is rejected.

## Failure semantics

Explicit errors cover source/evidence mismatch, content-hash mismatch, empty content, malformed structured model output, and unauthorized evidence references. An empty valid claim array is allowed for no-answer/unsupported cases.

## Compatibility

This module remains internal until the Noema AI runtime/package dependency surface is stable. Promoting it to a public package export requires package metadata, adjacent usage/index updates, repository catalog update, and CI proof in the same change.

## Proof

- `tests/integrity/ai-claim-extraction.test.ts`
- AI QA gate: `ai-claim-extraction`
