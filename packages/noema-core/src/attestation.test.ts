import { describe, expect, it } from "vitest";
import type { Evidence } from "@noema/economic-kernel";
import {
  authorityScopeAllows,
  attestationBindsExactEvidenceState,
  attestationIsFinalitySafe,
  deriveVenueAttestationId,
  resolveVenueAttestationSet,
  summarizeVenueAttestations,
  validateVenueAttestationBinding,
  validateVenueAttestationScope,
  venueAttestationSigningProjection,
  venueAttestationTypedData,
  venuePropositionScope,
  verifyVenueAttestationAuthority,
  VENUE_ATTESTATION_ENVELOPE_VERSION,
  type VenueAttestationPolicy,
  type VenueEconomicAttestationEnvelope
} from "./attestation.js";

const DOMAIN = {
  name: "Noema" as const,
  version: "1",
  chainId: 196,
  verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`
};

function envelope(overrides: Partial<VenueEconomicAttestationEnvelope> = {}): VenueEconomicAttestationEnvelope {
  return {
    schemaId: "noema:venue-attestation",
    schemaVersion: 1,
    attestationId: "attestation:fixture:1",
    venueId: "venue:transfer-agent",
    attestor: "0x00000000000000000000000000000000000000aa",
    authorityScope: {
      role: "TRANSFER_AGENT",
      propositions: ["SHARE_REGISTER_OWNERSHIP", "SHARE_REGISTER_BALANCE"]
    },
    binding: {
      subjectRef: "representation:fixture:1",
      claimRef: "claim:fixture:1",
      objectRef: "object:fixture",
      objectVersion: 1
    },
    evidenceRefs: ["evidence:fixture:1"],
    evidenceRoot: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourceRefs: ["snapshot:fixture:1"],
    provenance: {
      chainId: "eip155:1",
      blockNumber: "12345",
      finality: "FINALIZED",
      observedAt: 1_700_000_000_000
    },
    nonce: 1,
    issuedAt: 1_700_000_000_000,
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
      "venue:custodian": "CUSTODIAN",
      "venue:issuer": "ISSUER"
    },
    trustedAttestors: new Set(["0x00000000000000000000000000000000000000aa"]),
    nowMs: 1_700_000_000_100,
    ...overrides
  };
}

describe("venue proposition scope", () => {
  it("restricts each venue role to its own proposition scope", () => {
    expect(venuePropositionScope("TRANSFER_AGENT")).toContain("SHARE_REGISTER_OWNERSHIP");
    expect(venuePropositionScope("TRANSFER_AGENT")).not.toContain("NAV");
    expect(venuePropositionScope("CUSTODIAN")).toContain("CUSTODY");
    expect(venuePropositionScope("CUSTODIAN")).not.toContain("SHARE_REGISTER_OWNERSHIP");
    expect(venuePropositionScope("FUND_ADMINISTRATOR")).toContain("NAV");
  });

  it("authorityScopeAllows respects both declared and role-allowed propositions", () => {
    const scope = envelope().authorityScope;
    expect(authorityScopeAllows(scope, "SHARE_REGISTER_OWNERSHIP")).toBe(true);
    expect(authorityScopeAllows(scope, "NAV")).toBe(false);
    expect(authorityScopeAllows(scope, "CUSTODY")).toBe(false);
  });
});

describe("scope validation", () => {
  it("rejects an unregistered venue", () => {
    const result = validateVenueAttestationScope(
      envelope({ venueId: "venue:unknown" }),
      policy()
    );
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain("VENUE_NOT_REGISTERED");
  });

  it("rejects a venue attesting with a role it does not hold", () => {
    const result = validateVenueAttestationScope(
      envelope({
        venueId: "venue:transfer-agent",
        authorityScope: { role: "CUSTODIAN", propositions: ["CUSTODY"] }
      }),
      policy()
    );
    expect(result.valid).toBe(false);
    expect(result.reasonCodes.some((code) => code.startsWith("VENUE_ROLE_MISMATCH:"))).toBe(true);
  });

  it("rejects propositions outside the venue's authority scope", () => {
    const result = validateVenueAttestationScope(
      envelope({
        authorityScope: {
          role: "TRANSFER_AGENT",
          propositions: ["SHARE_REGISTER_OWNERSHIP", "NAV"]
        }
      }),
      policy()
    );
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain("PROPOSITION_OUT_OF_SCOPE:NAV");
  });

  it("accepts a correctly scoped attestation", () => {
    const result = validateVenueAttestationScope(envelope(), policy());
    expect(result.valid).toBe(true);
    expect(result.reasonCodes).toContain("SCOPE_VALID");
  });

  it("validates binding against subject and object", () => {
    const ok = validateVenueAttestationBinding(envelope(), "representation:fixture:1", "object:fixture");
    expect(ok.valid).toBe(true);

    const wrongSubject = validateVenueAttestationBinding(envelope(), "representation:other", "object:fixture");
    expect(wrongSubject.valid).toBe(false);
    expect(wrongSubject.reasonCodes).toContain("SUBJECT_MISMATCH");

    const wrongObject = validateVenueAttestationBinding(envelope(), "representation:fixture:1", "object:other");
    expect(wrongObject.valid).toBe(false);
    expect(wrongObject.reasonCodes).toContain("OBJECT_MISMATCH");
  });
});

describe("signing projection and id", () => {
  it("derives a deterministic attestation id from the signing projection", () => {
    const a = deriveVenueAttestationId(envelope());
    const b = deriveVenueAttestationId(envelope());
    const c = deriveVenueAttestationId(envelope({ nonce: 2 }));
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a).not.toBe(c);
  });

  it("produces domain-separated, version-aware typed data", () => {
    const typed = venueAttestationTypedData(envelope(), DOMAIN);
    expect(typed.primaryType).toBe("VenueEconomicAttestation");
    expect(typed.domain.version).toBe("1");
    expect(typed.domain.chainId).toBe(196);
    expect(typed.message.attestor).toBe("0x00000000000000000000000000000000000000aa");
    expect(typed.message.authorityScopeRole).toBe("TRANSFER_AGENT");
    expect(typed.message.objectVersion).toBe(1n);
  });

  it("includes explicit version constants in the signing projection", () => {
    const projection = venueAttestationSigningProjection(envelope());
    expect(projection.domain).toBe("noema:venue-attestation:v1");
    expect(projection.schemaVersion).toBe(1);
    expect(VENUE_ATTESTATION_ENVELOPE_VERSION).toBe("noema-venue-attestation-v1");
  });
});

describe("authority verification", () => {
  it("rejects an invalid signature as not action-authoritative (signature never sufficient)", async () => {
    const result = await verifyVenueAttestationAuthority(envelope(), policy(), DOMAIN);
    expect(result.signatureValid).toBe(false);
    expect(result.canBeActionAuthoritative).toBe(false);
    expect(result.reasonCodes).toContain("SIGNATURE_INVALID");
  });

  it("rejects attestations from attestors outside the trusted set", async () => {
    const impostor = envelope({ attestor: "0x00000000000000000000000000000000000000bb" });
    const result = await verifyVenueAttestationAuthority(impostor, policy(), DOMAIN);
    expect(result.attestorTrusted).toBe(false);
    expect(result.canBeActionAuthoritative).toBe(false);
    expect(result.reasonCodes).toContain("ATTESTOR_UNTRUSTED");
  });

  it("fails closed on wrong scope even with a valid-looking status", async () => {
    const outOfScope = envelope({
      authorityScope: { role: "TRANSFER_AGENT", propositions: ["NAV"] }
    });
    const result = await verifyVenueAttestationAuthority(outOfScope, policy(), DOMAIN);
    expect(result.scopeValid).toBe(false);
    expect(result.canBeActionAuthoritative).toBe(false);
    expect(result.scopeReasonCodes).toContain("PROPOSITION_OUT_OF_SCOPE:NAV");
  });

  it("rejects expired attestations from remaining action-authoritative", async () => {
    const expired = envelope({
      status: "EXPIRED",
      expiresAt: 1_700_000_000_050
    });
    const result = await verifyVenueAttestationAuthority(expired, policy(), DOMAIN);
    expect(result.status).toBe("EXPIRED");
    expect(result.canBeActionAuthoritative).toBe(false);
    expect(result.reasonCodes).toContain("ATTESTATION_EXPIRED");
  });

  it("rejects revoked attestations", async () => {
    const revoked = envelope({ status: "REVOKED", revokedAt: 1_700_000_000_050 });
    const result = await verifyVenueAttestationAuthority(revoked, policy(), DOMAIN);
    expect(result.status).toBe("REVOKED");
    expect(result.canBeActionAuthoritative).toBe(false);
    expect(result.reasonCodes).toContain("ATTESTATION_REVOKED");
  });

  it("rejects attestations that are not yet valid or past their validity window", async () => {
    const notYet = envelope({ validFrom: 1_700_000_000_200 });
    const resultNotYet = await verifyVenueAttestationAuthority(notYet, policy(), DOMAIN);
    expect(resultNotYet.status).toBe("EXPIRED");
    expect(resultNotYet.reasonCodes).toContain("NOT_YET_VALID");

    const past = envelope({ validUntil: 1_700_000_000_050 });
    const resultPast = await verifyVenueAttestationAuthority(past, policy(), DOMAIN);
    expect(resultPast.reasonCodes).toContain("PAST_VALID_UNTIL");
  });

  it("rejects superseded attestations", async () => {
    const superseded = envelope({ status: "SUPERSEDED", supersedes: "attestation:older" });
    const result = await verifyVenueAttestationAuthority(superseded, policy(), DOMAIN);
    expect(result.status).toBe("SUPERSEDED");
    expect(result.canBeActionAuthoritative).toBe(false);
    expect(result.reasonCodes).toContain("ATTESTATION_SUPERSEDED");
  });
});

describe("attestation set resolution", () => {
  it("resolves supersession and revocation deterministically and replayably", () => {
    const now = 1_700_000_000_100;
    const older = envelope({ attestationId: "attestation:older", nonce: 1 });
    const newer = envelope({ attestationId: "attestation:newer", nonce: 2, supersedes: "attestation:older" });
    const revoked = envelope({ attestationId: "attestation:revoked", status: "REVOKED", revokedAt: now - 10 });
    const expired = envelope({ attestationId: "attestation:expired", status: "EXPIRED", expiresAt: now - 10 });

    const first = resolveVenueAttestationSet({ envelopes: [newer, older, revoked, expired], nowMs: now });
    const second = resolveVenueAttestationSet({ envelopes: [revoked, expired, older, newer], nowMs: now });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.superseded).toContain("attestation:older");
    expect(first.revoked).toContain("attestation:revoked");
    expect(first.expired).toContain("attestation:expired");
    expect(first.active.map((e) => e.attestationId)).toContain("attestation:newer");
  });

  it("does not let expired or revoked attestations remain active", () => {
    const now = 1_700_000_000_100;
    const expired = envelope({ attestationId: "attestation:expired", status: "ACTIVE", expiresAt: now - 10 });
    const result = resolveVenueAttestationSet({ envelopes: [expired], nowMs: now });
    expect(result.active.map((e) => e.attestationId)).not.toContain("attestation:expired");
    expect(result.expired).toContain("attestation:expired");
  });

  it("keeps conflicting valid attestations conflicting instead of selecting by recency", () => {
    const now = 1_700_000_000_100;
    const a = envelope({ attestationId: "attestation:conflict-a", nonce: 1, status: "ACTIVE" });
    const b = envelope({ attestationId: "attestation:conflict-b", nonce: 2, status: "ACTIVE" });

    const result = resolveVenueAttestationSet({ envelopes: [a, b], nowMs: now });
    expect(result.conflicting).toHaveLength(1);
    expect(result.conflicting[0]).toEqual(
      expect.arrayContaining(["attestation:conflict-a", "attestation:conflict-b"])
    );
  });

  it("treats a revokes link as removing the target", () => {
    const now = 1_700_000_000_100;
    const target = envelope({ attestationId: "attestation:target", status: "ACTIVE" });
    const revoker = envelope({
      attestationId: "attestation:revoker",
      revokes: "attestation:target"
    });

    const result = resolveVenueAttestationSet({ envelopes: [target, revoker], nowMs: now });
    expect(result.revoked).toContain("attestation:target");
    expect(result.active.map((e) => e.attestationId)).not.toContain("attestation:target");
  });
});

describe("exact state binding and finality", () => {
  it("binds attestation to exact evidence/source state", () => {
    const root = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(attestationBindsExactEvidenceState(envelope({ evidenceRoot: root }), root)).toBe(true);
    expect(attestationBindsExactEvidenceState(envelope({ evidenceRoot: root }), "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc")).toBe(false);
  });

  it("rejects pending/unfinalized evidence when a finalized policy is required", () => {
    const pending = envelope({ provenance: { ...envelope().provenance, finality: "PENDING" } });
    expect(attestationIsFinalitySafe(pending, true)).toBe(false);
    expect(attestationIsFinalitySafe(envelope(), true)).toBe(true);
    expect(attestationIsFinalitySafe(pending, false)).toBe(true);
  });
});

describe("summary", () => {
  it("summarizes venue attestation coverage", () => {
    const now = 1_700_000_000_100;
    const active = envelope({ attestationId: "attestation:a" });
    const revoked = envelope({ attestationId: "attestation:b", status: "REVOKED" });
    const summary = summarizeVenueAttestations([active, revoked]);
    expect(summary.activeCount).toBe(1);
    expect(summary.revokedCount).toBe(1);
    expect(summary.coveredPropositions).toEqual(
      expect.arrayContaining(["SHARE_REGISTER_OWNERSHIP", "SHARE_REGISTER_BALANCE"])
    );
    void now;
  });
});