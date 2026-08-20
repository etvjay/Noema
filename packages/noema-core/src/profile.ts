import type {
  ClaimState,
  EconomicObject,
  EconomicObjectState,
  Evidence,
  EvidenceAuthority,
  RelationshipType
} from "@noema/economic-kernel";
import {
  SCHEMA_IDS,
  SCHEMA_VERSIONS,
  type ValidationDimension,
  type ValidationDimensionRequirement,
  type ValidationProfile
} from "@noema/schemas";

export const PROFILE_ENGINE_VERSION = "noema-validation-profile-v1";

export const PROFILE_REASON_CODES = {
  UNSUPPORTED_ASSET_CLASS: (assetClass: string) => `PROFILE_UNSUPPORTED_ASSET_CLASS:${assetClass}`,
  DIMENSION_MISSING: (dimension: string) => `PROFILE_DIMENSION_MISSING:${dimension}`,
  DIMENSION_STALE: (dimension: string) => `PROFILE_DIMENSION_STALE:${dimension}`,
  DIMENSION_CONFLICTING: (dimension: string) => `PROFILE_DIMENSION_CONFLICTING:${dimension}`,
  EVIDENCE_MISSING: (dimension: string) => `PROFILE_EVIDENCE_MISSING:${dimension}`,
  DIMENSION_PRESENT: (dimension: string) => `PROFILE_DIMENSION_PRESENT:${dimension}`,
  DIMENSION_OPTIONAL_PRESENT: (dimension: string) =>
    `PROFILE_DIMENSION_OPTIONAL_PRESENT:${dimension}`,
  DIMENSION_OPTIONAL_ABSENT: (dimension: string) => `PROFILE_DIMENSION_OPTIONAL_ABSENT:${dimension}`
} as const;

export const ACCEPTABLE_CLAIM_STATES: readonly ClaimState[] = [
  "OBSERVED",
  "SOURCED",
  "ATTESTED",
  "VERIFIED"
];

const AUTHORITY_RANK: Record<EvidenceAuthority, number> = {
  PRIMARY_SOURCE: 8,
  AUTHORIZED_ATTESTOR: 7,
  ONCHAIN_STATE: 6,
  INDEPENDENT_ORACLE: 5,
  REFERENCE_DATA: 4,
  MARKET_DATA: 3,
  DERIVED: 2,
  AI_INFERENCE: 1,
  DEMO_FIXTURE: 0
};

export interface ProfileEvaluationContext {
  nowMs: number;
}

export interface ProfileDimensionResult {
  dimension: ValidationDimension;
  required: boolean;
  satisfied: boolean;
  reasonCode: string;
  claimRefs: string[];
  evidenceRefs: string[];
}

export interface ProfileEvaluationResult {
  schemaId: (typeof SCHEMA_IDS)["VALIDATION_PROFILE"];
  schemaVersion: (typeof SCHEMA_VERSIONS)["VALIDATION_PROFILE"];
  profileId: string;
  profileVersion: number;
  objectId: string;
  objectVersion: number;
  engineVersion: string;
  assetClass: string;
  resolutionClass: string;
  resolution: EconomicObjectState;
  dimensionResults: ProfileDimensionResult[];
  requiredClaims: string[];
  requiredEvidence: string[];
  reasonCodes: string[];
  distinguishesMandateSuitability: true;
}

export interface ProfileSetEvaluation {
  objectId: string;
  objectVersion: number;
  applicable: ProfileEvaluationResult[];
  nonApplicable: ProfileEvaluationResult[];
  overall: EconomicObjectState;
  reasonCodes: string[];
}

const RESOLUTION_PRIORITY: readonly EconomicObjectState[] = [
  "UNSUPPORTED",
  "CONFLICTING",
  "STALE",
  "INSUFFICIENT_EVIDENCE",
  "PARTIALLY_RESOLVED",
  "RESOLVED"
];

export function selectApplicableProfiles(
  profiles: readonly ValidationProfile[],
  object: EconomicObject
): ValidationProfile[] {
  return profiles.filter((profile) => profile.assetClass === object.classification.primary);
}

