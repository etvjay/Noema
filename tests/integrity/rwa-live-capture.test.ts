import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ingestSourceSnapshot } from "@noema/noema-core/evidence";
import { captureEvmObservation } from "../../adapters/evm-source/index.js";
import { hashBytes, utf8Bytes } from "../../adapters/shared.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const STATE_DIR = join(HERE, "../../experiments/state/noema-live-rwa-capture");
const BODY_DIR = join(STATE_DIR, "bodies");
const ARTIFACT_DIR = new URL("../../artifacts/phase2/rwa-capture/", import.meta.url);

interface SnapshotJson {
  id: string;
  sourceId: string;
  uri: string;
  contentType: string;
  contentHash: string;
  fetchedAt: number;
  bodyStorageRef: string;
  httpStatus?: number;
  extractionVersion?: string;
}

function readJson<T>(url: URL): T {
  return JSON.parse(readFileSync(url, "utf8")) as T;
}

describe("Phase 2 live RWA capture (#35)", () => {
  const manifest = readJson<{
    schemaId: string;
    schemaVersion: number;
    capturedAt: string;
    candidates: Array<{ candidateId: string; classification: string; chainId: number; address: string }>;
    sources: Array<{ sourceId: string; kind: string; uri: string; authority: string; type: string }>;
  }>(new URL("manifest.json", ARTIFACT_DIR));
  const snapshots = readJson<SnapshotJson[]>(new URL("snapshots.json", ARTIFACT_DIR));
  const evidence = readJson<
    Array<{ id: string; type: string; authority: string; source: string; contentHash: string; locator?: string }>
  >(new URL("evidence.json", ARTIFACT_DIR));
  const failures = readJson<Array<{ code: string; sourceId: string }>>(new URL("failures.json", ARTIFACT_DIR));

  it("captures all three shortlisted candidates with both EVM and HTTP sources", () => {
    expect(manifest.candidates).toHaveLength(3);
    const ids = manifest.candidates.map((c) => c.candidateId).sort();
    expect(ids).toEqual(["benji", "ousg", "tbill"]);

    for (const candidate of manifest.candidates) {
      const candidateSources = manifest.sources.filter((s) => s.sourceId.startsWith(`source:${candidate.candidateId}`));
      const kinds = new Set(candidateSources.map((s) => s.kind));
      expect(kinds.has("evm"), `${candidate.candidateId} must have EVM source`).toBe(true);
      expect(kinds.has("http"), `${candidate.candidateId} must have HTTP source`).toBe(true);
    }
  });

  it("persists one immutable body per snapshot and replay reproduces identical content hashes", () => {
    const bodyFiles = readdirSync(BODY_DIR);
    const byRef = new Map(
      bodyFiles.map((f) => [f.replace(/\.bin$/, ""), readFileSync(join(BODY_DIR, f))])
    );

    expect(snapshots.length).toBeGreaterThanOrEqual(18);
    for (const snapshot of snapshots) {
      const body = byRef.get(snapshot.bodyStorageRef);
      expect(body, `body missing for ${snapshot.id}`).toBeDefined();
      if (body === undefined) continue;
      const recomputed = hashBytes(new Uint8Array(body));
      expect(recomputed, `content hash mismatch for ${snapshot.id}`).toBe(snapshot.contentHash.toLowerCase());
    }
  });

  it("derives evidence only through the shared ingestion normalizer", () => {
    expect(evidence.length).toBe(snapshots.length);
    for (const snapshot of snapshots) {
      const ev = evidence.find((e) => e.source === snapshot.id);
      expect(ev, `no evidence for ${snapshot.id}`).toBeDefined();
      if (ev === undefined) continue;
      expect(ev.contentHash).toBe(snapshot.contentHash);
    }
  });

  it("never lets the capture path assign VERIFIED, equivalence, mandate, or object state", () => {
    for (const ev of evidence) {
      expect(ev.authority).not.toBe("AI_INFERENCE");
      expect(ev).not.toHaveProperty("state");
      expect(ev).not.toHaveProperty("verificationOutcome");
      expect(ev).not.toHaveProperty("mandate");
      expect(ev).not.toHaveProperty("equivalence");
    }
  });

  it("records source failures explicitly instead of fabricating evidence", () => {
    for (const failure of failures) {
      expect(failure.code).toMatch(/^(HTTP_FAILURE|AUTH_FAILURE|TIMEOUT|RESPONSE_TOO_LARGE|RPC_FAILURE|MALFORMED_RESPONSE|UNSUPPORTED_CONTENT_TYPE|INVALID_SOURCE|PRIVATE_NETWORK_BLOCKED|REDIRECT_LIMIT)$/);
    }
    const evidenceSources = new Set(evidence.map((e) => e.source));
    for (const failure of failures) {
      const leaked = snapshots.find((s) => s.sourceId === failure.sourceId);
      if (leaked) {
        expect(evidenceSources.has(leaked.id), `failure ${failure.sourceId} must not leak into evidence`).toBe(false);
      }
    }
  });

  it("preserves EVM block identity and ERC-20 observation semantics", () => {
    const evmSnapshots = snapshots.filter((s) => s.contentType === "application/vnd.noema.evm-observation+json");
    expect(evmSnapshots.length).toBe(12);
    const seen = new Set<string>();
    for (const s of evmSnapshots) {
      seen.add(s.sourceId);
    }
    for (const candidate of ["benji", "ousg", "tbill"]) {
      for (const fn of ["name", "symbol", "decimals", "totalSupply"]) {
        expect(seen.has(`source:${candidate}:ethereum:erc20:${fn}`), `${candidate}.${fn}`).toBe(true);
      }
    }
  });

  it("is replay-stable: re-capturing the same EVM observation yields the same snapshot", () => {
    const manifestBySource = new Map(manifest.sources.map((s) => [s.sourceId, s]));
    const candidatesByPrefix = new Map(manifest.candidates.map((c) => [`source:${c.candidateId}`, c]));
    const evmSnapshot = snapshots.find((s) => s.contentType === "application/vnd.noema.evm-observation+json");
    expect(evmSnapshot).toBeDefined();
    if (evmSnapshot === undefined) return;

    const candidateEntry = [...candidatesByPrefix.entries()].find(([prefix]) =>
      evmSnapshot.sourceId.startsWith(prefix)
    );
    expect(candidateEntry).toBeDefined();
    if (candidateEntry === undefined) return;
    const candidate = candidateEntry[1];

    const locator = evmSnapshot.sourceId.split(":").pop() ?? "";
    const body = readFileSync(join(BODY_DIR, `${evmSnapshot.bodyStorageRef}.bin`));
    const canonical = JSON.parse(Buffer.from(body).toString("utf8"));

    const replay = captureEvmObservation({
      sourceId: evmSnapshot.sourceId,
      rpcUri: evmSnapshot.uri,
      chainId: candidate.chainId,
      blockNumber: BigInt(canonical.blockNumber),
      blockHash: canonical.blockHash,
      address: canonical.address,
      locator,
      value: canonical.value,
      observedAt: evmSnapshot.fetchedAt - 1,
      fetchedAt: evmSnapshot.fetchedAt,
      metadata: canonical.metadata
    });
    expect(replay.status).toBe("CAPTURED");
    if (replay.status !== "CAPTURED") return;
    expect(replay.snapshot.contentHash).toBe(evmSnapshot.contentHash);
    expect(replay.snapshot.id).toBe(evmSnapshot.id);
  });

  it("ingests a stored HTTP snapshot through the shared normalizer with the committed authority", () => {
    const httpSnapshot = snapshots.find((s) => s.sourceId === "source:benji:sec:nmfp3-primary-doc");
    expect(httpSnapshot).toBeDefined();
    if (httpSnapshot === undefined) return;
    const sourceDef = manifest.sources.find((s) => s.sourceId === httpSnapshot?.sourceId);
    expect(sourceDef).toBeDefined();
    if (sourceDef === undefined) return;

    const result = ingestSourceSnapshot({
      snapshot: httpSnapshot as import("@noema/economic-kernel").SourceSnapshot,
      evidenceId: `evidence:test:${httpSnapshot.sourceId}`,
      type: sourceDef.type as "FILING",
      authority: sourceDef.authority as "PRIMARY_SOURCE",
      observedAt: httpSnapshot.fetchedAt - 1,
      nowMs: httpSnapshot.fetchedAt
    });
    expect(result.status).toBe("INGESTED");
    if (result.status !== "INGESTED") return;
    expect(result.evidence.authority).toBe("PRIMARY_SOURCE");
    expect(result.evidence.type).toBe("FILING");
  });
});