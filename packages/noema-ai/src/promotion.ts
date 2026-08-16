import type {
  Claim,
  EconomicObject,
  EconomicRelationship,
  EconomicRight,
  EvidenceAuthority,
  JsonObject,
  JsonValue,
  ProvenanceEdge,
  ResolutionException,
  Restriction,
  SourceSnapshot
} from "@noema/economic-kernel";
import { reduceEconomicObject } from "@noema/noema-core";
import {
  resolveSemanticRelationship,
  type SemanticRepresentationLink,
  type SemanticRepresentationProfile
} from "@noema/noema-core/semantic";
import {
  NOEMA_AI_PROPOSAL_SCHEMA_VERSION,
  hashNoemaAiProposal,
  noemaAiProposalSchema,
  type AiEvidenceLocator,
  type NoemaAiProposal,
  type ProposedClaim,
  type ProposedConflict,
  type ProposedRelationship,
  type ProposedRestriction,
  type ProposedRight,
  type ProposedUnresolvedIssue
} from "@noema/schemas/ai";

export const AI_PROMOTION_POLICY_VERSION = "noema-ai-promotion-v1";

export type PromotionOutcome =
  | "ACCEPT_AS_INFERRED"
  | "ACCEPT_AS_CANDIDATE"
  | "REJECT_UNSUPPORTED"
  | "REJECT_CONFLICTING"
  | "REJECT_POLICY"
  | "REQUIRE_REVIEW"
  | "UNRESOLVED";

export type PromotionItemKind =
  | "CLAIM"
  | "RIGHT"
  | "RESTRICTION"
  | "RELATIONSHIP"
  | "CONFLICT"
  | "UNRESOLVED_ISSUE";

export interface PromotionDecision {
  itemKind: PromotionItemKind;
  itemId: string;
  outcome: PromotionOutcome;
  reasonCodes: string[];
  proposalId: string;
  proposalHash: `0x${string}`;
  aiRunId: string;
  evidenceRefs: string[];
  sourceSnapshotRefs: string[];
}

export interface AiPromotionResult {
  policyVersion: typeof AI_PROMOTION_POLICY_VERSION;
  proposalId: string;
  proposalHash: `0x${string}`;
  aiRunId: string;
  objectId: string;
  objectVersion: number;
  decisions: PromotionDecision[];
}

export interface AiPromotionPolicy {
  nowMs: number;
  maxEvidenceAgeMs?: number;
  allowedAuthorities?: EvidenceAuthority[];
  revokedEvidenceRefs?: string[];
  revokedSourceSnapshotRefs?: string[];
}

export interface AiPromotionContext {
  object: EconomicObject;
  sourceSnapshots: readonly SourceSnapshot[];
  proposalHash: `0x${string}`;
  aiRunId: string;
  policy: AiPromotionPolicy;
  relationshipProfiles?: Readonly<Record<string, SemanticRepresentationProfile>>;
  relationshipLinks?: readonly SemanticRepresentationLink[];
}

const DEFAULT_ALLOWED_AUTHORITIES = new Set<EvidenceAuthority>([
  "PRIMARY_SOURCE",
  "AUTHORIZED_ATTESTOR",
  "ONCHAIN_STATE",
  "INDEPENDENT_ORACLE",
  "REFERENCE_DATA",
  "MARKET_DATA"
]);

const REQUIRED_EQUIVALENCE_DIMENSIONS = [
  "economicClaim",
  "issuer",
  "shareClass",
  "rights",
  "restrictions",
  "backing",
  "redemption",
  "supportedRepresentationLink"
] as const;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function evidenceLocators(item:
  | ProposedClaim
  | ProposedRight
  | ProposedRestriction
  | ProposedRelationship
  | ProposedConflict
  | ProposedUnresolvedIssue
): AiEvidenceLocator[] {
  return [...item.evidence];
}

function knownSubjects(object: EconomicObject): Set<string> {
  return new Set([
    object.id,
    ...object.representations.map((item) => item.id),
    ...object.parties.map((item) => item.id)
  ]);
}

function itemSubject(item:
  | ProposedClaim
  | ProposedRight
  | ProposedRestriction
  | ProposedRelationship
  | ProposedConflict
  | ProposedUnresolvedIssue
): string {
  return item.subject;
}

