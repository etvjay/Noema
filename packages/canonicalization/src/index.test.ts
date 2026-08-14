import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  computeRoots,
  evidenceMerkleRoot,
  hashUtf8
} from "./index.js";
import { makeEconomicObject } from "../../../tests/helpers.js";

describe("canonicalization", () => {
  it("uses deterministic RFC 8785 JSON ordering", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it("does not let operational timestamps change the object root", () => {
    const first = makeEconomicObject();
    const second = makeEconomicObject({
      createdAt: 1_800_000_000_000,
      updatedAt: 1_800_000_000_999
    });
    expect(computeRoots(first).objectRoot).toBe(computeRoots(second).objectRoot);
  });

  it("makes evidence roots independent of input order", () => {
    const first = makeEconomicObject();
    const primaryEvidence = first.evidence[0];
    if (primaryEvidence === undefined) {
      throw new Error("fixture evidence missing");
    }
    const secondEvidence = {
      ...primaryEvidence,
      id: "evidence:fixture:secondary",
      contentHash: hashUtf8("secondary")
    };
    expect(
      evidenceMerkleRoot([primaryEvidence, secondEvidence])
    ).toBe(evidenceMerkleRoot([secondEvidence, primaryEvidence]));
  });
});
