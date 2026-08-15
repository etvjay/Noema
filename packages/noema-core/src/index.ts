import type {
  Attestation,
  Claim,
  EconomicClassification,
  EconomicObject,
  EconomicObjectState,
  EconomicObligation,
  EconomicParty,
  EconomicRelationship,
  EconomicRight,
  EconomicState,
  Evidence,
  ExternalIdentifier,
  ProvenanceGraph,
  Ref,
  Representation,
  ResolutionException,
  Restriction,
  VerificationSummary,
  UnixMillis
} from "@noema/economic-kernel";

export interface ReduceEconomicObjectInput {
  id: Ref;
  version: number;
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
  createdAt: UnixMillis;
  updatedAt: UnixMillis;
  verification?: VerificationSummary;
}

function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function deriveStatus(
  claims: readonly Claim[],
  exceptions: readonly ResolutionException[]
): EconomicObjectState {
  if (
    claims.some((claim) => claim.state === "REVOKED") ||
    exceptions.some((exception) => exception.type === "ATTESTATION_REVOKED")
  ) {
    return "REVOKED";
  }
  if (
    claims.some((claim) => claim.state === "CONFLICTING") ||
    exceptions.some((exception) => exception.type === "EVIDENCE_CONFLICT")
  ) {
    return "CONFLICTING";
  }
  if (
    claims.some((claim) => claim.state === "STALE") ||
    exceptions.some((exception) => exception.type === "EVIDENCE_STALE")
  ) {
    return "STALE";
  }
  if (
    exceptions.some((exception) =>
      [
        "EVIDENCE_MISSING",
        "IDENTITY_AMBIGUOUS",
        "RELATIONSHIP_AMBIGUOUS",
        "UNSUPPORTED_REPRESENTATION"
      ].includes(exception.type)
    )
  ) {
    return "INSUFFICIENT_EVIDENCE";
  }
  if (claims.some((claim) => ["UNKNOWN", "INFERRED"].includes(claim.state))) {
    return "PARTIALLY_RESOLVED";
  }
  return "RESOLVED";
}

export function reduceEconomicObject(
  input: ReduceEconomicObjectInput
): EconomicObject {
  const claims = byId(input.claims);
  const evidence = byId(input.evidence);
  const attestations = byId(input.attestations);
  const exceptions = byId(input.exceptions);
  const relationships = byId(input.relationships);
  const representations = byId(input.representations);
  const parties = byId(input.parties);
  const rights = byId(input.rights);
  const obligations = byId(input.obligations);
  const restrictions = byId(input.restrictions);
  const provenance = {
    edges: byId(input.provenance.edges)
  };
  const verification =
    input.verification ?? {
      status: "UNRESOLVED",
      verifierVersion: "pending",
      checks: []
    };

  return {
    id: input.id,
    version: input.version,
    classification: input.classification,
    identifiers: input.identifiers,
    representations,
    relationships,
    parties,
    rights,
    obligations,
    restrictions,
    economics: input.economics,
    claims,
    evidence,
    attestations,
    exceptions,
    provenance,
    verification,
    status: deriveStatus(claims, exceptions),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export const XLAYER_TESTNET_CHAIN_ID = 1952;
export const XLAYER_MAINNET_CHAIN_ID = 196;
export const XLAYER_LEGACY_UNSAFE_CHAIN_ID = 195;

export function isValidXLayerChainId(chainId: number): boolean {
  return chainId === XLAYER_TESTNET_CHAIN_ID || chainId === XLAYER_MAINNET_CHAIN_ID;
}

export * from "./lineage.js";
export * from "./ingestion.js";
