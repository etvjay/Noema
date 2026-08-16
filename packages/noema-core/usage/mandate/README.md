# Mandate Evaluation Usage

**Import:** `@noema/noema-core/mandate`  
**Source:** `packages/noema-core/src/mandate.ts`

## Purpose

Deterministically evaluates a canonical `EconomicObject` plus `VerificationReceipt` against a `Mandate` and produces a `DecisionReceipt` with `ALLOW`, `CONDITIONAL`, or `BLOCK`.

## Primary exports

- `evaluateMandate(object, verification, mandate, context)`
- `POLICY_ENGINE_VERSION`

## Minimal example

```ts
import { evaluateMandate } from "@noema/noema-core/mandate";

const decision = evaluateMandate(object, verification, mandate, { nowMs });
```

## Frontend-safe usage

**No for decision-making.** Frontend should display the canonical `DecisionReceipt` from `ui`/`surfaces`; it must not run or reproduce treasury policy locally.

## Authority / non-responsibilities

This module owns deterministic mandate policy evaluation. It does not verify source truth, resolve equivalence, create versions, commit transactions, or accept AI confidence as policy authority.

## Failure / uncertainty

Verification failure, stale/conflicting/revoked/insufficient states, prohibited classes or failed required evidence cause `BLOCK`. Unresolved threshold-dependent economics may produce `CONDITIONAL`. Reason codes and policy checks remain explicit.

## Compatibility

Consumers should persist/display `policyEngineVersion`, `verificationReceiptRef`, evidence root, reason codes and supporting claims. Policy-version changes are compatibility-sensitive.

## Proof

- `tests/integrity/mandate-determinism.test.ts`
- QA gate: `mandate-determinism`
