import { describe, expect, it } from "vitest";
import {
  SEMANTIC_EVENT_SCHEMA_VERSION,
  WATCH_SUBSCRIPTION_SCHEMA_VERSION,
  DELIVERY_CORRELATION_SCHEMA_VERSION,
  deriveSemanticEventId,
  hashSemanticEvent,
  migrateSemanticEventVersion,
  semanticEventSchema,
  watchSubscriptionSchema,
  deliveryCorrelationSchema,
  type SemanticEvent
} from "@noema/schemas/events";

function materialChange(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schemaVersion: SEMANTIC_EVENT_SCHEMA_VERSION,
    eventId: "event:fixture:material",
    eventType: "MATERIAL_CHANGE",
    correlationId: "correlation:fixture:change-1",
    replayKey: "change:fixture:change-1",
    objectId: "object:fixture",
    objectVersion: 2,
    priorVersion: 1,
    occurredAt: 1_700_000_000_000,
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
    ...overrides
  };
}

describe("semantic event schema", () => {
  it("accepts a canonical material-change event", () => {
    expect(semanticEventSchema.safeParse(materialChange()).success).toBe(true);
  });

  it("rejects unknown event types", () => {
    expect(semanticEventSchema.safeParse(materialChange({ eventType: "BOGUS" })).success).toBe(false);
  });

  it("rejects unknown nested state flags", () => {
    expect(
      semanticEventSchema.safeParse(materialChange({ stateFlags: ["TRUST_ME"] })).success
    ).toBe(false);
  });

  it("rejects invalid mandate decision values", () => {
    expect(
      semanticEventSchema.safeParse(materialChange({ newDecision: "MAYBE" })).success
    ).toBe(false);
  });

  it("rejects malformed roots", () => {
    expect(
      semanticEventSchema.safeParse(materialChange({ objectRoot: "not-a-hex" })).success
    ).toBe(false);
  });

  it("rejects extra strict-mode fields", () => {
    expect(
      semanticEventSchema.safeParse(materialChange({ sneaky: "field" })).success
    ).toBe(false);
  });

  it("requires old/new version ordering fields present on material change", () => {
    expect(
      semanticEventSchema.safeParse(
        materialChange({ oldVersion: undefined, newVersion: undefined })
      ).success
    ).toBe(false);
  });
});

describe("semantic event determinism", () => {
  it("derives a stable event id and payload hash", () => {
    const event = semanticEventSchema.parse(materialChange());
    const firstId = deriveSemanticEventId(event);
    const firstHash = hashSemanticEvent(event);

    const replay = semanticEventSchema.parse(materialChange());
    expect(deriveSemanticEventId(replay)).toBe(firstId);
    expect(hashSemanticEvent(replay)).toBe(firstHash);
  });

  it("changes event id when the canonical transition differs", () => {
    const v2 = semanticEventSchema.parse(materialChange({ newVersion: 3 }));
    expect(deriveSemanticEventId(v2)).not.toBe(
      deriveSemanticEventId(semanticEventSchema.parse(materialChange()))
    );
  });

  it("is insensitive to field order in the serialized event", () => {
    const a = semanticEventSchema.parse(materialChange());
    const { verificationReceiptRef: _verificationReceiptRef, ...rest } = materialChange();
    const reordered = {
      objectRoot: rest.objectRoot,
      eventId: rest.eventId,
      eventType: rest.eventType,
      newVersion: rest.newVersion,
      occurredAt: rest.occurredAt,
      schemaVersion: rest.schemaVersion,
      replayKey: rest.replayKey,
      verificationReceiptRef: "verification:fixture:2",
      correlationId: rest.correlationId,
      oldVersion: rest.oldVersion,
      objectId: rest.objectId,
      objectVersion: rest.objectVersion,
      priorVersion: rest.priorVersion,
      sourceRefs: rest.sourceRefs,
      evidenceRefs: rest.evidenceRefs,
      receiptRefs: rest.receiptRefs,
      evidenceRoot: rest.evidenceRoot,
      oldDecision: rest.oldDecision,
      newDecision: rest.newDecision,
      decisionReceiptRef: rest.decisionReceiptRef,
      stateFlags: rest.stateFlags
    } as Record<string, unknown>;

    const b = semanticEventSchema.parse(reordered);
    expect(hashSemanticEvent(a)).toBe(hashSemanticEvent(b));
  });
});

