# REST Resource Contract Usage

**Import:** `@noema/noema-core/rest`
**Source:** `packages/noema-core/src/rest.ts`

## Public responsibilities

Defines the versioned canonical HTTP resource model for Noema so clients can retrieve the latest economic state, historical versions, evidence, receipts, watches, and changes without semantic ambiguity. `latest` means the highest canonical EconomicObject version accepted by the current repository/runtime state — never the newest raw source fetch, newest block, or newest channel notification.

## Versioned contract

`REST_CONTRACT_VERSION = "noema-rest-v1"`. `buildOpenApiContract()` produces a machine-readable OpenAPI 3.1 document (paths, operations, tags, auth, typed error responses). `REST_RESOURCES` enumerates the resource map with canonical schema bindings:

| Resource | Path | Immutable exact ref | latest semantics |
|---|---|---|---|
| objects | `/objects` | — | list latest |
| objectVersion | `/objects/{objectId}/versions/{version}` | yes | — |
| objectLatest | `/objects/{objectId}/latest` | — | yes |
| objectHistory | `/objects/{objectId}/versions` | — | — |
| verificationReceipts | `/objects/{objectId}/verification/{version}` | yes | — |
| decisions | `/objects/{objectId}/decisions/{version}` | yes | — |
| watches | `/watches` | — | private (bearer) |
| semanticEvents | `/semantic-events` | — | — |
| xlayerCommitments | `/xlayer/commitments` | — | — |

## Canonical semantics

- `latest` resolution: `resolveLatestObject({ objectId, versions, repositoryStateRef, nowMs })` returns the highest canonical version plus a `LatestSelectionProof` (`selectedVersion`, `repositoryStateRef`, `candidateVersions`, `reason`, `selectedAtMs`). It fails closed (`LATEST_UNAVAILABLE`) when no canonical versions exist and rejects version records for a different object.
- Exact-version retrieval is immutable/replayable: `exactObjectVersionRef(objectId, version)` → `objects/{id}/versions/{v}`; `parseObjectVersionRef` validates strictly and never coerces malformed IDs (typed `NoemaRestError`, never fake success).
- Pagination is deterministic: `createDeterministicCursor`/`parseDeterministicCursor`/`paginateDeterministically` produce opaque, tamper-rejecting, replayable cursors over version-ordered lists.
- Errors are typed: `restError({ code, ... })` with `code ∈ INVALID_REF | MALFORMED_ID | NOT_FOUND | VERSION_NOT_FOUND | LATEST_UNAVAILABLE | INVALID_PAGE | UNAUTHORIZED | FORBIDDEN | INTERNAL`.
- Caching semantics: exact versions are `immutable`; `latest` is `no-cache, must-revalidate` with an etag bound to `repositoryStateRef` + selected version, so a stale cached object can never be mislabeled as latest.
- Authorization: public economic proof resources (objects, evidence, receipts, mandates, decisions, events, commitments, health) are independently inspectable; `watches` require bearer auth (destination secrets remain out of object state).

## Example

```ts
import {
  resolveLatestObject,
  latestSelectionMetadata,
  parseObjectVersionRef,
  buildOpenApiContract
} from "@noema/noema-core/rest";

const api = buildOpenApiContract(); // machine-readable OpenAPI 3.1
const parsed = parseObjectVersionRef("objects/object:treasury/versions/3");
if (!parsed.ok) return parsed.error;

const resolved = resolveLatestObject({
  objectId: "object:treasury",
  versions: [v1, v2, v3],
  repositoryStateRef: "repository:state:123",
  nowMs: Date.now()
});
if (!resolved.ok) return resolved.error;
const meta = latestSelectionMetadata({
  objectId: "object:treasury",
  selectedVersion: resolved.result.selection.selectedVersion,
  repositoryStateRef: "repository:state:123"
});
```

## Authority boundary

This module only defines the HTTP resource contract and selection/pagination/error/cache semantics. It never independently decides equivalence, verification, mandate outcomes, materiality, or canonical version authority — those remain in the canonical engine. An HTTP runtime (deployed under #40) must not override `latest` semantics or return fake success.

## Proof

- `packages/noema-core/src/rest.test.ts` (10 tests) — OpenAPI contract, auth model, exact-version immutability, latest selection proof, typed errors, deterministic pagination/cursors, cache semantics, latest-unavailable, cross-object rejection.
- QA gate: `rest-contract` in `qa/noema-integrity.json`.
- Conformance: `tests/integrity/rest-contract.test.ts`.