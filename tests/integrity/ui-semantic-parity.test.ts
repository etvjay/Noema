import { describe, expect, it } from "vitest";
import type { Mandate } from "@noema/economic-kernel";
import {
  buildEconomicObjectViewModel,
  evaluateMandate,
  createNextVersion
} from "@noema/noema-core";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

function makeMandate(): Mandate {
  return {
    id: "mandate:ui-demo",
    version: 1,
    principal: "principal:operator-1",
    objective: "Demo treasury mandate",
    allowedAssetClasses: ["TOKENIZED_TREASURY"],
    prohibitedAssetClasses: ["UNCOLLATERALIZED_CREDIT"],
    jurisdictions: ["US"],
    requiredClaims: [
      { property: "economicIdentity", requiredState: "SOURCED" }
    ],
    requiredEvidence: [
      { type: "API_RESPONSE", maxAgeMs: 86_400_000 }
    ],
    expiresAt: 1_800_000_000_000
  };
}

describe("UI and view-model semantic parity and inspectability integrity", () => {
  it("derives complete inspectable view-model from canonical domain outputs and preserves lineage traversal", () => {
    const object = makeEconomicObject({ id: "object:rwa:ondo-ousg", version: 1 });
    const verification = verifyEconomicObject(object, { nowMs: 1_700_000_000_000 });
    const mandate = makeMandate();
    const decision = evaluateMandate(object, verification, mandate, { nowMs: 1_700_000_000_000 });

    const viewModel = buildEconomicObjectViewModel(object, verification, decision);

    // Assert parity on core domain fields
    expect(viewModel.id).toBe(object.id);
    expect(viewModel.version).toBe(1);
    expect(viewModel.status).toBe("RESOLVED");
    expect(viewModel.verification?.overallStatus).toBe("PASS");
    expect(viewModel.decision?.decision).toBe("ALLOW");

    // Assert lineage graph connections: Decision -> Verification -> Claim -> Evidence -> Source
    const decisionNode = viewModel.lineage.nodes.find((n) => n.type === "DECISION");
    expect(decisionNode).toBeDefined();

    const verificationNode = viewModel.lineage.nodes.find((n) => n.type === "VERIFICATION");
    expect(verificationNode).toBeDefined();

    const claimNode = viewModel.lineage.nodes.find((n) => n.type === "CLAIM");
    expect(claimNode).toBeDefined();

    const evidenceNode = viewModel.lineage.nodes.find((n) => n.type === "EVIDENCE");
    expect(evidenceNode).toBeDefined();

    const sourceNode = viewModel.lineage.nodes.find((n) => n.type === "SOURCE");
    expect(sourceNode).toBeDefined();

    expect(viewModel.lineage.links.some((l) => l.relation === "VERIFIED_BY")).toBe(true);
    expect(viewModel.lineage.links.some((l) => l.relation === "EVALUATES_CLAIM")).toBe(true);
    expect(viewModel.lineage.links.some((l) => l.relation === "GROUNDED_IN")).toBe(true);
    expect(viewModel.lineage.links.some((l) => l.relation === "OBSERVED_FROM")).toBe(true);
  });

  it("visibly preserves stale/conflicting exceptions without collapsing into generic success", () => {
    const staleObject = makeEconomicObject({
      id: "object:stale-rwa",
      version: 1,
      status: "STALE",
      evidence: [
        {
          ...makeEconomicObject().evidence[0]!,
          freshness: "STALE"
        }
      ],
      exceptions: [
        {
          id: "ex:stale:01",
          objectId: "object:stale-rwa",
          type: "EVIDENCE_STALE",
          severity: "BLOCKING",
          affectedClaims: ["claim:fixture:identity"],
          evidence: ["evidence:fixture:primary"],
          detectedAt: 1_700_000_000_000,
          status: "OPEN"
        }
      ]
    });

    const verification = verifyEconomicObject(staleObject, { nowMs: 1_700_000_000_000 });
    const decision = evaluateMandate(staleObject, verification, makeMandate(), { nowMs: 1_700_000_000_000 });

    const viewModel = buildEconomicObjectViewModel(staleObject, verification, decision);

    expect(viewModel.status).toBe("STALE");
    expect(viewModel.exceptions.length).toBe(1);
    expect(viewModel.exceptions[0]?.type).toBe("EVIDENCE_STALE");
    expect(viewModel.exceptions[0]?.severity).toBe("BLOCKING");
    expect(viewModel.verification?.failedChecksCount).toBeGreaterThan(0);
    expect(viewModel.decision?.decision).toBe("BLOCK");
  });

  it("visibly distinguishes vN from vN+1 across version progression", () => {
    const v1 = makeEconomicObject({ id: "object:versioned", version: 1 });
    const v2 = createNextVersion(
      v1,
      {
        exceptions: [
          {
            id: "ex:stale:v2",
            objectId: v1.id,
            type: "EVIDENCE_STALE",
            severity: "BLOCKING",
            affectedClaims: [],
            evidence: [],
            detectedAt: 1_700_000_100_000,
            status: "OPEN"
          }
        ]
      },
      { nowMs: 1_700_000_100_000 }
    );

    const vm1 = buildEconomicObjectViewModel(v1);
    const vm2 = buildEconomicObjectViewModel(v2);

    expect(vm1.version).toBe(1);
    expect(vm2.version).toBe(2);
    expect(vm1.status).toBe("RESOLVED");
    expect(vm2.status).toBe("STALE");
    expect(vm1.objectRoot).not.toBe(vm2.objectRoot);
  });
});
