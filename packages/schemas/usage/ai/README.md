# Noema AI Proposal Contract Usage

## Purpose

Defines the strict proposal-only contract between probabilistic Noema AI reasoning and deterministic Noema. It validates structured economic proposals, evidence/source locators, deterministic proposal hashes, and AI run provenance without granting model output canonical authority.

**Import:** `@noema/schemas/ai`  
**Source:** `packages/schemas/src/ai.ts`

## Primary exports

- `noemaAiProposalSchema`
- `noemaAiRunReceiptSchema`
- proposed claim/right/restriction/relationship/conflict/unresolved schemas
- `hashNoemaAiProposal(proposal)`
- `proposalHashProjection(proposal)`
- proposal/run/hash version constants
- inferred TypeScript proposal and receipt types

## Input / output contract

A `NoemaAiProposal` contains only structured proposal content and immutable source/evidence references. Action-relevant proposals carry exact `sourceSnapshotRef`, `evidenceRef`, and locator values.

A `NoemaAiRunReceipt` separately records model identity/version, prompt version, proposal schema/hash versions, input refs, output proposal hash, latency, token usage, status, and explicit start/completion timestamps.

## Minimal example

```ts
import {
  noemaAiProposalSchema,
  noemaAiRunReceiptSchema,
  hashNoemaAiProposal
} from "@noema/schemas/ai";

const proposal = noemaAiProposalSchema.parse(modelStructuredOutput);
const outputProposalHash = hashNoemaAiProposal(proposal);

const receipt = noemaAiRunReceiptSchema.parse({
  ...runMetadata,
  outputProposalHash
});
```

## Frontend-safe usage

Frontend may render stored proposal/run provenance for inspectability, but must not treat a valid proposal schema or high confidence as canonical truth. Prefer canonical UI/surface modules for product state.

## Authority boundary

This module does **not**:

- mark claims `VERIFIED`;
- mutate an `EconomicObject`;
- decide economic equivalence;
- resolve conflicts by confidence;
- evaluate mandates;
- submit transactions;
- execute model-discovered instructions.

Proposal acceptance/rejection belongs to the deterministic promotion boundary (#30).

## Hash semantics

`hashNoemaAiProposal` uses canonical key ordering plus SHA-256 under `NOEMA_AI_PROPOSAL_HASH_VERSION`. The hash covers stored proposal content and excludes run-operational fields such as latency, token counts, and timestamps. Proposal collection ordering that is semantically identified by item IDs is normalized by ID before hashing; source/evidence reference lists are sorted.

## Failure / uncertainty semantics

Malformed model output is rejected by strict schemas rather than coerced. Proposed claims explicitly distinguish `DIRECT_STATEMENT` from `INFERRED`. Rights, restrictions, and relationships preserve unresolved dimensions. Conflicts preserve at least two evidence locators. None of these states grant verification authority.

## Compatibility

Changing proposal shape or hash projection requires a new explicit schema/hash version, updated fixtures/tests, and deterministic promotion compatibility review.

## Proof

- `tests/integrity/ai-proposal-contract.test.ts`
- AI QA gate: `ai-proposal-contract`
