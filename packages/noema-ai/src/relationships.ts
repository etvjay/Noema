import {
  proposedRelationshipSchema,
  proposedUnresolvedIssueSchema,
  type AiEvidenceLocator,
  type ProposedClaim,
  type ProposedRelationship,
  type ProposedRestriction,
  type ProposedRight,
  type ProposedUnresolvedIssue
} from "@noema/schemas/ai";
import {
  resolveSemanticRelationship,
  type SemanticRepresentationLink,
  type SemanticRepresentationProfile
} from "@noema/noema-core/semantic";

export const RELATIONSHIP_INTERPRETATION_JOB_VERSION = "noema-ai-relationship-interpretation-v1";

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

export interface RelationshipRepresentationInput {
  profile: SemanticRepresentationProfile;
  name?: string;
  ticker?: string;
  claimRefs: string[];
  rightRefs: string[];
  restrictionRefs: string[];
}

export interface RelationshipEvidenceScope {
  sourceSnapshotRef: string;
  evidenceRef: string;
}

export interface RelationshipInterpretationModelEnvelope {
  job: "CLASSIFY_ECONOMIC_RELATIONSHIPS";
  jobVersion: typeof RELATIONSHIP_INTERPRETATION_JOB_VERSION;
  left: RelationshipRepresentationInput;
  right: RelationshipRepresentationInput;
  links: SemanticRepresentationLink[];
  claims: ProposedClaim[];
  rights: ProposedRight[];
  restrictions: ProposedRestriction[];
  evidenceScope: RelationshipEvidenceScope[];
  rules: {
    outputProposalOnly: true;
    labelsNamesTickersAreNotEconomicIdentity: true;
    similarExposureDoesNotImplyEquivalence: true;
    equivalenceRequiresAllMaterialDimensions: true;
    unsupportedDimensionsMustRemainUnresolved: true;
  };
}

export interface RelationshipInterpretationModel {
  classify(envelope: RelationshipInterpretationModelEnvelope): Promise<unknown>;
}

export interface RelationshipInterpretationResult {
  relationships: ProposedRelationship[];
  unresolvedIssues: ProposedUnresolvedIssue[];
}

export class RelationshipInterpretationError extends Error {
  constructor(
    readonly code:
      | "MALFORMED_MODEL_OUTPUT"
      | "UNKNOWN_SUPPORTING_CLAIM"
      | "UNAUTHORIZED_EVIDENCE_REFERENCE"
      | "INVALID_RELATIONSHIP_ENDPOINT"
      | "FALSE_EQUIVALENCE_PROPOSAL"
      | "EQUIVALENCE_DIMENSIONS_INCOMPLETE",
    message: string
  ) {
    super(message);
    this.name = "RelationshipInterpretationError";
  }
}

function parseOutput(output: unknown): RelationshipInterpretationResult {
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    throw new RelationshipInterpretationError("MALFORMED_MODEL_OUTPUT", "Model output must be an object");
  }
  const record = output as Record<string, unknown>;
  if (!Array.isArray(record.relationships) || !Array.isArray(record.unresolvedIssues)) {
    throw new RelationshipInterpretationError(
      "MALFORMED_MODEL_OUTPUT",
      "Model output must contain relationships and unresolvedIssues arrays"
    );
  }

  try {
    return {
      relationships: record.relationships.map((item) => proposedRelationshipSchema.parse(item)),
      unresolvedIssues: record.unresolvedIssues.map((item) => proposedUnresolvedIssueSchema.parse(item))
    };
  } catch (error) {
    throw new RelationshipInterpretationError(
      "MALFORMED_MODEL_OUTPUT",
      error instanceof Error ? error.message : "Model output failed strict relationship validation"
    );
  }
}

function evidenceKey(locator: AiEvidenceLocator): string {
  return `${locator.sourceSnapshotRef}\u0000${locator.evidenceRef}`;
}

