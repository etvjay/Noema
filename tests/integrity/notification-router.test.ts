import { describe, expect, it } from "vitest";
import type { Mandate } from "@noema/economic-kernel";
import { evaluateMandate } from "@noema/noema-core/mandate";
import {
  initializeWatchState,
  processWatchedChange,
  type WatchRegistration
} from "@noema/noema-core/watch";
import {
  materialChangeEventSchema
} from "@noema/schemas/events";
import {
  initializeRouterState,
  routeEvent,
  type Transport
} from "@noema/noema-core/notification";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

const NOW = 1_700_000_002_000;

const mandate: Mandate = {
  id: "mandate:watch:treasury",
  version: 1,
  principal: "treasury:fixture",
  objective: "Hold fresh verified Treasury exposure",
  allowedAssetClasses: ["TOKENIZED_TREASURY"],
  prohibitedAssetClasses: [],
  maxEvidenceAgeMs: 3_600_000,
  jurisdictions: [],
  requiredClaims: [{ property: "economicIdentity", requiredState: "SOURCED" }],
  requiredEvidence: [{ type: "API_RESPONSE", maxAgeMs: 3_600_000 }]
};

const watch: WatchRegistration = {
  id: "watch:fixture:1",
  objectId: "object:fixture",
  mandateId: mandate.id,
  webhookUrl: "https://notify.example/noema",
  discordChannel: "discord:fixture-channel"
};

function evaluate(object: ReturnType<typeof makeEconomicObject>, nowMs = NOW) {
  const verification = verifyEconomicObject(object, {
    nowMs,
    maxEvidenceAgeMs: mandate.maxEvidenceAgeMs!
  });
  const decision = evaluateMandate(object, verification, mandate, { nowMs });
  return { verification, decision };
}

function ackTransport(): Transport {
  return { send: () => ({ ok: true, acknowledged: true }) };
}

describe("notification router over canonical watch pipeline", () => {
  it("routes a canonical material-change event to webhook + MCP with correlated identity", () => {
    const base = makeEconomicObject();
    const initial = evaluate(base);
    const evidence = base.evidence[0]!;
    const claim = base.claims[0]!;
    const candidate = makeEconomicObject({
      evidence: [{ ...evidence, freshness: "STALE" }],
      claims: [{ ...claim, state: "STALE" }],
      status: "STALE",
      updatedAt: NOW + 1_000
    });

    const watchOutcome = processWatchedChange({
      state: initializeWatchState(base),
      watch,
      candidate,
      changeId: "change:stale-nav",
      previousVerification: initial.verification,
      previousDecision: initial.decision,
      nowMs: NOW + 1_000,
      evaluate: (object) => evaluate(object, NOW + 1_000)
    });

    expect(watchOutcome.result.changed).toBe(true);
    const watchEvent = watchOutcome.result.event!;

    const semanticEvent = materialChangeEventSchema.parse({
      schemaVersion: "noema-semantic-event-v1",
      eventId: `event:${watchEvent.id}`,
      eventType: "MATERIAL_CHANGE",
      correlationId: watchEvent.correlationId,
      replayKey: watchEvent.changeId,
      objectId: watchEvent.objectId,
      objectVersion: watchEvent.newVersion,
      priorVersion: watchEvent.oldVersion,
      occurredAt: watchEvent.createdAt,
      sourceRefs: [],
      evidenceRefs: [],
      receiptRefs: [watchEvent.verificationReceiptRef, watchEvent.newDecisionRef],
      objectRoot: watchOutcome.result.verification.objectRoot,
      evidenceRoot: watchOutcome.result.verification.evidenceRoot,
      oldVersion: watchEvent.oldVersion,
      newVersion: watchEvent.newVersion,
      oldDecision: watchEvent.oldDecision,
      newDecision: watchEvent.newDecision,
      verificationReceiptRef: watchEvent.verificationReceiptRef,
      decisionReceiptRef: watchEvent.newDecisionRef,
      severity: "CRITICAL",
      materiality: "MATERIAL"
    });

    const { state, receipts } = routeEvent({
      event: semanticEvent,
      subscriptions: [
        {
          schemaVersion: "noema-watch-subscription-v1",
          subscriptionId: "subscription:watch:1",
          watchId: watch.id,
          objectId: watch.objectId,
          mandateId: mandate.id,
          eventTypes: ["MATERIAL_CHANGE"],
          channels: ["WEBHOOK", "MCP"],
          webhookUrl: watch.webhookUrl,
          createdAt: NOW,
          status: "ACTIVE"
        }
      ],
      state: initializeRouterState(),
      nowMs: NOW + 2_000,
      transport: ackTransport()
    });

    expect(receipts).toHaveLength(2);
    for (const receipt of receipts) {
      expect(receipt.eventId).toBe(`event:${watchEvent.id}`);
      expect(receipt.correlationId).toBe(watchEvent.correlationId);
      expect(receipt.replayKey).toBe(watchEvent.changeId);
      expect(receipt.state).toBe("ACKNOWLEDGED");
    }
    expect(Object.values(state.deliveries)).toHaveLength(2);
  });
});