import { describe, expect, it } from "vitest";
import {
  HASHING_VERSION,
  computeRoots,
  hashUtf8
} from "@noema/canonicalization";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

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
    expect(HASHING_VERSION).toBe("noema-hashing-v1");
    expect(roots.canonicalObject).toContain(`\"hashingVersion\":\"${HASHING_VERSION}\"`);
  });
});
