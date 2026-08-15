import type {
  Attestation,
  Claim,
  EconomicObject,
  Evidence,
  Ref,
  UnixMillis,
  VerificationCheck,
  VerificationOutcome,
  VerificationReceipt
} from "@noema/economic-kernel";
import {
  computeRoots,
  hashUtf8
} from "@noema/canonicalization";
import {
  hashTypedData,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type TypedDataDomain
} from "viem";

export const NOEMA_ATTESTATION_EIP712_DOMAIN = {
  name: "Noema Attestation Registry",
  version: "1",
  chainId: 1952,
  verifyingContract: "0x4200000000000000000000000000000000000021" as Address
} as const;

export const NOEMA_ATTESTATION_TYPES = {
  Attestation: [
    { name: "id", type: "string" },
    { name: "subject", type: "string" },
    { name: "claimRef", type: "string" },
    { name: "schema", type: "string" },
    { name: "attestor", type: "string" },
    { name: "evidenceRoot", type: "string" },
    { name: "issuedAt", type: "uint256" },
    { name: "expiresAt", type: "uint256" }
  ]
} as const;

export interface VerificationContext {
  nowMs: UnixMillis;
  maxEvidenceAgeMs?: number;
  revokedAttestationIds?: ReadonlySet<Ref>;
  contentByEvidenceId?: ReadonlyMap<Ref, string>;
  knownAttestorAddresses?: ReadonlySet<string>;
  domain?: TypedDataDomain;
  validSignatures?: ReadonlySet<string>;
  invalidSignatures?: ReadonlySet<string>;
}

export function toAttestationMessage(attestation: Attestation) {
  return {
    id: attestation.id,
    subject: attestation.subject,
    claimRef: attestation.claimRef,
    schema: attestation.schema,
    attestor: attestation.attestor,
    evidenceRoot: attestation.evidenceRoot ?? "0x0000000000000000000000000000000000000000000000000000000000000000",
    issuedAt: BigInt(attestation.issuedAt),
    expiresAt: BigInt(attestation.expiresAt ?? 0)
  };
}

export function hashAttestationTypedData(
  attestation: Attestation,
  domain: TypedDataDomain = NOEMA_ATTESTATION_EIP712_DOMAIN
): Hex {
  return hashTypedData({
    domain,
    types: NOEMA_ATTESTATION_TYPES,
    primaryType: "Attestation",
    message: toAttestationMessage(attestation)
  });
}