function evidenceReview(input: {
  locators: readonly AiEvidenceLocator[];
  proposal: NoemaAiProposal;
  context: AiPromotionContext;
}): { outcome?: PromotionOutcome; reasonCodes: string[] } {
  const evidenceById = new Map(input.context.object.evidence.map((item) => [item.id, item]));
  const snapshotsById = new Map(input.context.sourceSnapshots.map((item) => [item.id, item]));
  const allowedAuthorities = new Set(input.context.policy.allowedAuthorities ?? [...DEFAULT_ALLOWED_AUTHORITIES]);
  const revokedEvidence = new Set(input.context.policy.revokedEvidenceRefs ?? []);
  const revokedSnapshots = new Set(input.context.policy.revokedSourceSnapshotRefs ?? []);
  const proposalEvidence = new Set(input.proposal.evidenceRefs);
  const proposalSnapshots = new Set(input.proposal.sourceSnapshotRefs);
  const reasons: string[] = [];
  let review = false;

  if (input.locators.length === 0) {
    return { outcome: "REJECT_UNSUPPORTED", reasonCodes: ["EVIDENCE_REFERENCE_MISSING"] };
  }

  for (const locator of input.locators) {
    if (!proposalEvidence.has(locator.evidenceRef) || !proposalSnapshots.has(locator.sourceSnapshotRef)) {
      return {
        outcome: "REJECT_UNSUPPORTED",
        reasonCodes: ["PROPOSAL_REFERENCE_SET_MISMATCH"]
      };
    }
    const evidence = evidenceById.get(locator.evidenceRef);
    const snapshot = snapshotsById.get(locator.sourceSnapshotRef);
    if (evidence === undefined || snapshot === undefined) {
      return {
        outcome: "REJECT_UNSUPPORTED",
        reasonCodes: [evidence === undefined ? "EVIDENCE_NOT_FOUND" : "SOURCE_SNAPSHOT_NOT_FOUND"]
      };
    }
    if (evidence.source !== snapshot.id || evidence.contentHash !== snapshot.contentHash) {
      return { outcome: "REJECT_UNSUPPORTED", reasonCodes: ["SOURCE_EVIDENCE_LINEAGE_MISMATCH"] };
    }
    if (revokedEvidence.has(evidence.id) || revokedSnapshots.has(snapshot.id)) {
      return { outcome: "REJECT_POLICY", reasonCodes: ["EVIDENCE_OR_SOURCE_REVOKED"] };
    }
    if (!allowedAuthorities.has(evidence.authority)) {
      return { outcome: "REJECT_POLICY", reasonCodes: [`AUTHORITY_NOT_ALLOWED:${evidence.authority}`] };
    }
    if (evidence.freshness === "STALE") {
      reasons.push("EVIDENCE_STALE");
      review = true;
    } else if (evidence.freshness === "UNKNOWN" || evidence.freshness === undefined) {
      reasons.push("EVIDENCE_FRESHNESS_UNKNOWN");
      review = true;
    }
    if (
      input.context.policy.maxEvidenceAgeMs !== undefined &&
      input.context.policy.nowMs - evidence.observedAt > input.context.policy.maxEvidenceAgeMs
    ) {
      reasons.push("EVIDENCE_TOO_OLD");
      review = true;
    }
  }

  return review
    ? { outcome: "REQUIRE_REVIEW", reasonCodes: uniqueSorted(reasons) }
    : { reasonCodes: ["EVIDENCE_POLICY_SATISFIED"] };
}

function activeConflictFor(item: ProposedClaim | ProposedRelationship, object: EconomicObject): boolean {
  if (item.property !== undefined) {
    return object.claims.some(
      (claim) =>
        claim.subject === item.subject &&
        claim.property === item.property &&
        claim.state === "CONFLICTING"
    );
  }
  return object.status === "CONFLICTING" || object.exceptions.some(
    (exception) => exception.status === "OPEN" && exception.type === "EVIDENCE_CONFLICT"
  );
}

