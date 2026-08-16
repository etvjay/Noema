# Noema AI Conflict / Ambiguity Analysis Usage

## Purpose

Provides the bounded backend analyst for contradictory or incomplete economic evidence. It converts normalized evidence observations into proposal-only conflicts and unresolved issues while deterministically preventing the model from dropping materially contradictory source references.

**Status:** internal backend module; not a package export.  
**Source:** `packages/noema-ai/src/conflicts.ts`

## Intended consumers

Noema AI orchestration and integrity tests. Frontend code must not invoke this analyst directly.

## Inputs

`ConflictEvidenceObservation[]`, each carrying:

- subject and proposition/property;
- observed value;
- exact SourceSnapshot/Evidence locator;
- freshness and authority;
- optional scope, share class, and effective date;
- injected conflict-analysis model.

## Outputs

- `ProposedConflict[]`;
- `ProposedUnresolvedIssue[]`.

## Minimal example

```ts
const result = await analyzeConflicts({ observations, model });
```

## Frontend-safe usage

None. Frontend may render stored conflicts/unresolved issues and canonical exceptions, but must not choose which conflicting source is true.

## Authority boundary

The model may explain likely causes such as effective-date, share-class, representation, scope, freshness, or authority mismatch. It may not select canonical truth by confidence.

The boundary deterministically groups same-subject/same-property observations and detects materially different values before accepting model output. Every detected material conflict must appear in the proposal and must cite every conflicting evidence locator. Missing a conflict or dropping one side fails closed.

Canonical conflict resolution remains owned by deterministic source-authority/freshness/specificity policy and later proposal promotion.

## Failure semantics

Malformed output, foreign evidence references, dropped material conflicts, and incomplete conflict evidence sets are rejected. If the observations are insufficient to establish a conflict, the analyst may return an unresolved issue rather than fabricate one.

## Compatibility

Changes to deterministic conflict grouping or materiality semantics require corresponding tests and Product Truth review. Promotion to a public export requires stable dependencies plus usage/index/catalog updates and CI proof.

## Proof

- `tests/integrity/ai-conflict-analysis.test.ts`
- AI QA gate: `ai-conflict-analysis`
