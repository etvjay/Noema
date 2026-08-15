import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { TypedDataDomain } from "viem";
import type {
  Attestation,
  Claim,
  EconomicObject,
  Evidence
} from "@noema/economic-kernel";
import {
  verifyEconomicObject,
  verifyEconomicObjectAsync,
  verifyAttestationSignature,
  NOEMA_ATTESTATION_EIP712_DOMAIN,
  NOEMA_ATTESTATION_TYPES
} from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY);

async function signTestAttestation(
  attestation: Omit<Attestation, "signature">,
  domain: TypedDataDomain = NOEMA_ATTESTATION_EIP712_DOMAIN
): Promise<Attestation> {
  const message = {
    id: attestation.id,
    subject: attestation.subject,
    claimRef: attestation.claimRef,
    schema: attestation.schema,
    attestor: attestation.attestor,
    evidenceRoot: attestation.evidenceRoot ?? "0x0000000000000000000000000000000000000000000000000000000000000000",
    issuedAt: BigInt(attestation.issuedAt),
    expiresAt: BigInt(attestation.expiresAt ?? 0)
  };

  const signature = await testAccount.signTypedData({
    domain,
    types: NOEMA_ATTESTATION_TYPES,
    primaryType: "Attestation",
    message
  });

  return {
    ...attestation,
    signature
  };
}

