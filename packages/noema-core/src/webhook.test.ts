import { describe, expect, it } from "vitest";
import { semanticEventSchema } from "@noema/schemas/events";
import type { SemanticEvent } from "@noema/schemas/events";
import {
  envelopeIdempotencyKey,
  signWebhookEnvelope,
  verifyWebhookEnvelope,
  WebhookSecretStore,
  createWebhookTransport,
  WEBHOOK_ENVELOPE_VERSION,
  WEBHOOK_SIGNATURE_VERSION
} from "@noema/noema-core/webhook";
import { initializeRouterState, routeEvent } from "@noema/noema-core/notification";
import type { WatchSubscription } from "@noema/schemas/events";

const NOW = 1_700_000_003_000;
const SECRET = "dest-secret-fixture-not-a-real-token";

function materialEvent(): SemanticEvent {
  return semanticEventSchema.parse({
    schemaVersion: "noema-semantic-event-v1",
    eventId: "event:fixture:material-1",
    eventType: "MATERIAL_CHANGE",
    correlationId: "correlation:fixture:change-1",
    replayKey: "change:fixture:change-1",
    objectId: "object:fixture",
    objectVersion: 2,
    priorVersion: 1,
    occurredAt: NOW,
    sourceRefs: ["source:fixture:primary"],
    evidenceRefs: ["evidence:fixture:primary"],
    receiptRefs: ["verification:fixture:2", "decision:fixture:2"],
    objectRoot: "0x2222222222222222222222222222222222222222222222222222222222222222",
    evidenceRoot: "0x3333333333333333333333333333333333333333333333333333333333333333",
    oldVersion: 1,
    newVersion: 2,
    oldDecision: "CONDITIONAL",
    newDecision: "ALLOW",
    verificationReceiptRef: "verification:fixture:2",
    decisionReceiptRef: "decision:fixture:2",
    severity: "CRITICAL",
    materiality: "MATERIAL"
  });
}

function subscription(): WatchSubscription {
  return {
    schemaVersion: "noema-watch-subscription-v1",
    subscriptionId: "subscription:fixture:1",
    watchId: "watch:fixture:1",
    objectId: "object:fixture",
    eventTypes: ["MATERIAL_CHANGE"],
    channels: ["WEBHOOK"],
    webhookUrl: "https://receiver.example/noema",
    createdAt: NOW - 1_000,
    status: "ACTIVE"
  };
}

describe("webhook envelope signing", () => {
  it("receiver can authenticate origin and detect tampering", () => {
    const event = materialEvent();
    const envelope = signWebhookEnvelope({
      event,
      deliveryId: "delivery:event:fixture:material-1:subscription:fixture:1:WEBHOOK:https://receiver.example/noema",
      attempt: 1,
      timestamp: NOW,
      secret: SECRET
    });

    const ok = verifyWebhookEnvelope({ envelope, secret: SECRET, nowMs: NOW });
    expect(ok.valid).toBe(true);
    expect(ok.envelope?.eventId).toBe(event.eventId);

    const tampered = { ...envelope, eventId: "event:fixture:material-999" };
    const bad = verifyWebhookEnvelope({ envelope: tampered, secret: SECRET, nowMs: NOW });
    expect(bad.valid).toBe(false);
    expect(bad.reason).toMatch(/tampering|wrong secret/);

    const wrongSecret = verifyWebhookEnvelope({ envelope, secret: "wrong-secret", nowMs: NOW });
    expect(wrongSecret.valid).toBe(false);
  });

  it("bounds replay attacks by timestamp window", () => {
    const event = materialEvent();
    const envelope = signWebhookEnvelope({
      event,
      deliveryId: "delivery:1",
      attempt: 1,
      timestamp: NOW,
      secret: SECRET
    });

    const within = verifyWebhookEnvelope({ envelope, secret: SECRET, nowMs: NOW, maxAgeMs: 60_000 });
    expect(within.valid).toBe(true);

    const tooOld = verifyWebhookEnvelope({ envelope, secret: SECRET, nowMs: NOW + 10 * 60_000, maxAgeMs: 60_000 });
    expect(tooOld.valid).toBe(false);
    expect(tooOld.reason).toMatch(/replay window/);

    const future = verifyWebhookEnvelope({ envelope, secret: SECRET, nowMs: NOW - 10 * 60_000, maxAgeMs: 60_000 });
    expect(future.valid).toBe(false);
  });

  it("duplicate deliveries are safe for conforming consumers via idempotency key", () => {
    const event = materialEvent();
    const envelope1 = signWebhookEnvelope({
      event,
      deliveryId: "delivery:1",
      attempt: 1,
      timestamp: NOW,
      secret: SECRET
    });
    const envelope2 = signWebhookEnvelope({
      event,
      deliveryId: "delivery:1",
      attempt: 1,
      timestamp: NOW,
      secret: SECRET
    });
    expect(envelopeIdempotencyKey(envelope1)).toBe(envelopeIdempotencyKey(envelope2));
    expect(envelopeIdempotencyKey(envelope1)).toBe(`${event.eventId}:delivery:1:1`);
  });

  it("retries preserve canonical event identity with distinct delivery-attempt identities", () => {
    const event = materialEvent();
    const attempt1 = signWebhookEnvelope({
      event,
      deliveryId: "delivery:1",
      attempt: 1,
      timestamp: NOW,
      secret: SECRET
    });
    const attempt2 = signWebhookEnvelope({
      event,
      deliveryId: "delivery:1",
      attempt: 2,
      timestamp: NOW + 1_000,
      secret: SECRET
    });
    expect(attempt1.eventId).toBe(attempt2.eventId);
    expect(attempt1.deliveryId).toBe(attempt2.deliveryId);
    expect(attempt1.attempt).not.toBe(attempt2.attempt);
    expect(envelopeIdempotencyKey(attempt1)).not.toBe(envelopeIdempotencyKey(attempt2));
  });

  it("payload includes links/IDs needed to fetch exact object version and receipts", () => {
    const event = materialEvent();
    const envelope = signWebhookEnvelope({
      event,
      deliveryId: "delivery:1",
      attempt: 1,
      timestamp: NOW,
      secret: SECRET
    });
    expect(envelope.links.objectId).toBe(event.objectId);
    expect(envelope.links.objectVersion).toBe(event.objectVersion);
    expect(envelope.links.verificationReceiptRef).toBe("verification:fixture:2");
    expect(envelope.links.decisionReceiptRef).toBe("decision:fixture:2");
  });

  it("manual replay can redeliver a historical event without creating a new semantic event", () => {
    const event = materialEvent();
    const original = signWebhookEnvelope({
      event,
      deliveryId: "delivery:1",
      attempt: 1,
      timestamp: NOW,
      secret: SECRET
    });
    const replayed = signWebhookEnvelope({
      event,
      deliveryId: "delivery:1",
      attempt: 1,
      timestamp: NOW + 60_000,
      secret: SECRET
    });
    expect(replayed.eventId).toBe(original.eventId);
    expect(replayed.payload.eventId).toBe(original.payload.eventId);
    expect(replayed.payload).toEqual(original.payload);
  });
});

