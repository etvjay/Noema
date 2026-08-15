import type {
  Claim,
  ClaimState,
  EconomicRelationship,
  Evidence,
  Ref,
  RelationshipType,
  SourceSnapshot,
  UnixMillis
} from "@noema/economic-kernel";
import type {
  NoemaAiProposal,
  ProposedClaim,
  ProposedRelationship
} from "./types.js";
import { validateProposal } from "./provenance.js";

export type PromotionOutcome =
  | "ACCEPT_AS_INFERRED"
  | "ACCEPT_AS_CANDIDATE"
  | "REJECT_UNSUPPORTED"
  | "REJECT_CONFLICTING"
  | "REJECT_POLICY"
  | "REQUIRE_REVIEW"
  | "UNRESOLVED";

export interface PromotionDecision {
  targetType: "CLAIM" | "RELATIONSHIP" | "RIGHT" | "RESTRICTION";
  targetId: Ref;
  outcome: PromotionOutcome;
  reasonCode: string;
  explanation: string;
}

export interface CanonicalReductionContext {
  sourceSnapshots: readonly SourceSnapshot[];
  evidence: readonly Evidence[];
  existingClaims?: readonly Claim[];
  now?: UnixMillis;
}

export interface ReductionResult {
  proposalId: Ref;
  decisions: PromotionDecision[];
  canonicalClaims: Claim[];
  canonicalRelationships: EconomicRelationship[];
  summary: {
    acceptedCount: number;
    rejectedCount: number;
    reviewCount: number;
    unresolvedCount: number;
  };
}

export function reduceAiProposalToCanonical(
  proposal: NoemaAiProposal,
  context: CanonicalReductionContext
): ReductionResult {
  // Validate proposal integrity first
  const validated = validateProposal(proposal);
  const now = context.now ?? Date.now();

  const sourceMap = new Map(context.sourceSnapshots.map((s) => [s.id, s]));
  const evidenceMap = new Map(context.evidence.map((e) => [e.id, e]));

  const decisions: PromotionDecision[] = [];
  const canonicalClaims: Claim[] = [];
  const canonicalRelationships: EconomicRelationship[] = [];

  let acceptedCount = 0;
  let rejectedCount = 0;
  let reviewCount = 0;
  let unresolvedCount = 0;

  // 1. Reduce Proposed Claims
  for (const pc of validated.proposedClaims) {
    const decision = reduceProposedClaim(pc, sourceMap, evidenceMap, now);
    decisions.push(decision);

    if (decision.outcome === "ACCEPT_AS_CANDIDATE" || decision.outcome === "ACCEPT_AS_INFERRED") {
      acceptedCount++;
      const claimState: ClaimState = decision.outcome === "ACCEPT_AS_CANDIDATE" ? "SOURCED" : "INFERRED";
      canonicalClaims.push({
        id: pc.id,
        subject: pc.subject,
        property: pc.property,
        value: pc.value,
        ...(pc.unit ? { unit: pc.unit } : {}),
        state: claimState,
        sourceRefs: [...pc.sourceRefs],
        evidenceRefs: [...pc.evidenceRefs],
        attestationRefs: [],
        confidence: pc.confidence,
        createdAt: now
      });
    } else if (
      decision.outcome === "REJECT_UNSUPPORTED" ||
      decision.outcome === "REJECT_CONFLICTING" ||
      decision.outcome === "REJECT_POLICY"
    ) {
      rejectedCount++;
    } else if (decision.outcome === "REQUIRE_REVIEW") {
      reviewCount++;
    } else {
      unresolvedCount++;
    }
  }

  // 2. Reduce Proposed Relationships
  for (const pr of validated.proposedRelationships) {
    const decision = reduceProposedRelationship(pr, evidenceMap, now);
    decisions.push(decision);

    if (decision.outcome === "ACCEPT_AS_CANDIDATE" || decision.outcome === "ACCEPT_AS_INFERRED") {
      acceptedCount++;
      canonicalRelationships.push({
        id: pr.id,
        subject: pr.subject,
        predicate: pr.predicate,
        object: pr.object,
        state: decision.outcome === "ACCEPT_AS_CANDIDATE" ? "SOURCED" : "INFERRED",
        evidence: [...pr.evidenceRefs],
        attestations: [],
        confidence: pr.confidence,
        observedAt: now
      });
    } else if (
      decision.outcome === "REJECT_UNSUPPORTED" ||
      decision.outcome === "REJECT_CONFLICTING" ||
      decision.outcome === "REJECT_POLICY"
    ) {
      rejectedCount++;
    } else if (decision.outcome === "REQUIRE_REVIEW") {
      reviewCount++;
    } else {
      unresolvedCount++;
    }
  }

  return {
    proposalId: validated.proposalId,
    decisions,
    canonicalClaims,
    canonicalRelationships,
    summary: {
      acceptedCount,
      rejectedCount,
      reviewCount,
      unresolvedCount
    }
  };
}

