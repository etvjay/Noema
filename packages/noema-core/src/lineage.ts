import type {
  Attestation,
  Claim,
  EconomicObject,
  Evidence,
  EvidenceAuthority,
  EvidenceType,
  Hex,
  ProvenanceEdge,
  Ref,
  SourceSnapshot
} from "@noema/economic-kernel";

export type LineageNodeStatus =
  | "COMPLETE"
  | "PARTIAL"
  | "BROKEN"
  | "INFERRED_ONLY"
  | "STALE"
  | "REVOKED";

export interface EvidenceLineageItem {
  evidenceId: Ref;
  type: EvidenceType;
  authority: EvidenceAuthority;
  freshness?: string;
  contentHash: Hex;
  sourceId: Ref;
  sourceSnapshot?: SourceSnapshot;
  isStale: boolean;
  hasValidContentHash: boolean;
  error?: string;
}

export interface ClaimLineageNode {
  claimId: Ref;
  subject: Ref;
  property: string;
  value: unknown;
  state: string;
  isInferred: boolean;
  evidence: EvidenceLineageItem[];
  attestations: Attestation[];
  provenanceEdges: ProvenanceEdge[];
  status: LineageNodeStatus;
  errors: string[];
}

export interface EvidenceLineageTrace {
  objectId: Ref;
  objectVersion: number;
  objectStatus: string;
  claims: ClaimLineageNode[];
  allActionableClaimsSourced: boolean;
  unresolvedEvidenceRefs: Ref[];
  unresolvedSourceRefs: Ref[];
  staleEvidenceIds: Ref[];
  revokedClaimIds: Ref[];
  inferredClaimIds: Ref[];
  hasBrokenLineage: boolean;
}

export function traceEvidenceLineage(
  object: EconomicObject,
  sourceSnapshots: readonly SourceSnapshot[] | ReadonlyMap<Ref, SourceSnapshot> = []
): EvidenceLineageTrace {
  const snapshotMap =
    sourceSnapshots instanceof Map
      ? sourceSnapshots
      : new Map(
          (sourceSnapshots as readonly SourceSnapshot[]).map((s) => [s.id, s])
        );

  const evidenceMap = new Map(object.evidence.map((e) => [e.id, e]));
  const attestationMap = new Map(object.attestations.map((a) => [a.id, a]));

  const unresolvedEvidenceRefs: Ref[] = [];
  const unresolvedSourceRefs: Ref[] = [];
  const staleEvidenceIds: Ref[] = [];
  const revokedClaimIds: Ref[] = [];
  const inferredClaimIds: Ref[] = [];

  const claimNodes: ClaimLineageNode[] = object.claims.map((claim) => {
    const errors: string[] = [];
    const isInferred = claim.state === "INFERRED" || claim.sourceRefs.length === 0 && claim.evidenceRefs.length === 0;

    if (claim.state === "REVOKED") {
      revokedClaimIds.push(claim.id);
    }
    if (claim.state === "INFERRED") {
      inferredClaimIds.push(claim.id);
    }

    const claimEvidenceItems: EvidenceLineageItem[] = [];

    for (const evidenceRef of claim.evidenceRefs) {
      const evidence = evidenceMap.get(evidenceRef);
      if (!evidence) {
        unresolvedEvidenceRefs.push(evidenceRef);
        errors.push(`Evidence reference "${evidenceRef}" not found in EconomicObject evidence collection`);
        continue;
      }

      const snapshot = snapshotMap.get(evidence.source) ||
        Array.from(snapshotMap.values()).find((s) => s.sourceId === evidence.source || s.id === evidence.source);

      if (!snapshot) {
        unresolvedSourceRefs.push(evidence.source);
        errors.push(`SourceSnapshot for source "${evidence.source}" (evidence ${evidence.id}) could not be resolved`);
      }

      const isStale = evidence.freshness === "STALE";
      if (isStale) {
        staleEvidenceIds.push(evidence.id);
      }

      const hasValidContentHash = /^0x[0-9a-fA-F]{64}$/.test(evidence.contentHash);
      if (!hasValidContentHash) {
        errors.push(`Evidence "${evidence.id}" has invalid contentHash "${evidence.contentHash}"`);
      }

      const item: EvidenceLineageItem = {
        evidenceId: evidence.id,
        type: evidence.type,
        authority: evidence.authority,
        contentHash: evidence.contentHash,
        sourceId: evidence.source,
        isStale,
        hasValidContentHash,
        ...(evidence.freshness !== undefined ? { freshness: evidence.freshness } : {}),
        ...(snapshot !== undefined ? { sourceSnapshot: snapshot } : {}),
        ...(snapshot === undefined ? { error: `Missing source snapshot for ${evidence.source}` } : {})
      };
      claimEvidenceItems.push(item);
    }

    const claimAttestations: Attestation[] = [];
    for (const attestationRef of claim.attestationRefs) {
      const att = attestationMap.get(attestationRef);
      if (att) {
        claimAttestations.push(att);
        if (att.state === "REVOKED") {
          errors.push(`Attestation "${att.id}" referenced by claim "${claim.id}" is REVOKED`);
        }
      } else {
        errors.push(`Attestation reference "${attestationRef}" not found in object attestations`);
      }
    }

    const relevantProvenance = object.provenance.edges.filter(
      (e) => e.from === claim.id || e.to === claim.id || claim.evidenceRefs.includes(e.from) || claim.evidenceRefs.includes(e.to)
    );

    let status: LineageNodeStatus = "COMPLETE";
    if (claim.state === "REVOKED") {
      status = "REVOKED";
    } else if (claimEvidenceItems.some((e) => e.isStale)) {
      status = "STALE";
    } else if (claim.evidenceRefs.length === 0 && isInferred) {
      status = "INFERRED_ONLY";
    } else if (errors.length > 0 && claimEvidenceItems.length === 0) {
      status = "BROKEN";
    } else if (errors.length > 0 || claimEvidenceItems.some((e) => !e.sourceSnapshot)) {
      status = "PARTIAL";
    }

    return {
      claimId: claim.id,
      subject: claim.subject,
      property: claim.property,
      value: claim.value,
      state: claim.state,
      isInferred,
      evidence: claimEvidenceItems,
      attestations: claimAttestations,
      provenanceEdges: relevantProvenance,
      status,
      errors
    };
  });

  const hasBrokenLineage = claimNodes.some((c) => c.status === "BROKEN" || c.errors.length > 0);
  const allActionableClaimsSourced = claimNodes
    .filter((c) => !c.isInferred)
    .every((c) => c.status === "COMPLETE" && c.evidence.length > 0 && c.evidence.every((e) => Boolean(e.sourceSnapshot)));

  return {
    objectId: object.id,
    objectVersion: object.version,
    objectStatus: object.status,
    claims: claimNodes,
    allActionableClaimsSourced,
    unresolvedEvidenceRefs: Array.from(new Set(unresolvedEvidenceRefs)),
    unresolvedSourceRefs: Array.from(new Set(unresolvedSourceRefs)),
    staleEvidenceIds: Array.from(new Set(staleEvidenceIds)),
    revokedClaimIds: Array.from(new Set(revokedClaimIds)),
    inferredClaimIds: Array.from(new Set(inferredClaimIds)),
    hasBrokenLineage
  };
}
