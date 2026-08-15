import { describe, it, expect } from 'vitest';
import { reduceAiProposalToCanonical, hashProposal } from '@noema/noema-ai';

describe('ai-deterministic-promotion', () => {
  it('deterministically reduces AI proposals to canonical state based on evidence authority', async () => {
    const validSource = {
      id: 'src:canonical:001', sourceId: 'src:sec:filing',
      uri: 'https://sec.gov/filing.json', contentType: 'application/json',
      contentHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
      fetchedAt: 1_700_000_000_000, bodyStorageRef: 'storage:src:canonical:001'
    };
    const validEvidence = {
      id: 'ev:canonical:001', type: 'FILING' as const,
      source: 'src:canonical:001',
      contentHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
      observedAt: 1_700_000_000_000, authority: 'PRIMARY_SOURCE' as const,
      freshness: 'FRESH' as const, fetchedAt: 1_700_000_000_000, metadata: {}
    };
    const proposalRaw = {
      proposalId: 'proposal:test:001', runId: 'run:ai:001',
      promptVersion: 'noema-prompt-v1', schemaVersion: 'noema-ai-schema-v1',
      proposedClaims: [
        { id: 'claim:prop:nav', subject: 'object:rwa:001', property: 'nav',
          value: 100.0, unit: 'USD', confidence: 0.99, isDirect: true,
          sourceRefs: ['src:canonical:001'], evidenceRefs: ['ev:canonical:001'] },
        { id: 'claim:prop:unsupported', subject: 'object:rwa:001', property: 'secretVal',
          value: 'unsupported_data', confidence: 0.99, isDirect: true,
          sourceRefs: ['src:nonexistent:999'], evidenceRefs: ['ev:nonexistent:999'] }
      ],
      proposedRights: [], proposedRestrictions: [],
      proposedRelationships: [{
        id: 'rel:prop:equiv', subject: 'rep:001',
        predicate: 'ECONOMICALLY_EQUIVALENT_TO' as const,
        object: 'rep:002', rationale: 'Supported equivalence',
        claimRefs: ['claim:prop:nav'], evidenceRefs: ['ev:canonical:001'],
        confidence: 0.99, isEquivalent: true
      }],
      proposedConflicts: [], proposedUnresolvedIssues: [],
      summary: 'Proposal for canonical reduction test',
      createdAt: 1_700_000_000_000
    };
    const fullProposal = { ...proposalRaw, proposalHash: hashProposal(proposalRaw) };
    const result = reduceAiProposalToCanonical(fullProposal, {
      sourceSnapshots: [validSource], evidence: [validEvidence]
    });
    
    expect(result.summary.acceptedCount).toBe(2); // 1 claim + 1 relationship
    expect(result.summary.rejectedCount).toBe(1); // 1 unsupported claim
    const navClaim = result.canonicalClaims.find((c: any) => c.property === 'nav');
    expect(navClaim).toBeDefined();
    expect(navClaim?.state).toBe('SOURCED');
    const unsupportedDecision = result.decisions.find((d: any) => d.targetId === 'claim:prop:unsupported');
    expect(unsupportedDecision?.outcome).toBe('REJECT_UNSUPPORTED');
    expect(unsupportedDecision?.reasonCode).toBe('REASON_SOURCE_SNAPSHOT_NOT_FOUND');
  });
});
