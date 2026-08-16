import { describe, expect, it } from "vitest";
import { semanticEventSchema } from "@noema/schemas/events";
import type { WatchSubscription } from "@noema/schemas/events";
import {
  DEFAULT_RETRY_POLICY,
  initializeRouterState,
  routeEvent,
  type Delivery,
  type Transport,
  type TransportResult,
  type RouterState
} from "@noema/noema-core/notification";

const NOW = 1_700_000_001_000;

function materialEvent(overrides: Record<string, unknown> = {}) {
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
    materiality: "MATERIAL",
    ...overrides
  });
}

function subscription(
  overrides: Partial<WatchSubscription> = {}
): WatchSubscription {
  return {
    schemaVersion: "noema-watch-subscription-v1",
    subscriptionId: "subscription:fixture:1",
    watchId: "watch:fixture:1",
    objectId: "object:fixture",
    mandateId: "mandate:fixture:1",
    eventTypes: ["MATERIAL_CHANGE"],
    channels: ["WEBHOOK", "TELEGRAM"],
    webhookUrl: "https://notify.example/noema",
    telegramChatId: "chat:fixture",
    createdAt: NOW - 1_000,
    status: "ACTIVE",
    ...overrides
  };
}

function ackTransport(): Transport {
  return {
    send(): TransportResult {
      return { ok: true, acknowledged: true };
    }
  };
}

function failTransport(attemptsBeforeSuccess = Infinity, errorCode = "HTTP_500"): Transport {
  let sent = 0;
  return {
    send(): TransportResult {
      sent += 1;
      if (sent >= attemptsBeforeSuccess) return { ok: true, acknowledged: true };
      return { ok: false, errorCode };
    }
  };
}

function pumpUntilTerminal(
  event: ReturnType<typeof materialEvent>,
  subscriptions: WatchSubscription[],
  transport: Transport,
  retry?: import("@noema/noema-core/notification").RetryPolicy,
  startMs = NOW
): { receipts: import("@noema/noema-core/notification").DeliveryReceipt[]; state: RouterState; nowMs: number } {
  let state = initializeRouterState();
  let nowMs = startMs;
  let receipts: import("@noema/noema-core/notification").DeliveryReceipt[] = [];
  let steps = 0;
  let settled = false;
  while (!settled && steps < 100) {
    const out = routeEvent(
      retry === undefined
        ? { event, subscriptions, state, nowMs, transport }
        : { event, subscriptions, state, nowMs, transport, retry }
    );
    state = out.state;
    receipts = out.receipts;
    settled = out.receipts.every(
      (r) =>
        r.state === "ACKNOWLEDGED" ||
        r.state === "FAILED" ||
        r.state === "DEAD_LETTERED"
    );
    const nextDue = out.receipts
      .flatMap((r) => r.attempts)
      .filter((a) => a.state === "QUEUED")
      .map((a) => a.scheduledAt)
      .sort((a, b) => a - b)[0];
    nowMs = nextDue !== undefined ? nextDue : nowMs + 60_000;
    steps += 1;
  }
  return { receipts, state, nowMs };
}

