import { describe, expect, it } from "vitest";
import {
  computeRoots,
  objectRoot,
  evidenceMerkleRoot,
  canonicalJson,
  HASHING_VERSION,
  OBJECT_DOMAIN,
  EVIDENCE_LEAF_DOMAIN,
  MERKLE_DOMAIN
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
    expect(HASHING_VERSION).toBe("noema-hashing-v1");
    expect(OBJECT_DOMAIN).toBe("noema:economic-object:v1");
    expect(EVIDENCE_LEAF_DOMAIN).toBe("noema:evidence-leaf:v1");
    expect(MERKLE_DOMAIN).toBe("noema:evidence-merkle:v1");

    const object = makeEconomicObject();
    const roots = computeRoots(object);
    const receipt = verifyEconomicObject(object, { nowMs: 1_700_000_000_000 });

    expect(receipt.evidenceRoot).toBe(roots.evidenceRoot);
    expect(receipt.objectRoot).toBe(roots.objectRoot);
    expect(receipt.verifierVersion).toBe("noema-verifier-v1");
  });
});
