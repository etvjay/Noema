import type {
  DecisionReceipt,
  EconomicObject,
  Mandate,
  MandateDecision,
  PolicyCheck,
  Ref,
  UnixMillis,
  VerificationReceipt
} from "@noema/economic-kernel";

export const POLICY_ENGINE_VERSION = "noema-policy-v1";

export interface MandateEvaluationContext {
  nowMs: UnixMillis;
  policyEngineVersion?: string;
  allowConditionalOnWarnings?: boolean;
}

export function evaluateMandate(
  object: EconomicObject,
  verification: VerificationReceipt,
  mandate: Mandate,
  context: MandateEvaluationContext = { nowMs: Date.now() }
): DecisionReceipt {
  const policyEngineVersion = context.policyEngineVersion ?? POLICY_ENGINE_VERSION;
  const policyChecks: PolicyCheck[] = [];
  const reasonCodes: string[] = [];
  const supportingClaims: Ref[] = [];

  // 1. Mandate expiration check
  if (mandate.expiresAt !== undefined && context.nowMs > mandate.expiresAt) {
    policyChecks.push({
      ruleId: "rule:mandate:validity",
      result: "FAIL",
      claimRefs: [],
      evidenceRefs: [],
      reasonCode: "MANDATE_EXPIRED"
    });
    reasonCodes.push("MANDATE_EXPIRED");
  } else {
    policyChecks.push({
      ruleId: "rule:mandate:validity",
      result: "PASS",
      claimRefs: [],
      evidenceRefs: [],
      reasonCode: "MANDATE_ACTIVE"
    });
  }

  // 2. Verification check
  if (verification.overallStatus === "FAIL") {
    policyChecks.push({
      ruleId: "rule:verification:status",
      result: "FAIL",
      claimRefs: verification.checks.map((c) => c.subject),
      evidenceRefs: verification.checks.flatMap((c) => c.evidence),
      reasonCode: "VERIFICATION_FAILED"
    });
    reasonCodes.push("VERIFICATION_FAILED");
  } else if (verification.overallStatus === "UNRESOLVED") {
    policyChecks.push({
      ruleId: "rule:verification:status",
      result: "UNRESOLVED",
      claimRefs: verification.checks.map((c) => c.subject),
      evidenceRefs: verification.checks.flatMap((c) => c.evidence),
      reasonCode: "VERIFICATION_UNRESOLVED"
    });
    reasonCodes.push("VERIFICATION_UNRESOLVED");
  } else {
    policyChecks.push({
      ruleId: "rule:verification:status",
      result: "PASS",
      claimRefs: [],
      evidenceRefs: [],
      reasonCode: "VERIFICATION_PASSED"
    });
  }

  // 3. Object state check
  if (["REVOKED", "CONFLICTING", "INSUFFICIENT_EVIDENCE"].includes(object.status)) {
    policyChecks.push({
      ruleId: "rule:object:state",
      result: "FAIL",
      claimRefs: object.claims.map((c) => c.id),
      evidenceRefs: object.evidence.map((e) => e.id),
      reasonCode: `OBJECT_STATUS_${object.status}`
    });
    reasonCodes.push(`OBJECT_STATUS_${object.status}`);
  } else if (object.status === "STALE") {
    policyChecks.push({
      ruleId: "rule:object:state",
      result: "FAIL",
      claimRefs: object.claims.map((c) => c.id),
      evidenceRefs: object.evidence.map((e) => e.id),
      reasonCode: "OBJECT_STATUS_STALE"
    });
    reasonCodes.push("OBJECT_STATUS_STALE");
  } else if (object.status === "PARTIALLY_RESOLVED") {
    policyChecks.push({
      ruleId: "rule:object:state",
      result: "UNRESOLVED",
      claimRefs: object.claims.map((c) => c.id),
      evidenceRefs: object.evidence.map((e) => e.id),
      reasonCode: "OBJECT_PARTIALLY_RESOLVED"
    });
    reasonCodes.push("OBJECT_PARTIALLY_RESOLVED");
  } else {
    policyChecks.push({
      ruleId: "rule:object:state",
      result: "PASS",
      claimRefs: [],
      evidenceRefs: [],
      reasonCode: "OBJECT_RESOLVED"
    });
  }

  // 4. Prohibited Asset Classes
  if (mandate.prohibitedAssetClasses.includes(object.classification.primary)) {
    policyChecks.push({
      ruleId: "rule:asset-class:prohibited",
      result: "FAIL",
      claimRefs: [object.classification.claimRef],
      evidenceRefs: [],
      reasonCode: "PROHIBITED_ASSET_CLASS"
    });
    reasonCodes.push("PROHIBITED_ASSET_CLASS");
  } else {
    policyChecks.push({
      ruleId: "rule:asset-class:prohibited",
      result: "PASS",
      claimRefs: [object.classification.claimRef],
      evidenceRefs: [],
      reasonCode: "NOT_PROHIBITED"
    });
  }

  // 5. Allowed Asset Classes
  if (mandate.allowedAssetClasses.length > 0) {
    const isAllowed =
      mandate.allowedAssetClasses.includes(object.classification.primary) ||
      object.classification.secondary.some((sec) => mandate.allowedAssetClasses.includes(sec));

    if (!isAllowed) {
      policyChecks.push({
        ruleId: "rule:asset-class:allowed",
        result: "FAIL",
        claimRefs: [object.classification.claimRef],
        evidenceRefs: [],
        reasonCode: "ASSET_CLASS_NOT_ALLOWED"
      });
      reasonCodes.push("ASSET_CLASS_NOT_ALLOWED");
    } else {
      policyChecks.push({
        ruleId: "rule:asset-class:allowed",
        result: "PASS",
        claimRefs: [object.classification.claimRef],
        evidenceRefs: [],
        reasonCode: "ASSET_CLASS_ALLOWED"
      });
      supportingClaims.push(object.classification.claimRef);
    }
  }

  // 6. Required Claims
  for (const req of mandate.requiredClaims) {
    const matchingClaim = object.claims.find((c) => c.property === req.property);
    if (!matchingClaim) {
      policyChecks.push({
        ruleId: `rule:required-claim:${req.property}`,
        result: "FAIL",
        claimRefs: [],
        evidenceRefs: [],
        reasonCode: `MISSING_REQUIRED_CLAIM_${req.property.toUpperCase()}`
      });
      reasonCodes.push(`MISSING_REQUIRED_CLAIM_${req.property.toUpperCase()}`);
    } else if (matchingClaim.state !== req.requiredState) {
      policyChecks.push({
        ruleId: `rule:required-claim:${req.property}`,
        result: matchingClaim.state === "INFERRED" ? "UNRESOLVED" : "FAIL",
        claimRefs: [matchingClaim.id],
        evidenceRefs: matchingClaim.evidenceRefs,
        reasonCode: `CLAIM_STATE_MISMATCH_${req.property.toUpperCase()}`
      });
      reasonCodes.push(`CLAIM_STATE_MISMATCH_${req.property.toUpperCase()}`);
    } else {
      policyChecks.push({
        ruleId: `rule:required-claim:${req.property}`,
        result: "PASS",
        claimRefs: [matchingClaim.id],
        evidenceRefs: matchingClaim.evidenceRefs,
        reasonCode: `REQUIRED_CLAIM_${req.property.toUpperCase()}_SATISFIED`
      });
      supportingClaims.push(matchingClaim.id);
    }
  }

  // 7. Required Evidence
  for (const req of mandate.requiredEvidence) {
    const matchingEvidence = object.evidence.filter((e) => e.type === req.type);
    if (matchingEvidence.length === 0) {
      policyChecks.push({
        ruleId: `rule:required-evidence:${req.type}`,
        result: "FAIL",
        claimRefs: [],
        evidenceRefs: [],
        reasonCode: `MISSING_REQUIRED_EVIDENCE_${req.type}`
      });
      reasonCodes.push(`MISSING_REQUIRED_EVIDENCE_${req.type}`);
    } else {
      let passedAge = true;
      if (req.maxAgeMs !== undefined) {
        passedAge = matchingEvidence.every((e) => context.nowMs - e.observedAt <= req.maxAgeMs!);
      }
      if (!passedAge) {
        policyChecks.push({
          ruleId: `rule:required-evidence:${req.type}`,
          result: "FAIL",
          claimRefs: [],
          evidenceRefs: matchingEvidence.map((e) => e.id),
          reasonCode: `EVIDENCE_AGE_EXCEEDED_${req.type}`
        });
        reasonCodes.push(`EVIDENCE_AGE_EXCEEDED_${req.type}`);
      } else {
        policyChecks.push({
          ruleId: `rule:required-evidence:${req.type}`,
          result: "PASS",
          claimRefs: [],
          evidenceRefs: matchingEvidence.map((e) => e.id),
          reasonCode: `REQUIRED_EVIDENCE_${req.type}_SATISFIED`
        });
      }
    }
  }

  // Determine final MandateDecision
  let decision: MandateDecision = "ALLOW";
  const hasFailures = policyChecks.some((c) => c.result === "FAIL");
  const hasUnresolved = policyChecks.some((c) => c.result === "UNRESOLVED");

  if (hasFailures) {
    decision = "BLOCK";
  } else if (hasUnresolved) {
    decision = context.allowConditionalOnWarnings ? "CONDITIONAL" : "CONDITIONAL";
  }

  return {
    id: `decision:${mandate.id}:${object.id}:v${object.version}`,
    objectId: object.id,
    objectVersion: object.version,
    mandateId: mandate.id,
    mandateVersion: mandate.version,
    decision,
    reasonCodes: Array.from(new Set(reasonCodes)),
    policyChecks,
    supportingClaims: Array.from(new Set(supportingClaims)),
    evidenceRoot: verification.evidenceRoot,
    verificationReceiptRef: verification.id,
    policyEngineVersion,
    createdAt: context.nowMs
  };
}
