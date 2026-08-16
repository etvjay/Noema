import { describe, expect, it } from "vitest";
import type { EconomicObject, Mandate } from "@noema/economic-kernel";
import { evaluateMandate, POLICY_ENGINE_VERSION } from "@noema/noema-core/mandate";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

const NOW = 1_700_000_001_000;

function makeMandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    id: "mandate:fixture:treasury",
    version: 1,
    principal: "treasury:fixture",
    objective: "Hold verified tokenized Treasury exposure",
    allowedAssetClasses: ["TOKENIZED_TREASURY"],
    prohibitedAssetClasses: [],
    jurisdictions: [],
    requiredClaims: [
      {
        property: "economicIdentity",
        requiredState: "SOURCED"
      }
    ],
    requiredEvidence: [
      {
        type: "API_RESPONSE",
        maxAgeMs: 3_600_000
      }
    ],
    maxEvidenceAgeMs: 3_600_000,
    ...overrides
  };
}

function evaluate(object: EconomicObject, mandate = makeMandate()) {
  const verification = verifyEconomicObject(object, {
    nowMs: NOW,
    maxEvidenceAgeMs: mandate.maxEvidenceAgeMs
  });
  return {
    verification,
    decision: evaluateMandate(object, verification, mandate, { nowMs: NOW })
  };
}

describe("Noema deterministic mandate evaluation", () => {
  it("replays verified eligible inputs to the same ALLOW DecisionReceipt", () => {
    const object = makeEconomicObject();
    const mandate = makeMandate();
    const verification = verifyEconomicObject(object, {
      nowMs: NOW,
      maxEvidenceAgeMs: mandate.maxEvidenceAgeMs
    });

    const first = evaluateMandate(object, verification, mandate, { nowMs: NOW });
    const second = evaluateMandate(object, verification, mandate, { nowMs: NOW });

    expect(second).toEqual(first);
    expect(first.decision).toBe("ALLOW");
    expect(first.reasonCodes).toEqual([]);
    expect(first.policyEngineVersion).toBe(POLICY_ENGINE_VERSION);
    expect(first.verificationReceiptRef).toBe(verification.id);
    expect(first.evidenceRoot).toBe(verification.evidenceRoot);
    expect(first.supportingClaims).toContain("claim:fixture:identity");
    expect(first.policyChecks.every((check) => check.result === "PASS")).toBe(true);
  });

  it("returns CONDITIONAL when a mandate threshold depends on unresolved economic data", () => {
    const mandate = makeMandate({ minYieldBps: 400 });
    const { decision } = evaluate(makeEconomicObject(), mandate);

    expect(decision.decision).toBe("CONDITIONAL");
    expect(decision.reasonCodes).toContain("YIELD_UNRESOLVED");
    expect(
      decision.policyChecks.some(
        (check) => check.ruleId === "mandate:min-yield" && check.result === "UNRESOLVED"
      )
    ).toBe(true);
  });

  it("blocks stale, conflicting, revoked, and insufficient evidence states", () => {
    for (const status of ["STALE", "CONFLICTING", "REVOKED", "INSUFFICIENT_EVIDENCE"] as const) {
      const object = makeEconomicObject({ status });
      const { decision } = evaluate(object);
      expect(decision.decision).toBe("BLOCK");
      expect(decision.reasonCodes).toContain(`OBJECT_${status}`);
    }
  });

  it("blocks stale evidence even if the object status was incorrectly left RESOLVED", () => {
    const base = makeEconomicObject();
    const evidence = base.evidence[0]!;
    const object = makeEconomicObject({
      status: "RESOLVED",
      evidence: [{ ...evidence, freshness: "STALE" }]
    });
    const { verification, decision } = evaluate(object);

    expect(verification.overallStatus).toBe("FAIL");
    expect(decision.decision).toBe("BLOCK");
    expect(decision.reasonCodes).toContain("VERIFICATION_FAILED");
    expect(decision.reasonCodes).toContain("REQUIRED_EVIDENCE_STALE");
  });

  it("does not allow hidden model judgment to override deterministic policy", () => {
    const object = {
      ...makeEconomicObject({ status: "REVOKED" }),
      aiSuggestedDecision: "ALLOW",
      modelConfidence: 1
    } as EconomicObject & { aiSuggestedDecision: string; modelConfidence: number };

    const { decision } = evaluate(object);

    expect(object.aiSuggestedDecision).toBe("ALLOW");
    expect(decision.decision).toBe("BLOCK");
    expect(decision.reasonCodes).toContain("OBJECT_REVOKED");
  });
});
