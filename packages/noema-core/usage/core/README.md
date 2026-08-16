# Core Reducer + Lineage Usage

**Import:** `@noema/noema-core`  
**Source:** `packages/noema-core/src/index.ts`

## Purpose

Owns deterministic `EconomicObject` reduction and evidence-lineage inspection.

## Primary exports

- `reduceEconomicObject(input)`
- `traceClaimLineage(object, sourceSnapshots, claimId)`
- `validateEconomicObjectLineage(object, sourceSnapshots)`

## Inputs / outputs

`reduceEconomicObject` accepts canonical economic-object components and returns a normalized `EconomicObject` with deterministic status derivation. Lineage helpers return structured claim → evidence → source/attestation/provenance traces and explicit issues.

## Minimal example

```ts
import { reduceEconomicObject, validateEconomicObjectLineage } from "@noema/noema-core";

const object = reduceEconomicObject(input);
const lineage = validateEconomicObjectLineage(object, sourceSnapshots);
```

## Frontend-safe usage

**Indirect only.** Frontend should normally consume `@noema/noema-core/ui` or `@noema/noema-core/surfaces`. Do not construct canonical objects in UI code.

## Authority / non-responsibilities

This module owns deterministic object assembly and lineage visibility. It does not acquire sources, run AI inference, decide mandates, submit transactions, or own registry authority.

Never use UI state to override reducer-derived status or lineage issues.

## Failure / uncertainty

Stale, conflicting, revoked, missing and ambiguous evidence remain explicit through object status and lineage issue codes. `INFERRED` claims are not silently upgraded to verified truth.

## Compatibility

Changes to object-state derivation or lineage issue semantics are canonical-contract changes and require tests plus documentation updates.

## Proof

- `tests/integrity/evidence-lineage.test.ts`
- `tests/integrity/root-replay.test.ts`
- QA gates: `economic-object-schema`, `evidence-lineage`, `canonical-root-replay`
