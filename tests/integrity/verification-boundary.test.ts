import { describe, expect, it } from "vitest";
import { reduceEconomicObject } from "@noema/noema-core";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

const NOW = 1_700_000_001_000;

describe("Noema deterministic verification boundary", () => {
  it("replays identical normalized inputs and context to identical receipts", () => {
    const object = makeEconomicObject();
    const context = { nowMs: NOW, maxEvidenceAgeMs: 3_600_000 };

    const first = verifyEconomicObject(object, context);
    const second = verifyEconomicObject(object, context);

    expect(second).toEqual(first);
    expect(first.overallStatus).toBe("PASS");
    expect(first.hashingVersion).toBe("noema-hashing-v1");
  });

  it("never promotes an inferred claim to verified state", () => {
    const base = makeEconomicObject();
    const claim = base.claims[0]!;
    const inferred = makeEconomicObject({
      claims: [{ ...claim, state: "INFERRED" }]
    });

    const receipt = verifyEconomicObject(inferred, { nowMs: NOW });

    expect(receipt.overallStatus).toBe("UNRESOLVED");
    expect(receipt.checks.some((check) => check.type === "INFERENCE_BOUNDARY" && check.result === "UNRESOLVED")).toBe(true);
    expect(receipt.checks.some((check) => check.result === "PASS")).toBe(true);
  });

  it("fails deterministically for conflicting and stale claim state", () => {
    const base = makeEconomicObject();
    const claim = base.claims[0]!;

    const conflicting = verifyEconomicObject(
      makeEconomicObject({ claims: [{ ...claim, state: "CONFLICTING" }] }),
      { nowMs: NOW }
    );
    expect(conflicting.overallStatus).toBe("FAIL");
    expect(conflicting.checks.some((check) => check.type === "CONFLICT_BOUNDARY" && check.result === "FAIL")).toBe(true);

    const stale = verifyEconomicObject(
      makeEconomicObject({ claims: [{ ...claim, state: "STALE" }] }),
      { nowMs: NOW }
    );
    expect(stale.overallStatus).toBe("FAIL");
    expect(stale.checks.some((check) => check.type === "STALE_BOUNDARY" && check.result === "FAIL")).toBe(true);
  });

  it("fails when evidence is stale by explicit marker or freshness policy", () => {
    const base = makeEconomicObject();
    const evidence = base.evidence[0]!;

    const explicit = verifyEconomicObject(
      makeEconomicObject({ evidence: [{ ...evidence, freshness: "STALE" }] }),
      { nowMs: NOW }
    );
    expect(explicit.overallStatus).toBe("FAIL");
    expect(explicit.checks.some((check) => check.type === "FRESHNESS" && check.result === "FAIL")).toBe(true);

    const aged = verifyEconomicObject(base, {
      nowMs: evidence.observedAt + 10_001,
      maxEvidenceAgeMs: 10_000
    });
    expect(aged.overallStatus).toBe("FAIL");
    expect(aged.checks.some((check) => check.type === "FRESHNESS" && check.result === "FAIL")).toBe(true);
  });

  it("fails when a referenced attestation is revoked and preserves downstream revocation state", () => {
    const base = makeEconomicObject();
    const claim = base.claims[0]!;
    const attestationId = "attestation:fixture:revoked";
    const withAttestation = makeEconomicObject({
      claims: [{ ...claim, attestationRefs: [attestationId] }]
    });

    const receipt = verifyEconomicObject(withAttestation, {
      nowMs: NOW,
      revokedAttestationIds: new Set([attestationId])
    });

    expect(receipt.overallStatus).toBe("FAIL");
    expect(receipt.checks.some((check) => check.type === "ATTESTATION_REVOCATION" && check.result === "FAIL")).toBe(true);

    const reduced = reduceEconomicObject({
      id: withAttestation.id,
      version: withAttestation.version + 1,
      classification: withAttestation.classification,
      identifiers: withAttestation.identifiers,
      representations: withAttestation.representations,
      relationships: withAttestation.relationships,
      parties: withAttestation.parties,
      rights: withAttestation.rights,
      obligations: withAttestation.obligations,
      restrictions: withAttestation.restrictions,
      economics: withAttestation.economics,
      claims: withAttestation.claims,
      evidence: withAttestation.evidence,
      attestations: withAttestation.attestations,
      exceptions: [
        {
          id: "exception:attestation-revoked",
          objectId: withAttestation.id,
          type: "ATTESTATION_REVOKED",
          severity: "BLOCKING",
          affectedClaims: [claim.id],
          evidence: [attestationId],
          detectedAt: NOW,
          status: "OPEN"
        }
      ],
      provenance: withAttestation.provenance,
      createdAt: withAttestation.createdAt,
      updatedAt: NOW,
      verification: {
        status: receipt.overallStatus,
        verifierVersion: receipt.verifierVersion,
        checks: receipt.checks,
        objectRoot: receipt.objectRoot,
        evidenceRoot: receipt.evidenceRoot
      }
    });

    expect(reduced.status).toBe("REVOKED");
    expect(reduced.verification.status).toBe("FAIL");
  });
});
