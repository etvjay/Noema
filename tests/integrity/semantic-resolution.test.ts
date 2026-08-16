import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomicRelationship } from "@noema/economic-kernel";
import { computeRoots } from "@noema/canonicalization";
import {
  resolveSemanticRelationship,
  type SemanticResolutionInput,
  type SemanticRepresentationProfile
} from "@noema/noema-core/semantic";
import { makeEconomicObject } from "../helpers.js";

interface SemanticFixture {
  fixtureStatus: string;
  semanticInput: SemanticResolutionInput;
}

function loadFixture(name: string): SemanticFixture {
  const path = fileURLToPath(
    new URL("../../fixtures/semantic-cases/" + name, import.meta.url)
  );
  return JSON.parse(readFileSync(path, "utf8")) as SemanticFixture;
}

function replayRoot(relationship: EconomicRelationship["predicate"]) {
  const base = makeEconomicObject();
  const existing = base.relationships[0]!;
  const object = makeEconomicObject({
    relationships: [
      {
        ...existing,
        predicate: relationship
      }
    ]
  });
  return computeRoots(object);
}

describe("Noema executable semantic resolution", () => {
  it("case A derives economic equivalence from qualifying semantic evidence", () => {
    const fixture = loadFixture("equivalence.json");
    expect(fixture.fixtureStatus).toBe("DEMO_FIXTURE");

    const first = resolveSemanticRelationship(fixture.semanticInput);
    const second = resolveSemanticRelationship(fixture.semanticInput);

    expect(first).toEqual(second);
    expect(first.relationship).toBe("ECONOMICALLY_EQUIVALENT_TO");
    expect(first.objectState).toBe("RESOLVED");
    expect(first.exceptionTypes).toEqual([]);
    expect(first.reasonCodes).toEqual(["QUALIFYING_EQUIVALENCE_EVIDENCE"]);

    if (
      first.relationship !== "ECONOMICALLY_EQUIVALENT_TO" ||
      second.relationship !== "ECONOMICALLY_EQUIVALENT_TO"
    ) {
      throw new Error("equivalence fixture did not derive canonical equivalence");
    }
    const firstRoots = replayRoot(first.relationship);
    const secondRoots = replayRoot(second.relationship);
    expect(firstRoots.objectRoot).toBe(secondRoots.objectRoot);
    expect(firstRoots.evidenceRoot).toBe(secondRoots.evidenceRoot);
  });

  it("case B derives similar exposure and refuses equivalence when material rights differ", () => {
    const fixture = loadFixture("similar-non-equivalent.json");
    const result = resolveSemanticRelationship(fixture.semanticInput);

    expect(result.relationship).toBe("SIMILAR_EXPOSURE_TO");
    expect(result.relationship).not.toBe("ECONOMICALLY_EQUIVALENT_TO");
    expect(result.reasonCodes).toContain("ECONOMIC_CLAIM_DIFFERENT");
    expect(result.reasonCodes).toContain("SHARE_CLASS_DIFFERENT");
    expect(result.reasonCodes).toContain("RIGHTS_DIFFERENT");
    expect(result.reasonCodes).toContain("RESTRICTIONS_DIFFERENT");
    expect(result.reasonCodes).toContain("REDEMPTION_DIFFERENT");
    expect(result.reasonCodes).toContain("SUPPORTED_REPRESENTATION_LINK_MISSING");
  });

  it("case C derives stale blocking state from freshness rather than expectation labels", () => {
    const fixture = loadFixture("evidence-failure.json");
    const result = resolveSemanticRelationship(fixture.semanticInput);

    expect(result.relationship).toBeUndefined();
    expect(result.objectState).toBe("STALE");
    expect(result.exceptionTypes).toEqual(["EVIDENCE_STALE"]);
    expect(result.reasonCodes).toEqual(["STALE_EVIDENCE"]);
  });

  it("never derives equivalence from a shared ticker or display name", () => {
    const base: SemanticRepresentationProfile = {
      id: "representation:ticker:left",
      economicClaim: "claim:left",
      issuerClaim: "issuer:left",
      shareClass: "class-a",
      exposureClass: "US_TREASURY_BILL",
      rights: ["BENEFICIAL_INTEREST"],
      restrictions: [],
      backing: ["pool:left"],
      redemption: { asset: "USD", windowMs: 86400000 },
      evidenceFreshness: "FRESH"
    };
    const left = { ...base, ticker: "USTX", name: "Treasury Token" };
    const right = {
      ...base,
      id: "representation:ticker:right",
      economicClaim: "claim:right",
      issuerClaim: "issuer:right",
      backing: ["pool:right"],
      ticker: "USTX",
      name: "Treasury Token"
    };

    const result = resolveSemanticRelationship({
      left,
      right,
      links: [
        {
          from: left.id,
          to: right.id,
          type: "FUNCTIONALLY_FUNGIBLE_WITH"
        }
      ]
    });

    expect(result.relationship).toBe("SIMILAR_EXPOSURE_TO");
    expect(result.relationship).not.toBe("ECONOMICALLY_EQUIVALENT_TO");
    expect(result.reasonCodes).toContain("ECONOMIC_CLAIM_DIFFERENT");
    expect(result.reasonCodes).toContain("ISSUER_DIFFERENT");
  });
});
