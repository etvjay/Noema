# Registry Commitment Model Usage

**Import:** `@noema/noema-core/commitment`  
**Source:** `packages/noema-core/src/commitment.ts`

## Purpose

Provides the deterministic offchain model of Noema registry commitment/version semantics used by backend orchestration and integrity tests. It mirrors the canonical `NoemaRegistry` object registration/update shape without replacing Solidity as runtime authority.

## Primary exports

- `registerRegistryCommitment(input)`
- `updateRegistryCommitment(state, input)`
- commitment state/event types exported by the module

## Minimal example

```ts
import {
  registerRegistryCommitment,
  updateRegistryCommitment
} from "@noema/noema-core/commitment";

let state = registerRegistryCommitment({
  objectId,
  objectRoot,
  evidenceRoot
});

state = updateRegistryCommitment(state, {
  objectId,
  expectedVersion: 1,
  objectRoot: nextObjectRoot,
  evidenceRoot: nextEvidenceRoot
});
```

## Frontend-safe usage

**No for registry authority.** Frontend may display committed roots/version/event state received from a backend or chain reader, but must not use this model to claim an onchain commitment occurred.

## Authority / non-responsibilities

This module mirrors deterministic register/update state transitions and event payloads. The Solidity `NoemaRegistry` contract and observed chain state remain runtime authority. This module does not sign or submit transactions, manage publisher authorization, or prove X Layer inclusion.

## Failure / uncertainty

Invalid version sequencing or incompatible object identity must fail rather than silently rewrite history. Offchain model success is not live-chain proof.

## Compatibility

Keep event/version/root fields aligned with `contracts/src/NoemaRegistry.sol`. Contract changes require this usage contract and integrity tests to be reviewed together.

## Proof

- `tests/integrity/golden-path.e2e.test.ts`
- Solidity registry tests under `contracts/test/`
- QA gate: `registry-contract`
