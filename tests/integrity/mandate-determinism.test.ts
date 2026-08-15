import { describe, expect, it } from "vitest";
import type {
  Claim,
  DecisionReceipt,
  EconomicObject,
  Evidence,
  Mandate,
  VerificationReceipt
} from "@noema/economic-kernel";
import { evaluateMandate, POLICY_ENGINE_VERSION } from "@noema/noema-core";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

function makeMandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    id: "mandate:us-treasury-conservative",
    version: 1,
    principal: "principal:agent-007",
    objective: "Conservative tokenized treasury allocation with verified backing",
    allowedAssetClasses: ["TOKENIZED_TREASURY", "SOVEREIGN_DEBT"],
    prohibitedAssetClasses: ["UNCOLLATERALIZED_CREDIT", "MEMECOIN"],
    jurisdictions: ["US", "GLOBAL_OFFSHORE"],
    requiredClaims: [
      {
        property: "economicIdentity",
        requiredState: "SOURCED"
      }
    ],
    requiredEvidence: [
      {
        type: "API_RESPONSE",
        maxAgeMs: 86_400_000
      }
    ],
    expiresAt: 1_800_000_000_000,
    ...overrides
  };
}

describe("deterministic mandate evaluation and DecisionReceipt lineage integrity", () => {
  it("evaluates a verified object matching mandate policy to ALLOW with complete DecisionReceipt lineage", () => {
    const object = makeEconomicObject();
    const verification = verifyEconomicObject(object, { nowMs: 1_700_000_000_000 });
    const mandate = makeMandate();

    const decisionReceipt = evaluateMandate(object, verification, mandate, {
      nowMs: 1_700_000_000_000
    });

    expect(decisionReceipt.decision).toBe("ALLOW");
    expect(decisionReceipt.policyEngineVersion).toBe("noema-policy-v1");
    expect(decisionReceipt.verificationReceiptRef).toBe(verification.id);
    expect(decisionReceipt.evidenceRoot).toBe(verification.evidenceRoot);
    expect(decisionReceipt.policyChecks.length).toBeGreaterThan(0);
    expect(decisionReceipt.policyChecks.every((c) => c.result === "PASS")).toBe(true);
    expect(decisionReceipt.supportingClaims).toContain("claim:fixture:identity");
  });

  it("produces CONDITIONAL when object is partially resolved or unresolved verification boundary is present", () => {
    const inferredClaim: Claim = {
      ...makeEconomicObject().claims[0]!,
      id: "claim:inferred",
      state: "INFERRED"
    };

    const object = makeEconomicObject({
      status: "PARTIALLY_RESOLVED",
      claims: [inferredClaim]
    });

    const verification = verifyEconomicObject(object, { nowMs: 1_700_000_000_000 });
    expect(verification.overallStatus).toBe("UNRESOLVED");

    const mandate = makeMandate();
    const decisionReceipt = evaluateMandate(object, verification, mandate, {
      nowMs: 1_700_000_000_000
    });

    expect(decisionReceipt.decision).toBe("CONDITIONAL");
    expect(decisionReceipt.reasonCodes).toContain("VERIFICATION_UNRESOLVED");
    expect(decisionReceipt.policyChecks.some((c) => c.result === "UNRESOLVED")).toBe(true);
  });

  it("deterministically BLOCKs on prohibited asset class, expired mandate, or failed verification", () => {
    const object = makeEconomicObject({
      classification: {
        primary: "UNCOLLATERALIZED_CREDIT",
        secondary: [],
        confidence: 1,
        claimRef: "claim:fixture:identity"
      }
    });

    const verification = verifyEconomicObject(object, { nowMs: 1_700_000_000_000 });
    const mandate = makeMandate();

    const decisionReceipt = evaluateMandate(object, verification, mandate, {
      nowMs: 1_700_000_000_000
    });

    expect(decisionReceipt.decision).toBe("BLOCK");
    expect(decisionReceipt.reasonCodes).toContain("PROHIBITED_ASSET_CLASS");
  });

  it("deterministically BLOCKs on stale, conflicting, or revoked evidence without bypass", () => {
    // 1. Stale evidence case
    const staleObject = makeEconomicObject({
      status: "STALE",
      evidence: [
        {
          ...makeEconomicObject().evidence[0]!,
          freshness: "STALE"
        }
      ]
    });
    const staleVerification = verifyEconomicObject(staleObject, { nowMs: 1_700_000_000_000 });
    const staleDecision = evaluateMandate(staleObject, staleVerification, makeMandate(), {
      nowMs: 1_700_000_000_000
    });
    expect(staleDecision.decision).toBe("BLOCK");
    expect(staleDecision.reasonCodes).toContain("VERIFICATION_FAILED");

    // 2. Conflicting object case
    const conflictingObject = makeEconomicObject({
      status: "CONFLICTING"
    });
    const conflictingVerification = verifyEconomicObject(conflictingObject, { nowMs: 1_700_000_000_000 });
    const conflictingDecision = evaluateMandate(conflictingObject, conflictingVerification, makeMandate(), {
      nowMs: 1_700_000_000_000
    });
    expect(conflictingDecision.decision).toBe("BLOCK");
    expect(conflictingDecision.reasonCodes).toContain("OBJECT_STATUS_CONFLICTING");

    // 3. Revoked object case
    const revokedObject = makeEconomicObject({
      status: "REVOKED"
    });
    const revokedVerification = verifyEconomicObject(revokedObject, { nowMs: 1_700_000_000_000 });
    const revokedDecision = evaluateMandate(revokedObject, revokedVerification, makeMandate(), {
      nowMs: 1_700_000_000_000
    });
    expect(revokedDecision.decision).toBe("BLOCK");
    expect(revokedDecision.reasonCodes).toContain("OBJECT_STATUS_REVOKED");
  });

  it("replays identically: same canonical inputs produce byte-for-byte equivalent decision semantics", () => {
    const object = makeEconomicObject();
    const verification = verifyEconomicObject(object, { nowMs: 1_700_000_000_000 });
    const mandate = makeMandate();
    const context = { nowMs: 1_700_000_000_000 };

    const decision1 = evaluateMandate(object, verification, mandate, context);
    const decision2 = evaluateMandate(object, verification, mandate, context);

    expect(decision1.decision).toBe(decision2.decision);
    expect(decision1.reasonCodes).toEqual(decision2.reasonCodes);
    expect(decision1.policyChecks).toEqual(decision2.policyChecks);
    expect(decision1.supportingClaims).toEqual(decision2.supportingClaims);
    expect(decision1.evidenceRoot).toBe(decision2.evidenceRoot);
    expect(decision1.verificationReceiptRef).toBe(decision2.verificationReceiptRef);
  });
});
