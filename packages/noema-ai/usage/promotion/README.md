# Noema AI Deterministic Promotion Usage

## Purpose

Defines the deterministic boundary between probabilistic `NoemaAiProposal` output and canonical Noema economic state.

**Status:** internal backend module; not a package export.  
**Source:** `packages/noema-ai/src/promotion.ts`

## Intended consumers

Noema AI orchestration, canonical backend services, integrity tests, and future promotion/persistence workers. Frontend code must not invoke this reducer directly.

## Primary functions

- `reduceAiProposalPromotion(proposal, context)` returns one deterministic promotion decision per proposed item.
- `applyAcceptedAiProposal({ proposal, promotion, object, nowMs })` translates accepted proposal items into the existing economic-kernel structures and routes them through `reduceEconomicObject`.

## Promotion outcomes

- `ACCEPT_AS_INFERRED`
- `ACCEPT_AS_CANDIDATE`
- `REJECT_UNSUPPORTED`
- `REJECT_CONFLICTING`
- `REJECT_POLICY`
- `REQUIRE_REVIEW`
- `UNRESOLVED`

## Inputs and outputs

Promotion consumes a schema-valid `NoemaAiProposal`, the exact proposal hash and AI run ID, current canonical `EconomicObject`, immutable `SourceSnapshot[]`, and explicit promotion policy. Sensitive equivalence proposals may additionally receive deterministic semantic profiles and representation links.

Every decision records proposal ID/hash, AI run ID, evidence refs, source-snapshot refs, outcome, and deterministic reason codes.

## Authority boundary

AI confidence is metadata only. It never overrides evidence authority, freshness, conflict, revocation, source lineage, semantic-equivalence requirements, or canonical verification.

No AI proposal can directly create `VERIFIED` state. Accepted inferred claims become `INFERRED`; accepted direct-source candidates become `SOURCED`; accepted relationships remain `INFERRED`. Applying accepted output resets verification to the existing reducer's unresolved/pending boundary so verification must run separately.

## Fail-closed rules

- missing evidence/source snapshots -> reject unsupported;
- evidence/source hash or lineage mismatch -> reject unsupported;
- revoked sources/evidence or disallowed authority -> reject policy;
- stale/unknown/too-old evidence -> require review;
- active canonical conflict -> reject conflicting;
- unsupported claim refs -> reject unsupported;
- equivalence without all required dimensions -> require review;
- deterministic semantic resolver disagreeing with proposed equivalence -> reject policy;
- proposal hash/schema mismatch -> reject policy.

## Existing canonical model

`applyAcceptedAiProposal` does not introduce a parallel AI domain model. It translates accepted proposal records into existing `Claim`, `EconomicRight`, `Restriction`, `EconomicRelationship`, `ResolutionException`, and provenance structures, then calls `reduceEconomicObject`.

## Frontend-safe guidance

Frontend may display stored promotion decisions and provenance through a documented machine/UI projection once exposed. It must never recreate promotion logic, promote by confidence, or infer that an AI proposal is canonical merely because it is schema-valid.

## Compatibility

Policy semantics are versioned by `AI_PROMOTION_POLICY_VERSION = "noema-ai-promotion-v1"`. Material rule changes require a version change, updated tests, and updated usage documentation.

## Proof

- `tests/integrity/ai-promotion-boundary.test.ts`
- AI QA gate: `ai-deterministic-promotion`
