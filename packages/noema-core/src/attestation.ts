import { createHash } from "node:crypto";
import type {
  Evidence,
  Hex,
  Ref,
  SchemaId,
  SchemaVersion,
  UnixMillis
} from "@noema/economic-kernel";
import { canonicalJson, verifyEip712Signature } from "@noema/canonicalization";

export const VENUE_ATTESTATION_ENVELOPE_VERSION = "noema-venue-attestation-v1";
export const VENUE_ATTESTATION_HASH_VERSION = "noema-venue-attestation-sha256-v1";

export const VENUE_ROLES = [
  "ISSUER",
  "TRANSFER_AGENT",
  "CUSTODIAN",
  "FUND_ADMINISTRATOR",
  "BRIDGE",
  "ORACLE",
  "CHAIN_OBSERVER"
] as const;
export type VenueRole = (typeof VENUE_ROLES)[number];

export const VENUE_PROPOSITIONS = [
  "ISSUANCE",
  "REDEMPTION_TERMS",
  "RIGHTS",
  "SHARE_CLASS_DEFINITION",
  "SHARE_REGISTER_OWNERSHIP",
  "SHARE_REGISTER_BALANCE",
  "TRANSFER_RESTRICTIONS",
  "CUSTODY",
  "BACKING_ASSETS",
  "SAFEKEEPING",
  "NAV",
  "VALUATION",
  "SUBSCRIPTION_REDEMPTION",
  "TOTAL_AUM",
  "BRIDGE_LINEAGE",
  "LOCKED_ASSETS",
  "WRAPPED_SUPPLY",
  "OBSERVED_PRICE",
  "MARKET_DATA",
  "CONTRACT_STATE",
  "BALANCE",
  "ONCHAIN_EVENT"
] as const;
export type VenueProposition = (typeof VENUE_PROPOSITIONS)[number];

export const VENUE_PROPOSITION_SCOPE: Record<VenueRole, VenueProposition[]> = {
  ISSUER: ["ISSUANCE", "REDEMPTION_TERMS", "RIGHTS", "SHARE_CLASS_DEFINITION"],
  TRANSFER_AGENT: ["SHARE_REGISTER_OWNERSHIP", "SHARE_REGISTER_BALANCE", "TRANSFER_RESTRICTIONS"],
  CUSTODIAN: ["CUSTODY", "BACKING_ASSETS", "SAFEKEEPING"],
  FUND_ADMINISTRATOR: ["NAV", "VALUATION", "SUBSCRIPTION_REDEMPTION", "TOTAL_AUM"],
  BRIDGE: ["BRIDGE_LINEAGE", "LOCKED_ASSETS", "WRAPPED_SUPPLY"],
  ORACLE: ["OBSERVED_PRICE", "MARKET_DATA"],
  CHAIN_OBSERVER: ["CONTRACT_STATE", "BALANCE", "ONCHAIN_EVENT"]
};

export type AttestationStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "SUPERSEDED" | "CONFLICTING";

export interface VenueAuthorityScope {
  role: VenueRole;
  propositions: VenueProposition[];
}

export interface VenueAttestationBinding {
  subjectRef: Ref;
  claimRef?: Ref;
  representationRef?: Ref;
  objectRef?: Ref;
  objectVersion?: number;
}

export interface VenueAttestationProvenance {
  chainId?: string;
  blockNumber?: string;
  blockHash?: string;
  finality?: "PENDING" | "FINALIZED" | "REORGED" | "UNKNOWN";
  observedAt: UnixMillis;
  fetchedAt?: UnixMillis;
  method?: string;
  locator?: string;
}

