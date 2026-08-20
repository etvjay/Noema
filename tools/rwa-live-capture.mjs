#!/usr/bin/env node
// Live RWA evidence capture tool for Phase 2 (#35).
//
// Captures first-party HTTP documents and on-chain EVM observations for the
// three shortlisted tokenized US Treasury/Treasury-fund candidates:
//   BENJI (FOBXX, Franklin OnChain U.S. Government Money Fund)
//   OUSG (Ondo Short-Term U.S. Government Bond Fund)
//   TBILL (OpenEden T-Bills)
//
// Uses the canonical source adapters (http-source, evm-source) and the shared
// evidence normalizer (ingestSourceSnapshot) so that every captured snapshot
// follows the same content-addressed, replayable pipeline as the rest of Noema.
//
// Run: node tools/rwa-live-capture.mjs
//
// Outputs:
//   artifacts/phase2/rwa-capture/              release artifact copies
//   experiments/state/noema-live-rwa-capture/  persisted state + immutable bodies
//
// The tool is deterministic: replaying it against the persisted bodies must
// reproduce identical content hashes (see tests/integrity/rwa-live-capture.test.ts).

import { register } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import dns from "node:dns/promises";
import { createHash } from "node:crypto";

register(new URL("../apps/cli/loader.mjs", import.meta.url), import.meta.url);

const { captureHttpSource } = await import("../adapters/http-source/index.ts");
const { captureEvmObservation } = await import("../adapters/evm-source/index.ts");
const { hashBytes, utf8Bytes, stableStorageRef } = await import("../adapters/shared.ts");
const { ingestSourceSnapshot } = await import("../packages/noema-core/src/evidence.ts");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = resolve(ROOT, "experiments/state/noema-live-rwa-capture");
const ARTIFACT_DIR = resolve(ROOT, "artifacts/phase2/rwa-capture");
const BODY_DIR = join(STATE_DIR, "bodies");

const USER_AGENT =
  "Noema Research Agent (noema-research@example.invalid)";
const TIMEOUT_MS = 25_000;
const MAX_BYTES = 8_000_000;
const MAX_REDIRECTS = 5;
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "application/xml",
  "text/xml",
  "application/json",
  "text/plain",
  "application/pdf"
];

const ETH_RPC = "https://ethereum-rpc.publicnode.com";

// ---- candidate manifest ----------------------------------------------------

const CANDIDATES = {
  benji: {
    candidateId: "benji",
    label: "BENJI / FOBXX (Franklin OnChain U.S. Government Money Fund)",
    classification: "FUND_SHARE",
    secondary: "TOKENIZED_MONEY_MARKET_FUND",
    profileRef: "profile:moneymarket-fund-share",
    chainId: 1,
    address: "0x3DDc84940Ab509C11B20B76B466933f40b750dc9",
    sources: [
      {
        sourceId: "source:benji:ethereum:erc20:name",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "name"
      },
      {
        sourceId: "source:benji:ethereum:erc20:symbol",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "symbol"
      },
      {
        sourceId: "source:benji:ethereum:erc20:decimals",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "decimals"
      },
      {
        sourceId: "source:benji:ethereum:erc20:totalSupply",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "totalSupply"
      },
      {
        sourceId: "source:benji:sec:nmfp3-primary-doc",
        kind: "http",
        uri: "https://www.sec.gov/Archives/edgar/data/1786958/000207169126017542/primary_doc.xml",
        authority: "PRIMARY_SOURCE",
        type: "FILING"
      },
      {
        sourceId: "source:benji:sec:filing-index",
        kind: "http",
        uri: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001786958&type=N-MFP&dateb=&owner=include&count=10",
        authority: "PRIMARY_SOURCE",
        type: "FILING"
      }
    ]
  },
  ousg: {
    candidateId: "ousg",
    label: "OUSG (Ondo Short-Term U.S. Government Bond Fund)",
    classification: "WRAPPED_REPRESENTATION",
    secondary: "TOKENIZED_TREASURY",
    profileRef: "profile:treasury-wrapped-representation",
    chainId: 1,
    address: "0x1B19C19393e2d034D8Ff31ff34c81252FcBbee92",
    sources: [
      {
        sourceId: "source:ousg:ethereum:erc20:name",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "name"
      },
      {
        sourceId: "source:ousg:ethereum:erc20:symbol",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "symbol"
      },
      {
        sourceId: "source:ousg:ethereum:erc20:decimals",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "decimals"
      },
      {
        sourceId: "source:ousg:ethereum:erc20:totalSupply",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "totalSupply"
      },
      {
        sourceId: "source:ousg:ondo:overview",
        kind: "http",
        uri: "https://docs.ondo.finance/qualified-access-products/ousg/overview",
        authority: "PRIMARY_SOURCE",
        type: "DOCUMENT"
      },
      {
        sourceId: "source:ousg:ondo:trust-transparency",
        kind: "http",
        uri: "https://docs.ondo.finance/qualified-access-products/ousg/trust-and-transparency",
        authority: "PRIMARY_SOURCE",
        type: "DOCUMENT"
      }
    ]
  },
  tbill: {
    candidateId: "tbill",
    label: "TBILL (OpenEden T-Bills)",
    classification: "DEBT_INSTRUMENT",
    secondary: "TOKENIZED_TREASURY",
    profileRef: "profile:treasury-debt-instrument",
    chainId: 1,
    address: "0xdd50c053c096cb04a3e3362e2b622529ec5f2e8a",
    sources: [
      {
        sourceId: "source:tbill:ethereum:erc20:name",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "name"
      },
      {
        sourceId: "source:tbill:ethereum:erc20:symbol",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "symbol"
      },
      {
        sourceId: "source:tbill:ethereum:erc20:decimals",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "decimals"
      },
      {
        sourceId: "source:tbill:ethereum:erc20:totalSupply",
        kind: "evm",
        uri: ETH_RPC,
        authority: "ONCHAIN_STATE",
        type: "ONCHAIN_STATE",
        locator: "totalSupply"
      },
      {
        sourceId: "source:tbill:openeden:introduction",
        kind: "http",
        uri: "https://docs.openeden.com/tbill/introduction",
        authority: "PRIMARY_SOURCE",
        type: "DOCUMENT"
      },
      {
        sourceId: "source:tbill:openeden:contract-addresses",
        kind: "http",
        uri: "https://docs.openeden.com/tbill/smart-contract-addresses",
        authority: "PRIMARY_SOURCE",
        type: "DOCUMENT"
      }
    ]
  }
};

