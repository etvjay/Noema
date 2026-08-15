import { describe, expect, it } from "vitest";
import { runNoemaAiBenchmark, evaluateExperimentFoundryGate } from "@noema/noema-ai";

describe("Noema AI benchmark suite and Experiment Foundry promotion gate integrity", () => {
  it("executes the full >=20 case benchmark suite with zero false equivalence and zero false allow rate", async () => {
    const { receipt, gateResult } = await runNoemaAiBenchmark();

    expect(receipt.caseResults.length).toBeGreaterThanOrEqual(20);
    expect(receipt.metrics.passedCases).toBe(receipt.metrics.totalCases);
    expect(receipt.metrics.falseEquivalenceRate).toBe(0);
    expect(receipt.metrics.falseAllowRate).toBe(0);
    expect(receipt.metrics.unsupportedInferenceRate).toBe(0);
    expect(receipt.metrics.claimExtractionAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(receipt.metrics.rightsInterpretationAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(receipt.metrics.relationshipClassificationAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(receipt.metrics.conflictDetectionRecall).toBeGreaterThanOrEqual(0.95);

    expect(gateResult.status).toBe("PASS");
    expect(gateResult.gateScore).toBe(100);
    expect(gateResult.violations).toHaveLength(0);
    expect(gateResult.receiptHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("fails the Experiment Foundry gate with REDESIGN_REQUIRED if false equivalence is detected", () => {
    const failedResult = evaluateExperimentFoundryGate({
      totalCases: 22,
      passedCases: 21,
      claimExtractionAccuracy: 1.0,
      rightsInterpretationAccuracy: 1.0,
      relationshipClassificationAccuracy: 0.95,
      conflictDetectionRecall: 1.0,
      conflictDetectionPrecision: 1.0,
      unsupportedInferenceRate: 0.0,
      falseEquivalenceRate: 0.045, // Non-zero false equivalence
      falseAllowRate: 0.0
    });

    expect(failedResult.status).toBe("REDESIGN_REQUIRED");
    expect(failedResult.violations.some((v) => v.includes("False equivalence rate"))).toBe(true);
  });

  it("fails the Experiment Foundry gate with REDESIGN_REQUIRED if false allow rate is detected", () => {
    const failedResult = evaluateExperimentFoundryGate({
      totalCases: 22,
      passedCases: 21,
      claimExtractionAccuracy: 1.0,
      rightsInterpretationAccuracy: 1.0,
      relationshipClassificationAccuracy: 1.0,
      conflictDetectionRecall: 1.0,
      conflictDetectionPrecision: 1.0,
      unsupportedInferenceRate: 0.0,
      falseEquivalenceRate: 0.0,
      falseAllowRate: 0.045 // Non-zero false allow
    });

    expect(failedResult.status).toBe("REDESIGN_REQUIRED");
    expect(failedResult.violations.some((v) => v.includes("False ALLOW rate"))).toBe(true);
  });

  it("fails the Experiment Foundry gate with FAIL if accuracy drops below release threshold", () => {
    const failedResult = evaluateExperimentFoundryGate({
      totalCases: 22,
      passedCases: 19,
      claimExtractionAccuracy: 0.85, // Below 0.95 threshold
      rightsInterpretationAccuracy: 1.0,
      relationshipClassificationAccuracy: 1.0,
      conflictDetectionRecall: 1.0,
      conflictDetectionPrecision: 1.0,
      unsupportedInferenceRate: 0.0,
      falseEquivalenceRate: 0.0,
      falseAllowRate: 0.0
    });

    expect(failedResult.status).toBe("FAIL");
    expect(failedResult.violations.some((v) => v.includes("Claim extraction accuracy"))).toBe(true);
  });
});