export interface VenueEconomicAttestationEnvelope {
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  attestationId: Ref;
  venueId: Ref;
  attestor: Ref;
  authorityScope: VenueAuthorityScope;
  binding: VenueAttestationBinding;
  evidenceRefs: Ref[];
  evidenceRoot?: Hex;
  sourceStateRoot?: Hex;
  sourceRefs: Ref[];
  provenance: VenueAttestationProvenance;
  nonce: number;
  supersedes?: Ref;
  revokes?: Ref;
  validFrom?: UnixMillis;
  validUntil?: UnixMillis;
  expiresAt?: UnixMillis;
  revokedAt?: UnixMillis;
  issuedAt: UnixMillis;
  signatureScheme: "EIP-712";
  signatureDomainVersion: string;
  signature: Hex;
  status: AttestationStatus;
  reasonCodes: string[];
}

export interface VenueAttestationPolicy {
  venueCapabilities: Record<Ref, VenueRole>;
  trustedAttestors: ReadonlySet<string>;
  maxEvidenceAgeMs?: number;
  nowMs: UnixMillis;
}

export function venuePropositionScope(role: VenueRole): readonly VenueProposition[] {
  return VENUE_PROPOSITION_SCOPE[role];
}

export function authorityScopeAllows(
  scope: VenueAuthorityScope,
  proposition: VenueProposition
): boolean {
  return scope.propositions.includes(proposition) &&
    VENUE_PROPOSITION_SCOPE[scope.role].includes(proposition);
}

function sortedNormalized(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function venueAttestationSigningProjection(
  envelope: VenueEconomicAttestationEnvelope
): Record<string, unknown> {
  return {
    domain: "noema:venue-attestation:v1",
    hashVersion: VENUE_ATTESTATION_HASH_VERSION,
    schemaId: envelope.schemaId,
    schemaVersion: envelope.schemaVersion,
    attestationId: envelope.attestationId,
    venueId: envelope.venueId,
    attestor: envelope.attestor,
    authorityScope: {
      role: envelope.authorityScope.role,
      propositions: sortedNormalized(envelope.authorityScope.propositions)
    },
    binding: {
      subjectRef: envelope.binding.subjectRef,
      claimRef: envelope.binding.claimRef ?? null,
      representationRef: envelope.binding.representationRef ?? null,
      objectRef: envelope.binding.objectRef ?? null,
      objectVersion: envelope.binding.objectVersion ?? null
    },
    evidenceRefs: sortedNormalized(envelope.evidenceRefs),
    evidenceRoot: envelope.evidenceRoot ?? null,
    sourceStateRoot: envelope.sourceStateRoot ?? null,
    sourceRefs: sortedNormalized(envelope.sourceRefs),
    provenance: {
      chainId: envelope.provenance.chainId ?? null,
      blockNumber: envelope.provenance.blockNumber ?? null,
      blockHash: envelope.provenance.blockHash ?? null,
      finality: envelope.provenance.finality ?? null,
      observedAt: envelope.provenance.observedAt,
      method: envelope.provenance.method ?? null,
      locator: envelope.provenance.locator ?? null
    },
    nonce: envelope.nonce,
    supersedes: envelope.supersedes ?? null,
    revokes: envelope.revokes ?? null,
    validFrom: envelope.validFrom ?? null,
    validUntil: envelope.validUntil ?? null,
    expiresAt: envelope.expiresAt ?? null,
    issuedAt: envelope.issuedAt,
    status: envelope.status,
    reasonCodes: sortedNormalized(envelope.reasonCodes)
  };
}

export interface VenueAttestationDomain {
  name: "Noema";
  version: string;
  chainId: number;
  verifyingContract: `0x${string}`;
}

export const NOEMA_VENUE_ATTESTATION_TYPES = {
  VenueEconomicAttestation: [
    { name: "attestationId", type: "string" },
    { name: "venueId", type: "string" },
    { name: "attestor", type: "address" },
    { name: "authorityScopeRole", type: "string" },
    { name: "subjectRef", type: "string" },
    { name: "claimRef", type: "string" },
    { name: "representationRef", type: "string" },
    { name: "objectRef", type: "string" },
    { name: "objectVersion", type: "uint256" },
    { name: "evidenceRoot", type: "bytes32" },
    { name: "sourceStateRoot", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "supersedes", type: "string" },
    { name: "revokes", type: "string" },
    { name: "validFrom", type: "uint256" },
    { name: "validUntil", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "issuedAt", type: "uint256" },
    { name: "status", type: "string" }
  ]
} as const;

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export function venueAttestationTypedData(
  envelope: VenueEconomicAttestationEnvelope,
  domain: VenueAttestationDomain
) {
  return {
    types: NOEMA_VENUE_ATTESTATION_TYPES,
    primaryType: "VenueEconomicAttestation" as const,
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      verifyingContract: domain.verifyingContract
    },
    message: {
      attestationId: envelope.attestationId,
      venueId: envelope.venueId,
      attestor: envelope.attestor as `0x${string}`,
      authorityScopeRole: envelope.authorityScope.role,
      subjectRef: envelope.binding.subjectRef,
      claimRef: envelope.binding.claimRef ?? "",
      representationRef: envelope.binding.representationRef ?? "",
      objectRef: envelope.binding.objectRef ?? "",
      objectVersion: BigInt(envelope.binding.objectVersion ?? 0),
      evidenceRoot: (envelope.evidenceRoot ?? ZERO_BYTES32) as `0x${string}`,
      sourceStateRoot: (envelope.sourceStateRoot ?? ZERO_BYTES32) as `0x${string}`,
      nonce: BigInt(envelope.nonce),
      supersedes: envelope.supersedes ?? "",
      revokes: envelope.revokes ?? "",
      validFrom: BigInt(envelope.validFrom ?? 0),
      validUntil: BigInt(envelope.validUntil ?? 0),
      expiresAt: BigInt(envelope.expiresAt ?? 0),
      issuedAt: BigInt(envelope.issuedAt),
      status: envelope.status
    }
  };
}