describe("notification router", () => {
  it("fans one event out to multiple channels retaining the same eventId/correlationId", () => {
    const { receipts } = pumpUntilTerminal(
      materialEvent(),
      [subscription()],
      ackTransport()
    );

    expect(receipts).toHaveLength(2);
    const byChannel = new Map(receipts.map((r) => [r.channel, r]));
    expect(byChannel.get("WEBHOOK")).toBeDefined();
    expect(byChannel.get("TELEGRAM")).toBeDefined();
    for (const receipt of receipts) {
      expect(receipt.eventId).toBe("event:fixture:material-1");
      expect(receipt.correlationId).toBe("correlation:fixture:change-1");
      expect(receipt.replayKey).toBe("change:fixture:change-1");
      expect(receipt.state).toBe("ACKNOWLEDGED");
    }
  });

  it("does not create duplicate logical notifications for the same idempotency key on replay", () => {
    const event = materialEvent();
    const first = pumpUntilTerminal(event, [subscription()], ackTransport());
    expect(first.receipts).toHaveLength(2);

    const replayed = pumpUntilTerminal(
      event,
      [subscription()],
      ackTransport(),
      undefined,
      NOW + 60_000
    );
    expect(replayed.receipts).toHaveLength(2);
    expect(replayed.receipts.map((r) => r.deliveryId).sort()).toEqual(
      first.receipts.map((r) => r.deliveryId).sort()
    );
  });

  it("uses bounded exponential backoff and preserves attempt history", () => {
    const { receipts } = pumpUntilTerminal(
      materialEvent(),
      [subscription({ channels: ["WEBHOOK"], webhookUrl: "https://notify.example/noema", telegramChatId: undefined })],
      failTransport(4),
      { maxAttempts: 5, baseBackoffMs: 100, backoffMultiplier: 2, maxBackoffMs: 1_000 }
    );

    const webhook = receipts.find((r) => r.channel === "WEBHOOK")!;
    const attempts = webhook.attempts.filter((a) => a.state !== "QUEUED");
    expect(attempts.length).toBe(4);
    expect(webhook.state).toBe("ACKNOWLEDGED");

    const sentOffsets = attempts.map((a) => a.sentAt! - NOW);
    expect(sentOffsets[0]).toBe(0);
    expect(sentOffsets[1]).toBe(100);
    expect(sentOffsets[2]).toBe(300);
    expect(sentOffsets[3]).toBe(700);
    expect(sentOffsets.every((offset) => offset <= 1_000)).toBe(true);
  });

  it("dead-letters after maxAttempts permanent failures", () => {
    const { receipts } = pumpUntilTerminal(
      materialEvent(),
      [subscription({ channels: ["WEBHOOK"], webhookUrl: "https://notify.example/noema", telegramChatId: undefined })],
      failTransport(Infinity, "HTTP_500"),
      { maxAttempts: 3, baseBackoffMs: 100, backoffMultiplier: 2, maxBackoffMs: 1_000 }
    );

    const webhook = receipts.find((r) => r.channel === "WEBHOOK")!;
    const attempts = webhook.attempts.filter((a) => a.state !== "QUEUED");
    expect(attempts.length).toBe(3);
    expect(webhook.state).toBe("DEAD_LETTERED");
    expect(attempts.every((a) => a.errorCode === "HTTP_500")).toBe(true);
  });

  it("respects event-type routing policy filters", () => {
    const { receipts } = routeEvent({
      event: materialEvent(),
      subscriptions: [subscription()],
      state: initializeRouterState(),
      nowMs: NOW,
      transport: ackTransport(),
      policy: { includeEventTypes: ["VERIFICATION_CHANGED"] }
    });

    expect(receipts).toHaveLength(0);
  });

  it("skips suspended subscriptions", () => {
    const { receipts } = routeEvent({
      event: materialEvent(),
      subscriptions: [subscription({ status: "SUSPENDED" })],
      state: initializeRouterState(),
      nowMs: NOW,
      transport: ackTransport()
    });

    expect(receipts).toHaveLength(0);
  });

  it("preserves destination correlation without embedding secrets in receipts", () => {
    const { receipts } = pumpUntilTerminal(materialEvent(), [subscription()], ackTransport());

    for (const receipt of receipts) {
      const serialized = JSON.stringify(receipt);
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("Bearer ");
      expect(receipt.destination).not.toContain("token");
    }
  });

  it("permanent failure does not mutate canonical event data", () => {
    const event = materialEvent();
    const before = JSON.stringify(event);
    const { state } = pumpUntilTerminal(
      event,
      [subscription({ channels: ["WEBHOOK"], webhookUrl: "https://notify.example/noema", telegramChatId: undefined })],
      failTransport(Infinity),
      { maxAttempts: 2, baseBackoffMs: 100, backoffMultiplier: 2, maxBackoffMs: 1_000 }
    );

    const deliveries: Delivery[] = Object.values(state.deliveries);
    expect(deliveries[0]!.state).toBe("DEAD_LETTERED");
    expect(JSON.stringify(event)).toBe(before);
    expect(event.eventId).toBe("event:fixture:material-1");
  });

  it("replays a historical event deterministically", () => {
    const event = materialEvent();
    const first = pumpUntilTerminal(event, [subscription()], ackTransport());

    const replaySameTime = pumpUntilTerminal(
      event,
      [subscription()],
      ackTransport(),
      undefined,
      NOW
    );
    expect(replaySameTime.receipts.map((r) => JSON.stringify(r)).sort()).toEqual(
      first.receipts.map((r) => JSON.stringify(r)).sort()
    );

    const replayLater = pumpUntilTerminal(
      event,
      [subscription()],
      ackTransport(),
      undefined,
      NOW + 3_600_000
    );
    expect(replayLater.receipts.map((r) => r.deliveryId).sort()).toEqual(
      first.receipts.map((r) => r.deliveryId).sort()
    );
    expect(replayLater.receipts.map((r) => r.state).sort()).toEqual(
      first.receipts.map((r) => r.state).sort()
    );
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBeGreaterThan(0);
  });
});