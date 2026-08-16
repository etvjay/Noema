# Watch / Re-evaluation Usage

**Import:** `@noema/noema-core/watch`  
**Source:** `packages/noema-core/src/watch.ts`

## Purpose

Orchestrates idempotent material-change handling for watched economic objects: append a new canonical version when needed, re-run injected verification/mandate evaluation, emit a semantic change event, and derive notification payloads.

## Primary exports

- `initializeWatchState(object)`
- `processWatchedChange(input)`
- `WatchRegistration`
- watch state/result/event/notification types exported by the module

## Minimal example

```ts
import {
  initializeWatchState,
  processWatchedChange
} from "@noema/noema-core/watch";

const state = initializeWatchState(object);
const next = processWatchedChange({
  state,
  watch,
  candidate,
  changeId,
  previousVerification,
  previousDecision,
  nowMs,
  evaluate: (object) => ({
    verification: verify(object),
    decision: evaluatePolicy(object)
  })
});
```

## Frontend-safe usage

**No for orchestration.** Frontend should consume resulting versions, events and notifications via canonical surfaces. UI must not create watch events or re-evaluate policy.

## Authority / non-responsibilities

Watch owns idempotent change orchestration and correlation lineage. Verification and mandate semantics are injected and remain owned by their canonical modules. Watch does not reinterpret those results, fetch sources, or submit registry transactions.

## Failure / uncertainty

A non-material refresh emits no semantic change event. A material change produces `vN+1`, new verification/decision receipts and correlated notification payloads. Replaying the same `changeId` returns the previously processed result rather than duplicating versions or notifications.

## Compatibility

Preserve correlation IDs, version lineage, old/new decision references and idempotency semantics across transport changes.

## Proof

- `tests/integrity/watch-reevaluation.test.ts`
- QA gate: `watch-reevaluation`
