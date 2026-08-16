# SemanticEvent & Subscription Contract Usage

## Purpose

Defines the single canonical event/subscription contract that every notification and delivery surface consumes. Events describe canonical Noema state transitions; subscriptions describe where and how those events are delivered. This module never renders channel-specific payloads and never grants event data canonical or execution authority.

**Import:** `@noema/schemas/events`
**Source:** `packages/schemas/src/events.ts`

## Primary exports

- `semanticEventSchema` — strict discriminated union over canonical event types
- `materialChangeEventSchema`, `verificationChangedEventSchema`, `mandateDecisionChangedEventSchema`, `representationChangedEventSchema`, `attestationChangedEventSchema`
- `watchSubscriptionSchema` / `subscriptionSchema`
- `deliveryCorrelationSchema`
- `deriveSemanticEventId(event)` — deterministic event identity
- `hashSemanticEvent(event)` — deterministic payload hash
- `migrateSemanticEventVersion(event)` — fail-closed version migration
- `SEMANTIC_EVENT_SCHEMA_VERSION`, `WATCH_SUBSCRIPTION_SCHEMA_VERSION`, `DELIVERY_CORRELATION_SCHEMA_VERSION`

## Input / output contract

A `SemanticEvent` is a strict, versioned record of a canonical Noema state transition. Every event preserves:

- `eventId`, `correlationId`, `replayKey` (idempotency)
- `objectId`, `objectVersion`, optional `priorVersion`
- correlated receipt references
- optional `objectRoot` / `evidenceRoot`
- causal `sourceRefs` and `evidenceRefs`
- canonical `occurredAt` timestamp
- optional `severity`, `materiality`, `stateFlags` (UNKNOWN / STALE / CONFLICTING / UNSUPPORTED)

Event-specific fields carry the correlated change, e.g. `MATERIAL_CHANGE` carries `oldVersion`/`newVersion`, old/new `MandateDecision`, `verificationReceiptRef`, and optional `decisionReceiptRef`. All schemas are strict: unknown fields fail validation.

## Determinism and idempotency

`deriveSemanticEventId` and `hashSemanticEvent` are byte-for-byte deterministic over the canonical transition projection (arrays sorted, field order normalized). The same canonical transition always produces the same event identity and payload hash. `replayKey` is the idempotency key: replaying an already-processed input must not create a logically new event.

## Minimal example

```ts
import {
  semanticEventSchema,
  deriveSemanticEventId,
  hashSemanticEvent,
  watchSubscriptionSchema
} from "@noema/schemas/events";

const event = semanticEventSchema.parse(rawTransitionPayload);
const eventId = deriveSemanticEventId(event);
const eventHash = hashSemanticEvent(event);

const subscription = watchSubscriptionSchema.parse({
  schemaVersion: "noema-watch-subscription-v1",
  subscriptionId: "subscription:fixture:1",
  watchId: "watch:fixture:1",
  objectId: "object:fixture",
  eventTypes: ["MATERIAL_CHANGE"],
  channels: ["WEBHOOK", "TELEGRAM"],
  createdAt: Date.now()
});
```

## Frontend-safe usage

Frontend may render validated events, subscriptions, and delivery correlations for inspectability. It must not create canonical events, re-derive economic truth, or treat a valid event schema as authorization to act.

## Authority / non-responsibilities

Events are derived from canonical Noema state transitions (watch/versioning kernel), never from channel-specific rendering. This module defines shape and deterministic identity only; notification routing, delivery, and channel adapters are separate responsibilities.

## Versioning / migration

- Current schema version: `noema-semantic-event-v1`.
- `migrateSemanticEventVersion` fails closed on unknown, missing, or future versions rather than coercing.
- Cross-version hashing: an event identity is only stable within a schema version; migrations must not silently change a historical root/hash.

## Failure / uncertainty

Unknown event types, unknown channels, malformed roots, invalid enum values, strict-mode extras, and missing version fields are all rejected. Unknown/stale/conflicting economic states remain explicit via `stateFlags` rather than being silently resolved.

## Proof

- `packages/schemas/src/events.test.ts` (19 tests) — schema acceptance, adversarial rejection, determinism/idempotency, migration fail-closed, subscription/delivery correlation.
- Full suite: `pnpm test`; typecheck: `pnpm typecheck`; QA gates: `pnpm qa`, `pnpm qa:module-usage`.