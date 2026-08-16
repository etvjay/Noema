# Noema AI Rights / Restrictions Interpretation Usage

## Purpose

Provides the bounded backend interpretation job for economic rights and restrictions. It consumes already-proposed claims plus one bounded SourceSnapshot/Evidence/content input and returns proposal-only rights, restrictions, and unresolved issues.

**Status:** internal backend module; not a package export.  
**Source:** `packages/noema-ai/src/rights.ts`

## Intended consumers

Noema AI orchestration and integrity tests. Frontend code must not invoke this interpreter directly.

## Inputs

- bounded evidence input from the claim-extraction boundary;
- `ProposedClaim[]` already validated by `@noema/schemas/ai`;
- an injected `RightsRestrictionsModel`.

## Outputs

- `ProposedRight[]`;
- `ProposedRestriction[]`;
- `ProposedUnresolvedIssue[]`.

Every right/restriction must cite only supplied claim IDs and the bounded SourceSnapshot/Evidence pair.

## Minimal example

```ts
const result = await interpretRightsAndRestrictions({
  evidenceInput,
  claims,
  model
});
```

## Frontend-safe usage

None. Render stored proposal provenance only. Canonical product state still comes from `@noema/noema-core/ui` / `surfaces` after deterministic promotion and verification.

## Authority boundary

Token ownership, name/ticker similarity, or model confidence cannot establish legal/economic rights. The module is proposal-only and cannot mark claims VERIFIED, resolve canonical truth, evaluate a mandate, create a canonical version, or execute transactions.

## Failure semantics

Malformed output, foreign evidence references, and unknown supporting claim references fail closed. Missing support should be expressed through unresolved dimensions/issues rather than invented certainty.

## Compatibility

Promotion to a public package export requires stable package dependencies, usage/index/catalog updates, and CI proof in the same change.

## Proof

- `tests/integrity/ai-rights-restrictions.test.ts`
- AI QA gate: `ai-rights-restrictions`
