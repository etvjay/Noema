import type {
  Claim,
  EconomicObject,
  Evidence,
  RelationshipType,
  ResolutionException
} from "@noema/economic-kernel";

export interface SemanticComparisonResult {
  relationship: RelationshipType;
  isEquivalent: boolean;
  reasons: string[];
}

export interface RepresentationInput {
  id: string;
  environment?: string;
  network?: string;
  contract?: string;
  relationship?: string;
  parent?: string;
  shareClass?: string;
  issuer?: string;
  redemptionTerms?: string;
}

export function resolveSemanticRelationship(
  repA: RepresentationInput,
  repB: RepresentationInput
): SemanticComparisonResult {
  const reasons: string[] = [];

  // Check explicit parent / bridged representation link
  const isBridgedOfParent =
    (repB.parent === repA.id && repB.relationship === "BRIDGED_REPRESENTATION_OF") ||
    (repA.parent === repB.id && repA.relationship === "BRIDGED_REPRESENTATION_OF");

  // Check share class equality
  const hasShareClassA = repA.shareClass !== undefined;
  const hasShareClassB = repB.shareClass !== undefined;
  const shareClassMatches = hasShareClassA && hasShareClassB ? repA.shareClass === repB.shareClass : true;

  if (hasShareClassA && hasShareClassB && !shareClassMatches) {
    reasons.push(
      `Material difference in share class: '${repA.shareClass}' vs '${repB.shareClass}'. Institutional and retail share classes have different liquidity, fee, and redemption structures.`
    );
  }

  // Check issuer equality if specified
  if (repA.issuer && repB.issuer && repA.issuer !== repB.issuer) {
    reasons.push(`Material difference in legal issuer: '${repA.issuer}' vs '${repB.issuer}'.`);
  }

  // Check redemption terms if specified
  if (repA.redemptionTerms && repB.redemptionTerms && repA.redemptionTerms !== repB.redemptionTerms) {
    reasons.push(`Material difference in redemption terms: '${repA.redemptionTerms}' vs '${repB.redemptionTerms}'.`);
  }

  if (isBridgedOfParent && shareClassMatches) {
    return {
      relationship: "ECONOMICALLY_EQUIVALENT_TO",
      isEquivalent: true,
      reasons: ["Bridged representation with identical underlying claim, rights, and share class structure."]
    };
  }

  if (reasons.length > 0) {
    return {
      relationship: "SIMILAR_EXPOSURE_TO",
      isEquivalent: false,
      reasons
    };
  }

  // Fallback
  return {
    relationship: "REPRESENTS",
    isEquivalent: false,
    reasons: ["Separate representations without proven structural or economic equivalence."]
  };
}

export function deriveEvidenceState(
  evidenceList: readonly Evidence[],
  claimsList: readonly Claim[] = [],
  exceptionsList: readonly ResolutionException[] = []
): {
  status: EconomicObject["status"];
  exceptions: ResolutionException[];
} {
  const exceptions: ResolutionException[] = [...exceptionsList];

  const hasStaleEvidence = evidenceList.some((e) => e.freshness === "STALE");
  const hasRevokedClaim = claimsList.some((c) => c.state === "REVOKED");
  const hasConflictingClaim = claimsList.some((c) => c.state === "CONFLICTING");

  if (hasStaleEvidence) {
    const staleEv = evidenceList.find((e) => e.freshness === "STALE")!;
    if (!exceptions.some((ex) => ex.type === "EVIDENCE_STALE")) {
      exceptions.push({
        id: `ex:stale:${staleEv.id}`,
        objectId: "object:dynamic",
        type: "EVIDENCE_STALE",
        severity: "BLOCKING",
        affectedClaims: claimsList.filter((c) => c.evidenceRefs.includes(staleEv.id)).map((c) => c.id),
        evidence: [staleEv.id],
        detectedAt: Date.now(),
        status: "OPEN"
      });
    }
    return { status: "STALE", exceptions };
  }

  if (hasRevokedClaim) {
    return { status: "REVOKED", exceptions };
  }

  if (hasConflictingClaim) {
    return { status: "CONFLICTING", exceptions };
  }

  return { status: "RESOLVED", exceptions };
}