// ---- HTTP fetcher (injected into captureHttpSource) -----------------------

const fetchedBodies = new Map();

async function httpFetcher(url, { timeoutMs, maxResponseBytes }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        "accept-language": "en-US,en;q=0.9"
      },
      redirect: "manual"
    });

    let redirects = [];
    let currentUrl = url;
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        redirects = [new URL(location, currentUrl).href];
        currentUrl = new URL(location, currentUrl).href;
      }
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxResponseBytes) {
      return {
        status: response.status,
        url: currentUrl,
        headers: Object.fromEntries(response.headers.entries()),
        body: new Uint8Array(0),
        redirects
      };
    }

    const bytes = new Uint8Array(buffer);
    fetchedBodies.set(currentUrl, bytes);
    return {
      status: response.status,
      url: currentUrl,
      headers: Object.fromEntries(response.headers.entries()),
      body: bytes,
      redirects
    };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveHost(hostname) {
  const addresses = await dns.lookup(hostname, { all: true });
  return addresses.map((a) => a.address);
}

// ---- EVM RPC helpers ------------------------------------------------------

async function rpcCall(method, params) {
  const response = await fetch(ETH_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const json = await response.json();
  if (json.error) {
    const err = new Error(json.error.message || "RPC error");
    err.code = "RPC_FAILURE";
    throw err;
  }
  return json.result;
}

const SELECTORS = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd"
};

function decodeAbiString(raw) {
  const offset = parseInt(raw.slice(0, 64), 16) * 2;
  const length = parseInt(raw.slice(offset, offset + 64), 16) * 2;
  return Buffer.from(raw.slice(offset + 64, offset + 64 + length), "hex").toString();
}

function decodeUint(raw) {
  return BigInt("0x" + raw).toString();
}

// ---- capture orchestration --------------------------------------------------

function persistBody(bytes, hint) {
  const fileName = `${hint}.bin`;
  const filePath = join(BODY_DIR, fileName);
  mkdirSync(BODY_DIR, { recursive: true });
  writeFileSync(filePath, bytes);
  return `snapshot-body:${fileName}`;
}

function loadBody(storageRef) {
  const fileName = storageRef.replace("snapshot-body:", "");
  const filePath = join(BODY_DIR, fileName);
  return readFileSync(filePath);
}

