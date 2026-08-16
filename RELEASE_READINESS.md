# Noema Release Readiness

## Purpose

This file is the canonical release-truth contract for Noema Phase 2. It prevents implementation, deterministic proof, live proof, and product claims from collapsing into the same status.

## Proof classes

Every material Noema capability must be classified as exactly one of:

- **IMPLEMENTED** — code exists and is covered by focused tests, but no stronger claim is implied.
- **DETERMINISTICALLY_PROVEN** — deterministic/replayable tests prove the stated invariant over canonical fixtures.
- **LIVE_PROVEN** — the capability has been exercised against the stated live external/runtime environment with durable receipts/artifacts.
- **NOT_CLAIMED** — intentionally outside the current release surface.

A stronger proof class subsumes weaker ones only for the exact tested claim. A live transport proof does not imply economic-authority proof. A successful demo does not imply production reliability.

## Current release baseline

### EconomicObject and deterministic semantic kernel
Status: **DETERMINISTICALLY_PROVEN**

The current repository proves strict EconomicObject/runtime schemas, evidence-bounded semantic relationship resolution, deterministic verification/promotion boundaries, mandate evaluation, append-only versioning, watch/re-evaluation semantics, machine-surface parity, UI projection parity, and a deterministic golden path.

### Noema AI safety/promotion boundary
Status: **DETERMINISTICALLY_PROVEN**

Noema AI remains proposal-only. Deterministic promotion/rejection policy is the authority boundary. Existing benchmark evidence proves the deterministic promotion safety gate for the fixed benchmark fixtures; it is not a claim of production model quality on arbitrary real-world documents.

### X Layer runtime and NoemaRegistry
Status: **LIVE_PROVEN**

Public X Layer testnet proof exists for chain identity, NoemaRegistry deployment, object/evidence root commitment, event/readback trace, append-only commitment history, OKLink source verification, and ERC-8021 Builder Code attribution that preserves canonical calldata semantics.

### Real-world economic-source acquisition
Status: **IMPLEMENTED** for adapter contracts; **NOT YET LIVE-PROVEN AS A RELEASE SCENARIO**

HTTP, document, and EVM acquisition boundaries exist, but Phase 2 must capture and preserve a release-grade evidence pack for real RWA candidates using primary/authoritative sources and immutable SourceSnapshots.

### Real-world EconomicObject interpretation
Status: **NOT YET LIVE-PROVEN AS A RELEASE SCENARIO**

The release does not yet claim that a real multi-source RWA case has been resolved end-to-end from captured source evidence through Noema AI proposal, deterministic promotion, verification, mandate evaluation, and X Layer commitment.

### Real-world material-change cycle
Status: **DETERMINISTICALLY_PROVEN** for canonical fixtures; **NOT YET LIVE-PROVEN AS A RELEASE SCENARIO**

Phase 2 must demonstrate two genuine source states or dated source versions where a material evidence change produces vN+1, re-verification, mandate re-evaluation, semantic event, and notification without mutating vN.

### REST / SDK / MCP
Status: **IMPLEMENTED / DETERMINISTICALLY_PROVEN** for semantic parity; **NOT YET DEPLOYED AS THE RELEASE RUNTIME**

Phase 2 must expose the canonical machine surfaces through one running service and preserve the existing no-parallel-semantics rule.

### UI / demo
Status: **IMPLEMENTED / DETERMINISTICALLY_PROVEN** for projection parity; **NOT YET PACKAGED AS THE PHASE 2 LIVE RWA RELEASE DEMO**

The release demo must be driven by canonical APIs and show evidence, uncertainty, relationship classification, receipts, X Layer commitments, version history, and material change inspectably.

### EAS, downstream trading, lending, execution, multi-chain expansion
Status: **NOT_CLAIMED**

These are not Phase 2 dependencies and must not be added merely because they are technically available.

## Phase 2 release claim

Noema may be promoted to a Phase 2 release candidate only when one flagship live-RWA scenario proves:

`real sources -> immutable SourceSnapshots -> Evidence -> Noema AI proposal -> deterministic promotion -> EconomicObject -> VerificationReceipt -> Mandate -> DecisionReceipt -> X Layer commitment -> watch -> material source change -> vN+1 -> re-verification -> re-evaluation -> semantic event -> notification`

and permits independent traversal of:

`DecisionReceipt -> VerificationReceipt -> canonical promotion decision -> NoemaAiProposal -> Claim -> Evidence -> SourceSnapshot -> adapter/source -> hash/attestation/onchain commitment`.

## Phase 2 flagship scenario requirements

The first release scenario should compare at least three real RWA representations with materially useful semantic tension. The preferred initial domain is tokenized U.S. Treasury / Treasury-fund exposure because it naturally tests:

- same broad exposure vs same economic claim;
- issuer/share-class distinctions;
- redemption rights and windows;
- transfer/eligibility restrictions;
- backing/custody differences;
- stale/conflicting/missing evidence;
- true equivalence vs similar exposure.

Candidate selection is a research task, not a product-truth change. Final candidates must be chosen only after current primary-source evidence can be captured reproducibly.

## Release acceptance

Phase 2 is release-ready only when all of the following are true:

1. At least three real RWA candidates are captured through immutable source adapters.
2. Every action-relevant interpreted field traces to source/evidence or explicit inference.
3. One real Noema AI run is preserved with model, prompt, schema, tool/input refs, proposal hash, and promotion outcomes.
4. One deterministic treasury mandate produces inspectable ALLOW / CONDITIONAL / BLOCK behavior across the candidate set or justified equivalent outcomes.
5. At least one real-evidence EconomicObject root is committed to X Layer with tx/event/readback proof.
6. One genuine material source-state change produces vN+1 and a reproducible decision change or re-affirmation.
7. A deployed machine runtime exposes canonical REST/SDK/MCP semantics without parallel business logic.
8. The UI/demo consumes only canonical documented surfaces and exposes evidence/receipt/version lineage.
9. `pnpm qa` remains green for every required deterministic gate and all applicable live gates have durable artifacts.
10. The release package explicitly distinguishes fixture proof, live runtime proof, and real economic-evidence proof.

## Non-goals for Phase 2

Do not expand scope into financing, settlement, trading, lending, autonomous execution, generic compliance, multi-chain execution, or EAS unless a separately accepted Product Truth change makes one necessary.