export type AttestationScopeVerdict =
  | { valid: true; reasonCodes: string[] }
  | { valid: false; reasonCodes: string[] };

export function validateVenueAttestationScope(
  envelope: VenueEconomicAttestationEnvelope,
  policy: VenueAttestationPolicy
): AttestationScopeVerdict {
  const expectedRole = policy.venueCapabilities[envelope.venueId];
  if (expectedRole === undefined) {
    return { valid: false, reasonCodes: ["VENUE_NOT_REGISTERED"] };
  }

  if (envelope.authorityScope.role !== expectedRole) {
    return {
      valid: false,
      reasonCodes: [`VENUE_ROLE_MISMATCH:${envelope.authorityScope.role}:${expectedRole}`]
    };
  }

  const allowed = venuePropositionScope(expectedRole);
  const outOfScope = envelope.authorityScope.propositions.filter(
    (proposition) => !allowed.includes(proposition)
  );
  if (outOfScope.length > 0) {
    return {
      valid: false,
      reasonCodes: outOfScope.map((proposition) => `PROPOSITION_OUT_OF_SCOPE:${proposition}`)
    };
  }

  return { valid: true, reasonCodes: ["SCOPE_VALID"] };
}

export function validateVenueAttestationBinding(
  envelope: VenueEconomicAttestationEnvelope,
  subjectRef: Ref,
  objectRef: Ref
): AttestationScopeVerdict {
  if (envelope.binding.subjectRef !== subjectRef) {
    return { valid: false, reasonCodes: ["SUBJECT_MISMATCH"] };
  }
  if (envelope.binding.objectRef !== undefined && envelope.binding.objectRef !== objectRef) {
    return { valid: false, reasonCodes: ["OBJECT_MISMATCH"] };
  }
  return { valid: true, reasonCodes: ["BINDING_VALID"] };
}

export interface AttestationAuthorityVerdict {
  signatureValid: boolean;
  attestorTrusted: boolean;
  scopeValid: boolean;
  scopeReasonCodes: string[];
  status: AttestationStatus;
  binding: AttestationScopeVerdict;
  canBeActionAuthoritative: boolean;
  reasonCodes: string[];
}

