import { describe, expect, it } from "vitest";
import type { SemanticEvent, WatchSubscription } from "@noema/schemas/events";
import { semanticEventSchema } from "@noema/schemas/events";
import {
  initializeRouterState,
  routeEvent,
  type RouterState
} from "@noema/noema-core/notification";
import {
  assertNoSecretsInAlert,
  createTelegramDeliveryCorrelation,
  createTelegramTransport,
  renderTelegramAlert,
  telegramChannel,
  telegramMessageId,
  telegramRenderVersion,
  TELEGRAM_DELIVERY_CORRELATION_VERSION,
  TELEGRAM_RENDER_VERSION,
  type TelegramAlert
} from "@noema/noema-core/telegram";

const NOW = 1_700_000_009_000;

const materialEvent: SemanticEvent = semanticEventSchema.parse({
  schemaVersion: "noema-semantic-event-v1",
  eventId: "event:telegram:material-1",
  eventType: "MATERIAL_CHANGE",
  correlationId: "correlation:telegram:1",
  replayKey: "change:telegram:1",
  objectId: "object:telegram",
  objectVersion: 2,
  priorVersion: 1,
  occurredAt: NOW,
  sourceRefs: ["source:telegram:1"],
  evidenceRefs: ["evidence:telegram:2"],
  receiptRefs: ["verification:telegram:2", "decision:telegram:2"],
  objectRoot: "0x2222222222222222222222222222222222222222222222222222222222222222",
  evidenceRoot: "0x1111111111111111111111111111111111111111111111111111111111111111",
  severity: "INFO",
  materiality: "MATERIAL",
  stateFlags: [],
  changeKind: "ECONOMIC_STATE",
  oldVersion: 1,
  newVersion: 2,
  oldDecision: "BLOCK",
  newDecision: "ALLOW",
  verificationReceiptRef: "verification:telegram:2",
  decisionReceiptRef: "decision:telegram:2"
});

const mandateEvent: SemanticEvent = semanticEventSchema.parse({
  schemaVersion: "noema-semantic-event-v1",
  eventId: "event:telegram:mandate-1",
  eventType: "MANDATE_DECISION_CHANGED",
  correlationId: "correlation:telegram:2",
  replayKey: "change:telegram:2",
  objectId: "object:telegram",
  objectVersion: 2,
  priorVersion: 1,
  occurredAt: NOW,
  sourceRefs: ["source:telegram:1"],
  evidenceRefs: ["evidence:telegram:2"],
  receiptRefs: ["decision:telegram:2"],
  severity: "WARNING",
  materiality: "MATERIAL",
  stateFlags: ["CONFLICTING"],
  mandateId: "mandate:telegram:1",
  mandateVersion: 1,
  previousDecision: "ALLOW",
  currentDecision: "BLOCK",
  decisionReceiptRef: "decision:telegram:2",
  previousDecisionReceiptRef: "decision:telegram:1"
});

const subscription: WatchSubscription = {
  schemaVersion: "noema-watch-subscription-v1",
  subscriptionId: "subscription:telegram:1",
  watchId: "watch:telegram:1",
  objectId: "object:telegram",
  eventTypes: ["MATERIAL_CHANGE", "MANDATE_DECISION_CHANGED"],
  channels: ["TELEGRAM", "WEBHOOK"],
  telegramChatId: "-1001234567890",
  webhookUrl: "https://receiver.example/noema",
  createdAt: NOW,
  status: "ACTIVE"
};

