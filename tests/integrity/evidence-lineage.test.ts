import { describe, expect, it } from "vitest";
import type {
  EconomicObject,
  Evidence,
  SourceSnapshot,
  Claim,
  Attestation
} from "@noema/economic-kernel";
import {
  traceEvidenceLineage,
  createSourceSnapshot,
  createEvidenceRecord,
  createCandidateClaim,
  reduceEconomicObject,
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

describe("evidence lineage integrity", () => {
  it("traverses Claim -> Evidence -> SourceSnapshot -> authority/provenance end to end", () => {
    const rawFiling = JSON.stringify({
      issuer: "Ondo Finance",
      asset: "OUSG",
      nav: "105.42",
      collateral: "Short-Term US Treasuries"
    });

    const snapshot: SourceSnapshot = createSourceSnapshot({
      sourceId: "source:ondo:filing:ousg",
      uri: "https://ondo.finance/reports/ousg-2026.json",
      contentType: "application/json",
      body: rawFiling,
      fetchedAt: 1_700_000_000_000
    });

    const evidence: Evidence = createEvidenceRecord({
      id: "evidence:ondo:ousg:filing",
      type: "FILING",
      source: snapshot.sourceId,
      contentHash: snapshot.contentHash,
      authority: "PRIMARY_SOURCE",
      observedAt: 1_700_000_000_000,
      freshness: "FRESH",
      metadata: { filingType: "MONTHLY_PORTFOLIO" }
    });

    const claim: Claim = createCandidateClaim({
      id: "claim:ousg:nav",
      subject: "object:ondo:ousg",
      property: "nav",
      value: "105.42",
      unit: "USD",
      state: "SOURCED",
      sourceRefs: [snapshot.sourceId],
      evidenceRefs: [evidence.id],
      createdAt: 1_700_000_000_000
    });

    const obj: EconomicObject = makeEconomicObject({
      id: "object:ondo:ousg",
      claims: [claim],
      evidence: [evidence],
      provenance: {
        edges: [
          {
            id: "edge:claim-evidence",
            from: claim.id,
            to: evidence.id,
            relation: "SUPPORTED_BY"
          },
          {
            id: "edge:evidence-source",
            from: evidence.id,
            to: snapshot.sourceId,
            relation: "EXTRACTED_FROM"
          }
        ]
      }
    });

    const trace = traceEvidenceLineage(obj, [snapshot]);

    expect(trace.allActionableClaimsSourced).toBe(true);
    expect(trace.hasBrokenLineage).toBe(false);
    expect(trace.unresolvedEvidenceRefs).toHaveLength(0);
    expect(trace.unresolvedSourceRefs).toHaveLength(0);
    expect(trace.claims).toHaveLength(1);

    const node = trace.claims[0]!;
    expect(node.claimId).toBe(claim.id);
    expect(node.status).toBe("COMPLETE");
    expect(node.evidence[0]!.sourceSnapshot?.uri).toBe("https://ondo.finance/reports/ousg-2026.json");
    expect(node.evidence[0]!.authority).toBe("PRIMARY_SOURCE");
    expect(node.evidence[0]!.contentHash).toBe(snapshot.contentHash);
    expect(node.provenanceEdges.length).toBeGreaterThanOrEqual(1);
  });

  it("prohibits AI inference from masquerading as verified/sourced fact", () => {
    const inferredClaim: Claim = createCandidateClaim({
      id: "claim:inferred:equivalence",
      subject: "object:ondo:ousg",
      property: "relationship:economicEquivalence",
      value: "object:matrixdock:stbt",
      state: "INFERRED",
      sourceRefs: [],
      evidenceRefs: [],
      confidence: 0.95,
      createdAt: 1_700_000_000_000
    });

    const obj = makeEconomicObject({
      claims: [inferredClaim],
      evidence: []
    });

    const trace = traceEvidenceLineage(obj, []);
    expect(trace.inferredClaimIds).toContain(inferredClaim.id);

    const node = trace.claims.find((c) => c.claimId === inferredClaim.id)!;
    expect(node.isInferred).toBe(true);
    expect(node.status).toBe("INFERRED_ONLY");
    expect(node.evidence).toHaveLength(0);
  });

  it("detects broken evidence references deterministically", () => {
    const brokenClaim: Claim = createCandidateClaim({
      id: "claim:broken",
      subject: "object:test",
      property: "reserveProof",
      value: "active",
      state: "SOURCED",
      sourceRefs: ["source:missing"],
      evidenceRefs: ["evidence:non-existent"],
      createdAt: 1_700_000_000_000
    });

    const obj = makeEconomicObject({
      claims: [brokenClaim],
      evidence: []
    });

    const trace = traceEvidenceLineage(obj, []);
    expect(trace.hasBrokenLineage).toBe(true);
    expect(trace.unresolvedEvidenceRefs).toContain("evidence:non-existent");
    expect(trace.allActionableClaimsSourced).toBe(false);

    const node = trace.claims[0]!;
    expect(node.status).toBe("BROKEN");
    expect(node.errors.some((e) => e.includes("not found in EconomicObject"))).toBe(true);
  });

  it("surfaces missing source snapshots without silent fallback", () => {
    const evidenceWithoutSnapshot: Evidence = createEvidenceRecord({
      id: "evidence:unbacked",
      type: "API_RESPONSE",
      source: "source:remote:api",
      contentHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      authority: "MARKET_DATA",
      observedAt: 1_700_000_000_000
    });

    const claim: Claim = createCandidateClaim({
      id: "claim:test",
      subject: "object:test",
      property: "marketPrice",
      value: "100.00",
      state: "SOURCED",
      sourceRefs: ["source:remote:api"],
      evidenceRefs: [evidenceWithoutSnapshot.id],
      createdAt: 1_700_000_000_000
    });

    const obj = makeEconomicObject({
      claims: [claim],
      evidence: [evidenceWithoutSnapshot]
    });

    // Provide empty snapshots list
    const trace = traceEvidenceLineage(obj, []);
    expect(trace.unresolvedSourceRefs).toContain("source:remote:api");
    expect(trace.allActionableClaimsSourced).toBe(false);

    const node = trace.claims[0]!;
    expect(node.status).toBe("PARTIAL");
    expect(node.evidence[0]!.sourceSnapshot).toBeUndefined();
  });

  it("flags stale evidence and revoked attestations explicitly", () => {
    const staleEvidence: Evidence = createEvidenceRecord({
      id: "evidence:stale:oracle",
      type: "ORACLE",
      source: "source:chainlink:stale",
      contentHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
      authority: "INDEPENDENT_ORACLE",
      observedAt: 1_600_000_000_000,
      freshness: "STALE"
    });

    const revokedAttestation: Attestation = {
      id: "attestation:revoked:1",
      subject: "object:test",
      claimRef: "claim:with:revocation",
      schema: "schema:custody-proof:v1",
      attestor: "attestor:auditor",
      signature: "0x4444444444444444444444444444444444444444444444444444444444444444",
      issuedAt: 1_700_000_000_000,
      revokedAt: 1_700_000_100_000,
      state: "REVOKED"
    };

    const claim: Claim = createCandidateClaim({
      id: "claim:with:revocation",
      subject: "object:test",
      property: "custodyVerified",
      value: true,
      state: "SOURCED",
      sourceRefs: ["source:chainlink:stale"],
      evidenceRefs: [staleEvidence.id],
      attestationRefs: [revokedAttestation.id],
      createdAt: 1_700_000_000_000
    });

    const snapshot = createSourceSnapshot({
      sourceId: "source:chainlink:stale",
      uri: "https://oracle.chainlink.com/stale-feed",
      contentType: "application/json",
      body: "{}",
      fetchedAt: 1_600_000_000_000
    });

    const obj = makeEconomicObject({
      claims: [claim],
      evidence: [staleEvidence],
      attestations: [revokedAttestation]
    });

    const trace = traceEvidenceLineage(obj, [snapshot]);
    expect(trace.staleEvidenceIds).toContain(staleEvidence.id);

    const node = trace.claims[0]!;
    expect(node.evidence[0]!.isStale).toBe(true);
    expect(node.attestations[0]!.state).toBe("REVOKED");
    expect(node.status).toBe("STALE");
    expect(node.errors.some((e) => e.includes("is REVOKED"))).toBe(true);


  });
});

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

