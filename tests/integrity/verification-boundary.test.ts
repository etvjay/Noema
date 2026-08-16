import { describe, expect, it } from "vitest";
import type { Attestation } from "@noema/economic-kernel";
import { reduceEconomicObject } from "@noema/noema-core";
import {
  NOEMA_ATTESTATION_TYPES,
  noemaAttestationTypedData,
  verifyAttestationAuthority,
  verifyEconomicObject,
  verifyEconomicObjectWithAttestations,
  type AttestationAuthorityPolicy
} from "@noema/verification";
import {
  eip712TestSignerAddress,
  signEip712TestVector
} from "../../packages/canonicalization/src/test-signing.js";
import { makeEconomicObject } from "../helpers.js";

const NOW = 1_700_000_001_000;
const TRUSTED_ATTESTOR = "0x2222222222222222222222222222222222222222";
const OTHER_ATTESTOR = "0x3333333333333333333333333333333333333333";
const INVALID_SIGNATURE = `0x${"11".repeat(65)}`;
const TEST_ONLY_PRIVATE_KEY = `0x${"01".repeat(32)}` as `0x${string}`;

const authorityPolicy: AttestationAuthorityPolicy = {
  domain: {
    name: "Noema",
    version: "1",
    chainId: 1952,
    verifyingContract: "0x1111111111111111111111111111111111111111"
  },
  schema: "noema:attestation:v1",
  trustedAttestors: new Set([TRUSTED_ATTESTOR.toLowerCase()])
};

function makeAttestation(overrides: Partial<Attestation> = {}): Attestation {
  return {
    id: "attestation:fixture:authority",
    subject: "object:fixture",
    claimRef: "claim:fixture:identity",
    schema: authorityPolicy.schema,
    attestor: TRUSTED_ATTESTOR,
    evidenceRoot: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    signature: INVALID_SIGNATURE,
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 60_000,
    state: "ACTIVE",
    ...overrides
  };
}

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

  it("fails closed for malformed, wrong-schema, unknown, revoked, expired, and invalid-signature attestations", async () => {
    const context = { nowMs: NOW };

    const malformed = await verifyAttestationAuthority(
      makeAttestation({ attestor: "not-an-address" }),
      authorityPolicy,
      context
    );
    expect(malformed.result).toBe("FAIL");
    expect(malformed.reason).toContain("valid EVM address");

    const wrongSchema = await verifyAttestationAuthority(
      makeAttestation({ schema: "noema:attestation:v0" }),
      authorityPolicy,
      context
    );
    expect(wrongSchema.result).toBe("FAIL");
    expect(wrongSchema.reason).toContain("schema");

    const unknown = await verifyAttestationAuthority(
      makeAttestation({ attestor: OTHER_ATTESTOR }),
      authorityPolicy,
      context
    );
    expect(unknown.result).toBe("FAIL");
    expect(unknown.reason).toContain("not trusted");

    const revoked = await verifyAttestationAuthority(
      makeAttestation({ state: "REVOKED", revokedAt: NOW - 1 }),
      authorityPolicy,
      context
    );
    expect(revoked.result).toBe("FAIL");
    expect(revoked.reason).toContain("revoked");

    const expired = await verifyAttestationAuthority(
      makeAttestation({ state: "EXPIRED", expiresAt: NOW - 1 }),
      authorityPolicy,
      context
    );
    expect(expired.result).toBe("FAIL");
    expect(expired.reason).toContain("expired");

    const invalidSignature = await verifyAttestationAuthority(
      makeAttestation(),
      authorityPolicy,
      context
    );
    expect(invalidSignature.result).toBe("FAIL");
    expect(invalidSignature.reason).toContain("EIP-712");
  });

  it("binds a real EIP-712 signature to the exact Noema domain, schema, and payload", async () => {
    const signer = eip712TestSignerAddress(TEST_ONLY_PRIVATE_KEY);
    const signedPolicy: AttestationAuthorityPolicy = {
      ...authorityPolicy,
      trustedAttestors: new Set([signer.toLowerCase()])
    };
    const unsigned = makeAttestation({
      attestor: signer,
      signature: INVALID_SIGNATURE
    });
    const typedData = noemaAttestationTypedData(unsigned, signedPolicy.domain);
    const signed = await signEip712TestVector({
      privateKey: TEST_ONLY_PRIVATE_KEY,
      domain: typedData.domain,
      types: NOEMA_ATTESTATION_TYPES,
      primaryType: typedData.primaryType,
      message: typedData.message
    });
    const validAttestation: Attestation = {
      ...unsigned,
      signature: signed.signature
    };

    const valid = await verifyAttestationAuthority(validAttestation, signedPolicy, { nowMs: NOW });
    expect(valid.result).toBe("PASS");
    expect(valid.reason).toBeUndefined();

    const wrongDomain = await verifyAttestationAuthority(
      validAttestation,
      {
        ...signedPolicy,
        domain: {
          ...signedPolicy.domain,
          chainId: 1953
        }
      },
      { nowMs: NOW }
    );
    expect(wrongDomain.result).toBe("FAIL");
    expect(wrongDomain.reason).toContain("EIP-712");

    const payloadMutation = await verifyAttestationAuthority(
      {
        ...validAttestation,
        evidenceRoot: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      },
      signedPolicy,
      { nowMs: NOW }
    );
    expect(payloadMutation.result).toBe("FAIL");
    expect(payloadMutation.reason).toContain("EIP-712");

    const cryptographicSchemaMutation = await verifyAttestationAuthority(
      {
        ...validAttestation,
        schema: "noema:attestation:v2"
      },
      {
        ...signedPolicy,
        schema: "noema:attestation:v2"
      },
      { nowMs: NOW }
    );
    expect(cryptographicSchemaMutation.result).toBe("FAIL");
    expect(cryptographicSchemaMutation.reason).toContain("EIP-712");

    const base = makeEconomicObject();
    const claim = base.claims[0]!;
    const object = makeEconomicObject({
      claims: [{ ...claim, attestationRefs: [validAttestation.id] }],
      attestations: [validAttestation]
    });
    const context = { nowMs: NOW, maxEvidenceAgeMs: 3_600_000 };
    const firstReceipt = await verifyEconomicObjectWithAttestations(object, context, signedPolicy);
    const secondReceipt = await verifyEconomicObjectWithAttestations(object, context, signedPolicy);

    expect(secondReceipt).toEqual(firstReceipt);
    expect(firstReceipt.overallStatus).toBe("PASS");
    expect(firstReceipt.checks.some((check) => check.type === "ATTESTATION_AUTHORITY" && check.result === "PASS")).toBe(true);
  });
});
