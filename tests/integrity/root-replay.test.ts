import { describe, expect, it } from "vitest";
import {
  HASHING_VERSION,
  computeRoots,
  hashUtf8
} from "@noema/canonicalization";
import { reduceEconomicObject } from "@noema/noema-core";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

function reducePermuted(reverse: boolean) {
  const base = makeEconomicObject();
  const primaryEvidence = base.evidence[0];
  const primaryClaim = base.claims[0];
  if (primaryEvidence === undefined || primaryClaim === undefined) {
    throw new Error("fixture claim/evidence missing");
  }

  const secondaryEvidence = {
    ...primaryEvidence,
    id: "evidence:fixture:secondary",
    contentHash: hashUtf8("secondary evidence")
  };
  const secondaryClaim = {
    ...primaryClaim,
    id: "claim:fixture:secondary",
    property: "secondaryProperty",
    value: "secondary-value",
    evidenceRefs: [secondaryEvidence.id]
  };
  const secondaryEdge = {
    id: "edge:fixture:secondary",
    from: secondaryClaim.id,
    to: secondaryEvidence.id,
    relation: "SUPPORTED_BY"
  };

  const claims = reverse
    ? [secondaryClaim, primaryClaim]
    : [primaryClaim, secondaryClaim];
  const evidence = reverse
    ? [secondaryEvidence, primaryEvidence]
    : [primaryEvidence, secondaryEvidence];
  const provenanceEdges = reverse
    ? [secondaryEdge, ...base.provenance.edges]
    : [...base.provenance.edges, secondaryEdge];

  return reduceEconomicObject({
    id: base.id,
    version: base.version,
    classification: base.classification,
    identifiers: base.identifiers,
    representations: base.representations,
    relationships: base.relationships,
    parties: base.parties,
    rights: base.rights,
    obligations: base.obligations,
    restrictions: base.restrictions,
    economics: base.economics,
    claims,
    evidence,
    attestations: base.attestations,
    exceptions: base.exceptions,
    provenance: { edges: provenanceEdges },
    verification: base.verification,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt
  });
}

describe("Noema canonical root replay integrity", () => {
  it("replays identical semantic state to identical roots", () => {
    const object = makeEconomicObject();
    const first = computeRoots(object);
    const second = computeRoots(object);

    expect(first.objectRoot).toBe(second.objectRoot);
    expect(first.evidenceRoot).toBe(second.evidenceRoot);
    expect(first.canonicalObject).toBe(second.canonicalObject);
  });

  it("normalizes semantically irrelevant reducer input permutations to identical canonical roots", () => {
    const left = reducePermuted(false);
    const right = reducePermuted(true);
    const leftRoots = computeRoots(left);
    const rightRoots = computeRoots(right);

    expect(left.claims.map((claim) => claim.id)).toEqual(right.claims.map((claim) => claim.id));
    expect(left.evidence.map((item) => item.id)).toEqual(right.evidence.map((item) => item.id));
    expect(left.provenance.edges.map((edge) => edge.id)).toEqual(
      right.provenance.edges.map((edge) => edge.id)
    );
    expect(leftRoots.canonicalObject).toBe(rightRoots.canonicalObject);
    expect(leftRoots.evidenceRoot).toBe(rightRoots.evidenceRoot);
    expect(leftRoots.objectRoot).toBe(rightRoots.objectRoot);
  });

  it("keeps evidence root independent of evidence input order", () => {
    const first = makeEconomicObject();
    const primary = first.evidence[0];
    if (primary === undefined) {
      throw new Error("fixture evidence missing");
    }
    const secondary = {
      ...primary,
      id: "evidence:fixture:secondary",
      contentHash: hashUtf8("secondary evidence")
    };

    const left = makeEconomicObject({ evidence: [primary, secondary] });
    const right = makeEconomicObject({ evidence: [secondary, primary] });

    expect(computeRoots(left).evidenceRoot).toBe(computeRoots(right).evidenceRoot);
  });

  it("does not let verification wall-clock timestamps alter object roots", () => {
    const base = makeEconomicObject();
    const earlyReceipt = verifyEconomicObject(base, {
      nowMs: 1_700_000_001_000,
      maxEvidenceAgeMs: 3_600_000
    });
    const lateReceipt = verifyEconomicObject(base, {
      nowMs: 1_700_000_002_000,
      maxEvidenceAgeMs: 3_600_000
    });

    const early = makeEconomicObject({
      verification: {
        status: earlyReceipt.overallStatus,
        verifierVersion: earlyReceipt.verifierVersion,
        checks: earlyReceipt.checks
      }
    });
    const late = makeEconomicObject({
      verification: {
        status: lateReceipt.overallStatus,
        verifierVersion: lateReceipt.verifierVersion,
        checks: lateReceipt.checks
      }
    });

    expect(earlyReceipt.checks[0]?.timestamp).not.toBe(lateReceipt.checks[0]?.timestamp);
    expect(computeRoots(early).objectRoot).toBe(computeRoots(late).objectRoot);
  });

  it("changes roots when material evidence changes", () => {
    const base = makeEconomicObject();
    const evidence = base.evidence[0];
    if (evidence === undefined) {
      throw new Error("fixture evidence missing");
    }

    const changed = makeEconomicObject({
      evidence: [
        {
          ...evidence,
          contentHash: hashUtf8("materially changed source content")
        }
      ]
    });

    expect(computeRoots(changed).evidenceRoot).not.toBe(computeRoots(base).evidenceRoot);
    expect(computeRoots(changed).objectRoot).not.toBe(computeRoots(base).objectRoot);
  });

  it("binds the declared hashing version into canonical commitments and receipts", () => {
    const object = makeEconomicObject();
    const roots = computeRoots(object);
    const receipt = verifyEconomicObject(object, { nowMs: 1_700_000_001_000 });

    expect(HASHING_VERSION).toBe("noema-hashing-v1");
    expect(roots.canonicalObject).toContain(`\"hashingVersion\":\"${HASHING_VERSION}\"`);
    expect(receipt.hashingVersion).toBe(HASHING_VERSION);
    expect(receipt.objectRoot).toBe(roots.objectRoot);
    expect(receipt.evidenceRoot).toBe(roots.evidenceRoot);
  });
});