export async function verifyVenueAttestationAuthority(
  envelope: VenueEconomicAttestationEnvelope,
  policy: VenueAttestationPolicy,
  domain: VenueAttestationDomain
): Promise<AttestationAuthorityVerdict> {
  const scope = validateVenueAttestationScope(envelope, policy);
  const reasonCodes: string[] = [];

  const attestorTrusted = policy.trustedAttestors.has(envelope.attestor);
  if (!attestorTrusted) reasonCodes.push("ATTESTOR_UNTRUSTED");

  let signatureValid = false;
  try {
    signatureValid = await verifyEip712Signature({
      address: envelope.attestor as `0x${string}`,
      ...venueAttestationTypedData(envelope, domain),
      signature: envelope.signature as `0x${string}`
    });
  } catch {
    signatureValid = false;
  }

  const isRevoked = envelope.status === "REVOKED" || envelope.revokedAt !== undefined;
  const isExpired =
    envelope.status === "EXPIRED" ||
    (envelope.expiresAt !== undefined && envelope.expiresAt < policy.nowMs);
  const isSuperseded = envelope.status === "SUPERSEDED" || envelope.supersedes !== undefined;
  const notYetValid =
    envelope.validFrom !== undefined && envelope.validFrom > policy.nowMs;
  const pastValidUntil =
    envelope.validUntil !== undefined && envelope.validUntil < policy.nowMs;

  let status: AttestationStatus = envelope.status;
  if (isRevoked) status = "REVOKED";
  else if (isSuperseded) status = "SUPERSEDED";
  else if (isExpired) status = "EXPIRED";
  else if (notYetValid || pastValidUntil) status = "EXPIRED";
  else status = "ACTIVE";

  if (!signatureValid) reasonCodes.push("SIGNATURE_INVALID");
  if (!scope.valid) reasonCodes.push(...scope.reasonCodes);
  if (isRevoked) reasonCodes.push("ATTESTATION_REVOKED");
  if (isExpired) reasonCodes.push("ATTESTATION_EXPIRED");
  if (isSuperseded) reasonCodes.push("ATTESTATION_SUPERSEDED");
  if (notYetValid) reasonCodes.push("NOT_YET_VALID");
  if (pastValidUntil) reasonCodes.push("PAST_VALID_UNTIL");

  const binding = validateVenueAttestationBinding(
    envelope,
    envelope.binding.subjectRef,
    envelope.binding.objectRef ?? envelope.binding.subjectRef
  );
  if (!binding.valid) reasonCodes.push(...binding.reasonCodes);

  const canBeActionAuthoritative =
    signatureValid &&
    attestorTrusted &&
    scope.valid &&
    status === "ACTIVE" &&
    binding.valid;

  return {
    signatureValid,
    attestorTrusted,
    scopeValid: scope.valid,
    scopeReasonCodes: scope.valid ? [] : scope.reasonCodes,
    status,
    binding,
    canBeActionAuthoritative,
    reasonCodes: [...new Set(reasonCodes)]
  };
}

export interface ResolveAttestationSetInput {
  envelopes: readonly VenueEconomicAttestationEnvelope[];
  nowMs: UnixMillis;
}

export interface ResolveAttestationSetResult {
  active: VenueEconomicAttestationEnvelope[];
  conflicting: Ref[][];
  superseded: Ref[];
  revoked: Ref[];
  expired: Ref[];
}

