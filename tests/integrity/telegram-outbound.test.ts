import { describe, expect, it } from "vitest";
import type { SemanticEvent, WatchSubscription } from "@noema/schemas/events";
import { semanticEventSchema } from "@noema/schemas/events";
import { initializeRouterState, routeEvent, type RouterState } from "@noema/noema-core/notification";
import {
  assertNoSecretsInAlert,
  createTelegramTransport,
  renderTelegramAlert,
  TELEGRAM_DELIVERY_CORRELATION_VERSION,
  TELEGRAM_RENDER_VERSION,
  type TelegramAlert
} from "@noema/noema-core/telegram";

const NOW = 1_700_000_010_000;

const event: SemanticEvent = semanticEventSchema.parse({
  schemaVersion: "noema-semantic-event-v1",
  eventId: "event:telegram:integrity:material-1",
  eventType: "MATERIAL_CHANGE",
  correlationId: "correlation:telegram:integrity:1",
  replayKey: "change:telegram:integrity:1",
  objectId: "object:telegram:integrity",
  objectVersion: 2,
  priorVersion: 1,
  occurredAt: NOW,
  sourceRefs: ["source:telegram:1"],
  evidenceRefs: ["evidence:telegram:2"],
  receiptRefs: ["verification:telegram:2", "decision:telegram:2"],
  severity: "INFO",
  materiality: "MATERIAL",
  stateFlags: ["CONFLICTING"],
  changeKind: "ECONOMIC_STATE",
  oldVersion: 1,
  newVersion: 2,
  oldDecision: "BLOCK",
  newDecision: "ALLOW",
  verificationReceiptRef: "verification:telegram:2",
  decisionReceiptRef: "decision:telegram:2"
});

const subscription: WatchSubscription = {
  schemaVersion: "noema-watch-subscription-v1",
  subscriptionId: "subscription:telegram:integrity:1",
  watchId: "watch:telegram:integrity:1",
  objectId: "object:telegram:integrity",
  eventTypes: ["MATERIAL_CHANGE"],
  channels: ["TELEGRAM", "WEBHOOK"],
  telegramChatId: "-1009876543210",
  webhookUrl: "https://receiver.example/noema",
  createdAt: NOW,
  status: "ACTIVE"
};

describe("Telegram outbound sidecar (#47)", () => {
  it("renders canonical events deterministically with identity, transition, decision, and refs", () => {
    const alert = renderTelegramAlert(event, "-1009876543210");
    expect(alert.text).toContain("object:telegram:integrity");
    expect(alert.text).toContain("v1 -> v2");
    expect(alert.text).toContain("decision: BLOCK -> ALLOW");
    expect(alert.text).toContain("verification: verification:telegram:2");
    expect(alert.text).toContain("state: CONFLICTING");
    expect(alert.digest.length).toBe(64);
    const again = renderTelegramAlert(event, "-1009876543210");
    expect(again.digest).toBe(alert.digest);
  });

  it("fans one canonical event out to Telegram and signed webhook without semantic drift", () => {
    const state: RouterState = initializeRouterState();
    const delivered: TelegramAlert[] = [];
    const transport = createTelegramTransport({
      chatIdFor: () => "-1009876543210",
      onDeliver: ({ alert }) => delivered.push(alert)
    });
    const { receipts } = routeEvent({ event, subscriptions: [subscription], state, nowMs: NOW, transport });
    const tg = receipts.find((receipt) => receipt.channel === "TELEGRAM");
    const wh = receipts.find((receipt) => receipt.channel === "WEBHOOK");
    expect(tg).toBeDefined();
    expect(wh).toBeDefined();
    expect(delivered.length).toBe(1);
    expect(tg!.eventId).toBe(wh!.eventId);
    expect(tg!.correlationId).toBe(wh!.correlationId);
    expect(tg!.replayKey).toBe(wh!.replayKey);
    expect(tg!.destination).toBe("-1009876543210");
  });

  it("retries preserve event identity and do not duplicate logical notifications", () => {
    const state: RouterState = initializeRouterState();
    const delivered: TelegramAlert[] = [];
    const transport = createTelegramTransport({
      chatIdFor: () => "-1009876543210",
      failNext: 1,
      onDeliver: ({ alert }) => delivered.push(alert)
    });
    const first = routeEvent({
      event,
      subscriptions: [subscription],
      state,
      nowMs: NOW,
      transport,
      retry: { maxAttempts: 3, baseBackoffMs: 1, backoffMultiplier: 1, maxBackoffMs: 10 }
    });
    const firstTg = first.receipts.find((receipt) => receipt.channel === "TELEGRAM");
    expect(firstTg!.state).toBe("RETRYING");
    const second = routeEvent({
      event,
      subscriptions: [subscription],
      state: first.state,
      nowMs: NOW + 5,
      transport,
      retry: { maxAttempts: 3, baseBackoffMs: 1, backoffMultiplier: 1, maxBackoffMs: 10 }
    });
    const secondTg = second.receipts.find((receipt) => receipt.channel === "TELEGRAM");
    expect(secondTg!.state).toBe("ACKNOWLEDGED");
    expect(secondTg!.attempts.length).toBe(2);
    expect(delivered.length).toBe(1);
    expect(delivered[0]!.eventId).toBe("event:telegram:integrity:material-1");
    expect(delivered[0]!.replayKey).toBe("change:telegram:integrity:1");
  });

  it("delivery correlation records message/chat identity without becoming economic state", () => {
    const state: RouterState = initializeRouterState();
    const correlations: string[] = [];
    const transport = createTelegramTransport({
      chatIdFor: () => "-1009876543210",
      onDeliver: ({ correlation }) => correlations.push(correlation.schemaVersion)
    });
    const { receipts } = routeEvent({ event, subscriptions: [subscription], state, nowMs: NOW, transport });
    const tg = receipts.find((receipt) => receipt.channel === "TELEGRAM");
    expect(tg).toBeDefined();
    expect(correlations).toContain(TELEGRAM_DELIVERY_CORRELATION_VERSION);
    expect(tg!.deliveryId).toContain("delivery:");
  });

  it("rendering is versioned and alerts contain no secrets", () => {
    expect(TELEGRAM_RENDER_VERSION).toBe("noema-telegram-render-v1");
    const alert = renderTelegramAlert(event, "-1009876543210");
    expect(() => assertNoSecretsInAlert(alert)).not.toThrow();
    expect(alert.text).not.toContain("secret");
  });
});
