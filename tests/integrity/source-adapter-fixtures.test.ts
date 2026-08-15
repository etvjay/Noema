import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { captureDocumentSource } from "../../adapters/document-source/index.js";
import { captureEvmObservation } from "../../adapters/evm-source/index.js";
import { captureHttpSource } from "../../adapters/http-source/index.js";
import { utf8Bytes } from "../../adapters/shared.js";

function readFixture<T>(relative: string): T {
  const path = fileURLToPath(new URL(`../../fixtures/adapters/${relative}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("committed adapter replay fixtures", () => {
  it("replays the HTTP DEMO_FIXTURE deterministically", async () => {
    const fixture = readFixture<any>("http-source-success.json");
    expect(fixture.fixtureKind).toBe("DEMO_FIXTURE");

    const run = () =>
      captureHttpSource({
        sourceId: fixture.sourceId,
        url: fixture.url,
        fetchedAt: fixture.fetchedAt,
        policy: fixture.policy,
        resolveHost: async () => fixture.resolvedAddresses,
        fetcher: async () => ({
          ...fixture.response,
          body: utf8Bytes(fixture.response.bodyUtf8)
        })
      });

    const first = await run();
    const second = await run();
    expect(first).toEqual(second);
    expect(first.status).toBe("CAPTURED");
  });

  it("replays the document DEMO_FIXTURE deterministically", () => {
    const fixture = readFixture<any>("document-source-success.json");
    expect(fixture.fixtureKind).toBe("DEMO_FIXTURE");

    const input = {
      sourceId: fixture.sourceId,
      uri: fixture.uri,
      contentType: fixture.contentType,
      bytes: utf8Bytes(fixture.bodyUtf8),
      fetchedAt: fixture.fetchedAt,
      extractionVersion: fixture.extractionVersion
    };

    expect(captureDocumentSource(input)).toEqual(captureDocumentSource(input));
  });

  it("replays the EVM DEMO_FIXTURE deterministically", () => {
    const fixture = readFixture<any>("evm-source-success.json");
    expect(fixture.fixtureKind).toBe("DEMO_FIXTURE");

    const input = {
      sourceId: fixture.sourceId,
      rpcUri: fixture.rpcUri,
      chainId: fixture.chainId,
      blockNumber: BigInt(fixture.blockNumber),
      blockHash: fixture.blockHash as `0x${string}`,
      address: fixture.address as `0x${string}`,
      locator: fixture.locator,
      value: fixture.value,
      observedAt: fixture.observedAt,
      fetchedAt: fixture.fetchedAt,
      metadata: fixture.metadata
    };

    expect(captureEvmObservation(input)).toEqual(captureEvmObservation(input));
  });
});
