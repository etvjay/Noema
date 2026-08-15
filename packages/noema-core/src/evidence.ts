import type {
  Evidence,
  EvidenceAuthority,
  EvidenceType,
  JsonObject,
  Ref,
  SourceSnapshot,
  UnixMillis
} from "@noema/economic-kernel";

export type SourceIngestionStatus = "INGESTED" | "STALE" | "SOURCE_FAILURE";

export interface SourceIngestionInput {
  snapshot: SourceSnapshot;
  evidenceId: Ref;
  type: EvidenceType;
  authority: EvidenceAuthority;
  observedAt: UnixMillis;
  nowMs: UnixMillis;
  maxAgeMs?: number;
  locator?: string;
  metadata?: JsonObject;
}

export interface SourceIngestionSuccess {
  status: "INGESTED" | "STALE";
  snapshot: SourceSnapshot;
  evidence: Evidence;
}

export interface SourceIngestionFailure {
  status: "SOURCE_FAILURE";
  snapshot?: SourceSnapshot;
  reasonCode:
    | "HTTP_FAILURE"
    | "MISSING_CONTENT_HASH"
    | "MISSING_BODY_STORAGE_REF"
    | "INVALID_FETCH_TIME";
  message: string;
}

export type SourceIngestionResult =
  | SourceIngestionSuccess
  | SourceIngestionFailure;

function failure(
  snapshot: SourceSnapshot | undefined,
  reasonCode: SourceIngestionFailure["reasonCode"],
  message: string
): SourceIngestionFailure {
  return snapshot === undefined
    ? { status: "SOURCE_FAILURE", reasonCode, message }
    : { status: "SOURCE_FAILURE", snapshot, reasonCode, message };
}

export function ingestSourceSnapshot(
  input: SourceIngestionInput
): SourceIngestionResult {
  const { snapshot } = input;

  if (snapshot.httpStatus !== undefined && snapshot.httpStatus >= 400) {
    return failure(
      snapshot,
      "HTTP_FAILURE",
      `Source snapshot ${snapshot.id} returned HTTP ${snapshot.httpStatus}`
    );
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(snapshot.contentHash)) {
    return failure(
      snapshot,
      "MISSING_CONTENT_HASH",
      `Source snapshot ${snapshot.id} does not contain a 32-byte content hash`
    );
  }
  if (snapshot.bodyStorageRef.trim().length === 0) {
    return failure(
      snapshot,
      "MISSING_BODY_STORAGE_REF",
      `Source snapshot ${snapshot.id} does not preserve immutable body storage`
    );
  }
  if (snapshot.fetchedAt > input.nowMs) {
    return failure(
      snapshot,
      "INVALID_FETCH_TIME",
      `Source snapshot ${snapshot.id} was fetched in the future`
    );
  }

  const stale =
    input.maxAgeMs !== undefined &&
    input.nowMs - input.observedAt > input.maxAgeMs;

  const evidence: Evidence = {
    id: input.evidenceId,
    type: input.type,
    source: snapshot.id,
    contentHash: snapshot.contentHash,
    observedAt: input.observedAt,
    fetchedAt: snapshot.fetchedAt,
    authority: input.authority,
    freshness: stale ? "STALE" : "FRESH",
    metadata: {
      sourceId: snapshot.sourceId,
      sourceUri: snapshot.uri,
      contentType: snapshot.contentType,
      bodyStorageRef: snapshot.bodyStorageRef,
      extractionVersion: snapshot.extractionVersion ?? null,
      ...(input.metadata ?? {})
    },
    ...(input.locator === undefined ? {} : { locator: input.locator })
  };

  return {
    status: stale ? "STALE" : "INGESTED",
    snapshot,
    evidence
  };
}
