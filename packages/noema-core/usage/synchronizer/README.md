# Asynchronous Multi-Venue Economic Synchronizer Usage

**Import:** `@noema/noema-core/synchronizer`  
**Source:** `packages/noema-core/src/synchronizer.ts`

## Purpose

Deterministically reconciles asynchronous venue observations into versioned `EconomicObject` state without fabricating simultaneity or erasing conflict. The synchronizer is the intake layer that admits venue deliveries (scoped attestations from `#59` + chain observations from `#61` + evidence-backed propositions), reconciles them into a candidate object, and appends exactly one new object version per logical material change.

It evaluates **authority scope**, **effective/observed time**, **finality**, **version lineage**, and **evidence freshness** independently. It never uses last-write-wins, newest-timestamp-wins, or model confidence as a truth rule.

## Primary exports

- `VenueDelivery`, `VenueClaimProposal`, `SynchronizerPolicy`
- `VenueDeliveryAdmission`, `TemporalSkewRecord`, `SynchronizerConflict`, `AppliedVenueClaim`
- `ReconcileResult`, `SynchronizeInput`, `SynchronizeResult`
- `admitVenueDelivery(delivery, policy)` → `VenueDeliveryAdmission`
- `deriveVenueDeliveryIdentityKey(delivery)` — deterministic delivery identity (excludes `receivedAt`)
- `reconcileVenueDeliveries(input)` → `ReconcileResult`
- `synchronizeEconomicObject(input)` → `SynchronizeResult` (versioned append)
- `deriveSynchronizationRoot(candidate, history)` → `Hex`
- `SYNCHRONIZER_VERSION`, `SYNCHRONIZER_HASH_VERSION`

## Minimal example

```ts
import {
  synchronizeEconomicObject,
  type VenueDelivery
} from "@noema/noema-core/synchronizer";

const delivery: VenueDelivery = {
  deliveryId: "delivery:xlayer:1",
  venueId: "venue:transfer-agent",
  attestation: { /* VenueEconomicAttestationEnvelope (scoped, signed) */ },
  observations: [/* ChainObservation with FINALIZED provenance */],
  claims: [
    {
      proposition: "SHARE_REGISTER_BALANCE",
      subject: "object:treasury",
      value: "1000",
      observedAt: 1700000000000,
      evidenceRefs: ["evidence:xlayer:1"]
    }
  ],
  receivedAt: 1700000005000
};

const result = synchronizeEconomicObject({
  object: currentObject,
  history: currentHistory,
  deliveries: [delivery],
  policy: {
    venueCapabilities: { "venue:transfer-agent": "TRANSFER_AGENT" },
    trustedAttestors: new Set([publisher]),
    nowMs: 1700000006000,
    maxEvidenceAgeMs: 3_600_000,
    requireFinalizedObservations: true,
    evidenceIndex: { "evidence:xlayer:1": evidence }
  }
});
// result.created === true only for a material change; version vN+1 appended.
```

## Ordering, causality, idempotency, and conflict semantics

### Ordering

- Reconciliation is deterministic **regardless of delivery arrival order**. Deliveries are canonicalized by `deriveVenueDeliveryIdentityKey` (venue, attestation id, attestor, nonce, binding, claims) and sorted before application. `receivedAt` is never an ordering authority.
- Same logical input set ⇒ same candidate, same `synchronizationRoot`, same conflicts.

### Causality

- Propositions are grouped by `(subject, proposition)`. Within a group, supersede/revoke links (`VenueClaimProposal.supersedes` / `.revokes`, keyed by `sourceRef`) drive causality; superseded claims become `STALE`, revoked claims become `REVOKED`, never deleted.
- Effective/observed time is carried separately from delivery time as `TemporalSkewRecord` (`skewMs = receivedAt - observedAt`) and surfaced on `AppliedVenueClaim.skewMs`.

### Idempotency

- Duplicate deliveries collapse by identity key (`duplicatesDropped`). Replaying the same admitted set reproduces identical roots and version lineage; a replay of an already-applied change is a no-op (`created === false`).

### Conflicts

- When two admitted authoritative propositions for the same `(subject, proposition)` disagree and neither supersedes/revokes the other, both remain visible as `CONFLICTING` claims, a `SynchronizerConflict` is emitted with `unresolved: true`, and the object status becomes `CONFLICTING` with a `EVIDENCE_CONFLICT` exception. No winner is silently selected; resolution requires deterministic policy/evidence (supersede/revoke links or future evidence).
- Late evidence is applied when canonically relevant and, if `lateEvidenceThresholdMs` is exceeded, the claim is marked `OBSERVED` (visible lateness) while historical versions remain untouched.

## Authority scope

- `SynchronizerPolicy.venueCapabilities` maps each venue to its `VenueRole`; the attestation's `authorityScope` must match the registered role.
- A venue's delivery can only mutate propositions within that venue's accepted authority scope; out-of-scope propositions are rejected with `PROPOSITION_OUT_OF_SCOPE:<proposition>`.

## Input/output contract

- **Input:** `SynchronizeInput` — current `EconomicObject`, current version history, a set of `VenueDelivery`, and a `SynchronizerPolicy`.
- **Output:** `SynchronizeResult` — appended `history`, `created` flag, latest `current` record, and the full `ReconciliationResult` (admitted/rejected, applied claims, conflicts, duplicates, temporal skew, reason codes, synchronization root).

## Frontend-safe usage

The synchronizer is backend/core orchestration. Frontends must not re-derive reconciliation logic; they should render `EconomicObject.claims`/`exceptions`/`status` and the receipt/summary surfaced by the runtime.

## Canonical invariants preserved

- Historical canonical versions are never silently overwritten (append-only versioning via `versioning.ts`).
- Stale, conflicting, revoked, missing, and ambiguous evidence remains visible.
- Noema does not claim universal economic truth: conflicting venues stay conflicting until deterministic resolution.
- Same logical inputs produce the same canonical roots regardless of delivery order, duplicate injection, or replay.

## Operations consumers MUST NOT recompute or override

- Reconciliation ordering and conflict resolution (call `reconcileVenueDeliveries` / `synchronizeEconomicObject`).
- Venue authority-scope validation (use `admitVenueDelivery` / policy `venueCapabilities`).
- Version bump decisions (`created`, `current.version`).

## Dependency/runtime requirements

- `@noema/economic-kernel` types, `@noema/canonicalization`, and the `attestation`, `observation`, and `versioning` modules within `@noema/noema-core`.
- Node.js with `node:crypto` (no external runtime).

## Integrity tests / QA gates

- Unit: `packages/noema-core/src/synchronizer.test.ts` (25 tests)
- Integrity gate: `tests/integrity/synchronizer.test.ts` (10 tests)
- QA gate: `synchronizer-reconciliation`

## Proof

- `packages/noema-core/src/synchronizer.test.ts` (unit, 25 tests incl. property-based permutations)
- `tests/integrity/synchronizer.test.ts` (integrity gate, 10 tests)
- QA dependency: `synchronizer-reconciliation`

## Compatibility / version notes

- `SYNCHRONIZER_VERSION = "noema-venue-synchronizer-v1"`; breaking semantic changes to reconciliation or conflict semantics require a new synchronizer version and re-verification of history.
- Late-evidence threshold and evidence-freshness windows are policy inputs, not module constants; consumers set them per venue/mandate.