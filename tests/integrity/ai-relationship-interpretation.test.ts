import { describe, it, expect } from 'vitest';
import { classifyRelationships } from '@noema/noema-ai';

describe('ai-relationship-interpretation', () => {
  it('classifies semantic relationships from evidence, refusing false equivalence', () => {
    // Case A: 1:1 Bridged representation with matching CUSIP and issuer
    const repEth = {
      id: 'rep:ousg:eth', chainId: 1, issuer: 'Ondo Finance',
      cusip: '68248X104', assetClass: 'US_TREASURY', shareClass: 'institutional',
      ticker: 'OUSG', evidenceRefs: ['evidence:doc:ousg:eth']
    };
    const repXLayer = {
      id: 'rep:ousg:xlayer', chainId: 196, issuer: 'Ondo Finance',
      cusip: '68248X104', assetClass: 'US_TREASURY', shareClass: 'institutional',
      ticker: 'OUSG', bridgeMechanism: 'Ondo Canonical Bridge',
      evidenceRefs: ['evidence:doc:ousg:xlayer']
    };
    const caseAResult = classifyRelationships({ representationA: repXLayer, representationB: repEth });
    const isBridged = caseAResult.proposedRelationships.some((r: any) => r.predicate === 'BRIDGED_REPRESENTATION_OF');
    const isEquiv = caseAResult.proposedRelationships.some((r: any) => r.predicate === 'ECONOMICALLY_EQUIVALENT_TO' && r.isEquivalent === true);
    expect(isBridged).toBe(true);
    expect(isEquiv).toBe(true);

    // Case B: Same issuer but different share classes
    const repRetail = {
      id: 'rep:ousg:retail', chainId: 1, issuer: 'Ondo Finance',
      cusip: '68248X104', assetClass: 'US_TREASURY', shareClass: 'retail', ticker: 'OUSG-R'
    };
    const caseBResult = classifyRelationships({ representationA: repRetail, representationB: repEth });
    expect(caseBResult.proposedRelationships.some((r: any) => r.predicate === 'SHARE_CLASS_OF')).toBe(true);
    expect(caseBResult.proposedRelationships.some((r: any) => r.predicate === 'ECONOMICALLY_EQUIVALENT_TO')).toBe(false);

    // Case C: Different issuers
    const repMatrixdock = {
      id: 'rep:matrixdock:stbt', chainId: 1, issuer: 'Matrixdock',
      assetClass: 'US_TREASURY', ticker: 'STBT', evidenceRefs: ['evidence:doc:stbt']
    };
    const caseCResult = classifyRelationships({ representationA: repMatrixdock, representationB: repEth });
    expect(caseCResult.proposedRelationships.some((r: any) => r.predicate === 'SIMILAR_EXPOSURE_TO' && r.isEquivalent === false)).toBe(true);
    expect(caseCResult.proposedRelationships.some((r: any) => r.predicate === 'ECONOMICALLY_EQUIVALENT_TO')).toBe(false);
  });
});
