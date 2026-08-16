# Core Noema Schema Usage

## Purpose

Provides strict runtime schemas for canonical Noema domain records such as claims, evidence, attestations, economic relationships, parties, rights, restrictions, verification records, mandates, and EconomicObjects.

**Import:** `@noema/schemas`  
**Source:** `packages/schemas/src/index.ts`

## Intended consumers

Canonical backend boundaries, adapters, persistence/transport validation, integrity tests, and tooling that must reject malformed Noema domain records before they enter deterministic logic.

## Minimal example

```ts
import { evidenceSchema } from "@noema/schemas";

const evidence = evidenceSchema.parse(input);
```

## Frontend-safe usage

Use only to validate a documented canonical payload. Frontend presentation should normally consume `@noema/noema-core/ui` rather than rebuilding domain semantics from raw schemas.

## Authority boundary

Schema validity means only that a payload has a valid shape. It does not make a claim true, evidence authoritative, a relationship equivalent, or a decision allowed.

## Failure semantics

Malformed nested data is rejected by strict Zod schemas. Do not coerce rejected inputs into canonical state.

## Compatibility

Schema changes are canonical-contract changes. Update relevant consumers, fixtures, integrity tests, and this usage contract together.

## Proof

- `packages/schemas/src/index.test.ts`
- QA gate: `economic-object-schema`
