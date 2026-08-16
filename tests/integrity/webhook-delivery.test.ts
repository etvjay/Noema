import { describe, expect, it } from "vitest";
import { semanticEventSchema } from "@noema/schemas/events";
import type { SemanticEvent } from "@noema/schemas/events";
import {
  envelopeIdempotencyKey,
  signWebhookEnvelope,
  verifyWebhookEnvelope,
  WebhookSecretStore,
  createWebhookTransport
} from "@noema/noema-core/webhook";
import { initializeRouterState, routeEvent } from "@noema/noema-core/notification";
import type { WatchSubscription } from "@noema/schemas/events";

const NOW = 1_700_000_100_000;
const DESTINATION = "https://receiver.example/noema";
const SECRET = "integrity-webhook-secret-fixture";

function materialEvent(): SemanticEvent {
  return semanticEventSchema.parse({
    schemaVersion: "noema-semantic-event-v1",
    eventId: "event:integrity:material-1",
    eventType: "MATERIAL_CHANGE",
    correlationId: "correlation:integrity:change-1",
    replayKey: "change:integrity:change-1",
    objectId: "object:integrity",
    objectVersion: 3,
    priorVersion: 2,
    occurredAt: NOW,
    sourceRefs: ["source:integrity:primary"],
    evidenceRefs: ["evidence:integrity:primary"],
    receiptRefs: ["verification:integrity:3", "decision:integrity:3"],
    objectRoot: "0x4444444444444444444444444444444444444444444444444444444444444444",
    evidenceRoot: "0x5555555555555555555555555555555555555555555555555555555555555555",
    oldVersion: 2,
    newVersion: 3,
    oldDecision: "ALLOW",
    newDecision: "ALLOW",
    verificationReceiptRef: "verification:integrity:3",
    decisionReceiptRef: "decision:integrity:3",
    severity: "INFO",
    materiality: "MATERIAL"
  });
}

function subscription(): WatchSubscription {
  return {
    schemaVersion: "noema-watch-subscription-v1",
    subscriptionId: "subscription:integrity:1",
    watchId: "watch:integrity:1",
    objectId: "object:integrity",
    eventTypes: ["MATERIAL_CHANGE"],
    channels: ["WEBHOOK"],
    webhookUrl: DESTINATION,
    createdAt: NOW - 1_000,
    status: "ACTIVE"
  };
}

describe("signed webhook delivery (reference receiver)", () => {
  it("router produces a signed envelope a conforming receiver accepts and deduplicates", () => {
    const store = new WebhookSecretStore();
    store.set(DESTINATION, SECRET);
    const transport = createWebhookTransport({ secretStore: store, nowMs: () => NOW });

    const { state, receipts } = routeEvent({
      event: materialEvent(),
      subscriptions: [subscription()],
      state: initializeRouterState(),
      nowMs: NOW,
      transport
    });

    expect(receipts[0]!.state).toBe("ACKNOWLEDGED");

    const serialized = JSON.stringify(state.deliveries);
    expect(serialized).not.toContain(SECRET);

    const received = signWebhookEnvelope({
      event: materialEvent(),
      deliveryId: "delivery:integrity:1",
      attempt: 1,
      timestamp: NOW,
      secret: SECRET
    });

    const processed = new Set<string>();
    const verify = (body: unknown): { valid: boolean; deduplicated?: boolean } => {
      const result = verifyWebhookEnvelope({ envelope: body, secret: SECRET, nowMs: NOW, maxAgeMs: 60_000 });
      if (!result.valid) return { valid: false };
      const key = envelopeIdempotencyKey(result.envelope!);
      if (processed.has(key)) return { valid: true, deduplicated: true };
      processed.add(key);
      return { valid: true };
    };

    const first = verify(received);
    const duplicate = verify(received);
    expect(first.valid).toBe(true);
    expect(first.deduplicated).toBeUndefined();
    expect(duplicate.valid).toBe(true);
    expect(duplicate.deduplicated).toBe(true);
  });

  it("canonical envelope carries everything a receiver needs to fetch the exact object version and receipts", () => {
    const event = materialEvent();
    const envelope = signWebhookEnvelope({
      event,
      deliveryId: "delivery:integrity:1",
      attempt: 1,
      timestamp: NOW,
      secret: SECRET
    });
    expect(envelope.links.objectId).toBe("object:integrity");
    expect(envelope.links.objectVersion).toBe(3);
    expect(envelope.links.verificationReceiptRef).toBe("verification:integrity:3");
    expect(envelope.links.decisionReceiptRef).toBe("decision:integrity:3");
    expect(envelope.payload.eventId).toBe("event:integrity:material-1");
  });

  it("receiver rejects tampered payloads and out-of-window replays", () => {
    const envelope = signWebhookEnvelope({
      event: materialEvent(),
      deliveryId: "delivery:integrity:1",
      attempt: 1,
      timestamp: NOW,
      secret: SECRET
    });

    const tampered = { ...envelope, payload: { ...envelope.payload, eventId: "event:integrity:forged" } };
    const bad = verifyWebhookEnvelope({ envelope: tampered, secret: SECRET, nowMs: NOW });
    expect(bad.valid).toBe(false);
    expect(bad.reason).toMatch(/tampering|wrong secret/);

    const replayed = verifyWebhookEnvelope({ envelope, secret: SECRET, nowMs: NOW + 10 * 60_000, maxAgeMs: 60_000 });
    expect(replayed.valid).toBe(false);
    expect(replayed.reason).toMatch(/replay window/);
  });

  it("webhook endpoints can rotate secrets without losing in-flight deliveries", () => {
    const store = new WebhookSecretStore();
    store.set(DESTINATION, "rotating-old-secret");

    const inFlight = signWebhookEnvelope({
      event: materialEvent(),
      deliveryId: "delivery:integrity:2",
      attempt: 1,
      timestamp: NOW,
      secret: "rotating-old-secret"
    });

    store.rotate(DESTINATION, "rotating-new-secret");

    const verifyWithRotation = (body: unknown): boolean => {
      const result = verifyWebhookEnvelope({
        envelope: body,
        secret: "rotating-new-secret",
        nowMs: NOW
      });
      if (result.valid) return true;
      return verifyWebhookEnvelope({ envelope: body, secret: "rotating-old-secret", nowMs: NOW }).valid;
    };

    expect(verifyWithRotation(inFlight)).toBe(true);

    const fresh = signWebhookEnvelope({
      event: materialEvent(),
      deliveryId: "delivery:integrity:3",
      attempt: 1,
      timestamp: NOW,
      secret: "rotating-new-secret"
    });
    expect(verifyWithRotation(fresh)).toBe(true);
  });
});