export function resolveVenueAttestationSet(
  input: ResolveAttestationSetInput
): ResolveAttestationSetResult {
  const byId = new Map(input.envelopes.map((envelope) => [envelope.attestationId, envelope]));
  const superseded = new Set<Ref>();
  const revoked = new Set<Ref>();
  const expired = new Set<Ref>();

  for (const envelope of input.envelopes) {
    if (envelope.status === "REVOKED" || envelope.revokedAt !== undefined) {
      revoked.add(envelope.attestationId);
    }
    const isExpired =
      envelope.status === "EXPIRED" ||
      (envelope.expiresAt !== undefined && envelope.expiresAt < input.nowMs);
    if (isExpired) {
      expired.add(envelope.attestationId);
    }
    if (envelope.status === "SUPERSEDED") {
      superseded.add(envelope.attestationId);
    }
    if (envelope.supersedes !== undefined) {
      superseded.add(envelope.supersedes);
    }
    if (envelope.revokes !== undefined) {
      revoked.add(envelope.revokes);
    }
  }

  const eligible = input.envelopes.filter(
    (envelope) =>
      !superseded.has(envelope.attestationId) &&
      !revoked.has(envelope.attestationId) &&
      !expired.has(envelope.attestationId)
  );

  const active = eligible.filter(
    (envelope) =>
      (envelope.validFrom === undefined || envelope.validFrom <= input.nowMs) &&
      (envelope.validUntil === undefined || envelope.validUntil >= input.nowMs)
  );

  const conflicts: Ref[][] = [];
  const conflictGroups = new Map<string, Ref[]>();
  for (const envelope of active) {
    const key = JSON.stringify({
      role: envelope.authorityScope.role,
      subjectRef: envelope.binding.subjectRef,
      claimRef: envelope.binding.claimRef ?? null,
      representationRef: envelope.binding.representationRef ?? null
    });
    const group = conflictGroups.get(key) ?? [];
    group.push(envelope.attestationId);
    conflictGroups.set(key, group);
  }
  for (const group of conflictGroups.values()) {
    if (group.length > 1) conflicts.push(group);
  }

  return {
    active,
    conflicting: conflicts,
    superseded: [...superseded],
    revoked: [...revoked],
    expired: [...expired]
  };
}

export function deriveVenueAttestationId(
  envelope: Omit<VenueEconomicAttestationEnvelope, "attestationId" | "signature" | "status">
): `0x${string}` {
  const projection = venueAttestationSigningProjection({
    ...envelope,
    attestationId: "",
    signature: "0x0000000000000000000000000000000000000000000000000000000000000000",
    status: "ACTIVE"
  });
  const digest = createHash("sha256")
    .update(canonicalJson(projection), "utf8")
    .digest("hex");
  return `0x${digest}`;
}

export function attestationBindsExactEvidenceState(
  envelope: VenueEconomicAttestationEnvelope,
  evidenceRoot: Hex,
  sourceStateRoot?: Hex
): boolean {
  if (envelope.evidenceRoot !== undefined && envelope.evidenceRoot !== evidenceRoot) {
    return false;
  }
  if (
    envelope.sourceStateRoot !== undefined &&
    sourceStateRoot !== undefined &&
    envelope.sourceStateRoot !== sourceStateRoot
  ) {
    return false;
  }
  return true;
}

export function attestationIsFinalitySafe(
  envelope: VenueEconomicAttestationEnvelope,
  requireFinalized: boolean
): boolean {
  if (!requireFinalized) return true;
  return envelope.provenance.finality === "FINALIZED";
}

export function summarizeVenueAttestations(
  envelopes: readonly VenueEconomicAttestationEnvelope[]
): {
  activeCount: number;
  revokedCount: number;
  expiredCount: number;
  supersededCount: number;
  conflictingCount: number;
  coveredPropositions: VenueProposition[];
} {
  const active = envelopes.filter((envelope) => envelope.status === "ACTIVE");
  const coveredPropositions: VenueProposition[] = [];
  for (const envelope of active) {
    for (const proposition of envelope.authorityScope.propositions) {
      if (!coveredPropositions.includes(proposition)) coveredPropositions.push(proposition);
    }
  }
  return {
    activeCount: active.length,
    revokedCount: envelopes.filter((e) => e.status === "REVOKED").length,
    expiredCount: envelopes.filter((e) => e.status === "EXPIRED").length,
    supersededCount: envelopes.filter((e) => e.status === "SUPERSEDED").length,
    conflictingCount: envelopes.filter((e) => e.status === "CONFLICTING").length,
    coveredPropositions
  };
}