import { describe, expect, it } from "vitest";
import type { Evidence, Hex } from "@noema/economic-kernel";
import {
  attestationBindsExactEvidenceState,
  attestationIsFinalitySafe,
  deriveVenueAttestationId,
  resolveVenueAttestationSet,
  summarizeVenueAttestations,
  validateVenueAttestationBinding,
  validateVenueAttestationScope,
  verifyVenueAttestationAuthority,
  VENUE_ATTESTATION_ENVELOPE_VERSION,
  type VenueAttestationPolicy,
  type VenueEconomicAttestationEnvelope
} from "@noema/noema-core/attestation";

const DOMAIN = {
  name: "Noema" as const,
  version: "1",
  chainId: 196,
  verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`
};

const NOW = 1_700_000_000_100;

function evidence(id: string, authority: Evidence["authority"] = "PRIMARY_SOURCE"): Evidence {
  return {
    id,
    schemaId: "noema:evidence",
    schemaVersion: 1,
    type: "API_RESPONSE",
    source: `source:${id}`,
    contentHash: `0x${id.replace(/[^0-9a-f]/g, "").padEnd(64, "0")}`,
    observedAt: NOW - 1000,
    fetchedAt: NOW - 500,
    authority,
    freshness: "FRESH",
    metadata: {}
  };
}

function envelope(overrides: Partial<VenueEconomicAttestationEnvelope> = {}): VenueEconomicAttestationEnvelope {
  return {
    schemaId: "noema:venue-attestation",
    schemaVersion: 1,
    attestationId: "attestation:integrity:1",
    venueId: "venue:transfer-agent",
    attestor: "0x00000000000000000000000000000000000000aa",
    authorityScope: {
      role: "TRANSFER_AGENT",
      propositions: ["SHARE_REGISTER_OWNERSHIP", "SHARE_REGISTER_BALANCE"]
    },
    binding: {
      subjectRef: "representation:integrity:1",
      claimRef: "claim:integrity:1",
      objectRef: "object:integrity",
      objectVersion: 1
    },
    evidenceRefs: [evidence("evidence:integrity:1").id],
    evidenceRoot: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourceRefs: ["snapshot:integrity:1"],
    provenance: {
      chainId: "eip155:1",
      blockNumber: "12345",
      finality: "FINALIZED",
      observedAt: NOW - 1000
    },
    nonce: 1,
    issuedAt: NOW - 500,
    signatureScheme: "EIP-712",
    signatureDomainVersion: "1",
    signature: "0x0000000000000000000000000000000000000000000000000000000000000000",
    status: "ACTIVE",
    reasonCodes: [],
    ...overrides
  };
}

function policy(overrides: Partial<VenueAttestationPolicy> = {}): VenueAttestationPolicy {
  return {
    venueCapabilities: {
      "venue:transfer-agent": "TRANSFER_AGENT",
      "venue:issuer": "ISSUER"
    },
    trustedAttestors: new Set(["0x00000000000000000000000000000000000000aa"]),
    nowMs: NOW,
    ...overrides
  };
}

describe("scoped venue economic attestation envelope integrity", () => {
  it("an attestation cannot self-authorize a venue role it does not hold", () => {
    const unregistered = envelope({ venueId: "venue:unknown" });
    const notRegistered = validateVenueAttestationScope(unregistered, policy());
    expect(notRegistered.valid).toBe(false);
    expect(notRegistered.reasonCodes).toContain("VENUE_NOT_REGISTERED");

    const scopeSelfClaim = envelope({
      authorityScope: { role: "CUSTODIAN", propositions: ["CUSTODY"] }
    });
    const mismatch = validateVenueAttestationScope(scopeSelfClaim, policy());
    expect(mismatch.valid).toBe(false);
    expect(mismatch.reasonCodes[0]?.startsWith("VENUE_ROLE_MISMATCH:")).toBe(true);
  });

  it("an attestor outside the trusted set is never action-authoritative", async () => {
    const impostor = envelope({
      attestor: "0x00000000000000000000000000000000000000bb"
    });
    const result = await verifyVenueAttestationAuthority(impostor, policy(), DOMAIN);
    expect(result.attestorTrusted).toBe(false);
    expect(result.canBeActionAuthoritative).toBe(false);
    expect(result.reasonCodes).toContain("ATTESTOR_UNTRUSTED");
  });

  it("an attestor may not claim propositions beyond its venue role", () => {
    const overreach = envelope({
      authorityScope: {
        role: "TRANSFER_AGENT",
        propositions: ["SHARE_REGISTER_OWNERSHIP", "NAV"]
      }
    });
    const result = validateVenueAttestationScope(overreach, policy());
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain("PROPOSITION_OUT_OF_SCOPE:NAV");
  });

  it("an attestation signed over out-of-scope authority can never be action-authoritative", async () => {
    const overreach = envelope({
      authorityScope: { role: "TRANSFER_AGENT", propositions: ["SHARE_REGISTER_OWNERSHIP", "NAV"] }
    });
    const result = await verifyVenueAttestationAuthority(overreach, policy(), DOMAIN);
    expect(result.scopeValid).toBe(false);
    expect(result.canBeActionAuthoritative).toBe(false);
    expect(result.scopeReasonCodes).toContain("PROPOSITION_OUT_OF_SCOPE:NAV");
  });

  it("signature validity is necessary but never sufficient for action authority", async () => {
    const result = await verifyVenueAttestationAuthority(envelope(), policy(), DOMAIN);
    expect(result.signatureValid).toBe(false);
    expect(result.canBeActionAuthoritative).toBe(false);
    expect(result.reasonCodes).toContain("SIGNATURE_INVALID");
  });

  it("stale, revoked, expired, and superseded attestations never remain active", async () => {
    const revoked = envelope({
      attestationId: "attestation:integrity:revoked",
      status: "REVOKED",
      revokedAt: NOW - 100
    });
    const expired = envelope({
      attestationId: "attestation:integrity:expired",
      status: "ACTIVE",
      expiresAt: NOW - 100
    });
    const superseded = envelope({
      attestationId: "attestation:integrity:superseded",
      status: "SUPERSEDED",
      supersedes: "attestation:integrity:older"
    });

    for (const envelopeRecord of [revoked, expired, superseded]) {
      const result = await verifyVenueAttestationAuthority(envelopeRecord, policy(), DOMAIN);
      expect(result.status).not.toBe("ACTIVE");
      expect(result.canBeActionAuthoritative).toBe(false);
    }

    const resolved = resolveVenueAttestationSet({
      envelopes: [revoked, expired, superseded, envelope({ attestationId: "attestation:integrity:active" })],
      nowMs: NOW
    });
    const activeIds = resolved.active.map((a) => a.attestationId);
    expect(activeIds).not.toContain("attestation:integrity:revoked");
    expect(activeIds).not.toContain("attestation:integrity:expired");
    expect(activeIds).not.toContain("attestation:integrity:superseded");
    expect(activeIds).toContain("attestation:integrity:active");
  });

  it("conflicting valid attestations stay visible as conflicts rather than recency-winning", () => {
    const a = envelope({
      attestationId: "attestation:integrity:a",
      binding: { subjectRef: "representation:integrity:1", objectRef: "object:integrity" }
    });
    const b = envelope({
      attestationId: "attestation:integrity:b",
      binding: { subjectRef: "representation:integrity:1", objectRef: "object:integrity" },
      nonce: 2
    });

    const result = resolveVenueAttestationSet({ envelopes: [a, b], nowMs: NOW });
    expect(result.conflicting).toHaveLength(1);
    expect(result.conflicting[0]).toEqual(
      expect.arrayContaining(["attestation:integrity:a", "attestation:integrity:b"])
    );
    expect(result.active.map((e) => e.attestationId)).toEqual(
      expect.arrayContaining(["attestation:integrity:a", "attestation:integrity:b"])
    );
  });

  it("binding and exact-state checks bind the attestation to its subject and evidence state", () => {
    const root: Hex = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const binding = validateVenueAttestationBinding(envelope(), "representation:integrity:1", "object:integrity");
    expect(binding.valid).toBe(true);

    const mismatched = validateVenueAttestationBinding(envelope(), "representation:integrity:2", "object:integrity");
    expect(mismatched.valid).toBe(false);
    expect(mismatched.reasonCodes).toContain("SUBJECT_MISMATCH");

    expect(attestationBindsExactEvidenceState(envelope(), root)).toBe(true);
    expect(
      attestationBindsExactEvidenceState(envelope(), "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
    ).toBe(false);
  });

  it("replay of the same observation reproduces the same attestation identity", () => {
    const a = deriveVenueAttestationId(envelope());
    const b = deriveVenueAttestationId(envelope());
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("pending evidence is not finality-safe when the policy requires finalization", () => {
    const pending = envelope({
      provenance: { chainId: "eip155:1", blockNumber: "12345", finality: "PENDING", observedAt: NOW - 1000 }
    });
    expect(attestationIsFinalitySafe(pending, true)).toBe(false);
    expect(attestationIsFinalitySafe(envelope(), true)).toBe(true);
  });

  it("summary surfaces active coverage while keeping conflicts/revocations visible", () => {
    const active = envelope({ attestationId: "attestation:integrity:active" });
    const revoked = envelope({
      attestationId: "attestation:integrity:revoked",
      status: "REVOKED",
      revokedAt: NOW - 100
    });
    const summary = summarizeVenueAttestations([active, revoked]);
    expect(summary.activeCount).toBe(1);
    expect(summary.revokedCount).toBe(1);
    expect(summary.coveredPropositions).toEqual(
      expect.arrayContaining(["SHARE_REGISTER_OWNERSHIP", "SHARE_REGISTER_BALANCE"])
    );
  });

  it("envelope version is explicit and stable for downstream consumers", () => {
    expect(VENUE_ATTESTATION_ENVELOPE_VERSION).toBe("noema-venue-attestation-v1");
  });
});
