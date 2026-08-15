import { describe, expect, it } from "vitest";
import type { Attestation, Evidence, SourceSnapshot } from "@noema/economic-kernel";
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

function makeAttestation(overrides: Partial<Attestation> = {}): Attestation {
  return {
    id: "attestation:fixture:1",
    subject: "object:fixture",
    claimRef: "claim:fixture:identity",
    schema: "noema:test:v1",
    attestor: "attestor:fixture",
    evidenceRoot: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    signature: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    issuedAt: 1_700_000_000_050,
    state: "ACTIVE",
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
    expect(trace.attestations).toEqual([]);
    expect(trace.paths).toEqual([
      {
        evidenceId: object.evidence[0]!.id,
        sourceSnapshotId: snapshot.id,
        sourceId: snapshot.sourceId,
        authority: object.evidence[0]!.authority,
        freshness: "FRESH",
        provenanceEdgeRefs: ["edge:fixture:claim-evidence"]
      }
    ]);

    const report = validateEconomicObjectLineage(object, [snapshot]);
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("exposes a complete DecisionReceipt-ready claim lineage with source authority and attestation", () => {
    const base = makeEconomicObject();
    const claim = base.claims[0];
    if (claim === undefined) throw new Error("fixture claim missing");
    const attestation = makeAttestation();
    const object = makeEconomicObject({
      claims: [{ ...claim, attestationRefs: [attestation.id] }],
      attestations: [attestation]
    });

    const trace = traceClaimLineage(object, [makeSourceSnapshot()], claim.id);

    expect(trace.valid).toBe(true);
    expect(trace.paths[0]).toMatchObject({
      evidenceId: "evidence:fixture:primary",
      sourceSnapshotId: "source:fixture:primary",
      sourceId: "issuer:fixture",
      authority: "DEMO_FIXTURE",
      freshness: "FRESH"
    });
    expect(trace.attestations).toEqual([
      {
        attestationId: attestation.id,
        attestor: attestation.attestor,
        schema: attestation.schema,
        state: "ACTIVE",
        evidenceRoot: attestation.evidenceRoot
      }
    ]);
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

  it("keeps explicitly stale evidence visible in the lineage report", () => {
    const base = makeEconomicObject();
    const staleEvidence = { ...base.evidence[0]!, freshness: "STALE" as const };
    const object = makeEconomicObject({ evidence: [staleEvidence] });
    const snapshot = makeSourceSnapshot({ contentHash: staleEvidence.contentHash });

    const trace = traceClaimLineage(object, [snapshot], object.claims[0]!.id);

    expect(trace.valid).toBe(false);
    expect(trace.paths[0]?.freshness).toBe("STALE");
    expect(trace.issues.some((issue) => issue.code === "EVIDENCE_STALE")).toBe(true);
  });

  it("fails closed when an evidence authority is outside the canonical authority enum", () => {
    const base = makeEconomicObject();
    const invalidEvidence = {
      ...base.evidence[0]!,
      authority: "UNKNOWN_PROVIDER" as Evidence["authority"]
    };
    const object = makeEconomicObject({ evidence: [invalidEvidence] });

    const trace = traceClaimLineage(object, [makeSourceSnapshot()], object.claims[0]!.id);

    expect(trace.valid).toBe(false);
    expect(trace.issues.some((issue) => issue.code === "EVIDENCE_AUTHORITY_UNKNOWN")).toBe(true);
  });

  it("surfaces missing and revoked attestation references without fallback", () => {
    const base = makeEconomicObject();
    const claim = base.claims[0]!;

    const missing = makeEconomicObject({
      claims: [{ ...claim, attestationRefs: ["attestation:missing"] }]
    });
    const missingTrace = traceClaimLineage(missing, [makeSourceSnapshot()], claim.id);
    expect(missingTrace.valid).toBe(false);
    expect(missingTrace.issues.some((issue) => issue.code === "ATTESTATION_REFERENCE_MISSING")).toBe(true);

    const revokedAttestation = makeAttestation({
      state: "REVOKED",
      revokedAt: 1_700_000_000_090
    });
    const revoked = makeEconomicObject({
      claims: [{ ...claim, attestationRefs: [revokedAttestation.id] }],
      attestations: [revokedAttestation]
    });
    const revokedTrace = traceClaimLineage(revoked, [makeSourceSnapshot()], claim.id);
    expect(revokedTrace.valid).toBe(false);
    expect(revokedTrace.attestations[0]?.state).toBe("REVOKED");
    expect(revokedTrace.issues.some((issue) => issue.code === "ATTESTATION_REVOKED")).toBe(true);
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
