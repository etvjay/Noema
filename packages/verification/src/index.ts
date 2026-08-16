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
  HASHING_VERSION,
  computeRoots,
  hashUtf8,
  verifyEip712Signature
} from "@noema/canonicalization";

export interface VerificationContext {
  nowMs: UnixMillis;
  maxEvidenceAgeMs?: number;
  revokedAttestationIds?: ReadonlySet<Ref>;
  contentByEvidenceId?: ReadonlyMap<Ref, string>;
}

export interface NoemaAttestationDomain {
  name: "Noema";
  version: string;
  chainId: number;
  verifyingContract: `0x${string}`;
}

export interface AttestationAuthorityPolicy {
  domain: NoemaAttestationDomain;
  schema: string;
  trustedAttestors: ReadonlySet<string>;
}

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export const NOEMA_ATTESTATION_TYPES = {
  NoemaAttestation: [
    { name: "attestationId", type: "string" },
    { name: "subject", type: "string" },
    { name: "claimRef", type: "string" },
    { name: "schema", type: "string" },
    { name: "attestor", type: "address" },
    { name: "evidenceRoot", type: "bytes32" },
    { name: "issuedAt", type: "uint256" },
    { name: "expiresAt", type: "uint256" }
  ]
} as const;

export function noemaAttestationTypedData(
  attestation: Attestation,
  domain: NoemaAttestationDomain
) {
  return {
    domain,
    types: NOEMA_ATTESTATION_TYPES,
    primaryType: "NoemaAttestation" as const,
    message: {
      attestationId: attestation.id,
      subject: attestation.subject,
      claimRef: attestation.claimRef,
      schema: attestation.schema,
      attestor: attestation.attestor as `0x${string}`,
      evidenceRoot: (attestation.evidenceRoot ?? ZERO_BYTES32) as `0x${string}`,
      issuedAt: BigInt(attestation.issuedAt),
      expiresAt: BigInt(attestation.expiresAt ?? 0)
    }
  };
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
  return {
    id,
    type,
    subject,
    result,
    evidence,
    ruleVersion: "noema-verifier-v1",
    timestamp: context.nowMs,
    ...(reason === undefined ? {} : { reason })
  };
}

export async function verifyAttestationAuthority(
  attestation: Attestation,
  policy: AttestationAuthorityPolicy,
  context: VerificationContext
): Promise<VerificationCheck> {
  const id = `check:${attestation.claimRef}:attestation-authority:${attestation.id}`;

  if (!/^0x[0-9a-fA-F]{40}$/.test(attestation.attestor)) {
    return check(id, "ATTESTATION_AUTHORITY", attestation.claimRef, "FAIL", [attestation.id], context, "Attestor is not a valid EVM address");
  }
  if (attestation.schema !== policy.schema) {
    return check(id, "ATTESTATION_AUTHORITY", attestation.claimRef, "FAIL", [attestation.id], context, "Attestation schema does not match adopted schema");
  }
  if (!policy.trustedAttestors.has(attestation.attestor.toLowerCase())) {
    return check(id, "ATTESTATION_AUTHORITY", attestation.claimRef, "FAIL", [attestation.id], context, "Attestor is not trusted by the active authority policy");
  }
  if (attestation.state === "REVOKED" || attestation.revokedAt !== undefined) {
    return check(id, "ATTESTATION_AUTHORITY", attestation.claimRef, "FAIL", [attestation.id], context, "Attestation is revoked");
  }
  if (attestation.state === "EXPIRED" || (attestation.expiresAt !== undefined && attestation.expiresAt < context.nowMs)) {
    return check(id, "ATTESTATION_AUTHORITY", attestation.claimRef, "FAIL", [attestation.id], context, "Attestation is expired");
  }

  let validSignature = false;
  try {
    validSignature = await verifyEip712Signature({
      address: attestation.attestor as `0x${string}`,
      ...noemaAttestationTypedData(attestation, policy.domain),
      signature: attestation.signature as `0x${string}`
    });
  } catch {
    validSignature = false;
  }

  return check(
    id,
    "ATTESTATION_AUTHORITY",
    attestation.claimRef,
    validSignature ? "PASS" : "FAIL",
    [attestation.id],
    context,
    validSignature ? undefined : "EIP-712 attestation signature is invalid for the adopted domain/schema"
  );
}

