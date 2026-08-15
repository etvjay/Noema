import { describe, it, expect } from 'vitest';
import { extractClaims } from '@noema/noema-ai';

describe('ai-claim-extraction', () => {
  it('extracts evidence-grounded claims from structured JSON and prose documents', () => {
    const jsonBody = JSON.stringify({
      fundName: 'BlackRock USD Institutional Digital Liquidity Fund (BUIDL)',
      cusip: '09260B107', isin: 'US09260B1075', ticker: 'BUIDL',
      nav: 1.0, currency: 'USD', yield: 4.85,
      shareClass: 'institutional',
      issuer: 'BlackRock Financial Management, Inc.',
      reservesAdequacy: 'ADEQUATE'
    });
    const structuredSource = {
      id: 'source:json:001', sourceId: 'src:buidl:feed',
      uri: 'https://blackrock.com/buidl/feed.json',
      contentType: 'application/json',
      contentHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
      fetchedAt: 1_700_000_000_000, bodyStorageRef: 'storage:source:json:001'
    };
    const structuredEvidence = {
      id: 'evidence:ev:001', type: 'API_RESPONSE' as const,
      source: 'source:json:001',
      contentHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
      observedAt: 1_700_000_000_000, authority: 'REFERENCE_DATA' as const,
      freshness: 'FRESH' as const, fetchedAt: 1_700_000_000_000, metadata: {}
    };
    const claimsFromStructured = extractClaims({
      subject: 'object:buidl',
      sourceSnapshots: [structuredSource],
      evidence: [structuredEvidence],
      sourceBodies: { 'source:json:001': jsonBody }
    });
    expect(claimsFromStructured.length).toBeGreaterThanOrEqual(7);
    const navClaim = claimsFromStructured.find((c) => c.property === 'nav');
    expect(navClaim).toBeDefined();
    expect(navClaim?.value).toBe(1.0);
    expect(navClaim?.unit).toBe('USD');
    expect(navClaim?.isDirect).toBe(true);
    expect(navClaim?.locator).toBe('json:$.nav');
    const yieldClaim = claimsFromStructured.find((c) => c.property === 'yieldBps');
    expect(yieldClaim).toBeDefined();
    expect(yieldClaim?.value).toBe(485);
    expect(yieldClaim?.unit).toBe('bps');
    expect(yieldClaim?.isDirect).toBe(false);

    // Prose extraction
    const proseBody = 'Official prospectus summary: The fund reports a Net Asset Value of $105.50 USD as of market close. CUSIP: 912828ZG8. ISIN: US912828ZG84. Share Class is Retail.';
    const proseSource = {
      id: 'source:prose:002', sourceId: 'src:sec:prospectus',
      uri: 'https://sec.gov/edgar/prospectus.txt',
      contentType: 'text/plain',
      contentHash: '0x2222222222222222222222222222222222222222222222222222222222222222' as const,
      fetchedAt: 1_700_000_000_000, bodyStorageRef: 'storage:source:prose:002'
    };
    const proseEvidence = {
      id: 'evidence:ev:002', type: 'FILING' as const,
      source: 'source:prose:002',
      contentHash: '0x2222222222222222222222222222222222222222222222222222222222222222' as const,
      observedAt: 1_700_000_000_000, authority: 'PRIMARY_SOURCE' as const,
      freshness: 'FRESH' as const, fetchedAt: 1_700_000_000_000, metadata: {}
    };
    const claimsFromProse = extractClaims({
      subject: 'object:prose_asset',
      sourceSnapshots: [proseSource],
      evidence: [proseEvidence],
      sourceBodies: { 'source:prose:002': proseBody }
    });
    const proseNav = claimsFromProse.find((c) => c.property === 'nav');
    expect(proseNav?.value).toBe(105.5);
    expect(proseNav?.unit).toBe('USD');
    const proseCusip = claimsFromProse.find((c) => c.property === 'cusip');
    expect(proseCusip?.value).toBe('912828ZG8');
    expect(proseCusip?.isDirect).toBe(true);
  });
});
