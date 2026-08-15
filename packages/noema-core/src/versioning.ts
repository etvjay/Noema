import type {
  Claim,
  EconomicObject,
  Evidence,
  ProvenanceEdge,
  Ref,
  ResolutionException,
  UnixMillis
} from "@noema/economic-kernel";
import { computeRoots } from "@noema/canonicalization";
import { reduceEconomicObject, type ReduceEconomicObjectInput } from "./index.js";

export function isMaterialChange(
  currentObject: EconomicObject,
  newEvidence: readonly Evidence[] = [],
  newClaims: readonly Claim[] = [],
  newExceptions: readonly ResolutionException[] = []
): boolean {
  const currentEvidenceMap = new Map(currentObject.evidence.map((e) => [e.id, e]));
  const currentClaimsMap = new Map(currentObject.claims.map((c) => [c.id, c]));

  // Check evidence changes
  for (const evidence of newEvidence) {
    const existing = currentEvidenceMap.get(evidence.id);
    if (!existing) return true; // new evidence
    if (existing.contentHash !== evidence.contentHash) return true;
    if (existing.freshness !== evidence.freshness) return true;
    if (existing.authority !== evidence.authority) return true;
  }

  // Check claim changes
  for (const claim of newClaims) {
    const existing = currentClaimsMap.get(claim.id);
    if (!existing) return true;
    if (existing.state !== claim.state) return true;
    if (JSON.stringify(existing.value) !== JSON.stringify(claim.value)) return true;
  }

  // Check exception additions
  if (newExceptions.length > 0) {
    const currentExceptionIds = new Set(currentObject.exceptions.map((e) => e.id));
    if (newExceptions.some((e) => !currentExceptionIds.has(e.id))) {
      return true;
    }
  }

  return false;
}

export interface CreateNextVersionOptions {
  nowMs?: UnixMillis;
  reason?: string;
}

export function createNextVersion(
  currentObject: EconomicObject,
  updates: Partial<ReduceEconomicObjectInput>,
  options: CreateNextVersionOptions = {}
): EconomicObject {
  const nowMs = options.nowMs ?? Date.now();
  const nextVersion = currentObject.version + 1;

  const versionProvenanceEdge: ProvenanceEdge = {
    id: `edge:version:${currentObject.id}:v${currentObject.version}->v${nextVersion}`,
    from: `${currentObject.id}:v${currentObject.version}`,
    to: `${currentObject.id}:v${nextVersion}`,
    relation: "SUPERSEDES"
  };

  const existingEdges = updates.provenance?.edges ?? currentObject.provenance.edges;
  const mergedEdges = [...existingEdges, versionProvenanceEdge];

  const nextObjectInput: ReduceEconomicObjectInput = {
    id: currentObject.id,
    version: nextVersion,
    classification: updates.classification ?? currentObject.classification,
    identifiers: updates.identifiers ?? currentObject.identifiers,
    representations: updates.representations ?? currentObject.representations,
    relationships: updates.relationships ?? currentObject.relationships,
    parties: updates.parties ?? currentObject.parties,
    rights: updates.rights ?? currentObject.rights,
    obligations: updates.obligations ?? currentObject.obligations,
    restrictions: updates.restrictions ?? currentObject.restrictions,
    economics: updates.economics ?? currentObject.economics,
    claims: updates.claims ?? currentObject.claims,
    evidence: updates.evidence ?? currentObject.evidence,
    attestations: updates.attestations ?? currentObject.attestations,
    exceptions: updates.exceptions ?? currentObject.exceptions,
    provenance: { edges: mergedEdges },
    createdAt: currentObject.createdAt,
    updatedAt: nowMs,
    ...(updates.verification !== undefined ? { verification: updates.verification } : {})
  };

  return reduceEconomicObject(nextObjectInput);
}

export class AppendOnlyVersionStore {
  private readonly store = new Map<Ref, Map<number, { object: EconomicObject; canonicalRoots: ReturnType<typeof computeRoots> }>>();

  save(object: EconomicObject): void {
    let versions = this.store.get(object.id);
    if (!versions) {
      versions = new Map();
      this.store.set(object.id, versions);
    }
    if (versions.has(object.version)) {
      const existing = versions.get(object.version)!;
      const currentRoots = computeRoots(object);
      if (existing.canonicalRoots.objectRoot !== currentRoots.objectRoot) {
        throw new Error(
          `Immutability violation: Cannot overwrite version ${object.version} of ${object.id} with differing root ${currentRoots.objectRoot} (stored: ${existing.canonicalRoots.objectRoot})`
        );
      }
      return;
    }
    versions.set(object.version, {
      object: JSON.parse(JSON.stringify(object)),
      canonicalRoots: computeRoots(object)
    });
  }

  get(objectId: Ref, version: number): EconomicObject | undefined {
    const record = this.store.get(objectId)?.get(version);
    return record ? JSON.parse(JSON.stringify(record.object)) : undefined;
  }

  getLatest(objectId: Ref): EconomicObject | undefined {
    const versions = this.store.get(objectId);
    if (!versions || versions.size === 0) return undefined;
    const maxVersion = Math.max(...Array.from(versions.keys()));
    return this.get(objectId, maxVersion);
  }

  getAllVersions(objectId: Ref): EconomicObject[] {
    const versions = this.store.get(objectId);
    if (!versions) return [];
    const sortedVersions = Array.from(versions.keys()).sort((a, b) => a - b);
    return sortedVersions.map((v) => this.get(objectId, v)!);
  }
}
