# Semantic Resolution Usage

**Import:** `@noema/noema-core/semantic`  
**Source:** `packages/noema-core/src/semantic.ts`

## Purpose

Conservatively derives economic relationships from structured semantic evidence. It is the canonical boundary for distinguishing true economic equivalence from merely similar exposure.

## Primary exports

- `resolveSemanticRelationship(input)`
- `SemanticResolutionInput`
- `SemanticResolutionResult`
- `SemanticRepresentationProfile`
- `SemanticRepresentationLink`

## Minimal example

```ts
import { resolveSemanticRelationship } from "@noema/noema-core/semantic";

const result = resolveSemanticRelationship({ left, right, links });
```

## Frontend-safe usage

**Do not use for client-side decision-making.** Frontend should render the canonical relationship already exposed by `ui`/`surfaces`. Server-side tooling may use this module as part of the canonical semantic pipeline.

## Authority / non-responsibilities

Equivalence requires qualifying evidence across economic claim, issuer, share class, rights, restrictions, backing, redemption and an explicit supported representation link. Same ticker, name, price, category or exposure class is insufficient.

This module does not verify claims, evaluate mandates, promote AI proposals, create versions or commit registry state.

## Failure / uncertainty

Stale evidence yields `STALE`; missing profiles yield `INSUFFICIENT_EVIDENCE`; unresolved relationships remain partial/ambiguous rather than being forced into equivalence.

## Compatibility

Any change to equivalence criteria is Product-Truth-sensitive and requires canonical semantic fixtures plus integrity proof.

## Proof

- `tests/integrity/semantic-resolution.test.ts`
- `fixtures/semantic-cases/`
- QA gate: `semantic-resolution`
