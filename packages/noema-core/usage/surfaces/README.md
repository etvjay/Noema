# Machine Surfaces Usage

**Import:** `@noema/noema-core/surfaces`

**Source:** `packages/noema-core/src/surfaces.ts`

**Schema version:** `MACHINE_SURFACE_VERSION = "noema-machine-v1"`

## Purpose

Provides canonical read projections for REST, SDK, MCP and frontend data-loading boundaries so every machine interface preserves the same EconomicObject, VerificationReceipt and DecisionReceipt semantics.

## Public API

- `MACHINE_SURFACE_VERSION`
- `CanonicalNoemaSnapshot`
- `RestNoemaSnapshot`
- `McpNoemaResource`
- `MachineSourceFailure`
- `ExternalProviderObservationEnvelope`
- `toRestSnapshot(snapshot)`
- `fromSdkSnapshot(snapshot)`
- `toMcpResource(snapshot)`
- `machineSourceFailure(sourceId, code, message)`
- `externalProviderObservationEnvelope(input)`

## Core input

```ts
interface CanonicalNoemaSnapshot {
  object: EconomicObject;
  verification: VerificationReceipt;
  decision: DecisionReceipt;
  lineage?: EconomicObjectLineageReport;
}
```

## Examples

```ts
import {
  toRestSnapshot,
  fromSdkSnapshot,
  toMcpResource
} from "@noema/noema-core/surfaces";

const canonical = { object, verification, decision, lineage };
const rest = toRestSnapshot(canonical);
const sdk = fromSdkSnapshot(canonical);
const mcp = toMcpResource(canonical);
```

`toMcpResource` produces a resource URI shaped as `noema://objects/<id>/versions/<version>`.

Explicit source failures and external observations can be represented with:

```ts
import {
  machineSourceFailure,
  externalProviderObservationEnvelope
} from "@noema/noema-core/surfaces";
```

## Frontend guidance

Frontend data loaders may consume `CanonicalNoemaSnapshot` or the REST/SDK projections when they need full canonical machine state. Presentation components should normally use `@noema/noema-core/ui` to create the view model.

## Invariants

The module clones canonical snapshots rather than interpreting them. Transport boundaries preserve canonical object, verification and decision semantics.

## Do not

Do not recompute or override object status, economic equivalence, verification results/roots, mandate decisions/reason codes, canonical version authority or AI proposal promotion.

`externalProviderObservationEnvelope` is observation-only; it does not confer verification authority.

## Dependencies

Economic-kernel canonical object/receipt types plus the core lineage report type. No network/runtime dependency is required by this projection module.

## Integrity proof

Canonical gate: `machine-surface-parity`.
Test: `tests/integrity/machine-surface-parity.test.ts`.

## Compatibility

If the transport shape or `MACHINE_SURFACE_VERSION` changes, update REST/SDK/MCP/frontend consumers and this usage contract together.