function reduceProposedClaim(
  pc: ProposedClaim,
  sourceMap: Map<Ref, SourceSnapshot>,
  evidenceMap: Map<Ref, Evidence>,
  _now: UnixMillis
): PromotionDecision {
  // Validate that source refs exist
  if (pc.sourceRefs.length === 0 || pc.evidenceRefs.length === 0) {
    return {
      targetType: "CLAIM",
      targetId: pc.id,
      outcome: "REJECT_UNSUPPORTED",
      reasonCode: "REASON_EVIDENCE_MISSING",
      explanation: "Proposed claim has no backing source or evidence references"
    };
  }

  for (const sRef of pc.sourceRefs) {
    if (!sourceMap.has(sRef)) {
      return {
        targetType: "CLAIM",
        targetId: pc.id,
        outcome: "REJECT_UNSUPPORTED",
        reasonCode: "REASON_SOURCE_SNAPSHOT_NOT_FOUND",
        explanation: `Referenced source snapshot '${sRef}' is missing from canonical evidence store`
      };
    }
  }

  const primaryEv = evidenceMap.get(pc.evidenceRefs[0]!);
  if (!primaryEv) {
    return {
      targetType: "CLAIM",
      targetId: pc.id,
      outcome: "REJECT_UNSUPPORTED",
      reasonCode: "REASON_EVIDENCE_NOT_FOUND",
      explanation: `Referenced evidence '${pc.evidenceRefs[0]}' is missing from canonical evidence store`
    };
  }

  if (primaryEv.freshness === "STALE") {
    return {
      targetType: "CLAIM",
      targetId: pc.id,
      outcome: "REQUIRE_REVIEW",
      reasonCode: "REASON_EVIDENCE_STALE",
      explanation: "Underlying evidence is stale and requires freshness review before promotion"
    };
  }

  if (
    primaryEv.authority === "PRIMARY_SOURCE" ||
    primaryEv.authority === "REFERENCE_DATA" ||
    primaryEv.authority === "ONCHAIN_STATE" ||
    primaryEv.authority === "AUTHORIZED_ATTESTOR"
  ) {
    return {
      targetType: "CLAIM",
      targetId: pc.id,
      outcome: "ACCEPT_AS_CANDIDATE",
      reasonCode: "REASON_GROUNDED_AUTHORITATIVE",
      explanation: "Claim is grounded in authoritative primary/reference evidence"
    };
  }

  return {
    targetType: "CLAIM",
    targetId: pc.id,
    outcome: "ACCEPT_AS_INFERRED",
    reasonCode: "REASON_INFERRED_NON_AUTHORITATIVE",
    explanation: "Claim is supported by secondary source, promoted as inferred claim"
  };
}

function reduceProposedRelationship(
  pr: ProposedRelationship,
  evidenceMap: Map<Ref, Evidence>,
  _now: UnixMillis
): PromotionDecision {
  // Sensitive check: ECONOMICALLY_EQUIVALENT_TO must have evidence
  if (pr.predicate === "ECONOMICALLY_EQUIVALENT_TO") {
    if (!pr.isEquivalent || pr.evidenceRefs.length === 0) {
      return {
        targetType: "RELATIONSHIP",
        targetId: pr.id,
        outcome: "REJECT_POLICY",
        reasonCode: "REASON_EQUIVALENCE_EVIDENCE_INSUFFICIENT",
        explanation: "Cannot promote ECONOMICALLY_EQUIVALENT_TO without explicit equivalence proof and evidence refs"
      };
    }
  }

  if (pr.evidenceRefs.length === 0) {
    return {
      targetType: "RELATIONSHIP",
      targetId: pr.id,
      outcome: "REJECT_UNSUPPORTED",
      reasonCode: "REASON_EVIDENCE_MISSING",
      explanation: "Proposed relationship lacks supporting evidence references"
    };
  }

  for (const eRef of pr.evidenceRefs) {
    const ev = evidenceMap.get(eRef);
    if (!ev) {
      return {
        targetType: "RELATIONSHIP",
        targetId: pr.id,
        outcome: "REJECT_UNSUPPORTED",
        reasonCode: "REASON_EVIDENCE_NOT_FOUND",
        explanation: `Evidence '${eRef}' missing from canonical store`
      };
    }
  }

  return {
    targetType: "RELATIONSHIP",
    targetId: pr.id,
    outcome: "ACCEPT_AS_CANDIDATE",
    reasonCode: "REASON_RELATIONSHIP_GROUNDED",
    explanation: `Relationship '${pr.predicate}' successfully validated against canonical evidence`
  };
}