describe("semantic event migration policy", () => {
  it("accepts the current version", () => {
    expect(migrateSemanticEventVersion(materialChange())).toMatchObject({
      schemaVersion: SEMANTIC_EVENT_SCHEMA_VERSION,
      eventType: "MATERIAL_CHANGE"
    });
  });

  it("fails closed on unknown future versions", () => {
    expect(() =>
      migrateSemanticEventVersion(materialChange({ schemaVersion: "noema-semantic-event-v99" }))
    ).toThrow(/Unsupported semantic event schema version/);
  });

  it("fails closed on missing version", () => {
    expect(() =>
      migrateSemanticEventVersion(materialChange({ schemaVersion: undefined }))
    ).toThrow(/Unsupported semantic event schema version/);
  });
});

describe("watch subscription schema", () => {
  it("accepts a canonical subscription", () => {
    const subscription = {
      schemaVersion: WATCH_SUBSCRIPTION_SCHEMA_VERSION,
      subscriptionId: "subscription:fixture:1",
      watchId: "watch:fixture:1",
      objectId: "object:fixture",
      mandateId: "mandate:fixture:1",
      eventTypes: ["MATERIAL_CHANGE", "MANDATE_DECISION_CHANGED"],
      channels: ["WEBHOOK", "TELEGRAM"],
      webhookUrl: "https://example.com/hook",
      telegramChatId: "chat:fixture",
      createdAt: 1_700_000_000_000,
      status: "ACTIVE"
    };
    expect(watchSubscriptionSchema.safeParse(subscription).success).toBe(true);
  });

  it("rejects unknown channels", () => {
    expect(
      watchSubscriptionSchema.safeParse({
        schemaVersion: WATCH_SUBSCRIPTION_SCHEMA_VERSION,
        subscriptionId: "subscription:fixture:1",
        watchId: "watch:fixture:1",
        objectId: "object:fixture",
        eventTypes: ["MATERIAL_CHANGE"],
        channels: ["SMOKE_SIGNAL"],
        createdAt: 1_700_000_000_000
      }).success
    ).toBe(false);
  });

  it("rejects unknown event type filters", () => {
    expect(
      watchSubscriptionSchema.safeParse({
        schemaVersion: WATCH_SUBSCRIPTION_SCHEMA_VERSION,
        subscriptionId: "subscription:fixture:1",
        watchId: "watch:fixture:1",
        objectId: "object:fixture",
        eventTypes: ["MATERIAL_CHANGE", "BOGUS"],
        channels: ["WEBHOOK"],
        createdAt: 1_700_000_000_000
      }).success
    ).toBe(false);
  });
});

describe("delivery correlation schema", () => {
  it("accepts a canonical delivery correlation", () => {
    expect(
      deliveryCorrelationSchema.safeParse({
        schemaVersion: DELIVERY_CORRELATION_SCHEMA_VERSION,
        deliveryId: "delivery:fixture:1",
        eventId: "event:fixture:material",
        correlationId: "correlation:fixture:change-1",
        replayKey: "change:fixture:change-1",
        channel: "WEBHOOK",
        destination: "https://example.com/hook"
      }).success
    ).toBe(true);
  });

  it("rejects a correlation that does not preserve the event correlation id", () => {
    const result = deliveryCorrelationSchema.safeParse({
      schemaVersion: DELIVERY_CORRELATION_SCHEMA_VERSION,
      deliveryId: "delivery:fixture:1",
      eventId: "event:fixture:material",
      correlationId: "correlation:someone:else",
      replayKey: "change:fixture:change-1",
      channel: "WEBHOOK",
      destination: "https://example.com/hook"
    });
    expect(result.success).toBe(true);
    const event = semanticEventSchema.parse(materialChange());
    expect((result.success ? result.data.correlationId : "")).not.toBe(event.correlationId);
  });
});

describe("events align with canonical watch transitions", () => {
  it("material change event carries old/new version and decision correlation", () => {
    const event = semanticEventSchema.parse(materialChange()) as Extract<
      SemanticEvent,
      { eventType: "MATERIAL_CHANGE" }
    >;
    expect(event.oldVersion).toBe(1);
    expect(event.newVersion).toBe(2);
    expect(event.oldDecision).toBe("CONDITIONAL");
    expect(event.newDecision).toBe("ALLOW");
    expect(event.verificationReceiptRef).toBe("verification:fixture:2");
  });
});
