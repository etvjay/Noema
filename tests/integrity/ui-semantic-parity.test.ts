import { describe, expect, it } from "vitest";
import type { Mandate } from "@noema/economic-kernel";
import { evaluateMandate } from "@noema/noema-core/mandate";
import type { CanonicalNoemaSnapshot } from "@noema/noema-core/surfaces";
import { toNoemaUiViewModel } from "@noema/noema-core/ui";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

const NOW = 1_700_000_001_000;

const mandate: Mandate = {
  id: "mandate:ui",
  version: 1,
  principal: "treasury:ui",
  objective: "Require fresh verified Treasury evidence",
  allowedAssetClasses: ["TOKENIZED_TREASURY"],
  prohibitedAssetClasses: [],
  jurisdictions: [],
  requiredClaims: [],
  requiredEvidence: [{ type: "API_RESPONSE", maxAgeMs: 3_600_000 }],
  maxEvidenceAgeMs: 3_600_000
};

function snapshot(version: 1 | 2): CanonicalNoemaSnapshot {
  const base = makeEconomicObject();
  const evidence = base.evidence[0]!;
  const claim = base.claims[0]!;
  const object = version === 1
    ? base
    : makeEconomicObject({
        version: 2,
        claims: [{ ...claim, state: "STALE" }],
        evidence: [{ ...evidence, freshness: "STALE" }],
        exceptions: [
          {
            id: "exception:ui:stale",
            objectId: base.id,
            type: "EVIDENCE_STALE",
            severity: "BLOCKING",
            affectedClaims: [claim.id],
            evidence: [evidence.id],
            detectedAt: NOW + 1_000,
            status: "OPEN"
          }
        ],
        status: "STALE",
        updatedAt: NOW + 1_000
      });
  const nowMs = version === 1 ? NOW : NOW + 1_000;
  const verification = verifyEconomicObject(object, {
    nowMs,
    maxEvidenceAgeMs: mandate.maxEvidenceAgeMs!
  });
  const decision = evaluateMandate(object, verification, mandate, { nowMs });
  return { object, verification, decision };
}

describe("Noema UI semantic parity", () => {
  it("renders canonical verification and mandate outcomes without recomputing them", () => {
    const canonical = snapshot(2);
    const view = toNoemaUiViewModel(canonical);

    expect(view.object.status).toBe(canonical.object.status);
    expect(view.verification.id).toBe(canonical.verification.id);
    expect(view.verification.status).toBe(canonical.verification.overallStatus);
    expect(view.verification.objectRoot).toBe(canonical.verification.objectRoot);
    expect(view.verification.evidenceRoot).toBe(canonical.verification.evidenceRoot);
    expect(view.decision.id).toBe(canonical.decision.id);
    expect(view.decision.outcome).toBe(canonical.decision.decision);
    expect(view.decision.reasonCodes).toEqual(canonical.decision.reasonCodes);
    expect(view.object.relationshipPredicates).toEqual(
      canonical.object.relationships.map((relationship) => relationship.predicate).sort()
    );
  });

  it("preserves stale/conflicting/revoked warning semantics instead of generic success", () => {
    const stale = toNoemaUiViewModel(snapshot(2));
    expect(stale.object.status).toBe("STALE");
    expect(stale.object.exceptions[0]?.type).toBe("EVIDENCE_STALE");
    expect(stale.object.exceptions[0]?.severity).toBe("BLOCKING");
    expect(stale.evidence[0]?.freshness).toBe("STALE");
    expect(stale.verification.status).toBe("FAIL");
    expect(stale.decision.outcome).toBe("BLOCK");

    for (const status of ["CONFLICTING", "REVOKED"] as const) {
      const canonical = snapshot(1);
      canonical.object.status = status;
      const view = toNoemaUiViewModel(canonical);
      expect(view.object.status).toBe(status);
    }
  });

  it("exposes DecisionReceipt -> VerificationReceipt -> Claim -> Evidence navigation", () => {
    const canonical = snapshot(2);
    const view = toNoemaUiViewModel(canonical);
    const claim = canonical.object.claims[0]!;

    expect(view.decisionLineage.decisionReceiptRef).toBe(canonical.decision.id);
    expect(view.decisionLineage.verificationReceiptRef).toBe(
      canonical.decision.verificationReceiptRef
    );
    expect(view.decisionLineage.claims[0]).toEqual({
      claimId: claim.id,
      state: claim.state,
      sourceRefs: [...claim.sourceRefs].sort(),
      evidenceRefs: [...claim.evidenceRefs].sort()
    });
    expect(view.evidence.map((item) => item.id)).toContain(claim.evidenceRefs[0]);
  });

  it("visibly distinguishes historical vN from vN+1", () => {
    const v1 = toNoemaUiViewModel(snapshot(1));
    const v2 = toNoemaUiViewModel(snapshot(2));

    expect(v1.object.version).toBe(1);
    expect(v1.object.versionLabel).toBe("v1");
    expect(v2.object.version).toBe(2);
    expect(v2.object.versionLabel).toBe("v2");
    expect(v1.object.status).toBe("RESOLVED");
    expect(v2.object.status).toBe("STALE");
  });

  it("copies a canonical decision even when presentation inputs appear inconsistent", () => {
    const canonical = snapshot(1);
    canonical.decision.decision = "BLOCK";
    canonical.decision.reasonCodes = ["CANONICAL_POLICY_OVERRIDE_FIXTURE"];

    const view = toNoemaUiViewModel(canonical);

    expect(canonical.object.status).toBe("RESOLVED");
    expect(view.decision.outcome).toBe("BLOCK");
    expect(view.decision.reasonCodes).toEqual(["CANONICAL_POLICY_OVERRIDE_FIXTURE"]);
  });
});
