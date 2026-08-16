# Noema AI Tool Execution / Hostile-Evidence Isolation Usage

## Purpose

Provides the internal backend executor for the public `@noema/schemas/ai-tools` contract and the instruction-neutral evidence envelope used before captured source content is exposed to a model.

**Status:** internal backend module; not a package export.  
**Source:** `packages/noema-ai/src/tools.ts`

## Intended consumers

Noema AI orchestration, provider/tool adapters and integrity tests. Frontend code must not execute this module directly.

## Evidence envelope

`prepareEvidenceForModel` requires an immutable `SourceSnapshot`, linked `Evidence`, and captured content. It verifies source identity, content-hash linkage, an allowlisted content type, and a 256 KiB maximum model payload before returning an envelope that explicitly declares source text as data rather than instructions.

Allowed model content types are currently:

- `text/plain`
- `text/markdown`
- `application/json`
- `text/csv`

Source acquisition, redirect/DNS/SSRF policy, hashing and immutable storage remain upstream adapter responsibilities; the model tool surface deliberately exposes no arbitrary URL-fetch tool.

## Tool executor

`executeAiTool` strictly parses calls with `@noema/schemas/ai-tools` and dispatches only allowlisted read operations with explicitly registered handlers. Proposal calls return proposal-only payloads with `canonicalWritePerformed: false` and never invoke a canonical writer.

Tool outputs are scanned recursively for secret-bearing field names before they can enter the model transcript. Results preserve source refs/content hashes and produce an audit transcript containing call/result/timing/version metadata without hidden model reasoning.

## Minimal example

```ts
const evidenceEnvelope = prepareEvidenceForModel({ snapshot, evidence, content });

const transcript = await executeAiTool({
  rawCall,
  callId,
  runId,
  startedAt,
  completedAt,
  handlers
});
```

## Frontend-safe usage

None for execution. Frontend may render stored, validated tool transcripts for inspectability using the public schema contract.

## Authority boundary

This executor has no operation that can commit canonical state, send/sign a transaction, execute a shell command, access arbitrary files, fetch arbitrary URLs, or expose secrets. `propose_*` tools only produce proposal payloads. Verification, mandate evaluation, canonical versioning and registry commitment remain outside model authority.

## Failure semantics

Unsupported content types, oversized evidence, source/evidence mismatch, hash mismatch, invalid tool calls, missing handlers, secret-bearing outputs and malformed transcripts all fail closed with explicit `AiToolBoundaryError` codes.

## Compatibility

Any new tool is a security-sensitive capability addition. Update the public schema/version, this runtime, adjacent usage docs, repository module catalog and security tests together.

## Proof

- `tests/integrity/ai-tool-security-boundary.test.ts`
- AI QA gate: `ai-tool-security-boundary`
