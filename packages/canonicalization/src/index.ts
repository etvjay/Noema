import canonicalize from "canonicalize";
import type {
  EconomicObject,
  Evidence,
  Hex,
  JsonValue
} from "@noema/economic-kernel";
import { keccak256, stringToHex } from "viem";

export const HASHING_VERSION = "noema-hashing-v1";
export const OBJECT_DOMAIN = "noema:economic-object:v1";
export const EVIDENCE_LEAF_DOMAIN = "noema:evidence-leaf:v1";
export const MERKLE_DOMAIN = "noema:evidence-merkle:v1";

export function canonicalJson(value: unknown): string {
  const result = canonicalize(value);
  if (result === undefined) {
    throw new Error("Value cannot be represented as canonical JSON");
  }
  return result;
}

export function hashUtf8(value: string): Hex {
  return keccak256(stringToHex(value));
}

export function hashCanonical(value: JsonValue | Record<string, unknown>): Hex {
  return hashUtf8(canonicalJson(value));
}

export function toObjectHashProjection(object: EconomicObject): Record<string, unknown> {
  return {
    domain: OBJECT_DOMAIN,
    id: object.id,
    version: object.version,
    classification: object.classification,
    identifiers: object.identifiers,
    representations: object.representations,
    relationships: object.relationships,
    parties: object.parties,
    rights: object.rights,
    obligations: object.obligations,
    restrictions: object.restrictions,
    economics: object.economics,
    claims: object.claims,
    evidence: object.evidence,
    attestations: object.attestations,
    exceptions: object.exceptions,
    provenance: object.provenance,
    status: object.status,
    verification: {
      status: object.verification.status,
      verifierVersion: object.verification.verifierVersion,
      checks: object.verification.checks
    }
  };
}

function evidenceLeafPayload(evidence: Evidence): Record<string, unknown> {
  return {
    domain: EVIDENCE_LEAF_DOMAIN,
    id: evidence.id,
    type: evidence.type,
    source: evidence.source,
    contentHash: evidence.contentHash,
    locator: evidence.locator ?? null,
    observedAt: evidence.observedAt,
    fetchedAt: evidence.fetchedAt,
    authority: evidence.authority,
    freshness: evidence.freshness ?? "UNKNOWN",
    metadata: evidence.metadata
  };
}

export function hashEvidenceLeaf(evidence: Evidence): Hex {
  return hashCanonical(evidenceLeafPayload(evidence));
}

export function evidenceLeaves(evidence: readonly Evidence[]): Hex[] {
  return evidence.map(hashEvidenceLeaf).sort();
}

export function evidenceMerkleRoot(evidence: readonly Evidence[]): Hex {
  let layer = evidenceLeaves(evidence);
  if (layer.length === 0) {
    return hashCanonical({ domain: MERKLE_DOMAIN, leaves: [] });
  }

  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let index = 0; index < layer.length; index += 2) {
      const left = layer[index];
      const right = layer[index + 1] ?? left;
      if (left === undefined || right === undefined) {
        throw new Error("Merkle layer unexpectedly contained an empty node");
      }
      const ordered = [left, right].sort();
      next.push(
        hashCanonical({
          domain: MERKLE_DOMAIN,
          left: ordered[0],
          right: ordered[1]
        })
      );
    }
    layer = next.sort();
  }

  const root = layer[0];
  if (root === undefined) {
    throw new Error("Merkle root unexpectedly missing");
  }
  return root;
}

export const evidenceRoot = evidenceMerkleRoot;

export function objectRoot(object: EconomicObject): Hex {
  return hashCanonical(toObjectHashProjection(object));
}

export interface CanonicalHashBundle {
  objectRoot: Hex;
  evidenceRoot: Hex;
  canonicalObject: string;
  evidenceLeaves: Hex[];
}

export function computeRoots(object: EconomicObject): CanonicalHashBundle {
  const projection = toObjectHashProjection(object);
  return {
    objectRoot: hashCanonical(projection),
    evidenceRoot: evidenceMerkleRoot(object.evidence),
    canonicalObject: canonicalJson(projection),
    evidenceLeaves: evidenceLeaves(object.evidence)
  };
}
