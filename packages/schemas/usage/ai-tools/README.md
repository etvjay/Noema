# Noema AI Typed Tool Contract Usage

## Purpose

Defines the only model-visible tool-call shapes Noema AI is allowed to request. The contract exposes a narrow read-only inspection surface plus proposal-only write-like calls; it deliberately contains no transaction execution, canonical commit, arbitrary URL fetch, shell, filesystem, secret, or downstream execution capability.

**Import:** `@noema/schemas/ai-tools`  
**Source:** `packages/schemas/src/ai-tools.ts`

## Public tool surface

Read-only calls:

- `get_source_snapshot`
- `get_claims`
- `get_evidence`
- `get_attestations`
- `get_representation`
- `get_identifier_candidates`
- `read_contract_state`
- `get_market_observation`
- `get_verification_result`

Proposal-only calls:

- `propose_claim`
- `propose_relationship`
- `propose_exception`

Anything outside this union is invalid by construction.

## Primary exports

- `noemaAiReadToolCallSchema`
- `noemaAiProposalToolCallSchema`
- `noemaAiToolCallSchema`
- `noemaAiToolResultSchema`
- `noemaAiToolTranscriptEntrySchema`
- tool contract/transcript version constants
- inferred TypeScript types

## Minimal example

```ts
import {
  noemaAiToolCallSchema,
  noemaAiToolTranscriptEntrySchema
} from "@noema/schemas/ai-tools";

const call = noemaAiToolCallSchema.parse(modelToolCall);
const transcriptEntry = noemaAiToolTranscriptEntrySchema.parse(auditEntry);
```

## Frontend-safe usage

Frontend may validate and display stored tool transcripts for inspectability. It must not execute these tools directly or treat a successful proposal tool call as canonical state.

## Authority boundary

Schema validity proves only that a requested operation belongs to the approved Noema AI tool vocabulary and has a valid payload shape. Runtime handlers still enforce source/evidence integrity, bounded outputs, secret isolation, provider/network policy, and proposal-only semantics.

`propose_*` calls create proposal data only. They do not mark `VERIFIED`, mutate `EconomicObject`, evaluate mandates, create versions, commit registry roots, sign transactions, or invoke downstream execution.

## Security properties

- unknown tool names are rejected;
- strict schemas reject extra hidden arguments;
- contract-state reads require explicit chain ID, address and selector rather than arbitrary code execution;
- tool results carry source refs/content hashes and explicit timestamps/status;
- transcript entries preserve calls/results/metadata without exposing hidden model reasoning.

## Failure semantics

Malformed tool calls/results/transcripts fail strict validation. Runtime policy may additionally return `REJECTED` with a reason code for unsafe or unauthorized results.

## Compatibility

Adding or changing a model-visible capability is a security-sensitive public-contract change. Update this usage contract, package index, repository catalog, runtime executor, security tests and tool contract version together.

## Proof

- `tests/integrity/ai-tool-security.test.ts`
- AI QA gate: `ai-tool-security-boundary`