async function main() {
  const fetchedAt = Date.now();
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const snapshots = [];
  const failures = [];
  const evidence = [];

  let blockNumber = 0n;
  let blockHash = "0x" + "0".repeat(64);
  const blockResult = await rpcCall("eth_getBlockByNumber", ["latest", false]).catch((e) => {
    failures.push({
      status: "SOURCE_FAILURE",
      sourceId: "source:ethereum:block",
      uri: ETH_RPC,
      code: "RPC_FAILURE",
      message: e.message,
      observedAt: fetchedAt
    });
    return null;
  });
  if (blockResult) {
    blockNumber = BigInt(blockResult.number);
    blockHash = blockResult.hash;
  }

  for (const candidate of Object.values(CANDIDATES)) {
    for (const def of candidate.sources) {
      let result;
      if (def.kind === "evm") {
        const hex = await rpcCall("eth_call", [
          { to: candidate.address, data: SELECTORS[def.locator] },
          "latest"
        ]).catch((e) => {
          failures.push({
            status: "SOURCE_FAILURE",
            sourceId: def.sourceId,
            uri: ETH_RPC,
            code: "RPC_FAILURE",
            message: e.message,
            observedAt: fetchedAt
          });
          return null;
        });
        if (!hex) continue;
        const raw = hex.slice(2);
        const value =
          def.locator === "totalSupply"
            ? decodeUint(raw)
            : def.locator === "decimals"
              ? parseInt("0x" + raw.slice(0, 64), 16).toString()
              : decodeAbiString(raw);

        const metadata = {
          candidateId: candidate.candidateId,
          function: def.locator,
          selector: SELECTORS[def.locator]
        };
        result = captureEvmObservation({
          sourceId: def.sourceId,
          rpcUri: ETH_RPC,
          chainId: candidate.chainId,
          blockNumber,
          blockHash,
          address: candidate.address,
          locator: def.locator,
          value,
          observedAt: fetchedAt,
          fetchedAt,
          metadata
        });

        if (result.status === "CAPTURED") {
          const canonical = JSON.stringify({
            chainId: candidate.chainId,
            blockNumber: blockNumber.toString(),
            blockHash: blockHash.toLowerCase(),
            address: candidate.address.toLowerCase(),
            locator: def.locator,
            value,
            metadata
          });
          persistBody(utf8Bytes(canonical), result.snapshot.bodyStorageRef);
        }
      } else {
        result = await captureHttpSource({
          sourceId: def.sourceId,
          url: def.uri,
          fetchedAt,
          policy: {
            timeoutMs: TIMEOUT_MS,
            maxResponseBytes: MAX_BYTES,
            maxRedirects: MAX_REDIRECTS,
            allowedContentTypes: ALLOWED_CONTENT_TYPES
          },
          fetcher: httpFetcher,
          resolveHost
        });
      }

      if (result.status === "CAPTURED") {
        if (def.kind === "http") {
          const bodyBytes = fetchedBodies.get(result.snapshot.uri) ?? new Uint8Array(0);
          persistBody(bodyBytes, result.snapshot.bodyStorageRef);
        }
        const ingestion = ingestSourceSnapshot({
          snapshot: result.snapshot,
          evidenceId: `evidence:${def.sourceId}:${result.snapshot.contentHash.slice(2, 18)}`,
          type: def.type,
          authority: def.authority,
          observedAt: fetchedAt - 1,
          nowMs: fetchedAt,
          maxAgeMs: 7 * 24 * 60 * 60 * 1000,
          locator: def.locator
        });
        if (ingestion.status === "INGESTED") {
          evidence.push(ingestion.evidence);
        } else {
          failures.push({ status: "SOURCE_FAILURE", sourceId: def.sourceId, uri: def.uri, code: ingestion.reasonCode, message: ingestion.message, observedAt: fetchedAt });
        }
        snapshots.push(result.snapshot);
      } else {
        failures.push(result);
      }
    }
  }

  mkdirSync(STATE_DIR, { recursive: true });
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const manifest = {
    schemaId: "noema:live-rwa-capture-manifest",
    schemaVersion: 1,
    runId,
    capturedAt: new Date(fetchedAt).toISOString(),
    tool: "tools/rwa-live-capture.mjs",
    sourceAdapterVersion: "noema-source-adapter-v1",
    candidates: Object.values(CANDIDATES).map((c) => ({
      candidateId: c.candidateId,
      label: c.label,
      classification: c.classification,
      secondary: c.secondary,
      profileRef: c.profileRef,
      chainId: c.chainId,
      address: c.address
    })),
    sources: Object.values(CANDIDATES).flatMap((c) => c.sources).map((s) => ({
      sourceId: s.sourceId,
      kind: s.kind,
      uri: s.uri,
      authority: s.authority,
      type: s.type,
      locator: s.locator
    }))
  };

  const files = [
    ["manifest.json", manifest],
    ["snapshots.json", snapshots],
    ["evidence.json", evidence],
    ["failures.json", failures]
  ];

  for (const [name, data] of files) {
    const json = JSON.stringify(data, null, 2) + "\n";
    writeFileSync(join(STATE_DIR, name), json);
    writeFileSync(join(ARTIFACT_DIR, name), json);
  }

  const summary = {
    runId,
    capturedAt: new Date(fetchedAt).toISOString(),
    ethereumBlock: blockNumber.toString(),
    ethereumBlockHash: blockHash,
    candidatesCaptured: Object.keys(CANDIDATES).length,
    snapshotsCaptured: snapshots.length,
    evidenceDerived: evidence.length,
    sourceFailures: failures.length,
    snapshotIds: snapshots.map((s) => s.id),
    failureCodes: failures.map((f) => f.code)
  };
  writeFileSync(join(STATE_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(ARTIFACT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});