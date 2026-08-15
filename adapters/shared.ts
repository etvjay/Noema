import { createHash } from "node:crypto";
import type { Ref, SourceSnapshot, UnixMillis } from "@noema/economic-kernel";

export const SOURCE_ADAPTER_VERSION = "noema-source-adapter-v1";

export type SourceFailureCode =
  | "INVALID_SOURCE"
  | "UNSUPPORTED_PROTOCOL"
  | "PRIVATE_NETWORK_BLOCKED"
  | "TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "HTTP_FAILURE"
  | "REDIRECT_LIMIT"
  | "AUTH_FAILURE"
  | "RPC_FAILURE"
  | "MALFORMED_RESPONSE";

export interface SourceFailure {
  status: "SOURCE_FAILURE";
  sourceId: Ref;
  uri: string;
  code: SourceFailureCode;
  message: string;
  observedAt: UnixMillis;
}

export interface SourceCapture {
  status: "CAPTURED";
  snapshot: SourceSnapshot;
}

export type SourceAdapterResult = SourceCapture | SourceFailure;

export function hashBytes(bytes: Uint8Array): `0x${string}` {
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}

export function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function stableStorageRef(sourceId: Ref, contentHash: string): Ref {
  return `snapshot-body:${sourceId}:${contentHash.toLowerCase()}`;
}

export function sourceFailure(
  sourceId: Ref,
  uri: string,
  code: SourceFailureCode,
  message: string,
  observedAt: UnixMillis
): SourceFailure {
  return { status: "SOURCE_FAILURE", sourceId, uri, code, message, observedAt };
}