function evidenceMeetsAuthority(evidence: Evidence, minAuthority: EvidenceAuthority): boolean {
  return AUTHORITY_RANK[evidence.authority] >= AUTHORITY_RANK[minAuthority];
}

function evidenceIsFresh(evidence: Evidence, maxAgeMs: number, nowMs: number): boolean {
  return nowMs - evidence.observedAt <= maxAgeMs;
}

function evaluateDimension(
  requirement: ValidationDimensionRequirement,
  object: EconomicObject,
  ctx: ProfileEvaluationContext
): ProfileDimensionResult {
  const claimProperties = requirement.claimProperties ?? [];
  const candidates = claimProperties.length > 0
    ? object.claims.filter((claim) => claimProperties.includes(claim.property))
    : [];
  const acceptedStates = requirement.acceptableClaimStates ?? [...ACCEPTABLE_CLAIM_STATES];

  const presentClaims = candidates.filter((claim) => acceptedStates.includes(claim.state));
  const staleClaims = candidates.filter((claim) => claim.state === "STALE");
  const conflictingClaims = candidates.filter(
    (claim) => claim.state === "CONFLICTING" || claim.state === "REVOKED"
  );

  const evidenceCandidates = requirement.evidenceTypes
    ? object.evidence.filter((evidence) =>
        (requirement.evidenceTypes ?? []).includes(evidence.type)
      )
    : [];
  const supportingEvidence = requirement.evidenceTypes
    ? evidenceCandidates.filter((evidence) => {
        const authorityOk = requirement.minAuthority
          ? evidenceMeetsAuthority(evidence, requirement.minAuthority)
          : true;
        const freshOk = requirement.maxAgeMs
          ? evidenceIsFresh(evidence, requirement.maxAgeMs, ctx.nowMs)
          : true;
        return authorityOk && freshOk;
      })
    : object.evidence.filter((evidence) =>
        new Set(presentClaims.flatMap((claim) => claim.evidenceRefs)).has(evidence.id)
      );

  const representationOk = requirement.representationRequired
    ? object.representations.some((representation) => representation.status === "ACTIVE") &&
      object.relationships.some((relationship) => {
        const predicates = requirement.relationshipPredicates;
        if (!predicates || predicates.length === 0) return true;
        return predicates.includes(relationship.predicate as RelationshipType);
      })
    : true;

  const claimRefs = presentClaims.map((claim) => claim.id);
  const evidenceRefs = supportingEvidence.map((evidence) => evidence.id);
  const satisfiedClaims = presentClaims.length > 0;
  const satisfiedEvidence = !requirement.evidenceTypes || supportingEvidence.length > 0;

  let satisfied: boolean;
  let reasonCode: string;

  if (!representationOk) {
    satisfied = false;
    reasonCode = PROFILE_REASON_CODES.DIMENSION_MISSING(requirement.dimension);
  } else if (conflictingClaims.length > 0) {
    satisfied = false;
    reasonCode = PROFILE_REASON_CODES.DIMENSION_CONFLICTING(requirement.dimension);
  } else if (staleClaims.length > 0) {
    satisfied = false;
    reasonCode = PROFILE_REASON_CODES.DIMENSION_STALE(requirement.dimension);
  } else if (!satisfiedClaims) {
    satisfied = false;
    reasonCode = PROFILE_REASON_CODES.DIMENSION_MISSING(requirement.dimension);
  } else if (!satisfiedEvidence) {
    satisfied = false;
    reasonCode = PROFILE_REASON_CODES.EVIDENCE_MISSING(requirement.dimension);
  } else if (!requirement.required) {
    satisfied = true;
    reasonCode = PROFILE_REASON_CODES.DIMENSION_OPTIONAL_PRESENT(requirement.dimension);
  } else {
    satisfied = true;
    reasonCode = PROFILE_REASON_CODES.DIMENSION_PRESENT(requirement.dimension);
  }

  if (!requirement.required && !satisfied) {
    satisfied = true;
    reasonCode = PROFILE_REASON_CODES.DIMENSION_OPTIONAL_ABSENT(requirement.dimension);
  }

  return {
    dimension: requirement.dimension,
    required: requirement.required,
    satisfied,
    reasonCode,
    claimRefs,
    evidenceRefs
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function evaluateValidationProfile(
  profile: ValidationProfile,
  object: EconomicObject,
  ctx: ProfileEvaluationContext
): ProfileEvaluationResult {
  const base = {
    schemaId: SCHEMA_IDS.VALIDATION_PROFILE,
    schemaVersion: SCHEMA_VERSIONS.VALIDATION_PROFILE,
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    objectId: object.id,
    objectVersion: object.version,
    engineVersion: PROFILE_ENGINE_VERSION,
    assetClass: profile.assetClass,
    resolutionClass: profile.resolutionClass,
    distinguishesMandateSuitability: true as const
  };

  if (profile.assetClass !== object.classification.primary) {
    return {
      ...base,
      resolution: "UNSUPPORTED",
      dimensionResults: [],
      requiredClaims: [],
      requiredEvidence: [],
      reasonCodes: [PROFILE_REASON_CODES.UNSUPPORTED_ASSET_CLASS(object.classification.primary)]
    };
  }

  const dimensionResults = profile.dimensions.map((requirement) =>
    evaluateDimension(requirement, object, ctx)
  );

  const required = dimensionResults.filter((result) => result.required);
  const requiredClaims = uniqueSorted(
    required.flatMap((result) => result.claimRefs.filter((ref) => result.satisfied))
  );
  const requiredEvidence = uniqueSorted(
    required.flatMap((result) => result.evidenceRefs.filter((ref) => result.satisfied))
  );

  let resolution: EconomicObjectState;
  if (required.some((result) => result.reasonCode.startsWith("PROFILE_DIMENSION_CONFLICTING"))) {
    resolution = "CONFLICTING";
  } else if (required.some((result) => result.reasonCode.startsWith("PROFILE_DIMENSION_STALE"))) {
    resolution = "STALE";
  } else if (
    required.some(
      (result) =>
        result.reasonCode.startsWith("PROFILE_DIMENSION_MISSING") ||
        result.reasonCode.startsWith("PROFILE_EVIDENCE_MISSING")
    )
  ) {
    resolution = "INSUFFICIENT_EVIDENCE";
  } else if (
    !dimensionResults.some((result) =>
      result.reasonCode.startsWith("PROFILE_DIMENSION_OPTIONAL_ABSENT")
    )
  ) {
    resolution = "RESOLVED";
  } else {
    resolution = "PARTIALLY_RESOLVED";
  }

  const reasonCodes = uniqueSorted(dimensionResults.map((result) => result.reasonCode));

  return {
    ...base,
    resolution,
    dimensionResults,
    requiredClaims,
    requiredEvidence,
    reasonCodes
  };
}

export function evaluateProfileSet(
  profiles: readonly ValidationProfile[],
  object: EconomicObject,
  ctx: ProfileEvaluationContext
): ProfileSetEvaluation {
  const evaluations = profiles.map((profile) => evaluateValidationProfile(profile, object, ctx));
  const applicable = evaluations.filter((result) => result.resolution !== "UNSUPPORTED");
  const nonApplicable = evaluations.filter((result) => result.resolution === "UNSUPPORTED");

  let overall: EconomicObjectState;
  if (applicable.length === 0) {
    overall = "UNSUPPORTED";
  } else {
    overall = applicable.reduce((worst, result) => {
      const worstIndex = RESOLUTION_PRIORITY.indexOf(worst);
      const currentIndex = RESOLUTION_PRIORITY.indexOf(result.resolution);
      return currentIndex < worstIndex ? result.resolution : worst;
    }, "RESOLVED" as EconomicObjectState);
  }

  const reasonCodes = uniqueSorted(evaluations.flatMap((result) => result.reasonCodes));

  return {
    objectId: object.id,
    objectVersion: object.version,
    applicable,
    nonApplicable,
    overall,
    reasonCodes
  };
}
