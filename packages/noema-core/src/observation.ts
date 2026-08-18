import { createHash } from "node:crypto";
import type {
  Hex,
  JsonObject,
  Ref,
  SchemaId,
  SchemaVersion,
  UnixMillis
} from "@noema/economic-kernel";
import { canonicalJson } from "@noema/canonicalization";

export const OBSERVATION_IDENTITY_VERSION = "noema-chain-observation-v1";
export const OBSERVATION_HASH_VERSION = "noema-chain-observation-sha256-v1";
export const OBSERVATION_FINALITY_POLICY_VERSION = "noema-chain-finality-v1";

export type ChainKind = "EVM" | "NON_EVM";

export type ObservationFinality =
  | "PENDING"
  | "FINALIZED"
  | "REORGED"
  | "UNAVAILABLE"
  | "CHAIN_STALLED";

export type ObservationFailureCode =
  | "CHAIN_ID_EMPTY"
  | "CHAIN_MISMATCH"
  | "MALFORMED_HEIGHT"
  | "MALFORMED_STATE_ID"
  | "MALFORMED_ACCOUNT"
  | "EMPTY_LOCATOR"
  | "MALFORMED_FINALITY"
  | "INVALID_TIMESTAMP";

export interface ChainObservationProvenance {
  chainId: string;
  chainKind: ChainKind;
  height: string;
  stateId: Hex;
  parentStateId?: Hex;
  account?: string;
  locator: string;
  value: string;
  finality: ObservationFinality;
  observedAt: UnixMillis;
  fetchedAt: UnixMillis;
  finalizedAt?: UnixMillis;
  confirmationPolicy: string;
  supersededBy?: Ref;
}

export interface ChainObservation {
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  observationId: Ref;
  sourceId: Ref;
  provenance: ChainObservationProvenance;
  contentHash: Hex;
  metadata: JsonObject;
}

export interface ChainObservationInput {
  observationId: Ref;
  sourceId: Ref;
  provenance: ChainObservationProvenance;
  metadata?: JsonObject;
}

export type ChainObservationVerdict =
  | { valid: true; reasonCodes: string[] }
  | { valid: false; reasonCodes: string[] };

function observationFailure(
  sourceId: Ref,
  code: ObservationFailureCode,
  message: string
): { status: "OBSERVATION_FAILURE"; sourceId: Ref; code: ObservationFailureCode; message: string } {
  return { status: "OBSERVATION_FAILURE", sourceId, code, message };
}

export type ChainObservationResult =
  | { status: "CAPTURED"; observation: ChainObservation }
  | ReturnType<typeof observationFailure>;

export function validateChainObservation(
  provenance: ChainObservationProvenance
): ChainObservationVerdict {
  const reasonCodes: string[] = [];

  if (provenance.chainId.trim().length === 0) {
    reasonCodes.push("CHAIN_ID_EMPTY");
  }
  if (!/^\d+$/.test(provenance.height)) {
    reasonCodes.push("MALFORMED_HEIGHT");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(provenance.stateId)) {
    reasonCodes.push("MALFORMED_STATE_ID");
  }
  if (
    provenance.parentStateId !== undefined &&
    !/^0x[0-9a-fA-F]{64}$/.test(provenance.parentStateId)
  ) {
    reasonCodes.push("MALFORMED_STATE_ID");
  }
  if (provenance.chainKind === "EVM") {
    if (provenance.account === undefined || !/^0x[0-9a-fA-F]{40}$/.test(provenance.account)) {
      reasonCodes.push("MALFORMED_ACCOUNT");
    }
  } else if (provenance.account !== undefined && !/^[A-Za-z0-9_:.-]{1,128}$/.test(provenance.account)) {
    reasonCodes.push("MALFORMED_ACCOUNT");
  }
  if (provenance.locator.trim().length === 0) {
    reasonCodes.push("EMPTY_LOCATOR");
  }
  const allowedFinality: ObservationFinality[] = [
    "PENDING",
    "FINALIZED",
    "REORGED",
    "UNAVAILABLE",
    "CHAIN_STALLED"
  ];
  if (!allowedFinality.includes(provenance.finality)) {
    reasonCodes.push("MALFORMED_FINALITY");
  }
  if (!Number.isFinite(provenance.observedAt) || provenance.observedAt <= 0) {
    reasonCodes.push("INVALID_TIMESTAMP");
  }
  if (!Number.isFinite(provenance.fetchedAt) || provenance.fetchedAt <= 0) {
    reasonCodes.push("INVALID_TIMESTAMP");
  }

  return reasonCodes.length === 0
    ? { valid: true, reasonCodes: ["OBSERVATION_VALID"] }
    : { valid: false, reasonCodes: [...new Set(reasonCodes)] };
}

