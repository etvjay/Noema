import type { Ref } from "@noema/economic-kernel";
import type { CanonicalNoemaSnapshot } from "./surfaces.js";

export interface NoemaUiViewModel {
  object: {
    id: Ref;
    version: number;
    versionLabel: string;
    status: CanonicalNoemaSnapshot["object"]["status"];
    relationshipPredicates: string[];
    exceptions: Array<{
      id: Ref;
      type: string;
      severity: string;
      status: string;
    }>;
  };
  verification: {
    id: Ref;
    status: CanonicalNoemaSnapshot["verification"]["overallStatus"];
    objectRoot: string;
    evidenceRoot: string;
  };
  decision: {
    id: Ref;
    outcome: CanonicalNoemaSnapshot["decision"]["decision"];
    reasonCodes: string[];
    policyEngineVersion: string;
  };
  evidence: Array<{
    id: Ref;
    authority: string;
    freshness: string;
    contentHash: string;
  }>;
  decisionLineage: {
    decisionReceiptRef: Ref;
    verificationReceiptRef: Ref;
    claims: Array<{
      claimId: Ref;
      state: string;
      sourceRefs: Ref[];
      evidenceRefs: Ref[];
    }>;
  };
}

export function toNoemaUiViewModel(
  snapshot: CanonicalNoemaSnapshot
): NoemaUiViewModel {
  return {
    object: {
      id: snapshot.object.id,
      version: snapshot.object.version,
      versionLabel: `v${snapshot.object.version}`,
      status: snapshot.object.status,
      relationshipPredicates: snapshot.object.relationships
        .map((relationship) => relationship.predicate)
        .sort(),
      exceptions: snapshot.object.exceptions
        .map((exception) => ({
          id: exception.id,
          type: exception.type,
          severity: exception.severity,
          status: exception.status
        }))
        .sort((left, right) => left.id.localeCompare(right.id))
    },
    verification: {
      id: snapshot.verification.id,
      status: snapshot.verification.overallStatus,
      objectRoot: snapshot.verification.objectRoot,
      evidenceRoot: snapshot.verification.evidenceRoot
    },
    decision: {
      id: snapshot.decision.id,
      outcome: snapshot.decision.decision,
      reasonCodes: [...snapshot.decision.reasonCodes],
      policyEngineVersion: snapshot.decision.policyEngineVersion
    },
    evidence: snapshot.object.evidence
      .map((evidence) => ({
        id: evidence.id,
        authority: evidence.authority,
        freshness: evidence.freshness ?? "UNKNOWN",
        contentHash: evidence.contentHash
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    decisionLineage: {
      decisionReceiptRef: snapshot.decision.id,
      verificationReceiptRef: snapshot.decision.verificationReceiptRef,
      claims: snapshot.object.claims
        .map((claim) => ({
          claimId: claim.id,
          state: claim.state,
          sourceRefs: [...claim.sourceRefs].sort(),
          evidenceRefs: [...claim.evidenceRefs].sort()
        }))
        .sort((left, right) => left.claimId.localeCompare(right.claimId))
    }
  };
}
