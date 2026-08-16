import type {
  DecisionReceipt,
  EconomicObject,
  Ref,
  VerificationReceipt
} from "@noema/economic-kernel";
import type { EconomicObjectLineageReport } from "./index.js";

export const MACHINE_SURFACE_VERSION = "noema-machine-v1";

export interface CanonicalNoemaSnapshot {
  object: EconomicObject;
  verification: VerificationReceipt;
  decision: DecisionReceipt;
  lineage?: EconomicObjectLineageReport;
}

export interface RestNoemaSnapshot {
  schemaVersion: typeof MACHINE_SURFACE_VERSION;
  snapshot: CanonicalNoemaSnapshot;
}

export interface McpNoemaResource {
  uri: string;
  mimeType: "application/vnd.noema.snapshot+json";
  schemaVersion: typeof MACHINE_SURFACE_VERSION;
  snapshot: CanonicalNoemaSnapshot;
}

export interface MachineSourceFailure {
  status: "SOURCE_FAILURE";
  sourceId: Ref;
  code: string;
  message: string;
  unavailable: true;
}

export interface ExternalProviderObservationEnvelope {
  status: "OBSERVATION_ONLY";
  sourceSnapshotId: Ref;
  evidenceId: Ref;
  authority: string;
}

function cloneSnapshot(snapshot: CanonicalNoemaSnapshot): CanonicalNoemaSnapshot {
  return structuredClone(snapshot);
}

export function toRestSnapshot(snapshot: CanonicalNoemaSnapshot): RestNoemaSnapshot {
  return {
    schemaVersion: MACHINE_SURFACE_VERSION,
    snapshot: cloneSnapshot(snapshot)
  };
}

export function fromSdkSnapshot(snapshot: CanonicalNoemaSnapshot): CanonicalNoemaSnapshot {
  return toRestSnapshot(snapshot).snapshot;
}

export function toMcpResource(snapshot: CanonicalNoemaSnapshot): McpNoemaResource {
  return {
    uri: `noema://objects/${encodeURIComponent(snapshot.object.id)}/versions/${snapshot.object.version}`,
    mimeType: "application/vnd.noema.snapshot+json",
    schemaVersion: MACHINE_SURFACE_VERSION,
    snapshot: cloneSnapshot(snapshot)
  };
}

export function machineSourceFailure(
  sourceId: Ref,
  code: string,
  message: string
): MachineSourceFailure {
  return {
    status: "SOURCE_FAILURE",
    sourceId,
    code,
    message,
    unavailable: true
  };
}

export function externalProviderObservationEnvelope(input: {
  sourceSnapshotId: Ref;
  evidenceId: Ref;
  authority: string;
}): ExternalProviderObservationEnvelope {
  return {
    status: "OBSERVATION_ONLY",
    sourceSnapshotId: input.sourceSnapshotId,
    evidenceId: input.evidenceId,
    authority: input.authority
  };
}
