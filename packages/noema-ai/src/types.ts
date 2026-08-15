import type {
  Hex,
  JsonValue,
  Ref,
  RelationshipType,
  ResolutionExceptionType,
  UnixMillis
} from "@noema/economic-kernel";

export interface ProposedClaim {
  id: Ref;
  subject: Ref;
  property: string;
  value: JsonValue;
  unit?: string;
  confidence: number;
  isDirect: boolean;
  sourceRefs: Ref[];
  evidenceRefs: Ref[];
  locator?: string;
  explanation?: string;
}

export interface ProposedRight {
  id: Ref;
  subject: Ref;
  holderType: "LEGAL_OWNER" | "BENEFICIAL_OWNER" | "RECORD_HOLDER" | "TOKEN_HOLDER";
  rightType: "REDEMPTION" | "INCOME" | "VOTING" | "INFORMATION" | "CONVERSION" | "OTHER";
  terms: string;
  transferability: "TRANSFERABLE" | "RESTRICTED" | "NON_TRANSFERABLE";
  redemptionWindow?: string;
  claimRefs: Ref[];
  evidenceRefs: Ref[];
  locator?: string;
  confidence: number;
  explanation?: string;
}

export interface ProposedRestriction {
  id: Ref;
  subject: Ref;
  restrictionType: "ELIGIBILITY" | "JURISDICTION" | "LOCKUP" | "TRANSFER_RESTRICTION" | "SANCTION";
  jurisdiction?: string;
  eligibilityCriteria?: string;
  claimRefs: Ref[];
  evidenceRefs: Ref[];
  locator?: string;
  confidence: number;
  explanation?: string;
}

export interface ProposedRelationship {
  id: Ref;
  subject: Ref;
  predicate: RelationshipType;
  object: Ref;
  rationale: string;
  claimRefs: Ref[];
  evidenceRefs: Ref[];
  locator?: string;
  confidence: number;
  isEquivalent?: boolean;
}

export interface ProposedConflict {
  id: Ref;
  subject: Ref;
  property: string;
  description: string;
  likelyCause:
    | "EFFECTIVE_DATE_MISMATCH"
    | "SHARE_CLASS_MISMATCH"
    | "REPRESENTATION_MISMATCH"
    | "JURISDICTION_MISMATCH"
    | "STALE_SOURCE"
    | "UNKNOWN_AUTHORITY"
    | "OTHER";
  conflictingClaimRefs: Ref[];
  conflictingEvidenceRefs: Ref[];
  severity: "INFO" | "WARNING" | "BLOCKING";
}

export interface ProposedUnresolvedIssue {
  id: Ref;
  subject: Ref;
  issueType: ResolutionExceptionType;
  description: string;
  missingEvidenceType?: string;
  ambiguityDimension?: string;
}

export interface NoemaAiProposal {
  proposalId: Ref;
  runId: Ref;
  promptVersion: string;
  schemaVersion: string;
  proposedClaims: ProposedClaim[];
  proposedRights: ProposedRight[];
  proposedRestrictions: ProposedRestriction[];
  proposedRelationships: ProposedRelationship[];
  proposedConflicts: ProposedConflict[];
  proposedUnresolvedIssues: ProposedUnresolvedIssue[];
  summary: string;
  proposalHash: Hex;
  createdAt: UnixMillis;
}

export interface NoemaAiRunReceipt {
  runId: Ref;
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  inputSourceRefs: Ref[];
  inputEvidenceRefs: Ref[];
  outputProposalHash: Hex;
  latencyMs: number;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  status: "SUCCESS" | "REJECTED_MALFORMED" | "REJECTED_TIMEOUT" | "REJECTED_SECURITY";
  timestamps: {
    startedAt: UnixMillis;
    completedAt: UnixMillis;
  };
}
