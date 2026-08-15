import { describe, expect, it } from "vitest";
import type { SourceSnapshot } from "@noema/economic-kernel";
import {
  traceClaimLineage,
  validateEconomicObjectLineage
} from "@noema/noema-core";
import { makeEconomicObject } from "../helpers.js";

function makeSourceSnapshot(overrides: Partial<SourceSnapshot> = {}): SourceSnapshot {
  const object = makeEconomicObject();
  const evidence = object.evidence[0];
  if (evidence === undefined) {
    throw new Error("fixture evidence missing");
  }

  return {
    id: evidence.source,
    sourceId: "issuer:fixture",
    uri: "https://issuer.example/evidence.json",
    contentType: "application/json",
    contentHash: evidence.contentHash,
    fetchedAt: evidence.fetchedAt,
    httpStatus: 200,
    bodyStorageRef: "storage:fixture:evidence",
    extractionVersion: "fixture-v1",
    ...overrides
  };
}

describe("Noema evidence lineage integrity", () => {
  it("traces a sourced claim through evidence to an immutable source snapshot", () => {
    const object = makeEconomicObject();
    const snapshot = makeSourceSnapshot();
    const claim = object.claims[0];
    if (claim === undefined) {
      throw new Error("fixture claim missing");
    }

    const trace = traceClaimLineage(object, [snapshot], claim.id);

    expect(trace.valid).toBe(true);
    expect(trace.explicitInference).toBe(false);
    expect(trace.issues).toEqual([]);
    expect(trace.paths).toEqual([
      {
        evidenceId: object.evidence[0]!.id,
        sourceSnapshotId: snapshot.id,
        sourceId: snapshot.sourceId,
        authority: object.evidence[0]!.authority,
        provenanceEdgeRefs: ["edge:fixture:claim-evidence"]
      }
    ]);

    const report = validateEconomicObjectLineage(object, [snapshot]);
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("fails when an evidence reference cannot resolve", () => {
    const base = makeEconomicObject();
    const claim = base.claims[0];
    if (claim === undefined) {
      throw new Error("fixture claim missing");
    }
    const object = makeEconomicObject({
      claims: [{ ...claim, evidenceRefs: ["evidence:missing"] }]
    });

    const report = validateEconomicObjectLineage(object, [makeSourceSnapshot()]);

    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === "EVIDENCE_REFERENCE_MISSING")).toBe(true);
  });

  it("fails when source snapshot content does not match evidence content", () => {
    const report = validateEconomicObjectLineage(makeEconomicObject(), [
      makeSourceSnapshot({
        contentHash: "0x2222222222222222222222222222222222222222222222222222222222222222"
      })
    ]);

    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SOURCE_CONTENT_HASH_MISMATCH")).toBe(true);
  });

  it("keeps explicit inference distinct from unsupported sourced fact", () => {
    const base = makeEconomicObject();
    const claim = base.claims[0];
    if (claim === undefined) {
      throw new Error("fixture claim missing");
    }
    const inferred = makeEconomicObject({
      claims: [
        {
          ...claim,
          state: "INFERRED",
          sourceRefs: [],
          evidenceRefs: []
        }
      ],
      provenance: { edges: [] }
    });

    const inferredTrace = traceClaimLineage(inferred, [], claim.id);
    expect(inferredTrace.explicitInference).toBe(true);
    expect(inferredTrace.valid).toBe(true);

    const unsupported = makeEconomicObject({
      claims: [
        {
          ...claim,
          state: "SOURCED",
          sourceRefs: [],
          evidenceRefs: []
        }
      ],
      provenance: { edges: [] }
    });

    const unsupportedTrace = traceClaimLineage(unsupported, [], claim.id);
    expect(unsupportedTrace.valid).toBe(false);
    expect(unsupportedTrace.issues.some((issue) => issue.code === "CLAIM_EVIDENCE_MISSING")).toBe(true);
  });
});