function baseDecision(input: {
  kind: PromotionItemKind;
  item: ProposedClaim | ProposedRight | ProposedRestriction | ProposedRelationship | ProposedConflict | ProposedUnresolvedIssue;
  proposal: NoemaAiProposal;
  context: AiPromotionContext;
}): PromotionDecision | undefined {
  const locators = evidenceLocators(input.item);
  const decisionBase = {
    itemKind: input.kind,
    itemId: input.item.id,
    proposalId: input.proposal.proposalId,
    proposalHash: input.context.proposalHash,
    aiRunId: input.context.aiRunId,
    evidenceRefs: uniqueSorted(locators.map((item) => item.evidenceRef)),
    sourceSnapshotRefs: uniqueSorted(locators.map((item) => item.sourceSnapshotRef))
  };

  if (!knownSubjects(input.context.object).has(itemSubject(input.item))) {
    return {
      ...decisionBase,
      outcome: "REJECT_UNSUPPORTED",
      reasonCodes: ["SUBJECT_NOT_FOUND"]
    };
  }

  if (input.context.object.status === "REVOKED") {
    return { ...decisionBase, outcome: "REJECT_POLICY", reasonCodes: ["OBJECT_REVOKED"] };
  }

  const reviewed = evidenceReview({ locators, proposal: input.proposal, context: input.context });
  if (reviewed.outcome !== undefined) {
    return { ...decisionBase, outcome: reviewed.outcome, reasonCodes: reviewed.reasonCodes };
  }
  return undefined;
}

function validateSupportingClaims(
  refs: readonly string[],
  proposal: NoemaAiProposal,
  object: EconomicObject
): string[] {
  const known = new Set([...proposal.claims.map((claim) => claim.id), ...object.claims.map((claim) => claim.id)]);
  return refs.filter((ref) => !known.has(ref));
}

function relationshipPolicy(
  item: ProposedRelationship,
  context: AiPromotionContext
): { outcome?: PromotionOutcome; reasonCodes: string[] } {
  if (item.predicate !== "ECONOMICALLY_EQUIVALENT_TO") {
    return { reasonCodes: ["RELATIONSHIP_POLICY_SATISFIED"] };
  }
  const compared = new Set(item.comparedDimensions);
  const missing = REQUIRED_EQUIVALENCE_DIMENSIONS.filter((dimension) => !compared.has(dimension));
  if (missing.length > 0 || item.unresolvedDimensions.length > 0) {
    return {
      outcome: "REQUIRE_REVIEW",
      reasonCodes: ["EQUIVALENCE_DIMENSIONS_INCOMPLETE"]
    };
  }

  const left = context.relationshipProfiles?.[item.subject];
  const right = context.relationshipProfiles?.[item.object];
  if (left === undefined || right === undefined) {
    return { outcome: "REQUIRE_REVIEW", reasonCodes: ["EQUIVALENCE_PROFILE_MISSING"] };
  }
  const resolved = resolveSemanticRelationship({
    left,
    right,
    links: [...(context.relationshipLinks ?? [])]
  });
  if (resolved.relationship !== "ECONOMICALLY_EQUIVALENT_TO") {
    return {
      outcome: "REJECT_POLICY",
      reasonCodes: ["FALSE_EQUIVALENCE", ...resolved.reasonCodes]
    };
  }
  return { reasonCodes: ["EQUIVALENCE_DETERMINISTICALLY_SUPPORTED"] };
}

function acceptedDecision(
  kind: PromotionItemKind,
  item: ProposedClaim | ProposedRight | ProposedRestriction | ProposedRelationship | ProposedConflict,
  proposal: NoemaAiProposal,
  context: AiPromotionContext,
  outcome: PromotionOutcome,
  reasonCodes: string[]
): PromotionDecision {
  const locators = evidenceLocators(item);
  return {
    itemKind: kind,
    itemId: item.id,
    outcome,
    reasonCodes: uniqueSorted(reasonCodes),
    proposalId: proposal.proposalId,
    proposalHash: context.proposalHash,
    aiRunId: context.aiRunId,
    evidenceRefs: uniqueSorted(locators.map((locator) => locator.evidenceRef)),
    sourceSnapshotRefs: uniqueSorted(locators.map((locator) => locator.sourceSnapshotRef))
  };
}

