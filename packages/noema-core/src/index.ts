import { EVIDENCE_AUTHORITIES } from "@noema/economic-kernel";
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
  SourceSnapshot,
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

export type LineageIssueCode =
  | "CLAIM_NOT_FOUND"
  | "CLAIM_EVIDENCE_MISSING"
  | "EVIDENCE_REFERENCE_MISSING"
  | "EVIDENCE_STALE"
  | "EVIDENCE_AUTHORITY_UNKNOWN"
  | "SOURCE_SNAPSHOT_MISSING"
  | "SOURCE_CONTENT_HASH_MISMATCH"
  | "CLAIM_SOURCE_REFERENCE_MISMATCH"
  | "PROVENANCE_EDGE_MISSING"
  | "ATTESTATION_REFERENCE_MISSING"
  | "ATTESTATION_REVOKED";

export interface LineageIssue {
  code: LineageIssueCode;
  claimId: Ref;
  evidenceId?: Ref;
  sourceRef?: Ref;
  attestationId?: Ref;
  message: string;
}

export interface ClaimLineageEvidencePath {
  evidenceId: Ref;
  evidenceType?: Evidence["type"];
  contentHash?: Evidence["contentHash"];
  sourceSnapshotId?: Ref;
  sourceId?: Ref;
  sourceUri?: string;
  bodyStorageRef?: Ref;
  authority?: Evidence["authority"];
  freshness?: Evidence["freshness"];
  provenanceEdgeRefs: Ref[];
}

export interface ClaimLineageAttestationPath {
  attestationId: Ref;
  attestor?: Ref;
  schema?: string;
  state?: Attestation["state"];
  evidenceRoot?: string;
  revokedAt?: UnixMillis;
}

export interface ClaimLineageTrace {
  claimId: Ref;
  claimState?: Claim["state"];
  explicitInference: boolean;
  sourceRefs: Ref[];
  paths: ClaimLineageEvidencePath[];
  attestations: ClaimLineageAttestationPath[];
  issues: LineageIssue[];
  valid: boolean;
}

export interface EconomicObjectLineageReport {
  objectId: Ref;
  objectVersion: number;
  traces: ClaimLineageTrace[];
  issues: LineageIssue[];
  valid: boolean;
}

const evidenceAuthorities = new Set<string>(EVIDENCE_AUTHORITIES);

