import type {
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

export interface VerificationContext {
  nowMs: UnixMillis;
  maxEvidenceAgeMs?: number;
  revokedAttestationIds?: ReadonlySet<Ref>;
  contentByEvidenceId?: ReadonlyMap<Ref, string>;
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

export function verifyClaim(
  claim: Claim,
  evidenceById: ReadonlyMap<Ref, Evidence>,
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
    if (context.revokedAttestationIds?.has(attestationId) === true) {
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
    }
  }

  return checks;
}

function overallStatus(checks: readonly VerificationCheck[]): VerificationOutcome {
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
  const checks = object.claims.flatMap((claim) =>
    verifyClaim(claim, evidenceById, context)
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
