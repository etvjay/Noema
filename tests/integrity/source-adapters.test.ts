import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureDocumentSource } from "../../adapters/document-source/index.js";
import { captureEvmObservation } from "../../adapters/evm-source/index.js";
import { captureHttpSource } from "../../adapters/http-source/index.js";
import { utf8Bytes } from "../../adapters/shared.js";
import { ingestSourceSnapshot } from "@noema/noema-core/evidence";

interface HttpFixture {
  fixtureKind: "DEMO_FIXTURE";
  sourceId: string;
  url: string;
  fetchedAt: number;
  resolvedAddresses: string[];
  response: {
    status: number;
    url: string;
    headers: Record<string, string>;
    bodyUtf8: string;
    redirects: string[];
  };
  policy: {
    timeoutMs: number;
    maxResponseBytes: number;
    maxRedirects: number;
    allowedContentTypes: string[];
  };
}

interface DocumentFixture {
  fixtureKind: "DEMO_FIXTURE";
  sourceId: string;
  uri: string;
  contentType: string;
  bodyUtf8: string;
  fetchedAt: number;
  extractionVersion: string;
}

interface EvmFixture {
  fixtureKind: "DEMO_FIXTURE";
  sourceId: string;
  rpcUri: string;
  chainId: number;
  blockNumber: string;
  blockHash: `0x${string}`;
  address: `0x${string}`;
  locator: string;
  value: string;
  observedAt: number;
  fetchedAt: number;
  metadata: Record<string, string>;
}

function loadFixture<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as T;
}

const httpFixture = loadFixture<HttpFixture>("../../fixtures/adapters/http-source-success.json");
const documentFixture = loadFixture<DocumentFixture>("../../fixtures/adapters/document-source-success.json");
const evmFixture = loadFixture<EvmFixture>("../../fixtures/adapters/evm-source-success.json");

