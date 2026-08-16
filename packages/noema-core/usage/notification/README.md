# Notification Router Usage

**Import:** `@noema/noema-core/notification`
**Source:** `packages/noema-core/src/notification.ts`

## Purpose

Fans one canonical `SemanticEvent` out to multiple human/software channels without semantic drift or duplicate side effects. Produces versioned `Delivery` / `DeliveryReceipt` records with bounded exponential-backoff retry and idempotent at-least-once delivery. The router never reinterprets the economic event; channel renderers receive immutable canonical event data plus routing context only.

## Primary exports

- `routeEvent(input)` — fan one event across subscriptions/channels, advancing due attempts
- `initializeRouterState()` — empty delivery ledger
- `DEFAULT_RETRY_POLICY` — maxAttempts 5, base 1s, ×2, cap 60s
- Types: `Delivery`, `DeliveryReceipt`, `DeliveryAttempt`, `RouterState`, `RoutingPolicy`, `RetryPolicy`, `Transport`, `TransportResult`, `DeliveryChannel`, `DeliveryState`

## Input / output contract

`routeEvent` takes the canonical event, active subscriptions, router state, current time, an injected `Transport`, optional routing policy, and optional retry overrides. It returns the updated state and receipts for every matched destination.

- Multiple channels on one subscription fan out with the **same** `eventId` / `correlationId` / `replayKey`.
- Idempotency: a delivery is keyed by `delivery:${eventId}:${subscriptionId}:${channel}:${destination}`. Replaying the same event never creates a duplicate logical notification.
- Delivery states: `QUEUED → SENT → ACKNOWLEDGED`, or `RETRYING → FAILED / DEAD_LETTERED`. Permanent failure never mutates canonical event data.

## Retry semantics

Bounded exponential backoff: attempt *n* schedules the next attempt at `nowMs + min(base · multiplier^(n−1), max)`. Attempt history is preserved on the delivery. The router is a pump — callers re-invoke `routeEvent` as time advances to let due attempts fire; `advance` only sends attempts whose `scheduledAt <= nowMs`.

## Minimal example

```ts
import { routeEvent, initializeRouterState } from "@noema/noema-core/notification";

const transport = {
  send({ event, channel, destination }) {
    // channel adapter: immutable event + routing context, no secrets in logs
    return { ok: true, acknowledged: true };
  }
};

const { state, receipts } = routeEvent({
  event: canonicalEvent,
  subscriptions: [watchSubscription],
  state: initializeRouterState(),
  nowMs: Date.now(),
  transport
});
```

## Security boundary

Destination secrets/tokens never appear in event payloads, receipts, or logs. The transport adapter owns credential resolution; the router and receipts carry only destinations/correlation identifiers.

## Authority / non-responsibilities

The router does not reinterpret the economic event, does not grant delivery authority to schema-valid payloads, and does not mutate canonical EconomicObject state. Channel rendering and credential handling live in transport adapters, not here.

## Proof

- `packages/noema-core/src/notification.test.ts` (9 tests) — fan-out identity/correlation, idempotent replay, bounded backoff attempt history, dead-lettering, policy filtering, suspended subscriptions, secret-free receipts, canonical-state non-mutation, deterministic historical replay.
- QA gate: `notification-router` in `qa/noema-integrity.json`.