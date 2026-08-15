import { describe, expect, it } from 'vitest';
import {
  hashProposal,
  validateProposal,
  createAiRunReceipt,
  validateRunReceipt,
} from '@noema/noema-ai';
import type { NoemaAiProposal } from '@noema/noema-ai';

describe('AI Proposal Contract Integrity Gate', () => {
  it('computes deterministic proposal hashes and validates valid proposals', () => {
    const rawProposal: Omit<NoemaAiProposal, 'proposalHash'> = {
      proposalId: 'proposal:ondo:ousg:001',
      runId: 'run:ai:001',
      promptVersion: 'noema-prompt-v1',
      schemaVersion: 'noema-ai-schema-v1',
      proposedClaims: [{
        id: 'claim:prop:identity',
        subject: 'object:ondo:ousg',
        property: 'economicIdentity',
        value: 'Ondo Short-Term US Government Bond Fund',
        confidence: 0.99,
        isDirect: true,
        sourceRefs: ['source:sec:filing:001'],
        evidenceRefs: ['evidence:doc:001'],
        locator: 'section:header',
        explanation: 'Direct statement in SEC prospectus'
      }],
      proposedRights: [{
        id: 'right:prop:redemption',
        subject: 'object:ondo:ousg',
        holderType: 'TOKEN_HOLDER',
        rightType: 'REDEMPTION',
        terms: 'Daily liquidity subject to KYC/AML verification',
        transferability: 'RESTRICTED',
        redemptionWindow: 'T+1 daily',
        claimRefs: ['claim:prop:identity'],
        evidenceRefs: ['evidence:doc:001'],
        confidence: 0.95
      }],
      proposedRestrictions: [{
        id: 'rest:prop:eligibility',
        subject: 'object:ondo:ousg',
        restrictionType: 'ELIGIBILITY',
        jurisdiction: 'US',
        eligibilityCriteria: 'Qualified Purchaser only',
        claimRefs: ['claim:prop:identity'],
        evidenceRefs: ['evidence:doc:001'],
        confidence: 0.98
      }],
      proposedRelationships: [{
        id: 'rel:prop:bridge',
        subject: 'rep:ondo:xlayer',
        predicate: 'BRIDGED_REPRESENTATION_OF',
        object: 'rep:ondo:ethereum',
        rationale: 'Official canonical bridge deployment',
        claimRefs: ['claim:prop:identity'],
        evidenceRefs: ['evidence:doc:001'],
        confidence: 0.99,
        isEquivalent: true
      }],
      proposedConflicts: [],
      proposedUnresolvedIssues: [],
      summary: 'High-confidence extracted identity and redemption terms from official prospectus',
      createdAt: 1_700_000_000_000
    };

    const hash1 = hashProposal(rawProposal);
    const hash2 = hashProposal(rawProposal);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);

    const fullProposal: NoemaAiProposal = { ...rawProposal, proposalHash: hash1 };
    const validated = validateProposal(fullProposal);
    expect(validated.proposalId).toBe('proposal:ondo:ousg:001');
    expect(validated.proposalHash).toBe(hash1);
  });

  it('fails validation when proposal hash is forged or mutated', () => {
    const rawProposal: NoemaAiProposal = {
      proposalId: 'proposal:ondo:ousg:002',
      runId: 'run:ai:002',
      promptVersion: 'noema-prompt-v1',
      schemaVersion: 'noema-ai-schema-v1',
      proposedClaims: [],
      proposedRights: [],
      proposedRestrictions: [],
      proposedRelationships: [],
      proposedConflicts: [],
      proposedUnresolvedIssues: [],
      summary: 'Empty proposal',
      proposalHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      createdAt: 1_700_000_000_000
    };
    expect(() => validateProposal(rawProposal)).toThrow(/Proposal hash mismatch/);
  });

  it('creates and validates reproducible AI run receipts with latency and token usage', () => {
    const startedAt = 1_700_000_000_000;
    const completedAt = 1_700_000_000_850;
    const receipt = createAiRunReceipt({
      runId: 'run:ai:receipt:001',
      modelId: 'model:noema-economic-v1',
      inputSourceRefs: ['source:sec:001'],
      inputEvidenceRefs: ['evidence:doc:001'],
      outputProposalHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      startedAt,
      completedAt,
      inputTokens: 1200,
      outputTokens: 450,
      status: 'SUCCESS'
    });
    expect(receipt.runId).toBe('run:ai:receipt:001');
    expect(receipt.latencyMs).toBe(850);
    expect(receipt.tokenUsage.totalTokens).toBe(1650);
    expect(receipt.status).toBe('SUCCESS');
    const validated = validateRunReceipt(receipt);
    expect(validated.modelId).toBe('model:noema-economic-v1');
  });
});
