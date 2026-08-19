import {
  deriveVenueAttestationId,
  validateVenueAttestationScope,
  venueAttestationTypedData,
  VENUE_ATTESTATION_ENVELOPE_VERSION,
  type VenueEconomicAttestationEnvelope,
  type VenueAttestationPolicy,
  type VenueAttestationDomain
} from "@noema/noema-core/attestation";
import { verifyEip712Signature } from "@noema/canonicalization";
import { privateKeyToAccount } from "viem/accounts";
import { readJsonArtifact } from "../io.js";
import { output, usageError, internalError, EXIT, type CommandOutput } from "../exit.js";

interface AttestationArtifact {
  envelope: VenueEconomicAttestationEnvelope;
  domain?: VenueAttestationDomain;
  policy?: VenueAttestationPolicy;
}

function parseArtifact(input: unknown): AttestationArtifact {
  const record = input as Record<string, unknown>;
  const envelope = record["envelope"];
  if (typeof envelope !== "object" || envelope === null) {
    throw new Error("attestation artifact missing envelope");
  }
  const artifact: AttestationArtifact = { envelope: envelope as VenueEconomicAttestationEnvelope };
  if (typeof record["domain"] === "object" && record["domain"] !== null) {
    artifact.domain = record["domain"] as VenueAttestationDomain;
  }
  if (typeof record["policy"] === "object" && record["policy"] !== null) {
    artifact.policy = record["policy"] as VenueAttestationPolicy;
  }
  return artifact;
}

const DEFAULT_DOMAIN: VenueAttestationDomain = {
  name: "Noema",
  version: "1",
  chainId: 1952,
  verifyingContract: "0x0000000000000000000000000000000000000000"
};

export async function attestationSign(path: string, keyHex?: string): Promise<CommandOutput> {
  if (!path) return usageError("attestation sign requires an artifact path");
  const privateKey = keyHex ?? process.env["NOEMA_ATTESTER_KEY"];
  if (!privateKey) {
    return usageError("attestation sign requires a private key via NOEMA_ATTESTER_KEY env or --key");
  }
  try {
    const artifact = parseArtifact(await readJsonArtifact(path));
    const envelope = artifact.envelope;
    const domain = artifact.domain ?? DEFAULT_DOMAIN;
    const typedData = venueAttestationTypedData(envelope, domain);
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const signature = await account.signTypedData({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message
    } as never);
    return output(EXIT.VALID, "attestation signed", {
      attestationId: envelope.attestationId,
      attestor: account.address,
      signature,
      signedDomain: {
        name: typedData.domain.name,
        version: typedData.domain.version,
        chainId: typedData.domain.chainId,
        verifyingContract: typedData.domain.verifyingContract
      },
      note: "the private key was consumed in memory only and was not printed or persisted"
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("attestation artifact")) {
      return output(EXIT.INVALID, error.message, {});
    }
    return internalError(error);
  }
}

export async function attestationVerify(path: string): Promise<CommandOutput> {
  if (!path) return usageError("attestation verify requires an artifact path");
  try {
    const artifact = parseArtifact(await readJsonArtifact(path));
    const envelope = artifact.envelope;
    const domain = artifact.domain ?? DEFAULT_DOMAIN;
    const policy = artifact.policy ?? {
      venueCapabilities: { [envelope.venueId]: envelope.authorityScope.role },
      trustedAttestors: new Set([envelope.attestor]),
      nowMs: Date.now()
    };
    const scopeVerdict = validateVenueAttestationScope(envelope, policy);
    const typedData = venueAttestationTypedData(envelope, domain);
    const signatureValid = await verifyEip712Signature({
      address: envelope.attestor as `0x${string}`,
      message: typedData.message,
      primaryType: typedData.primaryType,
      types: typedData.types,
      domain: typedData.domain,
      signature: envelope.signature as `0x${string}`
    });
    if (!signatureValid) {
      return output(EXIT.VERIFICATION_FAILURE, "attestation signature is invalid", {
        attestationId: envelope.attestationId,
        attestor: envelope.attestor,
        status: envelope.status
      });
    }
    if (!scopeVerdict.valid) {
      return output(EXIT.INVALID, `attestation scope not allowed`, {
        attestationId: envelope.attestationId,
        scopeStatus: "NOT_ALLOWED",
        reasonCodes: scopeVerdict.reasonCodes
      });
    }
    return output(EXIT.VALID, "attestation signature valid", {
      attestationId: envelope.attestationId,
      attestor: envelope.attestor,
      venueId: envelope.venueId,
      scopeStatus: "ALLOWED",
      status: envelope.status,
      schemaId: envelope.schemaId,
      schemaVersion: envelope.schemaVersion
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("attestation artifact")) {
      return output(EXIT.INVALID, error.message, {});
    }
    return internalError(error);
  }
}

export async function attestationRevokeCheck(path: string): Promise<CommandOutput> {
  if (!path) return usageError("attestation revoke-check requires an artifact path");
  try {
    const artifact = parseArtifact(await readJsonArtifact(path));
    const envelope = artifact.envelope;
    if (envelope.status === "REVOKED") {
      return output(EXIT.INVALID, "attestation is revoked", {
        attestationId: envelope.attestationId,
        revokedAt: envelope.revokedAt,
        status: envelope.status,
        reasonCodes: envelope.reasonCodes
      });
    }
    if (envelope.status === "EXPIRED") {
      return output(EXIT.INVALID, "attestation is expired", {
        attestationId: envelope.attestationId,
        expiresAt: envelope.expiresAt,
        status: envelope.status,
        reasonCodes: envelope.reasonCodes
      });
    }
    if (envelope.status === "SUPERSEDED" || envelope.status === "CONFLICTING") {
      return output(EXIT.UNRESOLVED, `attestation status is ${envelope.status}`, {
        attestationId: envelope.attestationId,
        status: envelope.status,
        supersedes: envelope.supersedes,
        reasonCodes: envelope.reasonCodes
      });
    }
    return output(EXIT.VALID, "attestation is active", {
      attestationId: envelope.attestationId,
      status: envelope.status,
      validFrom: envelope.validFrom,
      validUntil: envelope.validUntil,
      expiresAt: envelope.expiresAt
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("attestation artifact")) {
      return output(EXIT.INVALID, error.message, {});
    }
    return internalError(error);
  }
}

export { deriveVenueAttestationId, VENUE_ATTESTATION_ENVELOPE_VERSION, privateKeyToAccount };