export function verifyClaim(
  claim: Claim,
  evidenceById: ReadonlyMap<Ref, Evidence>,
  context: VerificationContext
): VerificationCheck[] {
  const checks: VerificationCheck[] = [];

  if (claim.state === "REVOKED") {
    checks.push(check(`check:${claim.id}:claim-state`, "CLAIM_STATE", claim.id, "FAIL", claim.evidenceRefs, context, "Claim is explicitly revoked"));
  }
  if (claim.state === "CONFLICTING") {
    checks.push(check(`check:${claim.id}:conflict-boundary`, "CONFLICT_BOUNDARY", claim.id, "FAIL", claim.evidenceRefs, context, "Conflicting claim state cannot establish verified state"));
  }
  if (claim.state === "STALE") {
    checks.push(check(`check:${claim.id}:stale-boundary`, "STALE_BOUNDARY", claim.id, "FAIL", claim.evidenceRefs, context, "Stale claim state cannot establish verified state"));
  }
  if (claim.state === "INFERRED") {
    checks.push(check(`check:${claim.id}:inference-boundary`, "INFERENCE_BOUNDARY", claim.id, "UNRESOLVED", claim.evidenceRefs, context, "AI inference cannot establish verified state"));
  }
  if (claim.evidenceRefs.length === 0) {
    checks.push(check(`check:${claim.id}:evidence-presence`, "EVIDENCE_PRESENCE", claim.id, "FAIL", [], context, "Action-relevant claim has no evidence reference"));
    return checks;
  }

  for (const evidenceId of claim.evidenceRefs) {
    const evidence = evidenceById.get(evidenceId);
    if (evidence === undefined) {
      checks.push(check(`check:${claim.id}:evidence:${evidenceId}`, "EVIDENCE_REFERENCE", claim.id, "FAIL", [evidenceId], context, "Evidence reference does not resolve"));
      continue;
    }

    const content = context.contentByEvidenceId?.get(evidence.id);
    if (content !== undefined) {
      const expected = hashUtf8(content).toLowerCase();
      const actual = evidence.contentHash.toLowerCase();
      checks.push(check(`check:${claim.id}:content-hash:${evidence.id}`, "CONTENT_HASH", claim.id, expected === actual ? "PASS" : "FAIL", [evidence.id], context, expected === actual ? undefined : "Evidence content hash mismatch"));
    }

    if (evidence.freshness === "STALE") {
      checks.push(check(`check:${claim.id}:freshness:${evidence.id}`, "FRESHNESS", claim.id, "FAIL", [evidence.id], context, "Evidence is explicitly stale"));
    } else if (context.maxEvidenceAgeMs !== undefined && context.nowMs - evidence.observedAt > context.maxEvidenceAgeMs) {
      checks.push(check(`check:${claim.id}:freshness:${evidence.id}`, "FRESHNESS", claim.id, "FAIL", [evidence.id], context, "Evidence exceeds freshness policy"));
    } else {
      checks.push(check(`check:${claim.id}:evidence:${evidence.id}`, "EVIDENCE_AVAILABLE", claim.id, "PASS", [evidence.id], context));
    }
  }

  for (const attestationId of claim.attestationRefs) {
    if (context.revokedAttestationIds?.has(attestationId) === true) {
      checks.push(check(`check:${claim.id}:attestation:${attestationId}`, "ATTESTATION_REVOCATION", claim.id, "FAIL", [attestationId], context, "Attestation is revoked"));
    }
  }

  return checks;
}

function overallStatus(checks: readonly VerificationCheck[]): VerificationOutcome {
  if (checks.some((item) => item.result === "FAIL")) return "FAIL";
  if (checks.some((item) => item.result === "UNRESOLVED")) return "UNRESOLVED";
  return "PASS";
}

export function verifyEconomicObject(
  object: EconomicObject,
  context: VerificationContext
): VerificationReceipt {
  const evidenceById = new Map(object.evidence.map((item) => [item.id, item]));
  const checks = object.claims.flatMap((claim) => verifyClaim(claim, evidenceById, context));
  const roots = computeRoots(object);
  return {
    id: `verification:${object.id}:v${object.version}`,
    objectId: object.id,
    objectVersion: object.version,
    verifierVersion: "noema-verifier-v1",
    hashingVersion: HASHING_VERSION,
    evidenceRoot: roots.evidenceRoot,
    objectRoot: roots.objectRoot,
    checks,
    overallStatus: overallStatus(checks),
    createdAt: context.nowMs
  };
}

export async function verifyEconomicObjectWithAttestations(
  object: EconomicObject,
  context: VerificationContext,
  policy: AttestationAuthorityPolicy
): Promise<VerificationReceipt> {
  const base = verifyEconomicObject(object, context);
  const attestationChecks = await Promise.all(
    object.attestations.map((attestation) => verifyAttestationAuthority(attestation, policy, context))
  );
  const checks = [...base.checks, ...attestationChecks].sort((left, right) => left.id.localeCompare(right.id));
  return {
    ...base,
    checks,
    overallStatus: overallStatus(checks)
  };
}
