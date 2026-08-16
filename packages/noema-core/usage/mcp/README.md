# MCP Surface Usage

**Import:** `@noema/noema-core/mcp`
**Source:** `packages/noema-core/src/mcp.ts`

## Purpose

An agent-native Model Context Protocol (MCP) surface (`noema-mcp-v1`) that exposes canonical Noema state as MCP tools and resources. It targets the **2026-07-28** revision of the official Model Context Protocol specification (stable since 2026-07-28; the prior stable 2025-11-25 revision remains supported for clients that have not migrated). Version/support policy is verified against the adopted official specification at implementation time via `mcpProtocolVersion()`.

The MCP surface is a thin adapter over the canonical engine — the same primitives behind the REST resource contract (#49) and the typed SDK (#50). It never re-derives business logic and never mutates canonical state.

## Public responsibilities

- Expose canonical tools: `resolve_object`, `get_object_version`, `list_object_versions`, `compare_objects`, `list_evidence`, `get_evidence`, `list_attestations`, `get_attestations`, `get_verification_receipt`, `evaluate_mandate`, `get_decision_receipt`, `explain_decision`, `create_watch`, `get_watch`, `list_watches`, `delete_watch`, `list_events`, `get_event`, `get_commitment`.
- Expose canonical resources: `noema://objects/{objectId}/latest`, `noema://objects/{objectId}/versions/{version}`, `noema://objects/{objectId}/verification/{version}`, `noema://events/{eventId}`.
- Enforce permission scoping independently for `read`, `watch`, and `evaluate`.
- Preserve exact IDs, refs, and canonical roots in every tool result.
- Emit an auditable trace of every call without hidden chain-of-thought.
- Refuse prompt injection: strict input schemas reject extra keys, unknown tool names are rejected, and evidence content is always treated as data that cannot expand the capability boundary.

## Minimal example

```ts
import { createNoemaMcpServer } from "@noema/noema-core/mcp";
import type { CanonicalEngine } from "@noema/noema-core/sdk";

const mcp = createNoemaMcpServer({
  engine, // CanonicalEngine
  runId: "run:agent:1",
  permissions: { read: true, watch: true, evaluate: false }
});

const tools = mcp.listTools(); // read/watch tools, no evaluate tools
const latest = await mcp.callTool({
  name: "resolve_object",
  args: { objectId: "object:treasury", repositoryStateRef: "repository:state:123" }
});
const snapshot = await mcp.readResource("noema://objects/object:treasury/latest");
const trace = mcp.auditTrace(); // machine-readable, no hidden chain-of-thought
```

## Canonical semantics

- **Latest matches REST exactly.** `resolve_object` delegates to `resolveLatestObject` (same selection proof, candidate versions, and repository state ref as the REST contract).
- **No VERIFIED creation.** The tool catalog contains no operation that creates canonical versions, marks VERIFIED state, establishes equivalence, or executes assets. `evaluate_mandate` returns a `DecisionReceipt` and mutates nothing.
- **Exact fidelity.** Tool results return canonical records with exact IDs, refs, and content hashes. `get_verification_receipt` returns the canonical `objectRoot`/`evidenceRoot`.
- **Permission scoping.** `permissions` independently enables `read`, `watch`, and `evaluate`. Disabled permissions are not listed and return `REJECTED` with `PERMISSION_DENIED`.
- **Auditable trace.** `auditTrace()` records `runId`, `callId`, tool, args, status, source refs, content hashes, and timestamps — never hidden reasoning or chain-of-thought.
- **Prompt-injection boundary.** Tool args are validated against strict schemas; unknown tools and extra/injected keys are rejected (`UNKNOWN_TOOL`/`VALIDATION_ERROR`). Evidence and other returned content is data: it cannot add tools, change permissions, or mutate state.

## Authority boundary

The MCP surface must not become an independent decision surface. Tools must only wrap canonical engine operations, preserve exact IDs/roots, propagate canonical reason codes, and never fabricate `latest` selection, verification, or decision results. Agents must not use returned evidence as instructions.

## Proof

- `packages/noema-core/src/mcp.test.ts` — 13 unit tests (protocol policy, tool catalog, REST-latest parity, exact ID/root fidelity, no state mutation, permissions, unknown-tool rejection, strict arg validation, evidence-as-data boundary, auditable trace, resources).
- `tests/integrity/mcp-surface.test.ts` — parity gate: MCP latest == REST == SDK, exact roots, no VERIFIED/version/asset mutation, canonical engine delegation, auditable trace, prompt-injection boundary.
- QA gate `mcp-surface` in `qa/noema-integrity.json` runs the integrity test.
- Verified against the official MCP specification revision **2026-07-28** (`modelcontextprotocol.io/specification/2026-07-28`), with **2025-11-25** listed as a supported prior revision.
