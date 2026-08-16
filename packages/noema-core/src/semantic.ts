import type {
  EconomicObjectState,
  EconomicRelationship
} from "@noema/economic-kernel";

export interface SemanticRepresentationProfile {
  id: string;
  economicClaim: string;
  issuerClaim: string;
  shareClass: string;
  exposureClass: string;
  rights: string[];
  restrictions: string[];
  backing: string[];
  redemption: {
    asset: string;
    windowMs: number;
  };
  evidenceFreshness: "FRESH" | "STALE" | "UNKNOWN";
}

export interface SemanticRepresentationLink {
  from: string;
  to: string;
  type:
    | "REPRESENTS"
    | "BRIDGED_REPRESENTATION_OF"
    | "WRAPPED_REPRESENTATION_OF"
    | "FUNCTIONALLY_FUNGIBLE_WITH";
}

export interface SemanticResolutionInput {
  left?: SemanticRepresentationProfile;
  right?: SemanticRepresentationProfile;
  links?: SemanticRepresentationLink[];
  evidenceFreshness?: Array<"FRESH" | "STALE" | "UNKNOWN">;
}

export interface SemanticResolutionResult {
  relationship?: EconomicRelationship["predicate"];
  objectState: EconomicObjectState;
  exceptionTypes: Array<"EVIDENCE_STALE" | "EVIDENCE_MISSING" | "RELATIONSHIP_AMBIGUOUS">;
  reasonCodes: string[];
}

function normalized(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

function hasSupportedLink(
  leftId: string,
  rightId: string,
  links: readonly SemanticRepresentationLink[]
): boolean {
  return links.some(
    (link) =>
      ((link.from === leftId && link.to === rightId) ||
        (link.from === rightId && link.to === leftId)) &&
      [
        "REPRESENTS",
        "BRIDGED_REPRESENTATION_OF",
        "WRAPPED_REPRESENTATION_OF",
        "FUNCTIONALLY_FUNGIBLE_WITH"
      ].includes(link.type)
  );
}

export function resolveSemanticRelationship(
  input: SemanticResolutionInput
): SemanticResolutionResult {
  const freshness = [
    ...(input.evidenceFreshness ?? []),
    ...(input.left === undefined ? [] : [input.left.evidenceFreshness]),
    ...(input.right === undefined ? [] : [input.right.evidenceFreshness])
  ];

  if (freshness.includes("STALE")) {
    return {
      objectState: "STALE",
      exceptionTypes: ["EVIDENCE_STALE"],
      reasonCodes: ["STALE_EVIDENCE"]
    };
  }

  if (input.left === undefined || input.right === undefined) {
    return {
      objectState: "INSUFFICIENT_EVIDENCE",
      exceptionTypes: ["EVIDENCE_MISSING"],
      reasonCodes: ["SEMANTIC_PROFILE_MISSING"]
    };
  }

  const left = input.left;
  const right = input.right;
  const differences: string[] = [];

  if (left.economicClaim !== right.economicClaim) differences.push("ECONOMIC_CLAIM_DIFFERENT");
  if (left.issuerClaim !== right.issuerClaim) differences.push("ISSUER_DIFFERENT");
  if (left.shareClass !== right.shareClass) differences.push("SHARE_CLASS_DIFFERENT");
  if (!sameStrings(left.rights, right.rights)) differences.push("RIGHTS_DIFFERENT");
  if (!sameStrings(left.restrictions, right.restrictions)) differences.push("RESTRICTIONS_DIFFERENT");
  if (!sameStrings(left.backing, right.backing)) differences.push("BACKING_DIFFERENT");
  if (
    left.redemption.asset !== right.redemption.asset ||
    left.redemption.windowMs !== right.redemption.windowMs
  ) {
    differences.push("REDEMPTION_DIFFERENT");
  }

  const linked = hasSupportedLink(left.id, right.id, input.links ?? []);
  if (!linked) differences.push("SUPPORTED_REPRESENTATION_LINK_MISSING");

  if (differences.length === 0) {
    return {
      relationship: "ECONOMICALLY_EQUIVALENT_TO",
      objectState: "RESOLVED",
      exceptionTypes: [],
      reasonCodes: ["QUALIFYING_EQUIVALENCE_EVIDENCE"]
    };
  }

  if (left.exposureClass === right.exposureClass) {
    return {
      relationship: "SIMILAR_EXPOSURE_TO",
      objectState: "RESOLVED",
      exceptionTypes: [],
      reasonCodes: ["SIMILAR_EXPOSURE_NOT_EQUIVALENT", ...differences.sort()]
    };
  }

  return {
    objectState: "PARTIALLY_RESOLVED",
    exceptionTypes: ["RELATIONSHIP_AMBIGUOUS"],
    reasonCodes: ["RELATIONSHIP_UNRESOLVED", ...differences.sort()]
  };
}
