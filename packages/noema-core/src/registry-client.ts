import type { Hex, Ref, UnixMillis } from "@noema/economic-kernel";
import { keccak256, stringToHex } from "viem";

export interface OnchainCommitmentRecord {
  objectIdHex: Hex;
  objectRoot: Hex;
  evidenceRoot: Hex;
  version: number;
  updatedAt: number;
  active: boolean;
  txHash: Hex;
  blockNumber: number;
}

export interface RegistryEvent {
  eventName: "ObjectRegistered" | "ObjectUpdated";
  objectIdHex: Hex;
  version: number;
  objectRoot: Hex;
  evidenceRoot: Hex;
  txHash: Hex;
  blockNumber: number;
}

export class MockXLayerRegistryClient {
  private readonly commitments = new Map<Hex, OnchainCommitmentRecord>();
  private readonly events: RegistryEvent[] = [];
  private currentBlock = 100_000;

  private toBytes32(id: string): Hex {
    return keccak256(stringToHex(id));
  }

  registerObject(
    objectId: Ref,
    objectRoot: Hex,
    evidenceRoot: Hex,
    timestamp = Math.floor(Date.now() / 1000)
  ): { txHash: Hex; blockNumber: number } {
    const idHex = this.toBytes32(objectId);
    if (this.commitments.has(idHex)) {
      throw new Error(`ObjectAlreadyRegistered: ${objectId}`);
    }

    this.currentBlock += 1;
    const txHash = keccak256(stringToHex(`tx:register:${objectId}:${this.currentBlock}`));

    const record: OnchainCommitmentRecord = {
      objectIdHex: idHex,
      objectRoot,
      evidenceRoot,
      version: 1,
      updatedAt: timestamp,
      active: true,
      txHash,
      blockNumber: this.currentBlock
    };

    this.commitments.set(idHex, record);
    this.events.push({
      eventName: "ObjectRegistered",
      objectIdHex: idHex,
      version: 1,
      objectRoot,
      evidenceRoot,
      txHash,
      blockNumber: this.currentBlock
    });

    return { txHash, blockNumber: this.currentBlock };
  }

  updateObject(
    objectId: Ref,
    expectedVersion: number,
    newObjectRoot: Hex,
    newEvidenceRoot: Hex,
    timestamp = Math.floor(Date.now() / 1000)
  ): { txHash: Hex; blockNumber: number } {
    const idHex = this.toBytes32(objectId);
    const existing = this.commitments.get(idHex);
    if (!existing) {
      throw new Error(`ObjectNotFound: ${objectId}`);
    }
    if (existing.version !== expectedVersion) {
      throw new Error(`InvalidExpectedVersion: expected ${expectedVersion}, but stored is ${existing.version}`);
    }

    this.currentBlock += 1;
    const txHash = keccak256(stringToHex(`tx:update:${objectId}:v${expectedVersion + 1}:${this.currentBlock}`));

    existing.objectRoot = newObjectRoot;
    existing.evidenceRoot = newEvidenceRoot;
    existing.version = expectedVersion + 1;
    existing.updatedAt = timestamp;
    existing.txHash = txHash;
    existing.blockNumber = this.currentBlock;

    this.events.push({
      eventName: "ObjectUpdated",
      objectIdHex: idHex,
      version: existing.version,
      objectRoot: newObjectRoot,
      evidenceRoot: newEvidenceRoot,
      txHash,
      blockNumber: this.currentBlock
    });

    return { txHash, blockNumber: this.currentBlock };
  }

  getCommitment(objectId: Ref): OnchainCommitmentRecord | undefined {
    return this.commitments.get(this.toBytes32(objectId));
  }

  getEvents(objectId?: Ref): RegistryEvent[] {
    if (!objectId) return [...this.events];
    const idHex = this.toBytes32(objectId);
    return this.events.filter((e) => e.objectIdHex === idHex);
  }
}