export function captureChainObservation(input: ChainObservationInput): ChainObservationResult {
  const verdict = validateChainObservation(input.provenance);
  if (!verdict.valid) {
    return observationFailure(input.sourceId, "MALFORMED_STATE_ID", verdict.reasonCodes.join("; "));
  }

  const projection = {
    domain: "noema:chain-observation:v1",
    hashVersion: OBSERVATION_HASH_VERSION,
    observationId: input.observationId,
    provenance: {
      chainId: input.provenance.chainId,
      chainKind: input.provenance.chainKind,
      height: input.provenance.height,
      stateId: input.provenance.stateId.toLowerCase(),
      parentStateId: input.provenance.parentStateId?.toLowerCase() ?? null,
      account: input.provenance.account?.toLowerCase() ?? null,
      locator: input.provenance.locator,
      value: input.provenance.value,
      finality: input.provenance.finality,
      observedAt: input.provenance.observedAt,
      fetchedAt: input.provenance.fetchedAt,
      finalizedAt: input.provenance.finalizedAt ?? null,
      confirmationPolicy: input.provenance.confirmationPolicy,
      supersededBy: input.provenance.supersededBy ?? null
    }
  };

  const contentHash = createHash("sha256")
    .update(canonicalJson(projection), "utf8")
    .digest("hex") as Hex;

  const observation: ChainObservation = {
    schemaId: "noema:chain-observation",
    schemaVersion: 1,
    observationId: input.observationId,
    sourceId: input.sourceId,
    provenance: input.provenance,
    contentHash,
    metadata: input.metadata ?? {}
  };

  return { status: "CAPTURED", observation };
}

export function deriveChainObservationIdentityKey(
  provenance: ChainObservationProvenance
): string {
  const projection = {
    chainId: provenance.chainId,
    chainKind: provenance.chainKind,
    height: provenance.height,
    stateId: provenance.stateId.toLowerCase(),
    account: provenance.account?.toLowerCase() ?? null,
    locator: provenance.locator,
    value: provenance.value
  };
  return createHash("sha256")
    .update(canonicalJson(projection), "utf8")
    .digest("hex");
}

export function deriveChainObservationScopeKey(
  provenance: ChainObservationProvenance
): string {
  const projection = {
    chainId: provenance.chainId,
    chainKind: provenance.chainKind,
    height: provenance.height,
    account: provenance.account?.toLowerCase() ?? null,
    locator: provenance.locator,
    value: provenance.value
  };
  return createHash("sha256")
    .update(canonicalJson(projection), "utf8")
    .digest("hex");
}

export function observationsAreDuplicate(left: ChainObservation, right: ChainObservation): boolean {
  return (
    deriveChainObservationIdentityKey(left.provenance) ===
    deriveChainObservationIdentityKey(right.provenance)
  );
}

export interface FinalityPolicy {
  requireFinalized: boolean;
  chainId?: string;
  allowPending: boolean;
}

export type FinalityVerdict =
  | { satisfied: true; reasonCodes: string[] }
  | { satisfied: false; reasonCodes: string[] };

export function finalitySatisfiesPolicy(
  observation: ChainObservation,
  policy: FinalityPolicy
): FinalityVerdict {
  const reasonCodes: string[] = [];

  if (policy.chainId !== undefined && policy.chainId !== observation.provenance.chainId) {
    return { satisfied: false, reasonCodes: [`CHAIN_MISMATCH:${observation.provenance.chainId}:${policy.chainId}`] };
  }

  const finality = observation.provenance.finality;
  if (policy.requireFinalized) {
    if (finality === "FINALIZED") {
      return { satisfied: true, reasonCodes: ["FINALITY_REQUIRED_FINALIZED"] };
    }
    if (finality === "PENDING") {
      return { satisfied: false, reasonCodes: ["FINALITY_PENDING_NOT_FINALIZED"] };
    }
    return { satisfied: false, reasonCodes: [`FINALITY_${finality}_NOT_FINALIZED`] };
  }

  if (policy.allowPending && (finality === "PENDING" || finality === "FINALIZED")) {
    return { satisfied: true, reasonCodes: ["FINALITY_POLICY_ACCEPTS_PENDING"] };
  }
  if (finality === "FINALIZED") {
    return { satisfied: true, reasonCodes: ["FINALITY_FINALIZED"] };
  }
  if (finality === "PENDING") {
    return { satisfied: false, reasonCodes: ["FINALITY_PENDING_REQUIRES_ALLOW_PENDING"] };
  }
  return { satisfied: false, reasonCodes: [`FINALITY_${finality}_NOT_ACCEPTABLE`] };
}

export interface ObservationReorgLineage {
  displaced: Ref;
  displacedObservationId: Ref;
  displacedByObservationId: Ref;
  stateId: Hex;
}

export interface ResolveChainObservationSetInput {
  observations: ChainObservation[];
  canonicalHead?: {
    chainId: string;
    chainKind: ChainKind;
    height: string;
    stateId: Hex;
    locator: string;
    account?: string;
  };
  nowMs: UnixMillis;
}

export interface ResolveChainObservationSetResult {
  finalized: ChainObservation[];
  pending: ChainObservation[];
  reorged: ChainObservation[];
  unavailable: ChainObservation[];
  stalled: ChainObservation[];
  conflicting: ChainObservation[];
  lineage: ObservationReorgLineage[];
  exceptions: string[];
}

