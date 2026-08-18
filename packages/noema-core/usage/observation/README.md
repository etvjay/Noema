# Cross-chain Observation Finality & Replay Usage

**Import:** `@noema/noema-core/observation`  
**Source:** `packages/noema-core/src/observation.ts`

## Purpose

Makes onchain observations safe for economic interpretation by preserving chain-specific finality, reorg, ordering, and replay semantics instead of treating every fetched block/slot as equally final. Canonical provenance for EVM and non-EVM observations is structural, never hidden inside body metadata.

## Primary exports

- `ChainObservation`, `ChainObservationProvenance`, `ChainObservationInput`, `FinalityPolicy`
- `ChainKind` ("EVM" | "NON_EVM"), `ObservationFinality` (PENDING/FINALIZED/REORGED/UNAVAILABLE/CHAIN_STALLED)
- `validateChainObservation(provenance)` → `ChainObservationVerdict`
- `captureChainObservation(input)` → `ChainObservationResult`
- `deriveChainObservationIdentityKey(provenance)` — deterministic replay identity over canonical chain state
- `deriveChainObservationScopeKey(provenance)` — scope identity excluding `stateId` (for disagreement grouping)
- `observationsAreDuplicate(left, right)`
- `finalitySatisfiesPolicy(observation, policy)` → `FinalityVerdict`
- `resolveChainObservationSet(input)` → `ResolveChainObservationSetResult`
- `deriveObservationSnapshotId(observation, sourceId)`
- `OBSERVATION_IDENTITY_VERSION`, `OBSERVATION_HASH_VERSION`, `OBSERVATION_FINALITY_POLICY_VERSION`

## Minimal example

```ts
import {
  captureChainObservation,
  finalitySatisfiesPolicy
} from "@noema/noema-core/observation";

const captured = captureChainObservation({
  observationId: "observation:xlayer:1",
  sourceId: "rpc:xlayer:testnet",
  provenance: {
    chainId: "eip155:1952",
    chainKind: "EVM",
    height: "123456",
    stateId: "0xaaaa…aaaa",
    account: "0x2222…2222",
    locator: "eth_call:totalSupply()",
    value: "0x01",
    finality: "FINALIZED",
    observedAt: 1700000000000,
    fetchedAt: 1700000000000,
    confirmationPolicy: "noema:finality:v1:xlayer-testnet"
  }
});

const verdict = finalitySatisfiesPolicy(captured.observation, {
  requireFinalized: true,
  allowPending: false,
  chainId: "eip155:1952"
});
// verdict.satisfied === true only when FINALIZED and chain matches
```

## Finality semantics

- `PENDING` and `UNAVAILABLE`/`CHAIN_STALLED`/`REORGED` observations never satisfy a policy with `requireFinalized: true`.
- Chain mismatch fails closed (`CHAIN_MISMATCH:<observed>:<required>`).
- Finality policy is explicit and versioned via `OBSERVATION_FINALITY_POLICY_VERSION`; per-chain finality adapters choose the confirmation policy and pass it in `provenance.confirmationPolicy`.

## Reorg / replay semantics

- A reorg cannot silently mutate historical evidence. `resolveChainObservationSet` emits displaced observations as `REORGED` copies (never mutating the input) with lineage entries, so the historical observation remains intact and the displaced state is explicitly superseded.
- Same observation replay reproduces the same content hash and identity key; `observationsAreDuplicate` detects replays across RPC retries/provider changes when canonical chain state is identical.
- Provider disagreement at the same height surfaces in `conflicting` plus a `PROVIDER_DISAGREEMENT` exception; no winner is silently selected.
- Resolution is deterministic across input orderings.

## Frontend-safe usage

**Yes**, read-only validation, identity, finality-policy checks, and set resolution are safe for frontend/read surfaces. Do not construct or mutate observations from frontend code.

## Authority / non-responsibilities

This module models observation provenance and finality; it does not fetch RPC data, verify signatures, promote claims, or decide that any chain is a universal source of truth. It preserves what was observed and whether that observation is safe to use under a given finality policy.

## Failure / uncertainty

- Malformed block height/hash/account/chain → `MALFORMED_HEIGHT`/`MALFORMED_STATE_ID`/`MALFORMED_ACCOUNT`/`CHAIN_ID_EMPTY`/`EMPTY_LOCATOR`/`MALFORMED_FINALITY`/`INVALID_TIMESTAMP`.
- Pending/unfinalized under a finalized policy → `FINALITY_PENDING_NOT_FINALIZED` / `FINALITY_<state>_NOT_FINALIZED`.
- Reorged/chain-stalled/unavailable evidence → never acceptable (`FINALITY_<state>_NOT_ACCEPTABLE`).
- Duplicate observations and provider disagreements are surfaced as exceptions, never silently resolved.

## Compatibility

`OBSERVATION_IDENTITY_VERSION` = "noema-chain-observation-v1"; consumers must preserve structural provenance fields and the versioned confirmation policy. Non-EVM chains keep equivalent slot/state identity (`NON_EVM` + `height`/`stateId`) without EVM-address semantics.

## Proof

- `packages/noema-core/src/observation.test.ts` (unit)
- `tests/integrity/observation-finality.test.ts` (integrity gate)
- QA dependency: `observation-finality`