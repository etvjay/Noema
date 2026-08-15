import type { JsonObject, Ref, SourceSnapshot, UnixMillis } from "@noema/economic-kernel";
import {
  SOURCE_ADAPTER_VERSION,
  hashBytes,
  sourceFailure,
  stableStorageRef,
  utf8Bytes,
  type SourceAdapterResult
} from "../shared.js";

export interface EvmObservationInput {
  sourceId: Ref;
  rpcUri: string;
  chainId: number;
  blockNumber: bigint;
  blockHash: `0x${string}`;
  address: `0x${string}`;
  locator: string;
  value: string;
  observedAt: UnixMillis;
  fetchedAt: UnixMillis;
  metadata?: JsonObject;
}

export function captureEvmObservation(input: EvmObservationInput): SourceAdapterResult {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
    return sourceFailure(input.sourceId, input.rpcUri, "INVALID_SOURCE", "Invalid EVM chain ID", input.observedAt);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.blockHash)) {
    return sourceFailure(input.sourceId, input.rpcUri, "MALFORMED_RESPONSE", "Invalid EVM block hash", input.observedAt);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.address)) {
    return sourceFailure(input.sourceId, input.rpcUri, "MALFORMED_RESPONSE", "Invalid EVM address", input.observedAt);
  }

  const canonicalObservation = JSON.stringify({
    chainId: input.chainId,
    blockNumber: input.blockNumber.toString(),
    blockHash: input.blockHash.toLowerCase(),
    address: input.address.toLowerCase(),
    locator: input.locator,
    value: input.value,
    metadata: input.metadata ?? {}
  });
  const contentHash = hashBytes(utf8Bytes(canonicalObservation));
  const snapshot: SourceSnapshot = {
    id: `snapshot:${input.sourceId}:${contentHash.slice(2, 18)}`,
    sourceId: input.sourceId,
    uri: input.rpcUri,
    contentType: "application/vnd.noema.evm-observation+json",
    contentHash,
    fetchedAt: input.fetchedAt,
    bodyStorageRef: stableStorageRef(input.sourceId, contentHash),
    extractionVersion: SOURCE_ADAPTER_VERSION
  };

  return { status: "CAPTURED", snapshot };
}