describe("Telegram outbound sidecar", () => {
  it("renders deterministically from a canonical SemanticEvent + config", () => {
    const first = renderTelegramAlert(materialEvent, "-1001234567890", { header: "Noema Alert" });
    const second = renderTelegramAlert(materialEvent, "-1001234567890", { header: "Noema Alert" });
    expect(first.text).toBe(second.text);
    expect(first.digest).toBe(second.digest);
    expect(first.text).toContain("Noema Alert");
    expect(first.text).toContain("MATERIAL_CHANGE");
    expect(first.text).toContain("object:telegram");
    expect(first.text).toContain("v1 -> v2");
  });

  it("includes object identity, version transition, changed fields, old/new decision, and receipt refs", () => {
    const alert = renderTelegramAlert(materialEvent, "-1001234567890");
    expect(alert.text).toContain("object:telegram");
    expect(alert.text).toContain("decision: BLOCK -> ALLOW");
    expect(alert.text).toContain("verification: verification:telegram:2");
    expect(alert.text).toContain("decision: decision:telegram:2");
    expect(alert.text).toContain("change: ECONOMIC_STATE");
    expect(alert.receiptRefs).toEqual(["verification:telegram:2", "decision:telegram:2"]);
  });

  it("preserves VERIFIED/INFERRED/STALE/CONFLICTING/UNKNOWN/REVOKED distinctions", () => {
    const alert = renderTelegramAlert(mandateEvent, "-1001234567890");
    expect(alert.text).toContain("state: CONFLICTING");
    expect(alert.text).toContain("decision: ALLOW -> BLOCK");
    expect(alert.stateFlags).toContain("CONFLICTING");
  });

  it("emits no sensitive evidence bodies or secrets by default", () => {
    const alert = renderTelegramAlert(materialEvent, "-1001234567890");
    expect(alert.text).not.toContain("apiKey");
    expect(alert.text).not.toContain("secret");
    expect(() => assertNoSecretsInAlert(alert)).not.toThrow();
  });

  it("delivery correlation records Telegram message/chat identity without becoming economic state", () => {
    const alert = renderTelegramAlert(materialEvent, "-1001234567890");
    const correlation = createTelegramDeliveryCorrelation({
      deliveryId: "delivery:telegram:1",
      alert,
      subscriptionId: "subscription:telegram:1",
      messageId: telegramMessageId(alert, 1),
      renderedAt: NOW
    });
    expect(correlation.schemaVersion).toBe(TELEGRAM_DELIVERY_CORRELATION_VERSION);
    expect(correlation.chatId).toBe("-1001234567890");
    expect(correlation.eventId).toBe("event:telegram:material-1");
    expect(correlation.replayKey).toBe("change:telegram:1");
    expect(correlation.renderedDigest).toBe(alert.digest);
  });

  it("routes to Telegram via the canonical router and fans out to webhook without semantic drift", () => {
    const state: RouterState = initializeRouterState();
    const delivered: TelegramAlert[] = [];
    const transport = createTelegramTransport({
      chatIdFor: () => "-1001234567890",
      onDeliver: ({ alert }) => delivered.push(alert)
    });
    const { state: nextState, receipts } = routeEvent({
      event: materialEvent,
      subscriptions: [subscription],
      state,
      nowMs: NOW,
      transport
    });
    const telegramReceipts = receipts.filter((receipt) => receipt.channel === "TELEGRAM");
    const webhookReceipts = receipts.filter((receipt) => receipt.channel === "WEBHOOK");
    expect(telegramReceipts.length).toBe(1);
    expect(webhookReceipts.length).toBe(1);
    expect(delivered.length).toBe(1);
    expect(delivered[0]!.eventId).toBe("event:telegram:material-1");
    expect(delivered[0]!.correlationId).toBe("correlation:telegram:1");
    expect(telegramReceipts[0]!.eventId).toBe(webhookReceipts[0]!.eventId);
    expect(telegramReceipts[0]!.correlationId).toBe(webhookReceipts[0]!.correlationId);
    expect(telegramReceipts[0]!.replayKey).toBe(webhookReceipts[0]!.replayKey);
  });

  it("duplicate router attempts do not duplicate logical Telegram alerts", () => {
    const state: RouterState = initializeRouterState();
    const delivered: TelegramAlert[] = [];
    const transport = createTelegramTransport({
      chatIdFor: () => "-1001234567890",
      onDeliver: ({ alert }) => delivered.push(alert)
    });
    const first = routeEvent({ event: materialEvent, subscriptions: [subscription], state, nowMs: NOW, transport });
    const second = routeEvent({ event: materialEvent, subscriptions: [subscription], state: first.state, nowMs: NOW + 1, transport });
    const telegramReceipts = second.receipts.filter((receipt) => receipt.channel === "TELEGRAM");
    expect(telegramReceipts.length).toBe(1);
    expect(delivered.length).toBe(1);
  });

  it("failed Telegram delivery cannot affect watch/object/decision state", () => {
    const state: RouterState = initializeRouterState();
    const transport = createTelegramTransport({ chatIdFor: () => "-1001234567890", failNext: 1 });
    const { state: nextState, receipts } = routeEvent({
      event: materialEvent,
      subscriptions: [subscription],
      state,
      nowMs: NOW,
      transport,
      retry: { maxAttempts: 2, baseBackoffMs: 1, backoffMultiplier: 1, maxBackoffMs: 10 }
    });
    const telegramReceipt = receipts.find((receipt) => receipt.channel === "TELEGRAM");
    expect(telegramReceipt!.state).toBe("RETRYING");
    expect(Object.keys(nextState.deliveries).length).toBe(2);
    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.eventTypes).toContain("MATERIAL_CHANGE");
  });

  it("Telegram rendering is versioned", () => {
    expect(telegramRenderVersion()).toBe(TELEGRAM_RENDER_VERSION);
    expect(TELEGRAM_RENDER_VERSION).toBe("noema-telegram-render-v1");
  });

  it("Telegram transport rejects non-Telegram channels", () => {
    const transport = createTelegramTransport();
    const result = transport.send({
      event: materialEvent,
      subscriptionId: "subscription:telegram:1",
      channel: "WEBHOOK",
      destination: "https://receiver.example/noema",
      deliveryId: "delivery:telegram:1",
      attempt: 1
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("WRONG_CHANNEL");
  });
});
