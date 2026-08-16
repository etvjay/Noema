import canonicalize from "canonicalize";
import type {
  Attestation,
  EconomicObject,
  Evidence,
  Hex,
  JsonValue
} from "@noema/economic-kernel";
import { keccak256, stringToHex, verifyTypedData } from "viem";

export const HASHING_VERSION_V1 = "noema-hashing-v1";
export const HASHING_VERSION_V2 = "noema-hashing-v2";
export const CURRENT_HASHING_VERSION = HASHING_VERSION_V2;

export const HASHING_VERSIONS = [HASHING_VERSION_V1, HASHING_VERSION_V2] as const;
export type HashingVersion = (typeof HASHING_VERSIONS)[number];

export const OBJECT_DOMAIN_V1 = "noema:economic-object:v1";
export const OBJECT_DOMAIN_V2 = "noema:economic-object:v2";
export const OBJECT_DOMAIN = OBJECT_DOMAIN_V2;
export const EVIDENCE_LEAF_DOMAIN_V1 = "noema:evidence-leaf:v1";
export const EVIDENCE_LEAF_DOMAIN_V2 = "noema:evidence-leaf:v2";
export const EVIDENCE_LEAF_DOMAIN = EVIDENCE_LEAF_DOMAIN_V2;
export const MERKLE_DOMAIN = "noema:evidence-merkle:v1";

function isV1(hashingVersion: HashingVersion): boolean {
  return hashingVersion === HASHING_VERSION_V1;
}

function assertV2SchemaIdentity(
  artifactKind: string,
  artifactId: string,
  schemaId: unknown,
  schemaVersion: unknown
): void {
  if (typeof schemaId !== "string" || schemaId.length === 0 || typeof schemaVersion !== "number") {
    throw new Error(
      `Cannot compute a v2 commitment: ${artifactKind} ${artifactId} is missing in-band schema identity (schemaId/schemaVersion)`
    );
  }
}

function stripSchemaFields<
  T extends { schemaId: string; schemaVersion: number }
>(value: T): Omit<T, "schemaId" | "schemaVersion"> {
  const { schemaId, schemaVersion, ...rest } = value;
  void schemaId;
  void schemaVersion;
  return rest;
}

function stripAttestationSchemaFields(attestation: Attestation): Omit<Attestation, "schemaId" | "schemaVersion"> {
  return stripSchemaFields(attestation);
}

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

export async function verifyEip712Signature(
  input: Parameters<typeof verifyTypedData>[0]
): Promise<boolean> {
  return verifyTypedData(input);
}

export function toObjectHashProjection(
  object: EconomicObject,
  hashingVersion: HashingVersion = CURRENT_HASHING_VERSION
): Record<string, unknown> {
  const v1 = isV1(hashingVersion);
  if (!v1) {
    assertV2SchemaIdentity("economic object", object.id, object.schemaId, object.schemaVersion);
  }
  return {
    domain: v1 ? OBJECT_DOMAIN_V1 : OBJECT_DOMAIN_V2,
    hashingVersion,
    ...(v1 ? {} : { schemaId: object.schemaId, schemaVersion: object.schemaVersion }),
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
    evidence: v1 ? object.evidence.map(stripSchemaFields) : object.evidence,
    attestations: v1 ? object.attestations.map(stripAttestationSchemaFields) : object.attestations,
    exceptions: object.exceptions,
    provenance: object.provenance,
    status: object.status,
    verification: {
      status: object.verification.status,
      verifierVersion: object.verification.verifierVersion,
      checks: object.verification.checks.map((check) => ({
        id: check.id,
        type: check.type,
        subject: check.subject,
        result: check.result,
        evidence: check.evidence,
        ruleVersion: check.ruleVersion,
        ...(check.reason === undefined ? {} : { reason: check.reason })
      }))
    }
  };
}

function evidenceLeafPayload(
  evidence: Evidence,
  hashingVersion: HashingVersion
): Record<string, unknown> {
  const v1 = isV1(hashingVersion);
  if (!v1) {
    assertV2SchemaIdentity("evidence", evidence.id, evidence.schemaId, evidence.schemaVersion);
  }
  return {
    domain: v1 ? EVIDENCE_LEAF_DOMAIN_V1 : EVIDENCE_LEAF_DOMAIN_V2,
    hashingVersion,
    ...(v1 ? {} : { schemaId: evidence.schemaId, schemaVersion: evidence.schemaVersion }),
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

export function hashEvidenceLeaf(
  evidence: Evidence,
  hashingVersion: HashingVersion = CURRENT_HASHING_VERSION
): Hex {
  return hashCanonical(evidenceLeafPayload(evidence, hashingVersion));
}

export function evidenceLeaves(
  evidence: readonly Evidence[],
  hashingVersion: HashingVersion = CURRENT_HASHING_VERSION
): Hex[] {
  return evidence.map((item) => hashEvidenceLeaf(item, hashingVersion)).sort();
}

export function evidenceMerkleRoot(
  evidence: readonly Evidence[],
  hashingVersion: HashingVersion = CURRENT_HASHING_VERSION
): Hex {
  let layer = evidenceLeaves(evidence, hashingVersion);
  if (layer.length === 0) {
    return hashCanonical({ domain: MERKLE_DOMAIN, hashingVersion, leaves: [] });
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
          hashingVersion,
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

export function objectRoot(
  object: EconomicObject,
  hashingVersion: HashingVersion = CURRENT_HASHING_VERSION
): Hex {
  return hashCanonical(toObjectHashProjection(object, hashingVersion));
}

export interface CanonicalHashBundle {
  objectRoot: Hex;
  evidenceRoot: Hex;
  canonicalObject: string;
  evidenceLeaves: Hex[];
  hashingVersion: HashingVersion;
}

export function computeRoots(
  object: EconomicObject,
  hashingVersion: HashingVersion = CURRENT_HASHING_VERSION
): CanonicalHashBundle {
  const projection = toObjectHashProjection(object, hashingVersion);
  return {
    objectRoot: hashCanonical(projection),
    evidenceRoot: evidenceMerkleRoot(object.evidence, hashingVersion),
    canonicalObject: canonicalJson(projection),
    evidenceLeaves: evidenceLeaves(object.evidence, hashingVersion),
    hashingVersion
  };
}
