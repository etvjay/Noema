import type {
  DecisionReceipt,
  EconomicObject,
  Evidence,
  Mandate,
  MandateDecision,
  PolicyCheck,
  Ref,
  UnixMillis,
  VerificationOutcome,
  VerificationReceipt
} from "@noema/economic-kernel";
import { SCHEMA_IDS, SCHEMA_VERSIONS } from "@noema/schemas";

export const POLICY_ENGINE_VERSION = "noema-mandate-v1";

export interface MandateEvaluationContext {
  nowMs: UnixMillis;
}

function policyCheck(
  ruleId: Ref,
  result: VerificationOutcome,
  claimRefs: Ref[],
  evidenceRefs: Ref[],
  reasonCode: string
): PolicyCheck {
  return {
    ruleId,
    result,
    claimRefs: [...new Set(claimRefs)].sort(),
    evidenceRefs: [...new Set(evidenceRefs)].sort(),
    reasonCode
  };
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function evidenceAgeMs(evidence: Evidence, nowMs: UnixMillis): number {
  return Math.max(0, nowMs - evidence.observedAt);
}

function decisionFromChecks(checks: readonly PolicyCheck[]): MandateDecision {
  if (checks.some((check) => check.result === "FAIL")) return "BLOCK";
  if (checks.some((check) => check.result === "UNRESOLVED")) return "CONDITIONAL";
  return "ALLOW";
}

export function evaluateMandate(
  object: EconomicObject,
  verification: VerificationReceipt,
  mandate: Mandate,
  context: MandateEvaluationContext
): DecisionReceipt {
  const checks: PolicyCheck[] = [];
  const evidenceById = new Map(object.evidence.map((item) => [item.id, item]));

  checks.push(
    policyCheck(
      "mandate:verification",
      verification.overallStatus,
      object.claims.map((claim) => claim.id),
      object.evidence.map((evidence) => evidence.id),
      verification.overallStatus === "PASS"
        ? "VERIFICATION_PASS"
        : verification.overallStatus === "FAIL"
          ? "VERIFICATION_FAILED"
          : "VERIFICATION_UNRESOLVED"
    )
  );

  const blockingStates = new Set([
    "STALE",
    "CONFLICTING",
    "INSUFFICIENT_EVIDENCE",
    "REVOKED",
    "UNSUPPORTED"
  ]);
  checks.push(
    policyCheck(
      "mandate:object-state",
      blockingStates.has(object.status) ? "FAIL" : "PASS",
      object.claims.map((claim) => claim.id),
      object.evidence.map((evidence) => evidence.id),
      blockingStates.has(object.status) ? `OBJECT_${object.status}` : "OBJECT_STATE_ACCEPTABLE"
    )
  );

  if (mandate.expiresAt !== undefined) {
    checks.push(
      policyCheck(
        "mandate:expiry",
        mandate.expiresAt < context.nowMs ? "FAIL" : "PASS",
        [],
        [],
        mandate.expiresAt < context.nowMs ? "MANDATE_EXPIRED" : "MANDATE_ACTIVE"
      )
    );
  }

  const assetClass = object.classification.primary;
  if (mandate.prohibitedAssetClasses.includes(assetClass)) {
    checks.push(policyCheck("mandate:asset-class", "FAIL", [], [], "ASSET_CLASS_PROHIBITED"));
  } else if (
    mandate.allowedAssetClasses.length > 0 &&
    !mandate.allowedAssetClasses.includes(assetClass)
  ) {
    checks.push(policyCheck("mandate:asset-class", "FAIL", [], [], "ASSET_CLASS_NOT_ALLOWED"));
  } else {
    checks.push(policyCheck("mandate:asset-class", "PASS", [], [], "ASSET_CLASS_ALLOWED"));
  }

  for (const requirement of [...mandate.requiredClaims].sort((a, b) =>
    `${a.property}:${a.requiredState}`.localeCompare(`${b.property}:${b.requiredState}`)
  )) {
    const matches = object.claims.filter(
      (claim) => claim.property === requirement.property && claim.state === requirement.requiredState
    );
    checks.push(
      policyCheck(
        `mandate:claim:${requirement.property}:${requirement.requiredState}`,
        matches.length > 0 ? "PASS" : "FAIL",
        matches.map((claim) => claim.id),
        matches.flatMap((claim) => claim.evidenceRefs),
        matches.length > 0 ? "REQUIRED_CLAIM_PRESENT" : "REQUIRED_CLAIM_MISSING"
      )
    );
  }

  for (const requirement of [...mandate.requiredEvidence].sort((a, b) => a.type.localeCompare(b.type))) {
    const matches = object.evidence.filter((evidence) => evidence.type === requirement.type);
    if (matches.length === 0) {
      checks.push(policyCheck(`mandate:evidence:${requirement.type}`, "FAIL", [], [], "REQUIRED_EVIDENCE_MISSING"));
      continue;
    }

    const stale = matches.some((evidence) => evidence.freshness === "STALE");
    const maxAge = requirement.maxAgeMs ?? mandate.maxEvidenceAgeMs;
    const tooOld = maxAge === undefined
      ? false
      : matches.some((evidence) => evidenceAgeMs(evidence, context.nowMs) > maxAge);
    checks.push(
      policyCheck(
        `mandate:evidence:${requirement.type}`,
        stale || tooOld ? "FAIL" : "PASS",
        [],
        matches.map((evidence) => evidence.id),
        stale ? "REQUIRED_EVIDENCE_STALE" : tooOld ? "REQUIRED_EVIDENCE_TOO_OLD" : "REQUIRED_EVIDENCE_ACCEPTABLE"
      )
    );
  }

  if (mandate.maxEvidenceAgeMs !== undefined) {
    const relevant = object.evidence.filter((evidence) => evidenceById.has(evidence.id));
    const stale = relevant.some(
      (evidence) =>
        evidence.freshness === "STALE" ||
        evidenceAgeMs(evidence, context.nowMs) > mandate.maxEvidenceAgeMs!
    );
    checks.push(
      policyCheck(
        "mandate:evidence:freshness",
        stale ? "FAIL" : "PASS",
        [],
        relevant.map((evidence) => evidence.id),
        stale ? "EVIDENCE_FRESHNESS_POLICY_FAILED" : "EVIDENCE_FRESHNESS_POLICY_PASS"
      )
    );
  }

  if (mandate.minYieldBps !== undefined) {
    const yieldBps = numericValue(object.economics.values.yieldBps);
    checks.push(
      policyCheck(
        "mandate:min-yield",
        yieldBps === undefined ? "UNRESOLVED" : yieldBps >= mandate.minYieldBps ? "PASS" : "FAIL",
        object.economics.claimRefs,
        [],
        yieldBps === undefined
          ? "YIELD_UNRESOLVED"
          : yieldBps >= mandate.minYieldBps
            ? "MIN_YIELD_SATISFIED"
            : "MIN_YIELD_NOT_SATISFIED"
      )
    );
  }

  if (mandate.maxRedemptionPeriodMs !== undefined) {
    const redemptionPeriodMs = numericValue(object.economics.values.redemptionPeriodMs);
    checks.push(
      policyCheck(
        "mandate:max-redemption-period",
        redemptionPeriodMs === undefined
          ? "UNRESOLVED"
          : redemptionPeriodMs <= mandate.maxRedemptionPeriodMs
            ? "PASS"
            : "FAIL",
        object.economics.claimRefs,
        [],
        redemptionPeriodMs === undefined
          ? "REDEMPTION_PERIOD_UNRESOLVED"
          : redemptionPeriodMs <= mandate.maxRedemptionPeriodMs
            ? "REDEMPTION_PERIOD_ACCEPTABLE"
            : "REDEMPTION_PERIOD_TOO_LONG"
      )
    );
  }

  const policyChecks = checks.sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  const decision = decisionFromChecks(policyChecks);
  const reasonCodes = [...new Set(
    policyChecks
      .filter((check) => check.result !== "PASS")
      .map((check) => check.reasonCode)
  )].sort();
  const supportingClaims = [...new Set(policyChecks.flatMap((check) => check.claimRefs))].sort();

  return {
    id: `decision:${object.id}:v${object.version}:${mandate.id}:v${mandate.version}`,
    schemaId: SCHEMA_IDS.DECISION_RECEIPT,
    schemaVersion: SCHEMA_VERSIONS.DECISION_RECEIPT,
    objectId: object.id,
    objectVersion: object.version,
    mandateId: mandate.id,
    mandateVersion: mandate.version,
    decision,
    reasonCodes,
    policyChecks,
    supportingClaims,
    evidenceRoot: verification.evidenceRoot,
    verificationReceiptRef: verification.id,
    policyEngineVersion: POLICY_ENGINE_VERSION,
    createdAt: context.nowMs
  };
}
