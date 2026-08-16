import { describe, expect, it } from "vitest";
import {
  computeRoots,
  objectRoot,
  evidenceMerkleRoot,
  canonicalJson,
  HASHING_VERSION_V1,
  HASHING_VERSION_V2,
  CURRENT_HASHING_VERSION,
  OBJECT_DOMAIN_V1,
  OBJECT_DOMAIN_V2,
  EVIDENCE_LEAF_DOMAIN_V1,
  EVIDENCE_LEAF_DOMAIN_V2,
  MERKLE_DOMAIN,
  hashUtf8
} from "@noema/canonicalization";
import { reduceEconomicObject } from "@noema/noema-core";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

describe("canonical root replay and tamper evidence integrity", () => {
  it("replays identical canonical inputs to byte-for-byte identical roots across repeated runs", () => {
    const object1 = makeEconomicObject();
    const object2 = makeEconomicObject();

    const roots1 = computeRoots(object1);
    const roots2 = computeRoots(object2);

    expect(roots1.objectRoot).toBe(roots2.objectRoot);
    expect(roots1.evidenceRoot).toBe(roots2.evidenceRoot);
    expect(roots1.canonicalObject).toBe(roots2.canonicalObject);
    expect(roots1.evidenceLeaves).toEqual(roots2.evidenceLeaves);

    // Repeated runs
    for (let i = 0; i < 5; i++) {
      const replay = computeRoots(object1);
      expect(replay.objectRoot).toBe(roots1.objectRoot);
      expect(replay.evidenceRoot).toBe(roots1.evidenceRoot);
    }
  });

  it("normalizes semantically irrelevant key order and array order permutations to identical roots", () => {
    const base = makeEconomicObject();

    // Permute JSON key order inside metadata/values
    const permutedObject = makeEconomicObject({
      economics: {
        asOf: base.economics.asOf,
        claimRefs: base.economics.claimRefs,
        values: {
          currency: "USD",
          nav: "100.00"
        }
      }
    });

    const rootBase = objectRoot(base);
    const rootPermuted = objectRoot(permutedObject);
    expect(rootPermuted).toBe(rootBase);

    // Shuffled claims and evidence before normalization
    const claim1 = { ...base.claims[0]!, id: "claim:01" };
    const claim2 = { ...base.claims[0]!, id: "claim:02" };
    const evidence1 = { ...base.evidence[0]!, id: "evidence:01" };
    const evidence2 = { ...base.evidence[0]!, id: "evidence:02" };

    const reduced1 = reduceEconomicObject({
      ...base,
      claims: [claim1, claim2],
      evidence: [evidence1, evidence2]
    });

    const reduced2 = reduceEconomicObject({
      ...base,
      claims: [claim2, claim1],
      evidence: [evidence2, evidence1]
    });

    expect(objectRoot(reduced1)).toBe(objectRoot(reduced2));
    expect(evidenceMerkleRoot(reduced1.evidence)).toBe(evidenceMerkleRoot(reduced2.evidence));
  });

  it("ensures material evidence changes alter evidenceRoot and objectRoot deterministically", () => {
    const base = makeEconomicObject();
    const originalRoots = computeRoots(base);

    // Alter content hash in evidence
    const mutatedEvidence = [
      {
        ...base.evidence[0]!,
        contentHash: "0x9999999999999999999999999999999999999999999999999999999999999999"
      }
    ];

    const mutatedObject = makeEconomicObject({
      evidence: mutatedEvidence
    });

    const mutatedRoots = computeRoots(mutatedObject);

    expect(mutatedRoots.evidenceRoot).not.toBe(originalRoots.evidenceRoot);
    expect(mutatedRoots.objectRoot).not.toBe(originalRoots.objectRoot);
    expect(mutatedRoots.evidenceLeaves).not.toEqual(originalRoots.evidenceLeaves);
  });

  it("ensures container timestamps do not contaminate canonical root computation", () => {
    const base = makeEconomicObject({
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_100
    });

    const laterTimestampObject = makeEconomicObject({
      createdAt: 1_800_000_000_000,
      updatedAt: 1_800_000_500_000
    });

    expect(objectRoot(base)).toBe(objectRoot(laterTimestampObject));
  });

  it("preserves hashing spec version and domain tags across verification receipts", () => {
    expect(HASHING_VERSION_V1).toBe("noema-hashing-v1");
    expect(HASHING_VERSION_V2).toBe("noema-hashing-v2");
    expect(CURRENT_HASHING_VERSION).toBe("noema-hashing-v2");
    expect(OBJECT_DOMAIN_V1).toBe("noema:economic-object:v1");
    expect(OBJECT_DOMAIN_V2).toBe("noema:economic-object:v2");
    expect(EVIDENCE_LEAF_DOMAIN_V1).toBe("noema:evidence-leaf:v1");
    expect(EVIDENCE_LEAF_DOMAIN_V2).toBe("noema:evidence-leaf:v2");
    expect(MERKLE_DOMAIN).toBe("noema:evidence-merkle:v1");

    const object = makeEconomicObject();
    const roots = computeRoots(object);
    const receipt = verifyEconomicObject(object, { nowMs: 1_700_000_000_000 });

    expect(receipt.evidenceRoot).toBe(roots.evidenceRoot);
    expect(receipt.objectRoot).toBe(roots.objectRoot);
    expect(receipt.verifierVersion).toBe("noema-verifier-v1");
    expect(receipt.hashingVersion).toBe(CURRENT_HASHING_VERSION);

  });
});

describe("Noema canonical root replay integrity", () => {
  it("replays identical semantic state to identical roots", () => {
    const object = makeEconomicObject();
    const first = computeRoots(object);
    const second = computeRoots(object);

    expect(first.objectRoot).toBe(second.objectRoot);
    expect(first.evidenceRoot).toBe(second.evidenceRoot);
    expect(first.canonicalObject).toBe(second.canonicalObject);
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

  it("binds the declared hashing version into canonical commitments", () => {
    const roots = computeRoots(makeEconomicObject());
    expect(CURRENT_HASHING_VERSION).toBe("noema-hashing-v2");
    expect(roots.hashingVersion).toBe(CURRENT_HASHING_VERSION);
    expect(roots.canonicalObject).toContain(`\"hashingVersion\":\"${CURRENT_HASHING_VERSION}\"`);
  });
});

