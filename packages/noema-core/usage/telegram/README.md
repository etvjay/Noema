# Telegram Sidecar Usage

**Import:** `@noema/noema-core/telegram`
**Source:** `packages/noema-core/src/telegram.ts`

## Purpose

Outbound Telegram delivery for canonical Noema SemanticEvents (#47). Renders deterministic alerts from canonical events + presentation config and delivers them through the canonical notification router as a `TELEGRAM` transport. Messages summarize canonical state — they never reinterpret it. Deep links/callback actions resolve to canonical object/version/receipt/evidence identifiers.

## Public responsibilities

- `renderTelegramAlert(event, chatId, config)` — deterministic, versioned rendering (`noema-telegram-render-v1`) with object identity, version transition, changed fields, old/new decision, verification/representation/attestation status, state flags, and receipt/evidence/source refs.
- `assertNoSecretsInAlert(alert)` — fail-closed guard that rejects secret-bearing alert text.
- `createTelegramTransport` — a `Transport` (notification router) that renders + delivers Telegram alerts and records delivery correlation (`noema-telegram-delivery-correlation-v1`) without touching canonical state.
- `createTelegramDeliveryCorrelation`, `telegramMessageId`, `telegramChannel`, `telegramRenderVersion`.

## Minimal example

```ts
import { initializeRouterState, routeEvent } from "@noema/noema-core/notification";
import { createTelegramTransport } from "@noema/noema-core/telegram";

const transport = createTelegramTransport({
  chatIdFor: (subscriptionId, destination) => destination, // e.g. map subscription -> chat id
  onDeliver: ({ alert, correlation }) => log(alert.digest, correlation.messageId)
});
const { receipts } = routeEvent({ event, subscriptions, state: initializeRouterState(), nowMs, transport });
```

## Canonical semantics

- **Deterministic rendering.** Same event + config → same text and digest. No model in the loop.
- **Distinctions survive.** VERIFIED/INFERRED/STALE/CONFLICTING/UNKNOWN/REVOKED render via event `stateFlags` and status transitions.
- **No secrets by default.** Alert text carries refs, never evidence bodies, tokens, or credentials. `assertNoSecretsInAlert` is fail-closed.
- **No duplicate logical alerts.** Router replayKey/delivery identity dedupe across retries.
- **Correlation is delivery state, not economic state.** Delivery receipts never become EconomicObject fields.
- **Failure isolation.** A failed Telegram delivery retries/dead-letters in the router only; watch/object/decision state is untouched.

## Authority boundary

Telegram is a presentation/transport surface, never an authority. It cannot create VERIFIED/ATTESTED state, equivalence, mandate outcomes, or versions. Alerts must cite canonical refs and never rewrite decisions.

## Proof

- `packages/noema-core/src/telegram.test.ts` — 10 unit tests (determinism, identity/transition/decision/refs, state-flag distinctions, secret-free, correlation, router fan-out, dedupe, failure isolation, versioning, wrong-channel rejection).
- `tests/integrity/telegram-outbound.test.ts` — parity gate (5 tests): deterministic rendering, Telegram+webhook fan-out without drift, retry identity without duplicates, correlation, no secrets.
- QA gate `telegram-outbound` in `qa/noema-integrity.json`.
