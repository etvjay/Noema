import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SourceSnapshot } from "@noema/economic-kernel";
import { ingestSourceSnapshot } from "@noema/noema-core/evidence";

function snapshot(overrides: Partial<SourceSnapshot> = {}): SourceSnapshot {
  return {
    id: "snapshot:issuer:1",
    sourceId: "issuer:1",
    uri: "https://issuer.example/nav.json",
    contentType: "application/json",
    contentHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    fetchedAt: 1_700_000_000_100,
    httpStatus: 200,
    bodyStorageRef: "storage:issuer:1:nav",
    extractionVersion: "source-ingestion-v1",
    ...overrides
  };
}

function replayFixture(): SourceSnapshot {
  const path = fileURLToPath(
    new URL("../../fixtures/evidence/source-snapshot-primary.json", import.meta.url)
  );
  return JSON.parse(readFileSync(path, "utf8")) as SourceSnapshot;
}

describe("Noema source ingestion foundation", () => {
  it("normalizes a source snapshot into typed evidence with authority and provenance metadata", () => {
    const result = ingestSourceSnapshot({
      snapshot: snapshot(),
      evidenceId: "evidence:issuer:1:nav",
      type: "API_RESPONSE",
      authority: "PRIMARY_SOURCE",
      observedAt: 1_700_000_000_000,
      nowMs: 1_700_000_001_000,
      maxAgeMs: 60_000,
      locator: "$.nav",
      metadata: { field: "nav" }
    });

    expect(result.status).toBe("INGESTED");
    if (result.status === "SOURCE_FAILURE") {
      throw new Error("expected successful ingestion");
    }
    expect(result.evidence.source).toBe(result.snapshot.id);
    expect(result.evidence.authority).toBe("PRIMARY_SOURCE");
    expect(result.evidence.contentHash).toBe(result.snapshot.contentHash);
    expect(result.evidence.freshness).toBe("FRESH");
    expect(result.evidence.metadata.bodyStorageRef).toBe(result.snapshot.bodyStorageRef);
  });

  it("replays a committed source snapshot fixture deterministically", () => {
    const input = {
      snapshot: replayFixture(),
      evidenceId: "evidence:issuer:1:nav",
      type: "API_RESPONSE" as const,
      authority: "PRIMARY_SOURCE" as const,
      observedAt: 1_700_000_000_000,
      nowMs: 1_700_000_001_000,
      maxAgeMs: 60_000,
      locator: "$.nav"
    };

    const first = ingestSourceSnapshot(input);
    const second = ingestSourceSnapshot(input);

    expect(first).toEqual(second);
    expect(first.status).toBe("INGESTED");
  });

  it("preserves stale evidence explicitly", () => {
    const result = ingestSourceSnapshot({
      snapshot: snapshot(),
      evidenceId: "evidence:issuer:1:stale-nav",
      type: "API_RESPONSE",
      authority: "PRIMARY_SOURCE",
      observedAt: 1_700_000_000_000,
      nowMs: 1_700_000_100_000,
      maxAgeMs: 10_000
    });

    expect(result.status).toBe("STALE");
    if (result.status === "SOURCE_FAILURE") {
      throw new Error("expected stale evidence, not source failure");
    }
    expect(result.evidence.freshness).toBe("STALE");
  });

  it("represents upstream HTTP failure instead of fabricating evidence", () => {
    const result = ingestSourceSnapshot({
      snapshot: snapshot({ httpStatus: 503 }),
      evidenceId: "evidence:issuer:1:failed",
      type: "API_RESPONSE",
      authority: "PRIMARY_SOURCE",
      observedAt: 1_700_000_000_000,
      nowMs: 1_700_000_001_000
    });

    expect(result.status).toBe("SOURCE_FAILURE");
    if (result.status !== "SOURCE_FAILURE") {
      throw new Error("expected source failure");
    }
    expect(result.reasonCode).toBe("HTTP_FAILURE");
  });

  it("rejects snapshots without immutable content identity", () => {
    const result = ingestSourceSnapshot({
      snapshot: snapshot({ contentHash: "0x" }),
      evidenceId: "evidence:issuer:1:invalid",
      type: "DOCUMENT",
      authority: "PRIMARY_SOURCE",
      observedAt: 1_700_000_000_000,
      nowMs: 1_700_000_001_000
    });

    expect(result.status).toBe("SOURCE_FAILURE");
    if (result.status !== "SOURCE_FAILURE") {
      throw new Error("expected source failure");
    }
    expect(result.reasonCode).toBe("MISSING_CONTENT_HASH");
  });
});
