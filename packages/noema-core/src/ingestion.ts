import type {
  Claim,
  ClaimState,
  Evidence,
  EvidenceAuthority,
  EvidenceType,
  Hex,
  JsonObject,
  JsonValue,
  Ref,
  ResolutionException,
  ResolutionExceptionType,
  SourceSnapshot,
  UnixMillis
} from "@noema/economic-kernel";
import { hashCanonical, hashUtf8 } from "@noema/canonicalization";

export interface IngestSourceSnapshotInput {
  id?: Ref;
  sourceId: Ref;
  uri: string;
  contentType: string;
  body: string | JsonValue;
  fetchedAt?: UnixMillis;
  httpStatus?: number;
  etag?: string;
  lastModified?: string;
  bodyStorageRef?: Ref;
  extractionVersion?: string;
}

export function createSourceSnapshot(input: IngestSourceSnapshotInput): SourceSnapshot {
  const fetchedAt = input.fetchedAt ?? Date.now();
  const id = input.id ?? `snapshot:${input.sourceId}:${fetchedAt}`;
  const contentHash: Hex =
    typeof input.body === "string"
      ? hashUtf8(input.body)
      : hashCanonical(input.body as JsonObject);

  const snapshot: SourceSnapshot = {
    id,
    sourceId: input.sourceId,
    uri: input.uri,
    contentType: input.contentType,
    contentHash,
    fetchedAt,
    bodyStorageRef: input.bodyStorageRef ?? `storage:${id}`,
    ...(input.httpStatus !== undefined ? { httpStatus: input.httpStatus } : {}),
    ...(input.etag !== undefined ? { etag: input.etag } : {}),
    ...(input.lastModified !== undefined ? { lastModified: input.lastModified } : {}),
    ...(input.extractionVersion !== undefined ? { extractionVersion: input.extractionVersion } : { extractionVersion: "v1" })
  };

  return snapshot;
}

export interface IngestEvidenceInput {
  id?: Ref;
  type: EvidenceType;
  source: Ref;
  contentHash: Hex;
  locator?: string;
  observedAt?: UnixMillis;
  fetchedAt?: UnixMillis;
  authority: EvidenceAuthority;
  freshness?: "FRESH" | "STALE" | "UNKNOWN";
  metadata?: JsonObject;
}

export function createEvidenceRecord(input: IngestEvidenceInput): Evidence {
  const observedAt = input.observedAt ?? Date.now();
  const fetchedAt = input.fetchedAt ?? observedAt;
  const id = input.id ?? `evidence:${input.source}:${observedAt}`;

  const evidence: Evidence = {
    id,
    type: input.type,
    source: input.source,
    contentHash: input.contentHash,
    observedAt,
    fetchedAt,
    authority: input.authority,
    freshness: input.freshness ?? "FRESH",
    metadata: input.metadata ?? {},
    ...(input.locator !== undefined ? { locator: input.locator } : {})
  };

  return evidence;
}

export interface CreateCandidateClaimInput<T = JsonValue> {
  id?: Ref;
  subject: Ref;
  property: string;
  value: T;
  unit?: string;
  state?: ClaimState;
  sourceRefs: Ref[];
  evidenceRefs: Ref[];
  attestationRefs?: Ref[];
  confidence?: number;
  observedAt?: UnixMillis;
  validFrom?: UnixMillis;
  expiresAt?: UnixMillis;
  supersedes?: Ref;
  createdAt?: UnixMillis;
}

export function createCandidateClaim<T = JsonValue>(
  input: CreateCandidateClaimInput<T>
): Claim<T> {
  const createdAt = input.createdAt ?? Date.now();
  const id = input.id ?? `claim:${input.subject}:${input.property}:${createdAt}`;

  const claim: Claim<T> = {
    id,
    subject: input.subject,
    property: input.property,
    value: input.value,
    state: input.state ?? "SOURCED",
    sourceRefs: input.sourceRefs,
    evidenceRefs: input.evidenceRefs,
    attestationRefs: input.attestationRefs ?? [],
    createdAt,
    ...(input.unit !== undefined ? { unit: input.unit } : {}),
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    ...(input.observedAt !== undefined ? { observedAt: input.observedAt } : {}),
    ...(input.validFrom !== undefined ? { validFrom: input.validFrom } : {}),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    ...(input.supersedes !== undefined ? { supersedes: input.supersedes } : {})
  };

  return claim;
}

export function createResolutionException(
  objectId: Ref,
  type: ResolutionExceptionType,
  severity: "INFO" | "WARNING" | "BLOCKING",
  affectedClaims: Ref[],
  evidence: Ref[],
  resolutionOptions?: string[]
): ResolutionException {
  const now = Date.now();
  const exception: ResolutionException = {
    id: `exception:${objectId}:${type.toLowerCase()}:${now}`,
    objectId,
    type,
    severity,
    affectedClaims,
    evidence,
    detectedAt: now,
    status: "OPEN",
    ...(resolutionOptions !== undefined ? { resolutionOptions } : {})
  };

  return exception;
}
