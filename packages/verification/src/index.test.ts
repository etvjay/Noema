import { describe, expect, it } from "vitest";
import { makeEconomicObject } from "../../../tests/helpers.js";
import { verifyEconomicObject } from "./index.js";

describe("deterministic verification", () => {
  it("passes a sourced claim with available fresh evidence", () => {
    const result = verifyEconomicObject(makeEconomicObject(), {
      nowMs: 1_700_000_001_000,
      maxEvidenceAgeMs: 3_600_000
    });
    expect(result.overallStatus).toBe("PASS");
    expect(result.evidenceRoot).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("fails explicitly stale evidence", () => {
    const object = makeEconomicObject({
      evidence: [
        {
          ...makeEconomicObject().evidence[0]!,
          freshness: "STALE"
        }
      ],
      claims: [
        {
          ...makeEconomicObject().claims[0]!,
          state: "STALE"
        }
      ]
    });
    const result = verifyEconomicObject(object, {
      nowMs: 1_700_000_001_000
    });
    expect(result.overallStatus).toBe("FAIL");
    expect(result.checks.some((item) => item.type === "FRESHNESS")).toBe(true);
  });

  it("does not promote AI inference to verified state", () => {
    const object = makeEconomicObject({
      claims: [
        {
          ...makeEconomicObject().claims[0]!,
          state: "INFERRED"
        }
      ]
    });
    const result = verifyEconomicObject(object, {
      nowMs: 1_700_000_001_000
    });
    expect(result.overallStatus).toBe("UNRESOLVED");
    expect(
      result.checks.some((item) => item.type === "INFERENCE_BOUNDARY")
    ).toBe(true);
  });
});
