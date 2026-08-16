# Versioning Usage

**Import:** `@noema/noema-core/versioning`  
**Source:** `packages/noema-core/src/versioning.ts`

## Purpose

Maintains append-only `EconomicObject` version history and determines whether a candidate change is economically/materially significant enough to create `vN+1`.

## Primary exports

- `initializeVersionHistory(object, changeId?)`
- `isMaterialEconomicObjectChange(previous, candidate)`
- `appendEconomicObjectChange(history, candidate, changeId)`
- `EconomicObjectVersionRecord`
- `VersionAppendResult`

## Minimal example

```ts
import {
  initializeVersionHistory,
  appendEconomicObjectChange
} from "@noema/noema-core/versioning";

let history = initializeVersionHistory(object);
const next = appendEconomicObjectChange(history, candidate, "change:issuer-nav");
history = next.history;
```

## Frontend-safe usage

**No for version creation.** Frontend may render supplied historical versions but must never decide whether a change is material or assign canonical version numbers.

## Authority / non-responsibilities

This module owns material-change detection and append-only version sequencing. It does not acquire evidence, verify claims, evaluate mandates, or send notifications.

## Failure / uncertainty

Non-material refreshes do not create a new version. Material semantic/evidence/status changes create exactly the next canonical version. Previous stored versions are preserved rather than mutated.

## Compatibility

Changing the material projection changes canonical history semantics and requires replay tests plus explicit compatibility review.

## Proof

- `tests/integrity/version-history.test.ts`
- QA gate: `version-history`
