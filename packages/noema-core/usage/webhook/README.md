# Signed Webhook Delivery Usage

**Import:** `@noema/noema-core/webhook`
**Source:** `packages/noema-core/src/webhook.ts`

## Purpose

Provides institutional systems a reliable, authenticatable machine-to-machine notification channel for canonical Noema events. Webhook payloads are signed canonical event envelopes — never channel-specific economic interpretation.

## Primary exports

- `signWebhookEnvelope(input)` — build an HMAC-SHA256 signed envelope over canonical event data
- `verifyWebhookEnvelope(input)` — authenticate origin, detect tampering, enforce replay window
- `WebhookSecretStore` — destination-scoped secret management with rotation
- `createWebhookTransport(options)` — notification-router `Transport` adapter that signs deliveries
- `webhookSignaturePayload(input)` / `envelopeIdempotencyKey(envelope)`
- Types: `WebhookEnvelope`, `WebhookLinks`, `SignWebhookEnvelopeInput`, `VerifyWebhookEnvelopeResult`

## Envelope contract

`WebhookEnvelope` (`noema-webhook-envelope-v1`, `noema-webhook-hmac-sha256-v1`) contains:

- `eventId`, `correlationId`, `deliveryId`, `attempt`, `timestamp`
- `links` — `objectId`, `objectVersion`, `verificationReceiptRef`, optional `decisionReceiptRef`/`objectRoot`/`evidenceRoot`, so receivers can fetch the exact object version and receipts
- `payload` — the canonical `SemanticEvent` (validated via `semanticEventSchema`)
- `signature` — HMAC-SHA256 over the canonical serialization of every other field

## Minimal example

```ts
import {
  signWebhookEnvelope,
  verifyWebhookEnvelope,
  WebhookSecretStore,
  createWebhookTransport
} from "@noema/noema-core/webhook";
import { routeEvent } from "@noema/noema-core/notification";

// sender: destination-scoped secret, never logged
const store = new WebhookSecretStore();
store.set("https://receiver.example/noema", process.env.WEBHOOK_SECRET!);

const transport = createWebhookTransport({ secretStore: store });
const { receipts } = routeEvent({
  event,
  subscriptions: [subscription],
  state: initializeRouterState(),
  nowMs: Date.now(),
  transport
});

// receiver: authenticate + validate replay window
const result = verifyWebhookEnvelope({
  envelope: receivedBody,
  secret: store.get("https://receiver.example/noema")!,
  nowMs: Date.now(),
  maxAgeMs: 60_000
});
if (!result.valid) reject(result.reason);
```

## Reference receiver example

```ts
const processed = new Set<string>(); // durable idempotency ledger

function receiveWebhook(body: unknown, headers: { destination: string }, nowMs: number) {
  const secret = store.get(headers.destination);
  const result = verifyWebhookEnvelope({ envelope: body, secret, nowMs, maxAgeMs: 60_000 });
  if (!result.valid) return { status: 400, reason: result.reason };
  const key = envelopeIdempotencyKey(result.envelope!);
  if (processed.has(key)) return { status: 200, deduplicated: true };
  processed.add(key);
  // fetch object version + receipts via result.envelope.links
  return { status: 200, accepted: true };
}
```

## Security boundary

- Signature authentication detects tampering and wrong-secret forgery.
- Replay attacks are bounded by the timestamp window (`maxAgeMs`, default 5 min) plus idempotency keying.
- Duplicate deliveries are safe: the same `eventId:deliveryId:attempt` is idempotent.
- Retries keep the same `eventId`/`deliveryId` (canonical event identity) with a distinct `attempt`.
- Destination secrets live only in `WebhookSecretStore`; they are never embedded in envelopes, receipts, or logs, and are never exposed to Noema AI.
- Endpoint failures/rotation never affect canonical EconomicObject state.

## Manual replay

Re-signing a historical event with the same delivery context redelivers it without creating a new semantic event (`payload` is byte-identical).

## Proof

- `packages/noema-core/src/webhook.test.ts` (10 tests) — origin auth, tamper detection, replay window, idempotent duplicates, retry identity, links, secret rotation, transport integration, fail-closed missing secret.
- QA gate: `webhook-delivery` in `qa/noema-integrity.json`.
- Reference receiver: `tests/integrity/webhook-delivery.test.ts`.