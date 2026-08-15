import type {
  Claim,
  DecisionReceipt,
  EconomicObject,
  Evidence,
  Ref,
  ResolutionException,
  VerificationReceipt
} from "@noema/economic-kernel";
import { computeRoots } from "@noema/canonicalization";

export interface ClaimViewModel {
  id: Ref;
  property: string;
  value: string;
  state: Claim["state"];
  confidence?: number;
  evidenceRefs: Ref[];
  attestationRefs: Ref[];
  isVerified: boolean;
}

export interface EvidenceViewModel {
  id: Ref;
  type: Evidence["type"];
  authority: Evidence["authority"];
  freshness: Evidence["freshness"];
  sourceRef: Ref;
  observedAt: number;
  contentHash: string;
}

export interface ExceptionViewModel {
  id: Ref;
  type: ResolutionException["type"];
  severity: ResolutionException["severity"];
  affectedClaims: Ref[];
  evidenceRefs: Ref[];
}

export interface LineageNode {
  id: Ref;
  type: "DECISION" | "VERIFICATION" | "CLAIM" | "EVIDENCE" | "SOURCE";
  label: string;
  status?: string;
}

export interface LineageLink {
  source: Ref;
  target: Ref;
  relation: string;
}

export interface EconomicObjectViewModel {
  id: Ref;
  version: number;
  status: EconomicObject["status"];
  primaryAssetClass: string;
  secondaryAssetClasses: string[];
  objectRoot: string;
  evidenceRoot: string;
  claims: ClaimViewModel[];
  evidence: EvidenceViewModel[];
  exceptions: ExceptionViewModel[];
  verification?: {
    id: Ref;
    overallStatus: VerificationReceipt["overallStatus"];
    verifierVersion: string;
    passedChecksCount: number;
    failedChecksCount: number;
    unresolvedChecksCount: number;
  };
  decision?: {
    id: Ref;
    decision: DecisionReceipt["decision"];
    reasons: string[];
    mandateId: Ref;
    policyEngineVersion: string;
  };
  lineage: {
    nodes: LineageNode[];
    links: LineageLink[];
  };
}

export function buildEconomicObjectViewModel(
  object: EconomicObject,
  verification?: VerificationReceipt,
  decision?: DecisionReceipt
): EconomicObjectViewModel {
  const roots = computeRoots(object);

  const claimsVm: ClaimViewModel[] = object.claims.map((c) => ({
    id: c.id,
    property: c.property,
    value: typeof c.value === "string" ? c.value : JSON.stringify(c.value),
    state: c.state,
    ...(c.confidence !== undefined ? { confidence: c.confidence } : {}),
    evidenceRefs: c.evidenceRefs,
    attestationRefs: c.attestationRefs,
    isVerified: c.state === "VERIFIED" || (verification?.overallStatus === "PASS" && c.state === "SOURCED")
  }));

  const evidenceVm: EvidenceViewModel[] = object.evidence.map((e) => ({
    id: e.id,
    type: e.type,
    authority: e.authority,
    freshness: e.freshness,
    sourceRef: e.source,
    observedAt: e.observedAt,
    contentHash: e.contentHash
  }));

  const exceptionsVm: ExceptionViewModel[] = object.exceptions.map((ex) => ({
    id: ex.id,
    type: ex.type,
    severity: ex.severity,
    affectedClaims: ex.affectedClaims,
    evidenceRefs: ex.evidence
  }));

  // Build inspectable Lineage graph
  const nodes: LineageNode[] = [];
  const links: LineageLink[] = [];

  if (decision) {
    nodes.push({
      id: decision.id,
      type: "DECISION",
      label: `Mandate Decision: ${decision.decision}`,
      status: decision.decision
    });
  }

  if (verification) {
    nodes.push({
      id: verification.id,
      type: "VERIFICATION",
      label: `Verification Receipt: ${verification.overallStatus}`,
      status: verification.overallStatus
    });

    if (decision) {
      links.push({
        source: decision.id,
        target: verification.id,
        relation: "VERIFIED_BY"
      });
    }
  }

  for (const claim of object.claims) {
    nodes.push({
      id: claim.id,
      type: "CLAIM",
      label: `Claim: ${claim.property} (${claim.state})`,
      status: claim.state
    });

    if (verification) {
      links.push({
        source: verification.id,
        target: claim.id,
        relation: "EVALUATES_CLAIM"
      });
    }

    for (const evRef of claim.evidenceRefs) {
      links.push({
        source: claim.id,
        target: evRef,
        relation: "GROUNDED_IN"
      });
    }
  }

  for (const ev of object.evidence) {
    nodes.push({
      id: ev.id,
      type: "EVIDENCE",
      label: `Evidence: ${ev.type} (${ev.freshness ?? "UNKNOWN"})`,
      ...(ev.freshness !== undefined ? { status: ev.freshness } : {})
    });

    nodes.push({
      id: ev.source,
      type: "SOURCE",
      label: `Source: ${ev.source}`
    });

    links.push({
      source: ev.id,
      target: ev.source,
      relation: "OBSERVED_FROM"
    });
  }

  return {
    id: object.id,
    version: object.version,
    status: object.status,
    primaryAssetClass: object.classification.primary,
    secondaryAssetClasses: [...object.classification.secondary],
    objectRoot: roots.objectRoot,
    evidenceRoot: roots.evidenceRoot,
    claims: claimsVm,
    evidence: evidenceVm,
    exceptions: exceptionsVm,
    ...(verification !== undefined
      ? {
          verification: {
            id: verification.id,
            overallStatus: verification.overallStatus,
            verifierVersion: verification.verifierVersion,
            passedChecksCount: verification.checks.filter((c) => c.result === "PASS").length,
            failedChecksCount: verification.checks.filter((c) => c.result === "FAIL").length,
            unresolvedChecksCount: verification.checks.filter((c) => c.result === "UNRESOLVED").length
          }
        }
      : {}),
    ...(decision !== undefined
      ? {
          decision: {
            id: decision.id,
            decision: decision.decision,
            reasons: decision.reasonCodes,
            mandateId: decision.mandateId,
            policyEngineVersion: decision.policyEngineVersion
          }
        }
      : {}),
    lineage: {
      nodes,
      links
    }
  };
}
