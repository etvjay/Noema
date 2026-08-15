import { describe, it, expect } from 'vitest';
import { interpretRightsAndRestrictions } from '@noema/noema-ai';

describe('ai-rights-restrictions', () => {
  it('interprets economic rights and restrictions from filings without assuming uniform terms', () => {
    const instSource = {
      id: 'source:filing:inst', sourceId: 'src:sec:inst',
      uri: 'https://sec.gov/filing-inst.json', contentType: 'application/json',
      contentHash: '0x3333333333333333333333333333333333333333333333333333333333333333' as const,
      fetchedAt: 1_700_000_000_000, bodyStorageRef: 'storage:source:filing:inst'
    };
    const instEvidence = {
      id: 'evidence:filing:inst', type: 'FILING' as const,
      source: 'source:filing:inst',
      contentHash: '0x3333333333333333333333333333333333333333333333333333333333333333' as const,
      observedAt: 1_700_000_000_000, authority: 'PRIMARY_SOURCE' as const,
      freshness: 'FRESH' as const, fetchedAt: 1_700_000_000_000, metadata: {}
    };
    const instBody = JSON.stringify({
      redemption: { window: 'T+1 daily', terms: 'Immediate redemption to USDC via smart contract liquidity buffer', transferable: false },
      beneficialOwnership: true,
      eligibility: { criteria: 'Qualified Purchaser ($5M+ investable assets)' },
      jurisdiction: 'US Section 3(c)(7)'
    });
    const result = interpretRightsAndRestrictions({
      subject: 'object:fund:inst',
      sourceSnapshots: [instSource],
      evidence: [instEvidence],
      sourceBodies: { 'source:filing:inst': instBody }
    });
    expect(result.proposedRights.length).toBeGreaterThanOrEqual(1);
    const redRight = result.proposedRights.find((r) => r.rightType === 'REDEMPTION');
    expect(redRight).toBeDefined();
    expect(redRight?.holderType).toBe('BENEFICIAL_OWNER');
    expect(redRight?.transferability).toBe('RESTRICTED');
    expect(redRight?.redemptionWindow).toBe('T+1 daily');
    expect(result.proposedRestrictions.length).toBeGreaterThanOrEqual(2);
    const eligRest = result.proposedRestrictions.find((r) => r.restrictionType === 'ELIGIBILITY');
    expect(eligRest?.eligibilityCriteria).toContain('Qualified Purchaser');
  });
});