describe("Noema foundational source adapters", () => {
  it("replays the committed HTTP fixture into the canonical evidence normalizer", async () => {
    expect(httpFixture.fixtureKind).toBe("DEMO_FIXTURE");
    const capture = await captureHttpSource({
      sourceId: httpFixture.sourceId,
      url: httpFixture.url,
      fetchedAt: httpFixture.fetchedAt,
      policy: httpFixture.policy,
      resolveHost: async () => httpFixture.resolvedAddresses,
      fetcher: async () => ({
        ...httpFixture.response,
        body: utf8Bytes(httpFixture.response.bodyUtf8)
      })
    });

    expect(capture.status).toBe("CAPTURED");
    if (capture.status !== "CAPTURED") throw new Error("expected HTTP capture");
    expect(capture.snapshot.httpStatus).toBe(200);
    expect(capture.snapshot.etag).toBe('"fixture-v1"');

    const evidence = ingestSourceSnapshot({
      snapshot: capture.snapshot,
      evidenceId: "evidence:http:fixture",
      type: "API_RESPONSE",
      authority: "DEMO_FIXTURE",
      observedAt: httpFixture.fetchedAt - 500,
      nowMs: httpFixture.fetchedAt,
      maxAgeMs: 60_000,
      locator: "$.nav",
      metadata: { fixtureKind: httpFixture.fixtureKind }
    });
    expect(evidence.status).toBe("INGESTED");
    if (evidence.status === "SOURCE_FAILURE") throw new Error("expected normalized evidence");
    expect(evidence.evidence.authority).toBe("DEMO_FIXTURE");
    expect(evidence.evidence.metadata.fixtureKind).toBe("DEMO_FIXTURE");
  });

  it("blocks private-network HTTP sources before fetch", async () => {
    let fetchCalled = false;
    const result = await captureHttpSource({
      sourceId: "issuer:ssrf",
      url: "http://internal.example/secret",
      fetchedAt: httpFixture.fetchedAt,
      policy: httpFixture.policy,
      resolveHost: async () => ["127.0.0.1"],
      fetcher: async () => {
        fetchCalled = true;
        throw new Error("must not be called");
      }
    });

    expect(result).toMatchObject({ status: "SOURCE_FAILURE", code: "PRIVATE_NETWORK_BLOCKED" });
    expect(fetchCalled).toBe(false);
  });

  it("rejects unsupported HTTP protocols", async () => {
    const result = await captureHttpSource({
      sourceId: "issuer:ftp",
      url: "ftp://issuer.example/nav.json",
      fetchedAt: httpFixture.fetchedAt,
      policy: httpFixture.policy,
      resolveHost: async () => httpFixture.resolvedAddresses,
      fetcher: async () => {
        throw new Error("must not be called");
      }
    });
    expect(result).toMatchObject({ status: "SOURCE_FAILURE", code: "UNSUPPORTED_PROTOCOL" });
  });

  it("rejects unsupported HTTP content types, oversize bodies, excessive redirects, auth failures, and timeouts", async () => {
    const base = {
      sourceId: "issuer:http:failure",
      url: httpFixture.url,
      fetchedAt: httpFixture.fetchedAt,
      policy: httpFixture.policy,
      resolveHost: async () => httpFixture.resolvedAddresses
    };

    const unsupported = await captureHttpSource({
      ...base,
      fetcher: async () => ({
        status: 200,
        url: httpFixture.url,
        headers: { "content-type": "text/html" },
        body: utf8Bytes("<html></html>"),
        redirects: []
      })
    });
    expect(unsupported).toMatchObject({ status: "SOURCE_FAILURE", code: "UNSUPPORTED_CONTENT_TYPE" });

    const oversized = await captureHttpSource({
      ...base,
      policy: { ...httpFixture.policy, maxResponseBytes: 4 },
      fetcher: async () => ({
        status: 200,
        url: httpFixture.url,
        headers: { "content-type": "application/json" },
        body: utf8Bytes("12345"),
        redirects: []
      })
    });
    expect(oversized).toMatchObject({ status: "SOURCE_FAILURE", code: "RESPONSE_TOO_LARGE" });

    const redirected = await captureHttpSource({
      ...base,
      policy: { ...httpFixture.policy, maxRedirects: 1 },
      fetcher: async () => ({
        status: 200,
        url: httpFixture.url,
        headers: { "content-type": "application/json" },
        body: utf8Bytes("{}"),
        redirects: ["https://a.example", "https://b.example"]
      })
    });
    expect(redirected).toMatchObject({ status: "SOURCE_FAILURE", code: "REDIRECT_LIMIT" });

    const auth = await captureHttpSource({
      ...base,
      fetcher: async () => ({
        status: 401,
        url: httpFixture.url,
        headers: { "content-type": "application/json" },
        body: utf8Bytes("{}"),
        redirects: []
      })
    });
    expect(auth).toMatchObject({ status: "SOURCE_FAILURE", code: "AUTH_FAILURE" });

    const timeout = await captureHttpSource({
      ...base,
      fetcher: async () => {
        throw new Error("request timeout");
      }
    });
    expect(timeout).toMatchObject({ status: "SOURCE_FAILURE", code: "TIMEOUT" });
  });

  it("replays the committed document fixture deterministically without interpreting its text", () => {
    expect(documentFixture.fixtureKind).toBe("DEMO_FIXTURE");
    const input = {
      sourceId: documentFixture.sourceId,
      uri: documentFixture.uri,
      contentType: documentFixture.contentType,
      bytes: utf8Bytes(documentFixture.bodyUtf8),
      fetchedAt: documentFixture.fetchedAt,
      extractionVersion: documentFixture.extractionVersion
    };

    const first = captureDocumentSource(input);
    const second = captureDocumentSource(input);
    expect(first).toEqual(second);
    expect(first.status).toBe("CAPTURED");
    if (first.status !== "CAPTURED") throw new Error("expected document capture");

    const evidence = ingestSourceSnapshot({
      snapshot: first.snapshot,
      evidenceId: "evidence:doc:fixture",
      type: "DOCUMENT",
      authority: "DEMO_FIXTURE",
      observedAt: documentFixture.fetchedAt,
      nowMs: documentFixture.fetchedAt,
      metadata: { fixtureKind: documentFixture.fixtureKind }
    });
    expect(evidence.status).toBe("INGESTED");
  });

  it("rejects empty or untyped document captures", () => {
    const empty = captureDocumentSource({
      sourceId: "document:empty",
      uri: "file://empty",
      contentType: "text/plain",
      bytes: new Uint8Array(),
      fetchedAt: documentFixture.fetchedAt
    });
    expect(empty).toMatchObject({ status: "SOURCE_FAILURE", code: "MALFORMED_RESPONSE" });

    const untyped = captureDocumentSource({
      sourceId: "document:untyped",
      uri: "file://untyped",
      contentType: "   ",
      bytes: utf8Bytes("content"),
      fetchedAt: documentFixture.fetchedAt
    });
    expect(untyped).toMatchObject({ status: "SOURCE_FAILURE", code: "UNSUPPORTED_CONTENT_TYPE" });
  });

  it("replays the committed EVM fixture without assigning economic meaning", () => {
    expect(evmFixture.fixtureKind).toBe("DEMO_FIXTURE");
    const input = {
      sourceId: evmFixture.sourceId,
      rpcUri: evmFixture.rpcUri,
      chainId: evmFixture.chainId,
      blockNumber: BigInt(evmFixture.blockNumber),
      blockHash: evmFixture.blockHash,
      address: evmFixture.address,
      locator: evmFixture.locator,
      value: evmFixture.value,
      observedAt: evmFixture.observedAt,
      fetchedAt: evmFixture.fetchedAt,
      metadata: evmFixture.metadata
    };

    const first = captureEvmObservation(input);
    const second = captureEvmObservation(input);
    expect(first).toEqual(second);
    expect(first.status).toBe("CAPTURED");
    if (first.status !== "CAPTURED") throw new Error("expected EVM capture");

    const evidence = ingestSourceSnapshot({
      snapshot: first.snapshot,
      evidenceId: "evidence:evm:fixture",
      type: "ONCHAIN_STATE",
      authority: "DEMO_FIXTURE",
      observedAt: input.observedAt,
      nowMs: evmFixture.fetchedAt,
      metadata: {
        fixtureKind: evmFixture.fixtureKind,
        chainId: evmFixture.chainId,
        blockNumber: evmFixture.blockNumber,
        blockHash: evmFixture.blockHash,
        address: evmFixture.address,
        locator: evmFixture.locator
      }
    });
    expect(evidence.status).toBe("INGESTED");
  });

  it("rejects malformed EVM chain, block, and address identities", () => {
    const base = {
      sourceId: evmFixture.sourceId,
      rpcUri: evmFixture.rpcUri,
      chainId: evmFixture.chainId,
      blockNumber: BigInt(evmFixture.blockNumber),
      blockHash: evmFixture.blockHash,
      address: evmFixture.address,
      locator: evmFixture.locator,
      value: evmFixture.value,
      observedAt: evmFixture.observedAt,
      fetchedAt: evmFixture.fetchedAt
    };

    expect(captureEvmObservation({ ...base, chainId: 0 })).toMatchObject({
      status: "SOURCE_FAILURE",
      code: "INVALID_SOURCE"
    });
    expect(captureEvmObservation({ ...base, blockHash: "0x1234" })).toMatchObject({
      status: "SOURCE_FAILURE",
      code: "MALFORMED_RESPONSE"
    });
    expect(captureEvmObservation({ ...base, address: "0x1234" })).toMatchObject({
      status: "SOURCE_FAILURE",
      code: "MALFORMED_RESPONSE"
    });
  });
});