export function resolveChainObservationSet(
  input: ResolveChainObservationSetInput
): ResolveChainObservationSetResult {
  const finalized: ChainObservation[] = [];
  const pending: ChainObservation[] = [];
  const reorged: ChainObservation[] = [];
  const unavailable: ChainObservation[] = [];
  const stalled: ChainObservation[] = [];
  const conflicting: ChainObservation[] = [];
  const lineage: ObservationReorgLineage[] = [];
  const exceptions: string[] = [];

  const byIdentity = new Map<string, ChainObservation[]>();
  for (const observation of input.observations) {
    const key = deriveChainObservationIdentityKey(observation.provenance);
    const group = byIdentity.get(key) ?? [];
    group.push(observation);
    byIdentity.set(key, group);
  }

  const seenIdentities = new Set<string>();
  let duplicateCount = 0;
  for (const observation of input.observations) {
    const key = deriveChainObservationIdentityKey(observation.provenance);
    if (seenIdentities.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seenIdentities.add(key);

    const head = input.canonicalHead;
    const matchesHead =
      head !== undefined &&
      head.chainId === observation.provenance.chainId &&
      head.chainKind === observation.provenance.chainKind &&
      head.height === observation.provenance.height &&
      head.locator === observation.provenance.locator &&
      (head.account === undefined || head.account === observation.provenance.account);

    const headStateMatches =
      matchesHead &&
      head !== undefined &&
      head.stateId.toLowerCase() === observation.provenance.stateId.toLowerCase();

    if (observation.provenance.finality === "FINALIZED" && matchesHead && !headStateMatches) {
      const displaced: ChainObservation = {
        ...observation,
        provenance: {
          ...observation.provenance,
          finality: "REORGED",
          supersededBy: observation.observationId
        }
      };
      lineage.push({
        displaced: observation.provenance.stateId,
        displacedObservationId: observation.observationId,
        displacedByObservationId: observation.observationId,
        stateId: head !== undefined ? head.stateId : observation.provenance.stateId
      });
      reorged.push(displaced);
      continue;
    }

    switch (observation.provenance.finality) {
      case "FINALIZED":
        finalized.push(observation);
        break;
      case "PENDING":
        pending.push(observation);
        break;
      case "REORGED":
        reorged.push(observation);
        break;
      case "UNAVAILABLE":
        unavailable.push(observation);
        break;
      case "CHAIN_STALLED":
        stalled.push(observation);
        break;
    }
  }

  if (duplicateCount > 0) {
    exceptions.push(`DUPLICATE_OBSERVATION:${duplicateCount}`);
  }

  const byScope = new Map<string, ChainObservation[]>();
  for (const observation of input.observations) {
    const key = deriveChainObservationScopeKey(observation.provenance);
    const group = byScope.get(key) ?? [];
    group.push(observation);
    byScope.set(key, group);
  }
  for (const [scopeKey, observations] of byScope) {
    const distinctStateIds = new Set(
      observations.map((observation) => observation.provenance.stateId.toLowerCase())
    );
    if (distinctStateIds.size > 1) {
      for (const observation of observations) {
        if (observation.provenance.finality !== "REORGED") {
          conflicting.push(observation);
        }
      }
      exceptions.push(`PROVIDER_DISAGREEMENT:${scopeKey.slice(0, 16)}`);
    }
  }

  const head = input.canonicalHead;
  if (head !== undefined) {
    const headNumber = BigInt(head.height);
    for (const group of byIdentity.values()) {
      const groupChainKind = group[0]?.provenance.chainKind;
      const groupChainId = group[0]?.provenance.chainId;
      const groupLocator = group[0]?.provenance.locator;
      if (
        groupChainKind !== head.chainKind ||
        groupChainId !== head.chainId ||
        groupLocator !== head.locator
      ) {
        continue;
      }
      let maxHeight = 0n;
      for (const observation of group) {
        const height = BigInt(observation.provenance.height);
        if (height > maxHeight) maxHeight = height;
      }
      if (maxHeight < headNumber) {
        exceptions.push(`STALE_HEAD:${head.locator}:${head.height}`);
      }
    }
  }

  const byObservationId = (left: ChainObservation, right: ChainObservation) =>
  left.observationId.localeCompare(right.observationId);

  return {
    finalized: [...finalized].sort(byObservationId),
    pending: [...pending].sort(byObservationId),
    reorged: [...reorged].sort(byObservationId),
    unavailable: [...unavailable].sort(byObservationId),
    stalled: [...stalled].sort(byObservationId),
    conflicting: [...conflicting].sort(byObservationId),
    lineage: [...lineage].sort((left, right) =>
      left.displacedObservationId.localeCompare(right.displacedObservationId)
    ),
    exceptions: [...exceptions].sort()
  };
}

export function deriveObservationSnapshotId(
  observation: ChainObservation,
  sourceId: Ref
): Ref {
  return `snapshot:${sourceId}:${observation.contentHash.slice(2, 18)}`;
}