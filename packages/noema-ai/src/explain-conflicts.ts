import type { Evidence, Ref } from "@noema/economic-kernel";
import type {
  ProposedClaim,
  ProposedConflict,
  ProposedRelationship,
  ProposedRestriction,
  ProposedRight,
  ProposedUnresolvedIssue
} from "./types.js";

export interface AnalyzeConflictsInput {
  subject: Ref;
  claims: readonly ProposedClaim[];
  rights?: readonly ProposedRight[];
  restrictions?: readonly ProposedRestriction[];
  relationships?: readonly ProposedRelationship[];
  evidence?: readonly Evidence[];
}

export interface AnalyzeConflictsResult {
  proposedConflicts: ProposedConflict[];
  proposedUnresolvedIssues: ProposedUnresolvedIssue[];
}

export function analyzeConflictsAndAmbiguities(
  input: AnalyzeConflictsInput
): AnalyzeConflictsResult {
  const proposedConflicts: ProposedConflict[] = [];
  const proposedUnresolvedIssues: ProposedUnresolvedIssue[] = [];

  const evidenceMap = new Map((input.evidence ?? []).map((e) => [e.id, e]));

  // 1. Group claims by property
  const claimsByProperty = new Map<string, ProposedClaim[]>();
  for (const claim of input.claims) {
    const list = claimsByProperty.get(claim.property) ?? [];
    list.push(claim);
    claimsByProperty.set(claim.property, list);
  }

  for (const [property, claims] of claimsByProperty.entries()) {
    if (claims.length < 2) continue;

    // Check for value divergences
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const c1 = claims[i]!;
        const c2 = claims[j]!;

        if (areValuesConflicting(c1.value, c2.value)) {
          const conflictingClaimRefs = [c1.id, c2.id];
          const conflictingEvidenceRefs = Array.from(
            new Set([...c1.evidenceRefs, ...c2.evidenceRefs])
          );

          // Determine likely cause
          let likelyCause: ProposedConflict["likelyCause"] = "OTHER";

          // Check if one evidence is stale
          const e1 = c1.evidenceRefs[0] ? evidenceMap.get(c1.evidenceRefs[0]) : undefined;
          const e2 = c2.evidenceRefs[0] ? evidenceMap.get(c2.evidenceRefs[0]) : undefined;

          if (e1?.freshness === "STALE" || e2?.freshness === "STALE") {
            likelyCause = "STALE_SOURCE";
          } else if (property === "shareClass") {
            likelyCause = "SHARE_CLASS_MISMATCH";
          } else if (property === "economicIdentity" || property === "issuer") {
            likelyCause = "REPRESENTATION_MISMATCH";
          } else if (e1?.authority !== e2?.authority) {
            likelyCause = "UNKNOWN_AUTHORITY";
          } else {
            likelyCause = "EFFECTIVE_DATE_MISMATCH";
          }

          proposedConflicts.push({
            id: `conflict:prop:${input.subject}:${property}:${c1.id}:${c2.id}`,
            subject: input.subject,
            property,
            description: `Conflicting values for property '${property}': '${JSON.stringify(c1.value)}' vs '${JSON.stringify(c2.value)}'`,
            likelyCause,
            conflictingClaimRefs,
            conflictingEvidenceRefs,
            severity: "BLOCKING"
          });

          proposedUnresolvedIssues.push({
            id: `issue:unresolved:${input.subject}:${property}:conflict`,
            subject: input.subject,
            issueType: "EVIDENCE_CONFLICT",
            description: `Contradictory evidence detected for property '${property}' across source filings`,
            ambiguityDimension: property
          });
        }
      }
    }
  }

  // 2. Check for conflicting redemption rights
  const rights = input.rights ?? [];
  const redemptionRights = rights.filter((r) => r.rightType === "REDEMPTION");
  if (redemptionRights.length >= 2) {
    const r1 = redemptionRights[0]!;
    const r2 = redemptionRights[1]!;

    if (
      r1.redemptionWindow &&
      r2.redemptionWindow &&
      r1.redemptionWindow.toLowerCase() !== r2.redemptionWindow.toLowerCase()
    ) {
      proposedConflicts.push({
        id: `conflict:prop:${input.subject}:redemptionWindow:${r1.id}:${r2.id}`,
        subject: input.subject,
        property: "redemptionWindow",
        description: `Conflicting redemption terms: '${r1.redemptionWindow}' vs '${r2.redemptionWindow}'`,
        likelyCause: "SHARE_CLASS_MISMATCH",
        conflictingClaimRefs: [...r1.claimRefs, ...r2.claimRefs],
        conflictingEvidenceRefs: [...r1.evidenceRefs, ...r2.evidenceRefs],
        severity: "BLOCKING"
      });

      proposedUnresolvedIssues.push({
        id: `issue:unresolved:${input.subject}:redemption:conflict`,
        subject: input.subject,
        issueType: "EVIDENCE_CONFLICT",
        description: "Contradictory redemption windows in legal filings",
        ambiguityDimension: "redemptionWindow"
      });
    }
  }

  return {
    proposedConflicts,
    proposedUnresolvedIssues
  };
}

function areValuesConflicting(v1: unknown, v2: unknown): boolean {
  if (typeof v1 === "number" && typeof v2 === "number") {
    return Math.abs(v1 - v2) > 0.0001;
  }
  if (typeof v1 === "string" && typeof v2 === "string") {
    return v1.trim().toLowerCase() !== v2.trim().toLowerCase();
  }
  return JSON.stringify(v1) !== JSON.stringify(v2);
}