export function reduceAiProposalPromotion(
  proposalInput: NoemaAiProposal,
  context: AiPromotionContext
): AiPromotionResult {
  const proposal = noemaAiProposalSchema.parse(proposalInput);
  const computedHash = hashNoemaAiProposal(proposal);
  const hashMismatch = computedHash !== context.proposalHash;
  const schemaMismatch = proposal.schemaVersion !== NOEMA_AI_PROPOSAL_SCHEMA_VERSION;
  const decisions: PromotionDecision[] = [];

  const allItems: Array<{
    kind: PromotionItemKind;
    item: ProposedClaim | ProposedRight | ProposedRestriction | ProposedRelationship | ProposedConflict | ProposedUnresolvedIssue;
  }> = [
    ...proposal.claims.map((item) => ({ kind: "CLAIM" as const, item })),
    ...proposal.rights.map((item) => ({ kind: "RIGHT" as const, item })),
    ...proposal.restrictions.map((item) => ({ kind: "RESTRICTION" as const, item })),
    ...proposal.relationships.map((item) => ({ kind: "RELATIONSHIP" as const, item })),
    ...proposal.conflicts.map((item) => ({ kind: "CONFLICT" as const, item })),
    ...proposal.unresolvedIssues.map((item) => ({ kind: "UNRESOLVED_ISSUE" as const, item }))
  ];

  for (const { kind, item } of allItems) {
    const locators = evidenceLocators(item);
    const common = {
      itemKind: kind,
      itemId: item.id,
      proposalId: proposal.proposalId,
      proposalHash: context.proposalHash,
      aiRunId: context.aiRunId,
      evidenceRefs: uniqueSorted(locators.map((locator) => locator.evidenceRef)),
      sourceSnapshotRefs: uniqueSorted(locators.map((locator) => locator.sourceSnapshotRef))
    };

    if (schemaMismatch || hashMismatch) {
      decisions.push({
        ...common,
        outcome: "REJECT_POLICY",
        reasonCodes: [schemaMismatch ? "PROPOSAL_SCHEMA_UNSUPPORTED" : "PROPOSAL_HASH_MISMATCH"]
      });
      continue;
    }

    if (kind === "UNRESOLVED_ISSUE") {
      decisions.push({
        ...common,
        outcome: "UNRESOLVED",
        reasonCodes: uniqueSorted(["AI_PROPOSAL_UNRESOLVED", (item as ProposedUnresolvedIssue).reasonCode])
      });
      continue;
    }

    const blocked = baseDecision({ kind, item, proposal, context });
    if (blocked !== undefined) {
      decisions.push(blocked);
      continue;
    }

    if (kind === "CLAIM") {
      const claim = item as ProposedClaim;
      if (activeConflictFor(claim, context.object)) {
        decisions.push(acceptedDecision(kind, claim, proposal, context, "REJECT_CONFLICTING", ["CANONICAL_CLAIM_CONFLICT"]));
      } else {
        decisions.push(
          acceptedDecision(
            kind,
            claim,
            proposal,
            context,
            claim.basis === "INFERRED" ? "ACCEPT_AS_INFERRED" : "ACCEPT_AS_CANDIDATE",
            [claim.basis === "INFERRED" ? "EXPLICIT_AI_INFERENCE" : "DIRECT_SOURCE_STATEMENT"]
          )
        );
      }
      continue;
    }

    if (kind === "RIGHT" || kind === "RESTRICTION") {
      const refs = (item as ProposedRight | ProposedRestriction).supportingClaimRefs;
      const missing = validateSupportingClaims(refs, proposal, context.object);
      if (missing.length > 0) {
        decisions.push(acceptedDecision(kind, item as ProposedRight | ProposedRestriction, proposal, context, "REJECT_UNSUPPORTED", ["SUPPORTING_CLAIM_NOT_FOUND"]));
      } else {
        decisions.push(acceptedDecision(kind, item as ProposedRight | ProposedRestriction, proposal, context, "ACCEPT_AS_CANDIDATE", ["SUPPORTED_BY_KNOWN_CLAIMS"]));
      }
      continue;
    }

    if (kind === "RELATIONSHIP") {
      const relationship = item as ProposedRelationship;
      if (activeConflictFor(relationship, context.object)) {
        decisions.push(acceptedDecision(kind, relationship, proposal, context, "REJECT_CONFLICTING", ["CANONICAL_RELATIONSHIP_CONFLICT"]));
        continue;
      }
      const missingClaims = validateSupportingClaims(relationship.supportingClaimRefs, proposal, context.object);
      if (missingClaims.length > 0) {
        decisions.push(acceptedDecision(kind, relationship, proposal, context, "REJECT_UNSUPPORTED", ["SUPPORTING_CLAIM_NOT_FOUND"]));
        continue;
      }
      const policy = relationshipPolicy(relationship, context);
      decisions.push(
        acceptedDecision(
          kind,
          relationship,
          proposal,
          context,
          policy.outcome ?? "ACCEPT_AS_CANDIDATE",
          policy.reasonCodes
        )
      );
      continue;
    }

    decisions.push(
      acceptedDecision("CONFLICT", item as ProposedConflict, proposal, context, "ACCEPT_AS_CANDIDATE", ["CONFLICT_PRESERVED"])
    );
  }

  return {
    policyVersion: AI_PROMOTION_POLICY_VERSION,
    proposalId: proposal.proposalId,
    proposalHash: context.proposalHash,
    aiRunId: context.aiRunId,
    objectId: context.object.id,
    objectVersion: context.object.version,
    decisions: [...decisions].sort((left, right) =>
      `${left.itemKind}:${left.itemId}`.localeCompare(`${right.itemKind}:${right.itemId}`)
    )
  };
}

