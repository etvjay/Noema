# Typed SDK Usage

**Import:** `@noema/noema-core/sdk`
**Source:** `packages/noema-core/src/sdk.ts`

## Public responsibilities

A typed Noema integration surface that is a thin semantic wrapper over canonical API contracts — never a second business-logic implementation. Developers get `objects`, `evidence`, `attestations`, `verification`, `mandates`, `decisions`, `watches`, `events`, and `commitments` clients whose types are mechanically bound to canonical schemas and the REST resource contract (#49).

## Minimal example

```ts
import { createNoemaSdk, createCanonicalEngineTransport } from "@noema/noema-core/sdk";
import type { CanonicalEngine } from "@noema/noema-core/sdk";

const sdk = createNoemaSdk(createCanonicalEngineTransport(engine)); // engine: CanonicalEngine

const latest = await sdk.objects.latest({ objectId: "object:treasury", repositoryStateRef: "repository:state:123" });
const decision = await sdk.mandates.evaluate({ objectId: "object:treasury", mandateId: "mandate:1", nowMs: Date.now() });
const watch = await sdk.watches.create({
  subscription: { /* WatchSubscription from @noema/schemas/events */ }
});
const event = await sdk.events.get({ eventId: "event:treasury:material-1" });
```

## Canonical semantics

- **No client-side recompute.** The SDK never recomputes equivalence, verification, mandate outcomes, materiality, or version authority. `mandates.evaluate` delegates to the canonical engine; `objects.compare` reports `equivalenceDeterminedBy: "canonical-roots"` using VerificationReceipt roots fetched from the engine.
- **Round-trip fidelity.** Exact canonical IDs, roots, and receipts survive without translation drift — `objects.get`/`verification.get`/`decisions.get` return the canonical records verbatim.
- **Typed errors.** Every failure returns `{ ok: false, error }` where `error.code` is a canonical machine-readable reason code (`INVALID_REF`, `MALFORMED_ID`, `VERSION_NOT_FOUND`, `LATEST_UNAVAILABLE`, `NOT_FOUND`, `VALIDATION_ERROR`, ...) and `error.operation` names the failing SDK operation.
- **Deterministic pagination.** `objects.versionHistory`, `events.list`, and `watches.list` use the same opaque `v1:` cursors as the REST contract; results are replayable.
- **Watch creation.** Exposes event filters and delivery destinations without embedding destination secrets into object state. `validateWatchSubscriptionNoSecret` rejects subscriptions that would leak a destination secret; secrets belong in the webhook secret store (#53), never in the subscription or EconomicObject.

## Transport contract

`NoemaTransport.request(operation)` is a discriminated union over `SdkOperationName`. `createCanonicalEngineTransport(engine)` wires a `CanonicalEngine` (repository-backed canonical primitives) to the SDK in-process. A deployed HTTP runtime (#40) provides its own `NoemaTransport` over the REST contract; SDK types bind to the same canonical schemas either way.

## Authority boundary

The SDK must not become an independent decision surface. Deployed runtimes and SDK adapters must preserve exact IDs/roots, propagate canonical reason codes, and never fabricate `latest` selection, verification, or decision results. UI/frontend consumers should use `@noema/noema-core/ui` for presentation.

## Proof

- `packages/noema-core/src/sdk.test.ts` (14 tests) — latest selection, round-trip fidelity, server-side mandate evaluation, decision reason codes, watch creation without secrets, typed errors, deterministic pagination, canonical-root compare, and the documented `latest -> evaluate -> create watch -> inspect event` flow.
- QA gate: `typed-sdk` in `qa/noema-integrity.json`.
- Conformance: `tests/integrity/typed-sdk.test.ts`.