# Machine Surfaces Usage

**Import:** `@noema/noema-core/surfaces`

**Source:** `packages/noema-core/src/surfaces.ts`

## Purpose

Provides canonical read projections for REST, SDK, MCP and frontend data-loading boundaries. It exists so every machine interface exposes the same EconomicObject, VerificationReceipt and DecisionReceipt semantics.

## Consumer contract

Use this module to project already-canonical state for transport. Consumers may serialize, paginate or present the projection, but must not reinterpret it.

Typical input is a canonical snapshot containing:

- `EconomicObject`
- `VerificationReceipt`
- `DecisionReceipt`

Typical output is the corresponding canonical machine-readable projection.

## Example

```ts
import { toMachineSurface } from "@noema/noema-core/surfaces";

const payload = toMachineSurface({ object, verification, decision });
return Response.json(payload);
```

Use the actual exported function/type names from the module when integrating; if exports change, update this document in the same change.

## Frontend guidance

Frontend data loaders may consume this projection directly when they need full canonical machine state. Presentation components should normally convert canonical state through `@noema/noema-core/ui`.

## Do not

Do not recompute or override:

- object status;
- relationship predicates/equivalence;
- verification result or roots;
- mandate decision/reason codes;
- version authority.

## Dependencies

Depends on canonical economic-kernel receipt/object types. It must remain presentation/transport logic only.

## Integrity proof

Canonical gate: `machine-surface-parity`.
Test: `tests/integrity/machine-surface-parity.test.ts`.

## Compatibility

If the transport shape changes, update REST/SDK/MCP/frontend consumers and this usage contract together. A transport projection must never silently diverge by interface.