function canonicalId(kind: string, proposalId: string, itemId: string): string {
  return `${kind}:promoted:${proposalId}:${itemId}`;
}

function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function asJsonObject(value: unknown): JsonObject {
  return value as JsonObject;
}

function appendUnique<T extends { id: string }>(existing: readonly T[], added: readonly T[]): T[] {
  const map = new Map(existing.map((item) => [item.id, structuredClone(item)]));
  for (const item of added) if (!map.has(item.id)) map.set(item.id, structuredClone(item));
  return [...map.values()];
}

export function applyAcceptedAiProposal(input: {
  proposal: NoemaAiProposal;
  promotion: AiPromotionResult;
  object: EconomicObject;
  nowMs: number;
}): EconomicObject {
  const proposal = noemaAiProposalSchema.parse(input.proposal);
  if (
    input.promotion.proposalId !== proposal.proposalId ||
    input.promotion.objectId !== input.object.id ||
    input.promotion.proposalHash !== hashNoemaAiProposal(proposal)
  ) {
    throw new Error("Promotion result does not match proposal/object identity");
  }

  const decisions = new Map(
    input.promotion.decisions.map((decision) => [`${decision.itemKind}:${decision.itemId}`, decision])
  );
  const accepted = (kind: PromotionItemKind, id: string) => {
    const outcome = decisions.get(`${kind}:${id}`)?.outcome;
    return outcome === "ACCEPT_AS_INFERRED" || outcome === "ACCEPT_AS_CANDIDATE";
  };
  const claimIdMap = new Map<string, string>();
  const promotedClaims: Claim[] = [];

  for (const claim of proposal.claims) {
    if (!accepted("CLAIM", claim.id)) continue;
    const decision = decisions.get(`CLAIM:${claim.id}`)!;
    const id = canonicalId("claim", proposal.proposalId, claim.id);
    claimIdMap.set(claim.id, id);
    promotedClaims.push({
      id,
      subject: claim.subject,
      property: claim.property,
      value: asJsonValue(claim.value),
      ...(claim.unit === undefined ? {} : { unit: claim.unit }),
      state: decision.outcome === "ACCEPT_AS_INFERRED" ? "INFERRED" : "SOURCED",
      sourceRefs: decision.sourceSnapshotRefs,
      evidenceRefs: decision.evidenceRefs,
      attestationRefs: [],
      confidence: claim.confidence,
      createdAt: input.nowMs
    });
  }

  const mapClaimRef = (ref: string) => claimIdMap.get(ref) ?? ref;
  const promotedRights: EconomicRight[] = proposal.rights
    .filter((item) => accepted("RIGHT", item.id))
    .map((item) => ({
      id: canonicalId("right", proposal.proposalId, item.id),
      type: item.type,
      terms: asJsonObject(item.terms),
      claimRefs: item.supportingClaimRefs.map(mapClaimRef).sort()
    }));
  const promotedRestrictions: Restriction[] = proposal.restrictions
    .filter((item) => accepted("RESTRICTION", item.id))
    .map((item) => ({
      id: canonicalId("restriction", proposal.proposalId, item.id),
      type: item.type,
      scope: item.scope,
      claimRefs: item.supportingClaimRefs.map(mapClaimRef).sort(),
      evidenceRefs: uniqueSorted(item.evidence.map((locator) => locator.evidenceRef))
    }));
  const promotedRelationships: EconomicRelationship[] = proposal.relationships
    .filter((item) => accepted("RELATIONSHIP", item.id))
    .map((item) => ({
      id: canonicalId("relationship", proposal.proposalId, item.id),
      subject: item.subject,
      predicate: item.predicate,
      object: item.object,
      state: "INFERRED",
      evidence: uniqueSorted(item.evidence.map((locator) => locator.evidenceRef)),
      attestations: [],
      inferredBy: input.promotion.aiRunId,
      confidence: item.confidence,
      observedAt: input.nowMs
    }));
  const promotedExceptions: ResolutionException[] = proposal.conflicts
    .filter((item) => accepted("CONFLICT", item.id))
    .map((item) => ({
      id: canonicalId("exception", proposal.proposalId, item.id),
      objectId: input.object.id,
      type: item.conflictType === "IDENTITY_MISMATCH"
        ? "IDENTITY_AMBIGUOUS"
        : item.conflictType === "RELATIONSHIP_MISMATCH"
          ? "RELATIONSHIP_AMBIGUOUS"
          : "EVIDENCE_CONFLICT",
      severity: "BLOCKING",
      affectedClaims: proposal.claims
        .filter((claim) => claim.subject === item.subject && claim.property === item.property)
        .map((claim) => mapClaimRef(claim.id))
        .sort(),
      evidence: uniqueSorted(item.evidence.map((locator) => locator.evidenceRef)),
      detectedAt: input.nowMs,
      status: "OPEN"
    }));

  const acceptedCanonicalIds = [
    ...promotedClaims.map((item) => item.id),
    ...promotedRights.map((item) => item.id),
    ...promotedRestrictions.map((item) => item.id),
    ...promotedRelationships.map((item) => item.id),
    ...promotedExceptions.map((item) => item.id)
  ];
  const provenanceEdges: ProvenanceEdge[] = [];
  for (const canonicalRef of acceptedCanonicalIds) {
    provenanceEdges.push({
      id: `edge:${canonicalRef}:proposal`,
      from: canonicalRef,
      to: proposal.proposalId,
      relation: "PROPOSED_BY_AI"
    });
    provenanceEdges.push({
      id: `edge:${canonicalRef}:run`,
      from: proposal.proposalId,
      to: input.promotion.aiRunId,
      relation: "GENERATED_IN_AI_RUN"
    });
    const decision = input.promotion.decisions.find((item) =>
      canonicalRef.endsWith(`:${item.itemId}`)
    );
    for (const evidenceRef of decision?.evidenceRefs ?? []) {
      provenanceEdges.push({
        id: `edge:${canonicalRef}:evidence:${evidenceRef}`,
        from: canonicalRef,
        to: evidenceRef,
        relation: "SUPPORTED_BY"
      });
    }
  }

  return reduceEconomicObject({
    id: input.object.id,
    version: input.object.version,
    classification: input.object.classification,
    identifiers: input.object.identifiers,
    representations: input.object.representations,
    relationships: appendUnique(input.object.relationships, promotedRelationships),
    parties: input.object.parties,
    rights: appendUnique(input.object.rights, promotedRights),
    obligations: input.object.obligations,
    restrictions: appendUnique(input.object.restrictions, promotedRestrictions),
    economics: input.object.economics,
    claims: appendUnique(input.object.claims, promotedClaims),
    evidence: input.object.evidence,
    attestations: input.object.attestations,
    exceptions: appendUnique(input.object.exceptions, promotedExceptions),
    provenance: {
      edges: appendUnique(input.object.provenance.edges, provenanceEdges)
    },
    createdAt: input.object.createdAt,
    updatedAt: input.nowMs
  });
}
