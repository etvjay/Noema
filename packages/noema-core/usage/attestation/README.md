# Scoped Venue Economic Attestation Envelope Usage

**Import:** `@noema/noema-core/attestation`  
**Source:** `packages/noema-core/src/attestation.ts`

## Purpose

Defines the scope-bounded economic attestation envelope a venue can issue, so Noema can accept an attestation from a venue as evidence about a subject only within the venue's registered role and proposition scope, and never lets signature validity alone make an attestation action-authoritative.

A venue cannot self-authorize a role it does not hold, cannot claim propositions beyond its role's scope, and every action-relevant conclusion must stay traceable to the specific evidence/source state the attestation binds.

## Primary exports

- `VenueEconomicAttestationEnvelope`, `VenueAuthorityScope`, `VenueAttestationBinding`, `VenueAttestationProvenance`, `VenueAttestationPolicy`, `VenueAttestationDomain`, `VenueRole`, `VenueProposition`, `AttestationStatus`
- `VENUE_ROLES`, `VENUE_PROPOSITIONS`, `VENUE_PROPOSITION_SCOPE`, `VENUE_ATTESTATION_ENVELOPE_VERSION`, `VENUE_ATTESTATION_HASH_VERSION`
- `venuePropositionScope(role)`, `authorityScopeAllows(scope, proposition)`
- `venueAttestationSigningProjection(envelope)`, `venueAttestationTypedData(envelope, domain)`, `NOEMA_VENUE_ATTESTATION_TYPES`
- `validateVenueAttestationScope(envelope, policy)`
- `validateVenueAttestationBinding(envelope, subjectRef, objectRef)`
- `verifyVenueAttestationAuthority(envelope, policy, domain)` → `AttestationAuthorityVerdict`
- `resolveVenueAttestationSet({ envelopes, nowMs })` → `ResolveAttestationSetResult`
- `deriveVenueAttestationId(envelope)`
- `attestationBindsExactEvidenceState(envelope, evidenceRoot, sourceStateRoot?)`
- `attestationIsFinalitySafe(envelope, requireFinalized)`
- `summarizeVenueAttestations(envelopes)`

## Minimal example

```ts
import { verifyVenueAttestationAuthority, type VenueAttestationPolicy } from "@noema/noema-core/attestation";

const policy: VenueAttestationPolicy = {
  venueCapabilities: { "venue:transfer-agent": "TRANSFER_AGENT" },
  trustedAttestors: new Set(["0x…"]),
  nowMs: Date.now()
};

const verdict = await verifyVenueAttestationAuthority(envelope, policy, domain);
// verdict.canBeActionAuthoritative === false unless signature valid AND scope valid AND status ACTIVE
```

## Scope semantics

- `VENUE_PROPOSITION_SCOPE` bounds each role to its propositions (e.g. `TRANSFER_AGENT` → share register, restrictions; `CUSTODIAN` → custody, backing, safekeeping; `FUND_ADMINISTRATOR` → NAV, valuation, subscription/redemption, total AUM).
- `validateVenueAttestationScope` rejects unregistered venues (`VENUE_NOT_REGISTERED`), role mismatches (`VENUE_ROLE_MISMATCH:claimed:expected`), and out-of-scope propositions (`PROPOSITION_OUT_OF_SCOPE:<p>`).
- `verifyVenueAttestationAuthority` fails closed: `canBeActionAuthoritative` requires a valid EIP-712 signature, valid scope, `ACTIVE` status, and a valid binding. Signature validity is necessary but never sufficient.

## Set resolution semantics

`resolveVenueAttestationSet` deterministically computes `active`, `conflicting`, `superseded`, `revoked`, and `expired` sets. Two active attestations over the same subject scope that are not linked by `supersedes`/`revokes` remain visible as a conflict — recency never silently wins.

## Authority / non-responsibilities

This module validates and resolves envelopes; it does not fetch evidence, issue attestations, or execute mandates. Noema does not own execution authority. AI proposals are not accepted as attestations by this module.

## Frontend-safe usage

Read-only resolution, summary, and scope validation are safe for frontend/read surfaces. Do not construct or mutate envelopes from frontend code.

## Failure / uncertainty

- Missing or invalid signature → `SIGNATURE_INVALID`, never action-authoritative.
- Expired/revoked/superseded/not-yet-valid/past-valid-until attestations → `ATTESTATION_EXPIRED` / `ATTESTATION_REVOKED` / `ATTESTATION_SUPERSEDED` / `NOT_YET_VALID` / `PAST_VALID_UNTIL`.
- Out-of-scope authority → scope-invalid, never action-authoritative.
- Conflicting active attestations are surfaced as conflicts, never resolved by recency.

## Compatibility

Envelope version is explicit via `VENUE_ATTESTATION_ENVELOPE_VERSION` ("noema-venue-attestation-v1"). `deriveVenueAttestationId` reproduces the same identity for the same observation, so replays are detected. Consumers must preserve explicit `schemaId`/`schemaVersion`, `venueId`, role, proposition scope, binding refs, evidence/source refs, and nonce.

## Proof

- `packages/noema-core/src/attestation.test.ts` (unit)
- `tests/integrity/attestation-envelope.test.ts` (integrity gate)
- QA dependency: `attestation-envelope`
