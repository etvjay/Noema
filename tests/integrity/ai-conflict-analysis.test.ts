import { describe, it, expect } from 'vitest';
import { analyzeConflictsAndAmbiguities } from '@noema/noema-ai';

describe('ai-conflict-analysis', () => {
  it('identifies conflicting claims, dates, and terms across multiple evidence sources', () => {
    const claimNavFresh: any = {
      id: 'claim:nav:fresh', subject: 'object:fund:ousg', property: 'nav',
      value: 105.5, confidence: 0.99, isDirect: true,
      sourceRefs: ['src:oracle:fresh'], evidenceRefs: ['ev:oracle:fresh']
    };
    const claimNavStale: any = {
      id: 'claim:nav:stale', subject: 'object:fund:ousg', property: 'nav',
      value: 100.0, confidence: 0.95, isDirect: true,
      sourceRefs: ['src:doc:stale'], evidenceRefs: ['ev:doc:stale']
    };
    const evidenceList: any[] = [
      { id: 'ev:oracle:fresh', type: 'ORACLE', source: 'src:oracle:fresh',
        contentHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        observedAt: 1_700_000_000_000, authority: 'REFERENCE_DATA', freshness: 'FRESH',
        fetchedAt: 1_700_000_000_000, metadata: {} },
      { id: 'ev:doc:stale', type: 'DOCUMENT', source: 'src:doc:stale',
        contentHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
        observedAt: 1_600_000_000_000, authority: 'REFERENCE_DATA', freshness: 'STALE',
        fetchedAt: 1_600_000_000_000, metadata: {} }
    ];
    const result = analyzeConflictsAndAmbiguities({
      subject: 'object:fund:ousg',
      claims: [claimNavFresh, claimNavStale],
      evidence: evidenceList
    });
    expect(result.proposedConflicts.length).toBe(1);
    expect(result.proposedConflicts[0]?.property).toBe('nav');
    expect(result.proposedConflicts[0]?.likelyCause).toBe('STALE_SOURCE');
    expect(result.proposedConflicts[0]?.severity).toBe('BLOCKING');
    expect(result.proposedUnresolvedIssues.length).toBe(1);
    expect(result.proposedUnresolvedIssues[0]?.issueType).toBe('EVIDENCE_CONFLICT');
  });
});
