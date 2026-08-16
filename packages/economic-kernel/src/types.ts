export type Ref = string;
export type Hex = string;
export type UnixMillis = number;
export type SchemaId = string;
export type SchemaVersion = number;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const CLAIM_STATES = [
  "UNKNOWN",
  "OBSERVED",
  "SOURCED",
  "ATTESTED",
  "VERIFIED",
  "INFERRED",
  "CONFLICTING",
  "STALE",
  "REVOKED"
] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

export const EVIDENCE_TYPES = [
  "DOCUMENT",
  "ORACLE",
  "ONCHAIN_STATE",
  "ATTESTATION",
  "API_RESPONSE",
  "FILING",
  "PROOF",
  "OTHER"
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_AUTHORITIES = [
  "PRIMARY_SOURCE",
  "AUTHORIZED_ATTESTOR",
  "ONCHAIN_STATE",
  "INDEPENDENT_ORACLE",
  "REFERENCE_DATA",
  "MARKET_DATA",
  "DERIVED",
  "AI_INFERENCE",
  "DEMO_FIXTURE"
] as const;
export type EvidenceAuthority = (typeof EVIDENCE_AUTHORITIES)[number];

export const ECONOMIC_OBJECT_STATES = [
  "RESOLVED",
  "PARTIALLY_RESOLVED",
  "CONFLICTING",
  "STALE",
  "INSUFFICIENT_EVIDENCE",
  "REVOKED",
  "UNSUPPORTED"
] as const;
export type EconomicObjectState = (typeof ECONOMIC_OBJECT_STATES)[number];

export const VERIFICATION_OUTCOMES = ["PASS", "FAIL", "UNRESOLVED"] as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

export const RELATIONSHIP_TYPES = [
  "REPRESENTS",
  "BRIDGED_REPRESENTATION_OF",
  "WRAPPED_REPRESENTATION_OF",
  "SHARE_CLASS_OF",
  "CLAIM_ON",
  "ISSUED_BY",
  "BACKED_BY",
  "CUSTODIED_BY",
  "REDEEMABLE_FOR",
  "DERIVATIVE_OF",
  "COLLATERALIZED_BY",
  "GUARANTEED_BY",
  "FUNCTIONALLY_FUNGIBLE_WITH",
  "ECONOMICALLY_EQUIVALENT_TO",
  "SIMILAR_EXPOSURE_TO",
  "SUPERSEDES"
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const EXCEPTION_TYPES = [
  "EVIDENCE_STALE",
  "EVIDENCE_CONFLICT",
  "EVIDENCE_MISSING",
  "IDENTITY_AMBIGUOUS",
  "RELATIONSHIP_AMBIGUOUS",
  "ATTESTATION_REVOKED",
  "SOURCE_FAILURE",
  "VERIFICATION_FAILED",
  "POLICY_AMBIGUOUS",
  "UNSUPPORTED_REPRESENTATION"
] as const;
export type ResolutionExceptionType = (typeof EXCEPTION_TYPES)[number];

export type ExceptionSeverity = "INFO" | "WARNING" | "BLOCKING";
export type ExceptionStatus = "OPEN" | "RESOLVED" | "SUPERSEDED" | "WAIVED";

export interface ExternalIdentifier {
  scheme:
    | "CAIP19"
    | "DTI"
    | "ISIN"
    | "CUSIP"
    | "CONTRACT"
    | "ISSUER"
    | "CUSTOM";
  value: string;
  namespace?: string;
  source: Ref;
  status: ClaimState;
}

export interface EconomicClassification {
  primary: string;
  secondary: string[];
  confidence: number;
  claimRef: Ref;
}

export interface Representation {
  id: Ref;
  environment: "EVM" | "SOLANA" | "CANTON" | "OFFCHAIN" | "OTHER";
  network?: string;
  contract?: string;
  tokenStandard?: string;
  identifiers: ExternalIdentifier[];
  relationshipToObject: Ref;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED" | "UNKNOWN";
  evidence: Ref[];
}

export interface EconomicRelationship {
  id: Ref;
  subject: Ref;
  predicate: RelationshipType;
  object: Ref;
  state: ClaimState;
  evidence: Ref[];
  attestations: Ref[];
  inferredBy?: Ref;
  confidence?: number;
  observedAt?: UnixMillis;
  validFrom?: UnixMillis;
  validUntil?: UnixMillis;
}

export interface Claim<T = JsonValue> {
  id: Ref;
  subject: Ref;
  property: string;
  value: T;
  unit?: string;
  state: ClaimState;
  sourceRefs: Ref[];
  evidenceRefs: Ref[];
  attestationRefs: Ref[];
  confidence?: number;
  observedAt?: UnixMillis;
  validFrom?: UnixMillis;
  expiresAt?: UnixMillis;
  supersedes?: Ref;
  createdAt: UnixMillis;
}

export interface Evidence {
  id: Ref;
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  type: EvidenceType;
  source: Ref;
  contentHash: Hex;
  locator?: string;
  observedAt: UnixMillis;
  fetchedAt: UnixMillis;
  authority: EvidenceAuthority;
  freshness?: "FRESH" | "STALE" | "UNKNOWN";
  metadata: JsonObject;
}

export interface Attestation {
  id: Ref;
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  subject: Ref;
  claimRef: Ref;
  schema: string;
  attestor: Ref;
  evidenceRoot?: Hex;
  signature: Hex;
  issuedAt: UnixMillis;
  expiresAt?: UnixMillis;
  revokedAt?: UnixMillis;
  state: "ACTIVE" | "EXPIRED" | "REVOKED";
}

export interface EconomicParty {
  id: Ref;
  role: string;
  name: string;
  identifiers: ExternalIdentifier[];
  claimRefs: Ref[];
}

export interface EconomicRight {
  id: Ref;
  type: string;
  holder?: Ref;
  terms: JsonObject;
  claimRefs: Ref[];
}

export interface EconomicObligation {
  id: Ref;
  type: string;
  obligor?: Ref;
  terms: JsonObject;
  claimRefs: Ref[];
}

export interface Restriction {
  id: Ref;
  type: string;
  scope: string;
  claimRefs: Ref[];
  evidenceRefs: Ref[];
}

export interface EconomicState {
  asOf: UnixMillis;
  values: JsonObject;
  claimRefs: Ref[];
}

export interface ProvenanceEdge {
  id: Ref;
  from: Ref;
  to: Ref;
  relation: string;
}

export interface ProvenanceGraph {
  edges: ProvenanceEdge[];
}

export interface ResolutionException {
  id: Ref;
  objectId: Ref;
  type: ResolutionExceptionType;
  severity: ExceptionSeverity;
  affectedClaims: Ref[];
  evidence: Ref[];
  detectedAt: UnixMillis;
  status: ExceptionStatus;
  resolutionOptions?: string[];
}

export interface VerificationCheck {
  id: Ref;
  type: string;
  subject: Ref;
  result: VerificationOutcome;
  evidence: Ref[];
  ruleVersion: string;
  timestamp: UnixMillis;
  reason?: string;
}

export interface VerificationSummary {
  status: VerificationOutcome;
  verifierVersion: string;
  checks: VerificationCheck[];
  objectRoot?: Hex;
  evidenceRoot?: Hex;
}

export interface EconomicObject {
  id: Ref;
  version: number;
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  classification: EconomicClassification;
  identifiers: ExternalIdentifier[];
  representations: Representation[];
  relationships: EconomicRelationship[];
  parties: EconomicParty[];
  rights: EconomicRight[];
  obligations: EconomicObligation[];
  restrictions: Restriction[];
  economics: EconomicState;
  claims: Claim[];
  evidence: Evidence[];
  attestations: Attestation[];
  exceptions: ResolutionException[];
  provenance: ProvenanceGraph;
  verification: VerificationSummary;
  status: EconomicObjectState;
  createdAt: UnixMillis;
  updatedAt: UnixMillis;
}

export interface SourceSnapshot {
  id: Ref;
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  sourceId: Ref;
  uri: string;
  contentType: string;
  contentHash: Hex;
  fetchedAt: UnixMillis;
  httpStatus?: number;
  etag?: string;
  lastModified?: string;
  bodyStorageRef: Ref;
  extractionVersion?: string;
}

export interface Money {
  currency: string;
  amount: string;
}

export interface ClaimRequirement {
  property: string;
  requiredState: ClaimState;
}

export interface EvidenceRequirement {
  type: EvidenceType;
  maxAgeMs?: number;
}

export interface Mandate {
  id: Ref;
  version: number;
  principal: Ref;
  objective: string;
  capital?: Money;
  allowedAssetClasses: string[];
  prohibitedAssetClasses: string[];
  minYieldBps?: number;
  maxRedemptionPeriodMs?: number;
  maxEvidenceAgeMs?: number;
  jurisdictions: string[];
  requiredClaims: ClaimRequirement[];
  requiredEvidence: EvidenceRequirement[];
  expiresAt?: UnixMillis;
}

export interface PolicyCheck {
  ruleId: Ref;
  result: VerificationOutcome;
  claimRefs: Ref[];
  evidenceRefs: Ref[];
  reasonCode: string;
}

export type MandateDecision = "ALLOW" | "BLOCK" | "CONDITIONAL";

export interface VerificationReceipt {
  id: Ref;
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  objectId: Ref;
  objectVersion: number;
  verifierVersion: string;
  hashingVersion: string;
  evidenceRoot: Hex;
  objectRoot: Hex;
  checks: VerificationCheck[];
  overallStatus: VerificationOutcome;
  createdAt: UnixMillis;
}

export interface DecisionReceipt {
  id: Ref;
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  objectId: Ref;
  objectVersion: number;
  mandateId: Ref;
  mandateVersion: number;
  decision: MandateDecision;
  reasonCodes: string[];
  policyChecks: PolicyCheck[];
  supportingClaims: Ref[];
  evidenceRoot: Hex;
  verificationReceiptRef: Ref;
  policyEngineVersion: string;
  createdAt: UnixMillis;
}

export interface MigrationReceipt {
  id: Ref;
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  subjectSchemaId: SchemaId;
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  migrationId: string;
  inputHash: Hex;
  outputHash: Hex;
}
