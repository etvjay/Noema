# Representation Identity, Lineage & Equivalence Usage

**Import:** `@noema/noema-core/representation`  
**Source:** `packages/noema-core/src/representation.ts`

## Purpose

Models explicit representation identity, immutable lineage, and deterministic equivalence boundaries so Noema can distinguish multiple technical representations of the same economic claim (same claim on different chains, distinct share classes, bridges, wrappers, derivatives) from merely similar exposures.

A representation is never automatically the economic object. A shared ticker, symbol, name, or matching exposure never establishes representation identity or equivalence by itself.

## Primary exports

- `RepresentationIdentity`, `RepresentationLocator`, `RepresentationLineageEdge`
- `deriveRepresentationIdentityKey(identity)`
- `classifyRepresentationRelationship(input)` → `RepresentationEquivalence`
- `traceRepresentationLineage(identities)` → `LineageTrace`
- `hasLineageEvidence(identity, kind, toRef)`
- `representationEvidenceRequirements(predicate)`
- `validateRepresentationEvidence(...)`
- `matchesForbiddenBasis(...)`
- `REPRESENTATION_EVIDENCE_REQUIREMENTS`

## Minimal example

```ts
import { classifyRepresentationRelationship } from "@noema/noema-core/representation";

const ethRep = { /* RepresentationIdentity with chainId "eip155:1" */ };
const xlayerRep = { /* same economicObjectRef, chainId "eip155:196" */ };

const result = classifyRepresentationRelationship({ left: ethRep, right: xlayerRep });
// { kind: "SAME_ECONOMIC_CLAIM", reasonCodes: ["SAME_OBJECT_DIFFERENT_LOCATOR"] }
```

## Equivalence semantics

`classifyRepresentationRelationship` returns one of:

- `SAME_REPRESENTATION` — identical structural identity key.
- `SAME_ECONOMIC_CLAIM` — same economic object on a different chain/locator with no bridge implied.
- `SHARE_CLASS_OF` — same object, distinct share class or tranche; never collapsed on exposure alone.
- `BRIDGED_REPRESENTATION_OF` / `WRAPPED_REPRESENTATION_OF` — requires explicit lineage evidence on the derived representation.
- `ECONOMICALLY_EQUIVALENT_TO` — all material dimensions equal and a supported representation link exists.
- `SIMILAR_EXPOSURE_TO` — exposure overlaps but at least one material dimension differs.
- `AMBIGUOUS` — insufficient dimensions, unbacked lineage, or unresolved relationship.
- `UNRELATED` — no shared object or supported linkage.

Identity is derived only from structural fields (`economicObjectRef`, environment, chain/network, contract/book-entry locator, share class, tranche). Names, tickers, and contract symbols are never identity.

## Frontend-safe usage

**Yes**, read-only classification and lineage tracing are safe for frontend/read surfaces. Do not construct or mutate representations from frontend code.

## Authority / non-responsibilities

This module declares deterministic evidence requirements per predicate. It does not fetch evidence, verify EIP-712 signatures, promote claims, or decide that any venue is a universal source of truth. Noema AI relationship proposals may propose `SemanticRepresentationLink`s, but deterministic promotion remains authoritative and consumes them as proposals only.

## Failure / uncertainty

- Bridge/wrapper lineage without evidence returns `AMBIGUOUS` and emits `RELATIONSHIP_AMBIGUOUS` exceptions.
- Dangling `supersedes`/`originRepresentation` refs and lineage cycles return `IDENTITY_AMBIGUOUS` exceptions via `traceRepresentationLineage`.
- Insufficient material dimensions return `AMBIGUOUS`; mismatched dimensions return `SIMILAR_EXPOSURE_TO`.

## Compatibility

Consumers must preserve explicit `representationId`, structural locator fields, and lineage evidence refs. History is immutable: upgrades and supersession create lineage edges, never in-place mutation.

## Proof

- `packages/noema-core/src/representation.test.ts` (unit)
- QA dependency: `representation-lineage`
