import type { Ref } from "@noema/economic-kernel";
import type {
  ProposedClaim,
  ProposedRelationship,
  ProposedRestriction,
  ProposedRight,
  ProposedUnresolvedIssue
} from "./types.js";

export interface RepresentationProfile {
  id: Ref;
  chainId?: number;
  address?: string;
  assetClass?: string;
  issuer?: string;
  shareClass?: string;
  cusip?: string;
  isin?: string;
  ticker?: string;
  nav?: number;
  yieldBps?: number;
  claims?: readonly ProposedClaim[];
  rights?: readonly ProposedRight[];
  restrictions?: readonly ProposedRestriction[];
  evidenceRefs?: readonly Ref[];
  bridgeMechanism?: string;
  isWrapped?: boolean;
}

export interface ClassifyRelationshipsInput {
  representationA: RepresentationProfile;
  representationB: RepresentationProfile;
  minConfidence?: number;
}

export interface ClassifyRelationshipsResult {
  proposedRelationships: ProposedRelationship[];
  proposedUnresolvedIssues: ProposedUnresolvedIssue[];
}

export function classifyRelationships(
  input: ClassifyRelationshipsInput
): ClassifyRelationshipsResult {
  const { representationA: a, representationB: b } = input;
  const proposedRelationships: ProposedRelationship[] = [];
  const proposedUnresolvedIssues: ProposedUnresolvedIssue[] = [];

  const combinedEvidenceRefs = Array.from(
    new Set([...(a.evidenceRefs ?? []), ...(b.evidenceRefs ?? [])])
  );
  const combinedClaimRefs = Array.from(
    new Set([
      ...(a.claims?.map((c) => c.id) ?? []),
      ...(b.claims?.map((c) => c.id) ?? [])
    ])
  );

  // 1. Check for missing evidence/identifiers
  const hasIdentifiersA = Boolean(a.cusip || a.isin || a.issuer);
  const hasIdentifiersB = Boolean(b.cusip || b.isin || b.issuer);

  if (!hasIdentifiersA || !hasIdentifiersB) {
    proposedUnresolvedIssues.push({
      id: `issue:unresolved:${a.id}:${b.id}:identifiers`,
      subject: a.id,
      issueType: "IDENTITY_AMBIGUOUS",
      description: "Insufficient authoritative identifiers to classify economic relationship",
      ambiguityDimension: "identifierCompleteness"
    });
  }

  // 2. Check Bridged Representation
  if (a.bridgeMechanism || b.bridgeMechanism) {
    const bridge = a.bridgeMechanism ?? b.bridgeMechanism;
    proposedRelationships.push({
      id: `rel:prop:${a.id}:bridged:${b.id}`,
      subject: a.id,
      predicate: "BRIDGED_REPRESENTATION_OF",
      object: b.id,
      rationale: `Cross-chain bridged representation via verified bridge mechanism '${bridge}'`,
      claimRefs: combinedClaimRefs,
      evidenceRefs: combinedEvidenceRefs,
      confidence: 0.98,
      isEquivalent: true
    });

    // Bridged representations with same CUSIP/issuer and 1:1 backing are Economically Equivalent
    const sameIssuer = a.issuer && b.issuer && a.issuer.toLowerCase() === b.issuer.toLowerCase();
    const sameCusip = a.cusip && b.cusip && a.cusip === b.cusip;
    const sameShareClass =
      !a.shareClass || !b.shareClass || a.shareClass.toLowerCase() === b.shareClass.toLowerCase();

    if ((sameIssuer || sameCusip) && sameShareClass) {
      proposedRelationships.push({
        id: `rel:prop:${a.id}:equiv:${b.id}`,
        subject: a.id,
        predicate: "ECONOMICALLY_EQUIVALENT_TO",
        object: b.id,
        rationale: "1:1 bridged representation with identical underlying issuer, CUSIP, and rights",
        claimRefs: combinedClaimRefs,
        evidenceRefs: combinedEvidenceRefs,
        confidence: 0.99,
        isEquivalent: true
      });
    }
  }

  // 3. Check Wrapped Representation
  if (a.isWrapped || b.isWrapped) {
    proposedRelationships.push({
      id: `rel:prop:${a.id}:wrapped:${b.id}`,
      subject: a.id,
      predicate: "WRAPPED_REPRESENTATION_OF",
      object: b.id,
      rationale: "1:1 programmatic wrapper contract around base representation",
      claimRefs: combinedClaimRefs,
      evidenceRefs: combinedEvidenceRefs,
      confidence: 0.98,
      isEquivalent: true
    });
  }

  // 4. Check Share Class Distinction
  const distinctShareClass =
    a.shareClass &&
    b.shareClass &&
    a.shareClass.toLowerCase() !== b.shareClass.toLowerCase();

  const sameFundOrIssuer =
    (a.issuer && b.issuer && a.issuer.toLowerCase() === b.issuer.toLowerCase()) ||
    (a.cusip && b.cusip && a.cusip === b.cusip);

  if (sameFundOrIssuer && distinctShareClass) {
    proposedRelationships.push({
      id: `rel:prop:${a.id}:shareClass:${b.id}`,
      subject: a.id,
      predicate: "SHARE_CLASS_OF",
      object: b.id,
      rationale: `Distinct share classes (${a.shareClass} vs ${b.shareClass}) of the same underlying fund/issuer`,
      claimRefs: combinedClaimRefs,
      evidenceRefs: combinedEvidenceRefs,
      confidence: 0.96,
      isEquivalent: false
    });

    proposedRelationships.push({
      id: `rel:prop:${a.id}:similar:${b.id}`,
      subject: a.id,
      predicate: "SIMILAR_EXPOSURE_TO",
      object: b.id,
      rationale: `Shares same underlying collateral and issuer, but rights/fees differ across ${a.shareClass} and ${b.shareClass}`,
      claimRefs: combinedClaimRefs,
      evidenceRefs: combinedEvidenceRefs,
      confidence: 0.95,
      isEquivalent: false
    });
  }

  // 5. Check Similar Exposure with Different Issuers (e.g. US Treasury Products from different issuers)
  const differentIssuer =
    a.issuer && b.issuer && a.issuer.toLowerCase() !== b.issuer.toLowerCase();

  const sameAssetClass =
    a.assetClass &&
    b.assetClass &&
    a.assetClass.toLowerCase() === b.assetClass.toLowerCase();

  if (differentIssuer && sameAssetClass) {
    proposedRelationships.push({
      id: `rel:prop:${a.id}:similar:${b.id}`,
      subject: a.id,
      predicate: "SIMILAR_EXPOSURE_TO",
      object: b.id,
      rationale: `Both representations provide ${a.assetClass} exposure, but originate from distinct issuers (${a.issuer} vs ${b.issuer})`,
      claimRefs: combinedClaimRefs,
      evidenceRefs: combinedEvidenceRefs,
      confidence: 0.92,
      isEquivalent: false
    });
  }

  // 6. Check Ticker Collision without Shared Identity (Adversarial / Name collision)
  const sameTicker =
    a.ticker && b.ticker && a.ticker.toUpperCase() === b.ticker.toUpperCase();

  if (sameTicker && differentIssuer) {
    proposedUnresolvedIssues.push({
      id: `issue:unresolved:${a.id}:${b.id}:tickerCollision`,
      subject: a.id,
      issueType: "RELATIONSHIP_AMBIGUOUS",
      description: `Ticker symbol collision '${a.ticker}' across unrelated issuers (${a.issuer} vs ${b.issuer})`,
      ambiguityDimension: "tickerCollision"
    });
  }

  return {
    proposedRelationships,
    proposedUnresolvedIssues
  };
}