function assertBoundedReferences(
  result: RelationshipInterpretationResult,
  input: {
    left: RelationshipRepresentationInput;
    right: RelationshipRepresentationInput;
    claims: readonly ProposedClaim[];
    evidenceScope: readonly RelationshipEvidenceScope[];
  }
): void {
  const allowedClaims = new Set(input.claims.map((claim) => claim.id));
  const allowedEvidence = new Set(
    input.evidenceScope.map((scope) => `${scope.sourceSnapshotRef}\u0000${scope.evidenceRef}`)
  );
  const endpoints = new Set([input.left.profile.id, input.right.profile.id]);

  for (const relationship of result.relationships) {
    if (!endpoints.has(relationship.subject) || !endpoints.has(relationship.object)) {
      throw new RelationshipInterpretationError(
        "INVALID_RELATIONSHIP_ENDPOINT",
        `${relationship.id} must relate the two supplied representations`
      );
    }
    for (const claimRef of relationship.supportingClaimRefs) {
      if (!allowedClaims.has(claimRef)) {
        throw new RelationshipInterpretationError(
          "UNKNOWN_SUPPORTING_CLAIM",
          `${relationship.id} references unknown supporting claim ${claimRef}`
        );
      }
    }
    for (const locator of relationship.evidence) {
      if (!allowedEvidence.has(evidenceKey(locator))) {
        throw new RelationshipInterpretationError(
          "UNAUTHORIZED_EVIDENCE_REFERENCE",
          `${relationship.id} references evidence outside the bounded relationship input`
        );
      }
    }
  }

  for (const issue of result.unresolvedIssues) {
    for (const locator of issue.evidence) {
      if (!allowedEvidence.has(evidenceKey(locator))) {
        throw new RelationshipInterpretationError(
          "UNAUTHORIZED_EVIDENCE_REFERENCE",
          `${issue.id} references evidence outside the bounded relationship input`
        );
      }
    }
  }
}

function assertEquivalenceSafety(
  relationships: readonly ProposedRelationship[],
  input: {
    left: RelationshipRepresentationInput;
    right: RelationshipRepresentationInput;
    links: readonly SemanticRepresentationLink[];
  }
): void {
  for (const relationship of relationships) {
    if (relationship.predicate !== "ECONOMICALLY_EQUIVALENT_TO") continue;

    const compared = new Set(relationship.comparedDimensions);
    const missing = REQUIRED_EQUIVALENCE_DIMENSIONS.filter((dimension) => !compared.has(dimension));
    if (missing.length > 0 || relationship.unresolvedDimensions.length > 0) {
      throw new RelationshipInterpretationError(
        "EQUIVALENCE_DIMENSIONS_INCOMPLETE",
        `${relationship.id} cannot propose equivalence with missing or unresolved material dimensions: ${[
          ...missing,
          ...relationship.unresolvedDimensions
        ].join(", ")}`
      );
    }

    const deterministic = resolveSemanticRelationship({
      left: input.left.profile,
      right: input.right.profile,
      links: [...input.links]
    });
    if (deterministic.relationship !== "ECONOMICALLY_EQUIVALENT_TO") {
      throw new RelationshipInterpretationError(
        "FALSE_EQUIVALENCE_PROPOSAL",
        `${relationship.id} proposed equivalence but deterministic semantic requirements were not satisfied: ${deterministic.reasonCodes.join(", ")}`
      );
    }
  }
}

export async function classifyRelationships(input: {
  left: RelationshipRepresentationInput;
  right: RelationshipRepresentationInput;
  links: readonly SemanticRepresentationLink[];
  claims: readonly ProposedClaim[];
  rights: readonly ProposedRight[];
  restrictions: readonly ProposedRestriction[];
  evidenceScope: readonly RelationshipEvidenceScope[];
  model: RelationshipInterpretationModel;
}): Promise<RelationshipInterpretationResult> {
  const envelope: RelationshipInterpretationModelEnvelope = {
    job: "CLASSIFY_ECONOMIC_RELATIONSHIPS",
    jobVersion: RELATIONSHIP_INTERPRETATION_JOB_VERSION,
    left: structuredClone(input.left),
    right: structuredClone(input.right),
    links: structuredClone([...input.links]),
    claims: structuredClone([...input.claims]),
    rights: structuredClone([...input.rights]),
    restrictions: structuredClone([...input.restrictions]),
    evidenceScope: structuredClone([...input.evidenceScope]),
    rules: {
      outputProposalOnly: true,
      labelsNamesTickersAreNotEconomicIdentity: true,
      similarExposureDoesNotImplyEquivalence: true,
      equivalenceRequiresAllMaterialDimensions: true,
      unsupportedDimensionsMustRemainUnresolved: true
    }
  };

  const result = parseOutput(await input.model.classify(envelope));
  assertBoundedReferences(result, input);
  assertEquivalenceSafety(result.relationships, input);
  return structuredClone(result);
}
