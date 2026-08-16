import type { Hex, Ref } from "@noema/economic-kernel";

export interface RegistryCommitment {
  objectId: Ref;
  objectRoot: Hex;
  evidenceRoot: Hex;
  version: number;
  active: true;
}

export interface ObjectRegisteredEvent {
  type: "ObjectRegistered";
  objectId: Ref;
  version: 1;
  objectRoot: Hex;
  evidenceRoot: Hex;
}

export interface ObjectUpdatedEvent {
  type: "ObjectUpdated";
  objectId: Ref;
  previousVersion: number;
  newVersion: number;
  objectRoot: Hex;
  evidenceRoot: Hex;
}

export interface RegistryModelState {
  commitments: RegistryCommitment[];
  events: Array<ObjectRegisteredEvent | ObjectUpdatedEvent>;
}

export function registerRegistryCommitment(input: {
  objectId: Ref;
  objectRoot: Hex;
  evidenceRoot: Hex;
}): RegistryModelState {
  if (!input.objectRoot || /^0x0+$/.test(input.objectRoot)) {
    throw new Error("Invalid objectRoot");
  }
  if (!input.evidenceRoot || /^0x0+$/.test(input.evidenceRoot)) {
    throw new Error("Invalid evidenceRoot");
  }
  const commitment: RegistryCommitment = {
    objectId: input.objectId,
    objectRoot: input.objectRoot,
    evidenceRoot: input.evidenceRoot,
    version: 1,
    active: true
  };
  return {
    commitments: [commitment],
    events: [
      {
        type: "ObjectRegistered",
        objectId: input.objectId,
        version: 1,
        objectRoot: input.objectRoot,
        evidenceRoot: input.evidenceRoot
      }
    ]
  };
}

export function updateRegistryCommitment(
  state: RegistryModelState,
  input: {
    objectId: Ref;
    expectedVersion: number;
    objectRoot: Hex;
    evidenceRoot: Hex;
  }
): RegistryModelState {
  const current = state.commitments.at(-1);
  if (current === undefined || current.objectId !== input.objectId) {
    throw new Error("ObjectNotFound");
  }
  if (current.version !== input.expectedVersion) {
    throw new Error("InvalidExpectedVersion");
  }
  if (!input.objectRoot || /^0x0+$/.test(input.objectRoot)) {
    throw new Error("Invalid objectRoot");
  }
  if (!input.evidenceRoot || /^0x0+$/.test(input.evidenceRoot)) {
    throw new Error("Invalid evidenceRoot");
  }
  const next: RegistryCommitment = {
    objectId: current.objectId,
    objectRoot: input.objectRoot,
    evidenceRoot: input.evidenceRoot,
    version: current.version + 1,
    active: true
  };
  return {
    commitments: [...structuredClone(state.commitments), next],
    events: [
      ...structuredClone(state.events),
      {
        type: "ObjectUpdated",
        objectId: current.objectId,
        previousVersion: current.version,
        newVersion: next.version,
        objectRoot: input.objectRoot,
        evidenceRoot: input.evidenceRoot
      }
    ]
  };
}
