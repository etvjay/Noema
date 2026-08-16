import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashUtf8 } from "@noema/canonicalization";

const RPC = required("NOEMA_XLAYER_RPC_URL");
const REGISTRY = required("NOEMA_XLAYER_REGISTRY_ADDRESS").toLowerCase();
const UPDATE_TX = required("NOEMA_XLAYER_HISTORY_UPDATE_TX_HASH");
const OBJECT_ID = requiredHex32("NOEMA_XLAYER_TRACE_OBJECT_ID");
const V1_OBJECT_ROOT = requiredHex32("NOEMA_XLAYER_TRACE_OBJECT_ROOT");
const V1_EVIDENCE_ROOT = requiredHex32("NOEMA_XLAYER_TRACE_EVIDENCE_ROOT");
const V2_OBJECT_ROOT = requiredHex32("NOEMA_XLAYER_HISTORY_V2_OBJECT_ROOT");
const V2_EVIDENCE_ROOT = requiredHex32("NOEMA_XLAYER_HISTORY_V2_EVIDENCE_ROOT");
const EXPECTED_CHAIN_ID = BigInt(process.env.NOEMA_XLAYER_EXPECTED_CHAIN_ID ?? "1952");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required live-history environment variable: ${name}`);
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
    throw new Error("ABI data is not word aligned");
  }
  const raw = data.slice(2).toLowerCase();
  const out: string[] = [];
  for (let index = 0; index < raw.length; index += 64) out.push(`0x${raw.slice(index, index + 64)}`);
  return out;
}

function selector(signature: string): string {
  return hashUtf8(signature).slice(0, 10);
}

function uintWord(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

async function readCommitment(version: bigint): Promise<string[]> {
  const data = `${selector("commitmentHistory(bytes32,uint64)")}${OBJECT_ID.slice(2)}${uintWord(version)}`;
  return words(await rpc("eth_call", [{ to: REGISTRY, data }, "latest"]));
}

function assertCommitment(actual: string[], objectRoot: string, evidenceRoot: string, version: bigint): void {
  expect(actual.length).toBeGreaterThanOrEqual(5);
  expect(actual[0]!.toLowerCase()).toBe(objectRoot);
  expect(actual[1]!.toLowerCase()).toBe(evidenceRoot);
  expect(BigInt(actual[2]!)).toBe(version);
  expect(BigInt(actual[4]!)).toBe(1n);
}

function writeArtifact(value: Record<string, unknown>): void {
  const root = process.env.NOEMA_QA_OUT ?? "artifacts/qa";
  const dir = join(root, "registry-live-history");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("NoemaRegistry live append-only history", () => {
  it("proves v1 survives after v2 and update event/readback agree", async () => {
    const chainId = BigInt(await rpc("eth_chainId"));
    expect(chainId).toBe(EXPECTED_CHAIN_ID);

    const receipt = await rpc("eth_getTransactionReceipt", [UPDATE_TX]);
    expect(receipt).toBeTruthy();
    expect(BigInt(receipt.status)).toBe(1n);
    expect(String(receipt.to).toLowerCase()).toBe(REGISTRY);

    const topic0 = hashUtf8("ObjectUpdated(bytes32,uint64,uint64,bytes32,bytes32)").toLowerCase();
    const event = (receipt.logs as any[]).find((log) =>
      String(log.address).toLowerCase() === REGISTRY &&
      String(log.topics?.[0]).toLowerCase() === topic0 &&
      String(log.topics?.[1]).toLowerCase() === OBJECT_ID
    );
    expect(event).toBeTruthy();

    const eventWords = words(event.data);
    expect(BigInt(eventWords[0]!)).toBe(1n);
    expect(BigInt(eventWords[1]!)).toBe(2n);
    expect(eventWords[2]!.toLowerCase()).toBe(V2_OBJECT_ROOT);
    expect(eventWords[3]!.toLowerCase()).toBe(V2_EVIDENCE_ROOT);

    const v1 = await readCommitment(1n);
    const v2 = await readCommitment(2n);
    assertCommitment(v1, V1_OBJECT_ROOT, V1_EVIDENCE_ROOT, 1n);
    assertCommitment(v2, V2_OBJECT_ROOT, V2_EVIDENCE_ROOT, 2n);

    const latestData = `${selector("objects(bytes32)")}${OBJECT_ID.slice(2)}`;
    const latest = words(await rpc("eth_call", [{ to: REGISTRY, data: latestData }, "latest"]));
    assertCommitment(latest, V2_OBJECT_ROOT, V2_EVIDENCE_ROOT, 2n);

    writeArtifact({
      kind: "registry-live-history",
      observedAt: new Date().toISOString(),
      chainId: Number(chainId),
      registryAddress: REGISTRY,
      objectId: OBJECT_ID,
      updateTransactionHash: UPDATE_TX,
      blockNumber: Number(BigInt(receipt.blockNumber)),
      v1: { objectRoot: V1_OBJECT_ROOT, evidenceRoot: V1_EVIDENCE_ROOT, version: 1 },
      v2: { objectRoot: V2_OBJECT_ROOT, evidenceRoot: V2_EVIDENCE_ROOT, version: 2 },
      assertion: "historical v1 remained readable and unchanged after v2 append"
    });
  });
});
