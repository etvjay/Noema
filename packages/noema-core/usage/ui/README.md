# `@noema/noema-core/ui`

## Purpose

Provides the presentation-only projection for frontend consumers. It converts an already-canonical Noema snapshot into a view model without recomputing economic, verification, mandate, versioning, or registry semantics.

## Import

```ts
import { toNoemaUiViewModel, type NoemaUiViewModel } from "@noema/noema-core/ui";
```

## Input

`CanonicalNoemaSnapshot` from `@noema/noema-core/surfaces`.

## Output

`NoemaUiViewModel` containing:

- object id, canonical version and status;
- relationship predicates and visible exceptions;
- verification receipt id/status/objectRoot/evidenceRoot;
- decision receipt id/outcome/reason codes/policy engine version;
- evidence authority/freshness/content hashes;
- DecisionReceipt -> VerificationReceipt -> Claim -> Evidence navigation data.

## Frontend-safe usage

Use this as the default frontend adapter. Render the returned values as canonical state; do not recompute them in React/components.

```ts
const vm = toNoemaUiViewModel(snapshot);

return {
  status: vm.object.status,
  version: vm.object.versionLabel,
  decision: vm.decision.outcome,
  reasons: vm.decision.reasonCodes,
  verification: vm.verification.status,
};
```

## Authority boundary

This module does NOT decide equivalence, verify claims, evaluate mandates, create versions, or commit roots. It only projects already-canonical state for presentation.

If the UI appears to disagree with canonical receipts, fix the data path or this projection; never add frontend-side policy logic to force the desired result.

## Failure/uncertainty semantics

`STALE`, `CONFLICTING`, `REVOKED`, `INSUFFICIENT_EVIDENCE`, verification `FAIL/UNRESOLVED`, and mandate `BLOCK/CONDITIONAL` must remain visible. Do not collapse them into a generic success/error badge.

## Proof

Canonical integrity test: `tests/integrity/ui-semantic-parity.test.ts`.
