import { describe, expect, it } from "vitest";
import type { Mandate } from "@noema/economic-kernel";
import { evaluateMandate } from "@noema/noema-core/mandate";
import {
  initializeWatchState,
  processWatchedChange,
  type WatchRegistration
} from "@noema/noema-core/watch";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

const NOW = 1_700_000_001_000;

const mandate: Mandate = {
  id: "mandate:watch:treasury",
  version: 1,
  principal: "treasury:fixture",
  objective: "Hold fresh verified Treasury exposure",
  allowedAssetClasses: ["TOKENIZED_TREASURY"],
  prohibitedAssetClasses: [],
  maxEvidenceAgeMs: 3_600_000,
  jurisdictions: [],
  requiredClaims: [
    { property: "economicIdentity", requiredState: "SOURCED" }
  ],
  requiredEvidence: [
    { type: "API_RESPONSE", maxAgeMs: 3_600_000 }
  ]
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

describe("Noema watch-triggered re-evaluation", () => {
  it("creates vN+1, re-verifies, re-evaluates, emits an event, and derives notifications", () => {
    const base = makeEconomicObject();
    const initial = evaluate(base);
    expect(initial.verification.overallStatus).toBe("PASS");
    expect(initial.decision.decision).toBe("ALLOW");
    const originalV1 = JSON.stringify(base);

    const evidence = base.evidence[0]!;
    const claim = base.claims[0]!;
    const staleCandidate = makeEconomicObject({
      evidence: [{ ...evidence, freshness: "STALE" }],
      claims: [{ ...claim, state: "STALE" }],
      status: "STALE",
      updatedAt: NOW + 1_000
    });

    const first = processWatchedChange({
      state: initializeWatchState(base),
      watch,
      candidate: staleCandidate,
      changeId: "change:stale-nav",
      previousVerification: initial.verification,
      previousDecision: initial.decision,
      nowMs: NOW + 1_000,
      evaluate: (object) => evaluate(object, NOW + 1_000)
    });

    expect(first.result.changed).toBe(true);
    expect(first.state.history).toHaveLength(2);
    expect(first.result.object.version).toBe(2);
    expect(first.state.history[1]!.supersedesVersion).toBe(1);
    expect(JSON.stringify(first.state.history[0]!.object)).toBe(originalV1);
    expect(first.result.verification.overallStatus).toBe("FAIL");
    expect(first.result.decision.decision).toBe("BLOCK");

    const event = first.result.event!;
    expect(event.oldVersion).toBe(1);
    expect(event.newVersion).toBe(2);
    expect(event.oldDecision).toBe("ALLOW");
    expect(event.newDecision).toBe("BLOCK");
    expect(event.oldDecisionRef).toBe(initial.decision.id);
    expect(event.newDecisionRef).toBe(first.result.decision.id);
    expect(event.verificationReceiptRef).toBe(first.result.verification.id);
    expect(event.correlationId).toBe("correlation:watch:fixture:1:change:stale-nav");

    expect(first.result.notifications).toHaveLength(2);
    for (const notification of first.result.notifications) {
      expect(notification.eventId).toBe(event.id);
      expect(notification.correlationId).toBe(event.correlationId);
      expect(notification.objectId).toBe(base.id);
      expect(notification.oldVersion).toBe(1);
      expect(notification.newVersion).toBe(2);
      expect(notification.oldDecision).toBe("ALLOW");
      expect(notification.newDecision).toBe("BLOCK");
      expect(notification.decisionReceiptRef).toBe(first.result.decision.id);
    }
  });

  it("is idempotent for retries of the same logical material change", () => {
    const base = makeEconomicObject();
    const initial = evaluate(base);
    const evidence = base.evidence[0]!;
    const claim = base.claims[0]!;
    const candidate = makeEconomicObject({
      evidence: [{ ...evidence, freshness: "STALE" }],
      claims: [{ ...claim, state: "STALE" }],
      status: "STALE"
    });
    const input = {
      watch,
      candidate,
      changeId: "change:idempotent",
      previousVerification: initial.verification,
      previousDecision: initial.decision,
      nowMs: NOW + 2_000,
      evaluate: (object: ReturnType<typeof makeEconomicObject>) => evaluate(object, NOW + 2_000)
    };

    const first = processWatchedChange({
      state: initializeWatchState(base),
      ...input
    });
    const retry = processWatchedChange({
      state: first.state,
      ...input
    });

    expect(retry.state.history).toHaveLength(2);
    expect(retry.result).toEqual(first.result);
    expect(retry.state.processed["change:idempotent"]).toEqual(first.result);
  });

  it("does not emit a semantic event for a non-material source refresh", () => {
    const base = makeEconomicObject();
    const initial = evaluate(base);
    const evidence = base.evidence[0]!;
    const refresh = makeEconomicObject({
      updatedAt: base.updatedAt + 5_000,
      evidence: [{ ...evidence, fetchedAt: evidence.fetchedAt + 5_000 }]
    });

    const result = processWatchedChange({
      state: initializeWatchState(base),
      watch,
      candidate: refresh,
      changeId: "refresh:fetch-time-only",
      previousVerification: initial.verification,
      previousDecision: initial.decision,
      nowMs: NOW + 5_000,
      evaluate: (object) => evaluate(object, NOW + 5_000)
    });

    expect(result.result.changed).toBe(false);
    expect(result.state.history).toHaveLength(1);
    expect(result.result.event).toBeUndefined();
    expect(result.result.notifications).toEqual([]);
  });
});