export async function verifyAttestationSignature(
  attestation: Attestation,
  domain: TypedDataDomain = NOEMA_ATTESTATION_EIP712_DOMAIN
): Promise<{ valid: boolean; recoveredAddress?: Address; reason?: string }> {
  try {
    if (!attestation.signature || attestation.signature === "0x") {
      return { valid: false, reason: "Attestation has empty signature" };
    }
    const recovered = await recoverTypedDataAddress({
      domain,
      types: NOEMA_ATTESTATION_TYPES,
      primaryType: "Attestation",
      message: toAttestationMessage(attestation),
      signature: attestation.signature as Hex
    });

    const expected = attestation.attestor.toLowerCase();
    const actual = recovered.toLowerCase();
    if (expected !== actual) {
      return {
        valid: false,
        recoveredAddress: recovered,
        reason: `Signature recovered address ${recovered} does not match declared attestor ${attestation.attestor}`
      };
    }

    return { valid: true, recoveredAddress: recovered };
  } catch (error) {
    return {
      valid: false,
      reason: `EIP-712 recovery failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function check(
  id: Ref,
  type: string,
  subject: Ref,
  result: VerificationOutcome,
  evidence: Ref[],
  context: VerificationContext,
  reason?: string
): VerificationCheck {
  const c: VerificationCheck = {
    id,
    type,
    subject,
    result,
    evidence,
    ruleVersion: "noema-verifier-v1",
    timestamp: context.nowMs,
    ...(reason !== undefined ? { reason } : {})
  };
  return c;
}

export function verifyClaim(
  claim: Claim,
  evidenceById: ReadonlyMap<Ref, Evidence>,
  attestationsById: ReadonlyMap<Ref, Attestation>,
  context: VerificationContext
): VerificationCheck[] {
  const checks: VerificationCheck[] = [];

  if (claim.state === "REVOKED") {
    checks.push(
      check(
        "check:" + claim.id + ":claim-state",
        "CLAIM_STATE",
        claim.id,
        "FAIL",
        claim.evidenceRefs,
        context,
        "Claim is explicitly revoked"
      )
    );
  }

  if (claim.state === "INFERRED") {
    checks.push(
      check(
        "check:" + claim.id + ":inference-boundary",
        "INFERENCE_BOUNDARY",
        claim.id,
        "UNRESOLVED",
        claim.evidenceRefs,
        context,
        "AI inference cannot establish verified state"
      )
    );
  }

  if (claim.state === "CONFLICTING") {
    checks.push(
      check(
        "check:" + claim.id + ":claim-conflict",
        "EVIDENCE_CONFLICT",
        claim.id,
        "FAIL",
        claim.evidenceRefs,
        context,
        "Claim is in conflicting state"
      )
    );
  }

  if (claim.evidenceRefs.length === 0) {
    checks.push(
      check(
        "check:" + claim.id + ":evidence-presence",
        "EVIDENCE_PRESENCE",
        claim.id,
        "FAIL",
        [],
        context,
        "Action-relevant claim has no evidence reference"
      )
    );
    return checks;
  }

  for (const evidenceId of claim.evidenceRefs) {
    const evidence = evidenceById.get(evidenceId);
    if (evidence === undefined) {
      checks.push(
        check(
          "check:" + claim.id + ":evidence:" + evidenceId,
          "EVIDENCE_REFERENCE",
          claim.id,
          "FAIL",
          [evidenceId],
          context,
          "Evidence reference does not resolve"
        )
      );
      continue;
    }

    if (evidence.authority === "AI_INFERENCE") {
      checks.push(
        check(
          "check:" + claim.id + ":authority-boundary:" + evidence.id,
          "AUTHORITY_BOUNDARY",
          claim.id,
          "UNRESOLVED",
          [evidence.id],
          context,
          "AI inference evidence cannot satisfy verification authority requirements"
        )
      );
    }

    const content = context.contentByEvidenceId?.get(evidence.id);
    if (content !== undefined) {
      const expected = hashUtf8(content).toLowerCase();
      const actual = evidence.contentHash.toLowerCase();
      checks.push(
        check(
          "check:" + claim.id + ":content-hash:" + evidence.id,
          "CONTENT_HASH",
          claim.id,
          expected === actual ? "PASS" : "FAIL",
          [evidence.id],
          context,
          expected === actual ? undefined : "Evidence content hash mismatch"
        )
      );
    }

    if (evidence.freshness === "STALE") {
      checks.push(
        check(
          "check:" + claim.id + ":freshness:" + evidence.id,
          "FRESHNESS",
          claim.id,
          "FAIL",
          [evidence.id],
          context,
          "Evidence is explicitly stale"
        )
      );
    } else if (
      context.maxEvidenceAgeMs !== undefined &&
      context.nowMs - evidence.observedAt > context.maxEvidenceAgeMs
    ) {
      checks.push(
        check(
          "check:" + claim.id + ":freshness:" + evidence.id,
          "FRESHNESS",
          claim.id,
          "FAIL",
          [evidence.id],
          context,
          "Evidence exceeds freshness policy"
        )
      );
    } else {
      checks.push(
        check(
          "check:" + claim.id + ":evidence:" + evidence.id,
          "EVIDENCE_AVAILABLE",
          claim.id,
          "PASS",
          [evidence.id],
          context
        )
      );
    }
  }

  for (const attestationId of claim.attestationRefs) {
    const attestation = attestationsById.get(attestationId);
    if (!attestation) {
      checks.push(
        check(
          "check:" + claim.id + ":attestation-presence:" + attestationId,
          "ATTESTATION_PRESENCE",
          claim.id,
          "FAIL",
          [],
          context,
          `Attestation reference ${attestationId} does not resolve`
        )
      );
      continue;
    }

    if (
      attestation.state === "REVOKED" ||
      context.revokedAttestationIds?.has(attestationId) === true
    ) {
      checks.push(
        check(
          "check:" + claim.id + ":attestation:" + attestationId,
          "ATTESTATION_REVOCATION",
          claim.id,
          "FAIL",
          [attestationId],
          context,
          "Attestation is revoked"
        )
      );
      continue;
    }

    if (attestation.expiresAt && context.nowMs > attestation.expiresAt) {
      checks.push(
        check(
          "check:" + claim.id + ":attestation-expiry:" + attestationId,
          "ATTESTATION_EXPIRY",
          claim.id,
          "FAIL",
          [attestationId],
          context,
          "Attestation has expired"
        )
      );
      continue;
    }

    if (
      context.knownAttestorAddresses &&
      !context.knownAttestorAddresses.has(attestation.attestor.toLowerCase())
    ) {
      checks.push(
        check(
          "check:" + claim.id + ":attestor-authority:" + attestationId,
          "ATTESTOR_AUTHORITY",
          claim.id,
          "FAIL",
          [attestationId],
          context,
          `Attestor ${attestation.attestor} is not in authorized attestor registry`
        )
      );
      continue;
    }

    if (context.invalidSignatures?.has(attestation.signature)) {
      checks.push(
        check(
          "check:" + claim.id + ":attestation-signature:" + attestationId,
          "ATTESTATION_SIGNATURE",
          claim.id,
          "FAIL",
          [attestationId],
          context,
          "EIP-712 signature verification failed"
        )
      );
      continue;
    }

    if (context.validSignatures?.has(attestation.signature)) {
      checks.push(
        check(
          "check:" + claim.id + ":attestation-signature:" + attestationId,
          "ATTESTATION_SIGNATURE",
          claim.id,
          "PASS",
          [attestationId],
          context
        )
      );
      continue;
    }

    // Default check for signature presence and structural format
    if (/^0x[0-9a-fA-F]{130}$/.test(attestation.signature)) {
      checks.push(
        check(
          "check:" + claim.id + ":attestation-valid:" + attestationId,
          "ATTESTATION_VALID",
          claim.id,
          "PASS",
          [attestationId],
          context
        )
      );
    } else {
      checks.push(
        check(
          "check:" + claim.id + ":attestation-signature:" + attestationId,
          "ATTESTATION_SIGNATURE",
          claim.id,
          "FAIL",
          [attestationId],
          context,
          "Attestation signature is structurally invalid"
        )
      );
    }
  }

  return checks;
}

export function overallStatus(checks: readonly VerificationCheck[]): VerificationOutcome {
  if (checks.some((item) => item.result === "FAIL")) {
    return "FAIL";
  }
  if (checks.some((item) => item.result === "UNRESOLVED")) {
    return "UNRESOLVED";
  }
  return "PASS";
}

export function verifyEconomicObject(
  object: EconomicObject,
  context: VerificationContext
): VerificationReceipt {
  const evidenceById = new Map(object.evidence.map((item) => [item.id, item]));
  const attestationsById = new Map(object.attestations.map((item) => [item.id, item]));
  const checks = object.claims.flatMap((claim) =>
    verifyClaim(claim, evidenceById, attestationsById, context)
  );
  const roots = computeRoots(object);
  return {
    id: "verification:" + object.id + ":v" + object.version,
    objectId: object.id,
    objectVersion: object.version,
    verifierVersion: "noema-verifier-v1",
    evidenceRoot: roots.evidenceRoot,
    objectRoot: roots.objectRoot,
    checks,
    overallStatus: overallStatus(checks),
    createdAt: context.nowMs
  };
}

export async function verifyEconomicObjectAsync(
  object: EconomicObject,
  context: VerificationContext
): Promise<VerificationReceipt> {
  const validSignatures = new Set<string>(context.validSignatures ?? []);
  const invalidSignatures = new Set<string>(context.invalidSignatures ?? []);

  for (const attestation of object.attestations) {
    if (!validSignatures.has(attestation.signature) && !invalidSignatures.has(attestation.signature)) {
      const res = await verifyAttestationSignature(attestation, context.domain);
      if (res.valid) {
        validSignatures.add(attestation.signature);
      } else {
        invalidSignatures.add(attestation.signature);
      }
    }
  }

  return verifyEconomicObject(object, {
    ...context,
    validSignatures,
    invalidSignatures
  });
}
