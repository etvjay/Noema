import { describe, it, expect } from 'vitest';
import { runNoemaAiBenchmark, evaluateExperimentFoundryGate } from '@noema/noema-ai';

describe('AI Benchmark Promotion Gate', () => {
  it('executes the 22-case benchmark suite and evaluates Experiment Foundry promotion gate', async () => {
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
    expect(gateResult.status).toBe('PASS');
    expect(gateResult.gateScore).toBe(100);
    expect(gateResult.violations.length).toBe(0);
    
    const failedGate = evaluateExperimentFoundryGate({ ...receipt.metrics, falseEquivalenceRate: 0.05 });
    expect(failedGate.status).toBe('REDESIGN_REQUIRED');
    expect(failedGate.violations.length).toBeGreaterThan(0);
  });

  it('fails the Experiment Foundry gate with REDESIGN_REQUIRED if false equivalence is detected', () => {
    const failedResult = evaluateExperimentFoundryGate({
      totalCases: 22, passedCases: 21,
      claimExtractionAccuracy: 1.0, rightsInterpretationAccuracy: 1.0,
      relationshipClassificationAccuracy: 0.95, conflictDetectionRecall: 1.0,
      conflictDetectionPrecision: 1.0, unsupportedInferenceRate: 0.0,
      falseEquivalenceRate: 0.045, falseAllowRate: 0.0
    });
    expect(failedResult.status).toBe('REDESIGN_REQUIRED');
    expect(failedResult.violations.some((v) => v.includes('False equivalence rate'))).toBe(true);
  });

  it('fails the Experiment Foundry gate with REDESIGN_REQUIRED if false allow rate is detected', () => {
    const failedResult = evaluateExperimentFoundryGate({
      totalCases: 22, passedCases: 21,
      claimExtractionAccuracy: 1.0, rightsInterpretationAccuracy: 1.0,
      relationshipClassificationAccuracy: 1.0, conflictDetectionRecall: 1.0,
      conflictDetectionPrecision: 1.0, unsupportedInferenceRate: 0.0,
      falseEquivalenceRate: 0.0, falseAllowRate: 0.045
    });
    expect(failedResult.status).toBe('REDESIGN_REQUIRED');
    expect(failedResult.violations.some((v) => v.includes('False ALLOW rate'))).toBe(true);
  });

  it('fails the Experiment Foundry gate with FAIL if accuracy drops below release threshold', () => {
    const failedResult = evaluateExperimentFoundryGate({
      totalCases: 22, passedCases: 19,
      claimExtractionAccuracy: 0.85,
      rightsInterpretationAccuracy: 1.0,
      relationshipClassificationAccuracy: 1.0, conflictDetectionRecall: 1.0,
      conflictDetectionPrecision: 1.0, unsupportedInferenceRate: 0.0,
      falseEquivalenceRate: 0.0, falseAllowRate: 0.0
    });
    expect(failedResult.status).toBe('FAIL');
    expect(failedResult.violations.some((v) => v.includes('Claim extraction accuracy'))).toBe(true);
  });
});
