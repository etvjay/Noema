import { SCHEMA_IDS, SCHEMA_VERSIONS } from "@noema/schemas";
import type { Ref, SourceSnapshot, UnixMillis } from "@noema/economic-kernel";
import {
  SOURCE_ADAPTER_VERSION,
  hashBytes,
  sourceFailure,
  stableStorageRef,
  type SourceAdapterResult
} from "../shared.js";

export interface DocumentSourceInput {
  sourceId: Ref;
  uri: string;
  contentType: string;
  bytes: Uint8Array;
  fetchedAt: UnixMillis;
  bodyStorageRef?: Ref;
  extractionVersion?: string;
}

export function captureDocumentSource(input: DocumentSourceInput): SourceAdapterResult {
  const contentType = input.contentType.trim().toLowerCase();
  if (contentType.length === 0) {
    return sourceFailure(
      input.sourceId,
      input.uri,
      "UNSUPPORTED_CONTENT_TYPE",
      "Document content type is required",
      input.fetchedAt
    );
  }
  if (input.bytes.byteLength === 0) {
    return sourceFailure(
      input.sourceId,
      input.uri,
      "MALFORMED_RESPONSE",
      "Document body is empty",
      input.fetchedAt
    );
  }

  const contentHash = hashBytes(input.bytes);
  const snapshot: SourceSnapshot = {
    id: `snapshot:${input.sourceId}:${contentHash.slice(2, 18)}`,
    schemaId: SCHEMA_IDS.SOURCE_SNAPSHOT,
    schemaVersion: SCHEMA_VERSIONS.SOURCE_SNAPSHOT,
    sourceId: input.sourceId,
    uri: input.uri,
    contentType,
    contentHash,
    fetchedAt: input.fetchedAt,
    bodyStorageRef: input.bodyStorageRef ?? stableStorageRef(input.sourceId, contentHash),
    extractionVersion: input.extractionVersion ?? SOURCE_ADAPTER_VERSION
  };

  return { status: "CAPTURED", snapshot };
}