describe("verification boundary and EIP-712 attestation integrity", () => {
  it("proves valid EIP-712 signed attestations pass verification and generate complete receipts", async () => {
    const unsignedAttestation: Omit<Attestation, "signature"> = {
      id: "attestation:ondo:reserves:001",
      subject: "object:ondo:ousg",
      claimRef: "claim:ondo:reserves",
      schema: "schema:reserve-attestation:v1",
      attestor: testAccount.address,
      evidenceRoot: "0x1111111111111111111111111111111111111111111111111111111111111111",
      issuedAt: 1_700_000_000_000,
      expiresAt: 1_700_100_000_000,
      state: "ACTIVE"
    };

    const signedAttestation = await signTestAttestation(unsignedAttestation);

    const sigResult = await verifyAttestationSignature(signedAttestation);
    expect(sigResult.valid).toBe(true);
    expect(sigResult.recoveredAddress?.toLowerCase()).toBe(testAccount.address.toLowerCase());

    const claim: Claim = {
      id: "claim:ondo:reserves",
      subject: "object:ondo:ousg",
      property: "reservesAdequacy",
      value: "100% US Treasuries",
      state: "ATTESTED",
      sourceRefs: ["source:ondo"],
      evidenceRefs: ["evidence:fixture:primary"],
      attestationRefs: [signedAttestation.id],
      createdAt: 1_700_000_000_000
    };

    const object = makeEconomicObject({
      id: "object:ondo:ousg",
      claims: [claim],
      attestations: [signedAttestation]
    });

    const receipt = await verifyEconomicObjectAsync(object, {
      nowMs: 1_700_050_000_000,
      knownAttestorAddresses: new Set([testAccount.address.toLowerCase()])
    });

    expect(receipt.overallStatus).toBe("PASS");
    expect(receipt.checks.length).toBeGreaterThan(0);
    expect(receipt.checks.every((c) => c.result === "PASS")).toBe(true);
    expect(receipt.verifierVersion).toBe("noema-verifier-v1");
  });

  it("fails closed on invalid signature, wrong domain, or forged attestor", async () => {
    const wrongDomain = {
      ...NOEMA_ATTESTATION_EIP712_DOMAIN,
      chainId: 1 // wrong chain ID
    };

    const unsignedAttestation: Omit<Attestation, "signature"> = {
      id: "attestation:forged:001",
      subject: "object:test",
      claimRef: "claim:test",
      schema: "schema:test:v1",
      attestor: testAccount.address,
      issuedAt: 1_700_000_000_000,
      state: "ACTIVE"
    };

    // Signed for wrong domain (e.g. chainId 1 instead of 1952)
    const badDomainAttestation = await signTestAttestation(unsignedAttestation, wrongDomain);

    const sigCheck = await verifyAttestationSignature(badDomainAttestation, NOEMA_ATTESTATION_EIP712_DOMAIN);
    expect(sigCheck.valid).toBe(false);

    // Declaring a different attestor address than the signer
    const forgedAttestorAttestation: Attestation = {
      ...badDomainAttestation,
      attestor: "0x000000000000000000000000000000000000dEaD"
    };

    const object = makeEconomicObject({
      attestations: [forgedAttestorAttestation],
      claims: [
        {
          ...makeEconomicObject().claims[0]!,
          attestationRefs: [forgedAttestorAttestation.id]
        }
      ]
    });

    const receipt = await verifyEconomicObjectAsync(object, {
      nowMs: 1_700_000_000_000
    });

    expect(receipt.overallStatus).toBe("FAIL");
    expect(receipt.checks.some((c) => c.result === "FAIL" && c.type.includes("ATTESTATION"))).toBe(true);
  });

  it("ensures INFERRED claims cannot silently become VERIFIED", () => {
    const inferredClaim: Claim = {
      id: "claim:ai:inferred:exposure",
      subject: "object:test",
      property: "riskProfile",
      value: "LOW_RISK",
      state: "INFERRED",
      sourceRefs: [],
      evidenceRefs: ["evidence:fixture:primary"],
      attestationRefs: [],
      confidence: 0.99,
      createdAt: 1_700_000_000_000
    };

    const object = makeEconomicObject({
      claims: [inferredClaim]
    });

    const receipt = verifyEconomicObject(object, { nowMs: 1_700_000_000_000 });
    expect(receipt.overallStatus).toBe("UNRESOLVED");

    const inferenceCheck = receipt.checks.find((c) => c.type === "INFERENCE_BOUNDARY");
    expect(inferenceCheck).toBeDefined();
    expect(inferenceCheck?.result).toBe("UNRESOLVED");
    expect(inferenceCheck?.reason).toContain("AI inference cannot establish verified state");
  });

  it("fails verification on stale or conflicting evidence and revoked attestations", () => {
    const staleEvidence: Evidence = {
      ...makeEconomicObject().evidence[0]!,
      id: "evidence:stale",
      freshness: "STALE"
    };

    const revokedAttestation: Attestation = {
      id: "attestation:revoked",
      subject: "object:fixture",
      claimRef: "claim:fixture:identity",
      schema: "schema:test:v1",
      attestor: testAccount.address,
      signature: "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890",
      issuedAt: 1_700_000_000_000,
      revokedAt: 1_700_000_050_000,
      state: "REVOKED"
    };

    const object = makeEconomicObject({
      evidence: [staleEvidence],
      attestations: [revokedAttestation],
      claims: [
        {
          ...makeEconomicObject().claims[0]!,
          evidenceRefs: [staleEvidence.id],
          attestationRefs: [revokedAttestation.id]
        }
      ]
    });

    const receipt = verifyEconomicObject(object, {
      nowMs: 1_700_000_100_000,
      revokedAttestationIds: new Set([revokedAttestation.id])
    });

    expect(receipt.overallStatus).toBe("FAIL");
    expect(receipt.checks.some((c) => c.type === "FRESHNESS" && c.result === "FAIL")).toBe(true);
    expect(receipt.checks.some((c) => c.type === "ATTESTATION_REVOCATION" && c.result === "FAIL")).toBe(true);
  });

  it("replays deterministically to identical receipts and checks", () => {
    const object = makeEconomicObject();
    const context = { nowMs: 1_700_000_000_000 };

    const receipt1 = verifyEconomicObject(object, context);
    const receipt2 = verifyEconomicObject(object, context);

    expect(receipt1.overallStatus).toBe(receipt2.overallStatus);
    expect(receipt1.objectRoot).toBe(receipt2.objectRoot);
    expect(receipt1.evidenceRoot).toBe(receipt2.evidenceRoot);
    expect(receipt1.checks).toEqual(receipt2.checks);
  });
});
