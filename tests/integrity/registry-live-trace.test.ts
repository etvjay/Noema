import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashUtf8 } from "@noema/canonicalization";

const RPC = process.env.NOEMA_XLAYER_RPC_URL ?? "https://testrpc.xlayer.tech/terigon";
const REGISTRY = required("NOEMA_XLAYER_REGISTRY_ADDRESS").toLowerCase();
const TX_HASH = required("NOEMA_XLAYER_TRACE_TX_HASH");
const OBJECT_ID = requiredHex32("NOEMA_XLAYER_TRACE_OBJECT_ID");
const OBJECT_ROOT = requiredHex32("NOEMA_XLAYER_TRACE_OBJECT_ROOT");
const EVIDENCE_ROOT = requiredHex32("NOEMA_XLAYER_TRACE_EVIDENCE_ROOT");
const VERSION = BigInt(required("NOEMA_XLAYER_TRACE_VERSION"));
const KIND = (process.env.NOEMA_XLAYER_TRACE_KIND ?? "REGISTER").toUpperCase();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required live-trace environment variable: ${name}`);
  return value;
}

function requiredHex32(name: string): `0x${string}` {
  const value = required(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be bytes32`);
  return value.toLowerCase() as `0x${string}`;
}

async function rpc(method: string, params: unknown[] = []): Promise<any> {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000)
  });
  const body = await response.json() as { result?: any; error?: unknown };
  if (!response.ok || body.error !== undefined) {
    throw new Error(`${method} failed: ${JSON.stringify(body.error ?? body)}`);
  }
  return body.result;
}

function words(data: string): string[] {
  if (!/^0x[0-9a-fA-F]*$/.test(data) || (data.length - 2) % 64 !== 0) {
    throw new Error("Event/call data is not ABI-word aligned");
  }
  const raw = data.slice(2).toLowerCase();
  const out: string[] = [];
  for (let index = 0; index < raw.length; index += 64) out.push(`0x${raw.slice(index, index + 64)}`);
  return out;
}

function selector(signature: string): string {
  return hashUtf8(signature).slice(0, 10);
}

function writeTraceArtifact(receipt: Record<string, unknown>): void {
  const root = process.env.NOEMA_QA_OUT ?? "artifacts/qa";
  const dir = join(root, "registry-live-trace");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "latest.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

describe("NoemaRegistry live X Layer trace", () => {
  it("proves tx -> event -> canonical roots -> object version -> onchain readback", async () => {
    expect(KIND === "REGISTER" || KIND === "UPDATE").toBe(true);
    expect(REGISTRY).toMatch(/^0x[0-9a-f]{40}$/);
    expect(TX_HASH).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const chainId = BigInt(await rpc("eth_chainId"));
    expect(chainId).toBe(1952n);

    const code = await rpc("eth_getCode", [REGISTRY, "latest"]);
    expect(code).not.toBe("0x");

    const txReceipt = await rpc("eth_getTransactionReceipt", [TX_HASH]);
    expect(txReceipt).toBeTruthy();
    expect(BigInt(txReceipt.status)).toBe(1n);
    expect(String(txReceipt.to).toLowerCase()).toBe(REGISTRY);

    const eventSignature = KIND === "REGISTER"
      ? "ObjectRegistered(bytes32,uint64,bytes32,bytes32)"
      : "ObjectUpdated(bytes32,uint64,uint64,bytes32,bytes32)";
    const topic0 = hashUtf8(eventSignature).toLowerCase();
    const event = (txReceipt.logs as any[]).find((log) =>
      String(log.address).toLowerCase() === REGISTRY &&
      String(log.topics?.[0]).toLowerCase() === topic0 &&
      String(log.topics?.[1]).toLowerCase() === OBJECT_ID
    );
    expect(event).toBeTruthy();

    const eventWords = words(event.data);
    const eventVersion = KIND === "REGISTER" ? BigInt(eventWords[0]!) : BigInt(eventWords[1]!);
    const eventObjectRoot = (KIND === "REGISTER" ? eventWords[1] : eventWords[2])!.toLowerCase();
    const eventEvidenceRoot = (KIND === "REGISTER" ? eventWords[2] : eventWords[3])!.toLowerCase();
    expect(eventVersion).toBe(VERSION);
    expect(eventObjectRoot).toBe(OBJECT_ROOT);
    expect(eventEvidenceRoot).toBe(EVIDENCE_ROOT);

    const callData = `${selector("objects(bytes32)")}${OBJECT_ID.slice(2)}`;
    const stateWords = words(await rpc("eth_call", [{ to: REGISTRY, data: callData }, "latest"]));
    expect(stateWords.length).toBeGreaterThanOrEqual(5);
    expect(stateWords[0]!.toLowerCase()).toBe(OBJECT_ROOT);
    expect(stateWords[1]!.toLowerCase()).toBe(EVIDENCE_ROOT);
    expect(BigInt(stateWords[2]!)).toBe(VERSION);
    expect(BigInt(stateWords[4]!)).toBe(1n);

    const latestBlock = BigInt(await rpc("eth_blockNumber"));
    const committedBlock = BigInt(txReceipt.blockNumber);
    expect(committedBlock).toBeLessThanOrEqual(latestBlock);

    writeTraceArtifact({
      kind: "registry-live-trace",
      observedAt: new Date().toISOString(),
      chainId: Number(chainId),
      rpc: RPC,
      registryAddress: REGISTRY,
      transactionHash: TX_HASH,
      blockNumber: Number(committedBlock),
      blockHash: txReceipt.blockHash,
      eventKind: KIND,
      eventLogIndex: Number(BigInt(event.logIndex)),
      objectId: OBJECT_ID,
      version: Number(VERSION),
      objectRoot: OBJECT_ROOT,
      evidenceRoot: EVIDENCE_ROOT,
      onchainReadback: {
        objectRoot: stateWords[0],
        evidenceRoot: stateWords[1],
        version: Number(BigInt(stateWords[2]!)),
        updatedAt: Number(BigInt(stateWords[3]!)),
        active: BigInt(stateWords[4]!) === 1n
      }
    });
  });
});