describe("webhook secret store", () => {
  it("holds destination-scoped secrets and supports rotation without exposing them", () => {
    const store = new WebhookSecretStore();
    store.set("https://receiver.example/noema", SECRET);

    const secret = store.get("https://receiver.example/noema");
    expect(secret).toBe(SECRET);
    expect(JSON.stringify({ store })).not.toContain(SECRET);

    store.rotate("https://receiver.example/noema", "new-secret");
    expect(store.accepts("https://receiver.example/noema", "new-secret")).toBe(true);
    expect(store.accepts("https://receiver.example/noema", SECRET)).toBe(true);
    store.set("https://receiver.example/noema", "latest-secret");
    expect(store.accepts("https://receiver.example/noema", "latest-secret")).toBe(true);
  });
});

describe("webhook transport via notification router", () => {
  it("signs deliveries produced by the router without embedding secrets in receipts", () => {
    const store = new WebhookSecretStore();
    store.set("https://receiver.example/noema", SECRET);
    let captured: unknown;

    const transport = createWebhookTransport({
      secretStore: store,
      nowMs: () => NOW
    });

    const { state, receipts } = routeEvent({
      event: materialEvent(),
      subscriptions: [subscription()],
      state: initializeRouterState(),
      nowMs: NOW,
      transport
    });

    expect(receipts).toHaveLength(1);
    const serialized = JSON.stringify(state.deliveries);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("Bearer ");
    expect(receipts[0]!.state).toBe("ACKNOWLEDGED");
    void captured;
  });

  it("fails closed when a destination secret is missing", () => {
    const store = new WebhookSecretStore();
    const transport = createWebhookTransport({ secretStore: store, nowMs: () => NOW });

    const { receipts } = routeEvent({
      event: materialEvent(),
      subscriptions: [subscription()],
      state: initializeRouterState(),
      nowMs: NOW,
      transport,
      retry: { maxAttempts: 1, baseBackoffMs: 100, backoffMultiplier: 2, maxBackoffMs: 1_000 }
    });

    expect(receipts[0]!.state).toBe("DEAD_LETTERED");
    expect(receipts[0]!.attempts[0]?.errorCode).toBe("WEBHOOK_SECRET_MISSING");
  });

  it("envelope carries the canonical envelope version and signature version", () => {
    const envelope = signWebhookEnvelope({
      event: materialEvent(),
      deliveryId: "delivery:1",
      attempt: 1,
      timestamp: NOW,
      secret: SECRET
    });
    expect(envelope.envelopeVersion).toBe(WEBHOOK_ENVELOPE_VERSION);
    expect(envelope.signatureVersion).toBe(WEBHOOK_SIGNATURE_VERSION);
  });
});