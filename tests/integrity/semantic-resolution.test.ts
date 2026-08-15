import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Mandate } from "@noema/economic-kernel";
import {
  deriveEvidenceState,
  evaluateMandate,
  reduceEconomicObject,
  resolveSemanticRelationship
} from "@noema/noema-core";
import { computeRoots, objectRoot } from "@noema/canonicalization";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

function readFixture(filename: string): any {
  const filePath = resolve(process.cwd(), "fixtures/semantic-cases", filename);
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function makeMandate(): Mandate {
  return {
    id: "mandate:semantic-test",
    version: 1,
    principal: "principal:agent-007",
    objective: "Safe treasury allocation",
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

describe("executable semantic A/B/C resolution integrity", () => {
  it("Case A — derives ECONOMICALLY_EQUIVALENT_TO from linked bridged representation structure", () => {
    const fixture = readFixture("equivalence.json");
    const [repA, repB] = fixture.representations;

    const result = resolveSemanticRelationship(repA, repB);

    expect(result.relationship).toBe("ECONOMICALLY_EQUIVALENT_TO");
    expect(result.isEquivalent).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("Case B — derives SIMILAR_EXPOSURE_TO and explicitly refuses equivalence due to differing share classes", () => {
    const fixture = readFixture("similar-non-equivalent.json");
    const [repA, repB] = fixture.representations;

    const result = resolveSemanticRelationship(repA, repB);

    expect(result.relationship).toBe("SIMILAR_EXPOSURE_TO");
    expect(result.isEquivalent).toBe(false);
    expect(result.reasons.some((r) => r.includes("share class"))).toBe(true);
  });

  it("Case C — derives STALE state directly from evidence freshness and evaluates mandate to BLOCK", () => {
    const fixture = readFixture("evidence-failure.json");

    const object = makeEconomicObject({
      claims: [
        {
          ...makeEconomicObject().claims[0]!,
          id: fixture.claim.id,
          property: fixture.claim.property,
          state: fixture.claim.state,
          evidenceRefs: fixture.claim.evidenceRefs
        }
      ],
      evidence: [
        {
          ...makeEconomicObject().evidence[0]!,
          id: fixture.evidence.id,
          freshness: fixture.evidence.freshness
        }
      ]
    });

    const derived = deriveEvidenceState(object.evidence, object.claims, object.exceptions);
    expect(derived.status).toBe("STALE");
    expect(derived.exceptions.some((ex) => ex.type === "EVIDENCE_STALE")).toBe(true);

    const staleObject = reduceEconomicObject({
      ...object,
      exceptions: derived.exceptions
    });

    const verification = verifyEconomicObject(staleObject, { nowMs: 1_700_000_000_000 });
    expect(verification.overallStatus).toBe("FAIL");

    const mandateDecision = evaluateMandate(staleObject, verification, makeMandate(), {
      nowMs: 1_700_000_000_000
    });
    expect(mandateDecision.decision).toBe("BLOCK");
  });

  it("replays deterministically and produces identical semantic results and roots", () => {
    const fixtureA = readFixture("equivalence.json");
    const [repA, repB] = fixtureA.representations;

    const res1 = resolveSemanticRelationship(repA, repB);
    const res2 = resolveSemanticRelationship(repA, repB);

    expect(res1).toEqual(res2);

    const baseObj = makeEconomicObject();
    const roots1 = computeRoots(baseObj);
    const roots2 = computeRoots(baseObj);

    expect(roots1.objectRoot).toBe(roots2.objectRoot);
    expect(roots1.evidenceRoot).toBe(roots2.evidenceRoot);
  });
});