export function traceClaimLineage(
  object: EconomicObject,
  sourceSnapshots: readonly SourceSnapshot[],
  claimId: Ref
): ClaimLineageTrace {
  const claim = object.claims.find((item) => item.id === claimId);
  if (claim === undefined) {
    const issue: LineageIssue = {
      code: "CLAIM_NOT_FOUND",
      claimId,
      message: `Claim ${claimId} does not exist on ${object.id} v${object.version}`
    };
    return {
      claimId,
      explicitInference: false,
      sourceRefs: [],
      paths: [],
      attestations: [],
      issues: [issue],
      valid: false
    };
  }

  const explicitInference = claim.state === "INFERRED";
  const evidenceById = new Map(object.evidence.map((item) => [item.id, item]));
  const snapshotsById = new Map(sourceSnapshots.map((item) => [item.id, item]));
  const attestationsById = new Map(object.attestations.map((item) => [item.id, item]));
  const paths: ClaimLineageEvidencePath[] = [];
  const attestations: ClaimLineageAttestationPath[] = [];
  const issues: LineageIssue[] = [];

  if (!explicitInference && claim.evidenceRefs.length === 0) {
    issues.push({
      code: "CLAIM_EVIDENCE_MISSING",
      claimId: claim.id,
      message: `Non-inferred claim ${claim.id} has no evidence references`
    });
  }

  for (const evidenceId of claim.evidenceRefs) {
    const evidence = evidenceById.get(evidenceId);
    if (evidence === undefined) {
      issues.push({
        code: "EVIDENCE_REFERENCE_MISSING",
        claimId: claim.id,
        evidenceId,
        message: `Evidence reference ${evidenceId} does not resolve`
      });
      continue;
    }

    const provenanceEdges = object.provenance.edges.filter(
      (edge) => edge.from === claim.id && edge.to === evidence.id
    );
    if (provenanceEdges.length === 0) {
      issues.push({
        code: "PROVENANCE_EDGE_MISSING",
        claimId: claim.id,
        evidenceId: evidence.id,
        message: `Claim ${claim.id} has no provenance edge to evidence ${evidence.id}`
      });
    }

    if (evidence.freshness === "STALE") {
      issues.push({
        code: "EVIDENCE_STALE",
        claimId: claim.id,
        evidenceId: evidence.id,
        sourceRef: evidence.source,
        message: `Evidence ${evidence.id} is explicitly stale`
      });
    }

    if (!evidenceAuthorities.has(evidence.authority as string)) {
      issues.push({
        code: "EVIDENCE_AUTHORITY_UNKNOWN",
        claimId: claim.id,
        evidenceId: evidence.id,
        sourceRef: evidence.source,
        message: `Evidence ${evidence.id} has unknown authority ${String(evidence.authority)}`
      });
    }

    const sourceSnapshot = snapshotsById.get(evidence.source);
    if (sourceSnapshot === undefined) {
      issues.push({
        code: "SOURCE_SNAPSHOT_MISSING",
        claimId: claim.id,
        evidenceId: evidence.id,
        sourceRef: evidence.source,
        message: `Evidence ${evidence.id} source ${evidence.source} does not resolve to a SourceSnapshot`
      });
      paths.push({
        evidenceId: evidence.id,
        evidenceType: evidence.type,
        contentHash: evidence.contentHash,
        authority: evidence.authority,
        freshness: evidence.freshness,
        provenanceEdgeRefs: provenanceEdges.map((edge) => edge.id).sort()
      });
      continue;
    }

    if (sourceSnapshot.contentHash.toLowerCase() !== evidence.contentHash.toLowerCase()) {
      issues.push({
        code: "SOURCE_CONTENT_HASH_MISMATCH",
        claimId: claim.id,
        evidenceId: evidence.id,
        sourceRef: sourceSnapshot.id,
        message: `Evidence ${evidence.id} content hash does not match SourceSnapshot ${sourceSnapshot.id}`
      });
    }

    if (
      claim.sourceRefs.length > 0 &&
      !claim.sourceRefs.includes(sourceSnapshot.id) &&
      !claim.sourceRefs.includes(sourceSnapshot.sourceId)
    ) {
      issues.push({
        code: "CLAIM_SOURCE_REFERENCE_MISMATCH",
        claimId: claim.id,
        evidenceId: evidence.id,
        sourceRef: sourceSnapshot.id,
        message: `Claim ${claim.id} does not reference SourceSnapshot ${sourceSnapshot.id} or source ${sourceSnapshot.sourceId}`
      });
    }

    paths.push({
      evidenceId: evidence.id,
      evidenceType: evidence.type,
      contentHash: evidence.contentHash,
      sourceSnapshotId: sourceSnapshot.id,
      sourceId: sourceSnapshot.sourceId,
      sourceUri: sourceSnapshot.uri,
      bodyStorageRef: sourceSnapshot.bodyStorageRef,
      authority: evidence.authority,
      freshness: evidence.freshness,
      provenanceEdgeRefs: provenanceEdges.map((edge) => edge.id).sort()
    });
  }

  for (const attestationId of claim.attestationRefs) {
    const attestation = attestationsById.get(attestationId);
    if (attestation === undefined) {
      issues.push({
        code: "ATTESTATION_REFERENCE_MISSING",
        claimId: claim.id,
        attestationId,
        message: `Attestation reference ${attestationId} does not resolve`
      });
      attestations.push({ attestationId });
      continue;
    }

    attestations.push({
      attestationId: attestation.id,
      attestor: attestation.attestor,
      schema: attestation.schema,
      state: attestation.state,
      ...(attestation.evidenceRoot === undefined ? {} : { evidenceRoot: attestation.evidenceRoot }),
      ...(attestation.revokedAt === undefined ? {} : { revokedAt: attestation.revokedAt })
    });

    if (attestation.state === "REVOKED" || attestation.revokedAt !== undefined) {
      issues.push({
        code: "ATTESTATION_REVOKED",
        claimId: claim.id,
        attestationId: attestation.id,
        message: `Attestation ${attestation.id} is revoked`
      });
    }
  }

  return {
    claimId: claim.id,
    claimState: claim.state,
    explicitInference,
    sourceRefs: [...claim.sourceRefs].sort(),
    paths,
    attestations,
    issues,
    valid: issues.length === 0
  };
}

export function validateEconomicObjectLineage(
  object: EconomicObject,
  sourceSnapshots: readonly SourceSnapshot[]
): EconomicObjectLineageReport {
  const traces = object.claims.map((claim) =>
    traceClaimLineage(object, sourceSnapshots, claim.id)
  );
  const issues = traces.flatMap((trace) => trace.issues);
  return {
    objectId: object.id,
    objectVersion: object.version,
    traces,
    issues,
    valid: issues.length === 0
  };
}
