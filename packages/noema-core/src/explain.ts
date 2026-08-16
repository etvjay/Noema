import type {
  Claim,
  DecisionReceipt,
  EconomicObject,
  Evidence,
  Mandate,
  Ref,
  UnixMillis,
  VerificationReceipt
} from "@noema/economic-kernel";
import type { SemanticEvent } from "@noema/schemas/events";

export const EXPLANATION_VERSION = "noema-explanation-v1";

export type ExplanationKind =
  | "CLASSIFICATION"
  | "REPRESENTATION_EQUIVALENCE"
  | "MANDATE_CHANGE"
  | "EVIDENCE_STATE"
  | "VERSION_CHANGE"
  | "UNBLOCK_PATH";

export type ExplanationBasis =
  | "SOURCE_FACT"
  | "ATTESTATION"
  | "DETERMINISTIC_CONCLUSION"
  | "AI_INFERENCE";

export type ExplanationConfidence = "ESTABLISHED" | "UNRESOLVED" | "INSUFFICIENT_EVIDENCE";

export interface ExplanationAssertion {
  assertionId: Ref;
  claim: string;
  basis: ExplanationBasis;
  confidence: ExplanationConfidence;
  refs: Ref[];
  reasonCode?: string;
}

export interface ExplanationRunReceipt {
  schemaVersion: typeof EXPLANATION_VERSION;
  runId: Ref;
  generatedAt: UnixMillis;
  kind: ExplanationKind;
  inputRefs: Ref[];
  noHiddenChainOfThought: true;
}

export interface CanonicalExplanation {
  schemaVersion: typeof EXPLANATION_VERSION;
  kind: ExplanationKind;
  subjectRefs: Ref[];
  assertions: ExplanationAssertion[];
  runReceipt: ExplanationRunReceipt;
}

export interface ExplainInput {
  runId: Ref;
  nowMs: UnixMillis;
}

function dedupeRefs(refs: readonly Ref[]): Ref[] {
  return [...new Set(refs)].sort();
}

function build(input: ExplainInput, kind: ExplanationKind, subjectRefs: Ref[], assertions: ExplanationAssertion[], inputRefs: Ref[]): CanonicalExplanation {
  return {
    schemaVersion: EXPLANATION_VERSION,
    kind,
    subjectRefs: dedupeRefs(subjectRefs),
    assertions,
    runReceipt: {
      schemaVersion: EXPLANATION_VERSION,
      runId: input.runId,
      generatedAt: input.nowMs,
      kind,
      inputRefs: dedupeRefs(inputRefs),
      noHiddenChainOfThought: true
    }
  };
}

function assertion(
  assertionId: Ref,
  claim: string,
  basis: ExplanationBasis,
  confidence: ExplanationConfidence,
  refs: Ref[],
  reasonCode?: string
): ExplanationAssertion {
  const result: ExplanationAssertion = { assertionId, claim, basis, confidence, refs: dedupeRefs(refs) };
  if (reasonCode !== undefined) result.reasonCode = reasonCode;
  return result;
}

const VERIFIED = "PASS";
const UNRESOLVED = "UNRESOLVED";

export function explainClassification(
  input: ExplainInput,
  object: EconomicObject,
  verification: VerificationReceipt
): CanonicalExplanation {
  const assertions: ExplanationAssertion[] = [];

  const classificationRefs = [object.classification.claimRef, ...object.claims.map((claim) => claim.id)];
  assertions.push(
    assertion(
      "classification:primary",
      `Object classified as ${object.classification.primary}`,
      "DETERMINISTIC_CONCLUSION",
      verification.overallStatus === VERIFIED ? "ESTABLISHED" : "UNRESOLVED",
      classificationRefs,
      verification.overallStatus === VERIFIED ? undefined : "VERIFICATION_UNRESOLVED"
    )
  );

  if (object.classification.secondary.length > 0) {
    assertions.push(
      assertion(
        "classification:secondary",
        `Secondary classification: ${object.classification.secondary.join(", ")}`,
        "DETERMINISTIC_CONCLUSION",
        "ESTABLISHED",
        classificationRefs
      )
    );
  }

  for (const claim of object.claims) {
    const basis: ExplanationBasis =
      claim.state === "VERIFIED" || claim.state === "OBSERVED" || claim.state === "SOURCED" || claim.state === "ATTESTED"
        ? "SOURCE_FACT"
        : "AI_INFERENCE";
    assertions.push(
      assertion(
        `classification:claim:${claim.id}`,
        `Claim ${claim.property} = ${JSON.stringify(claim.value)}`,
        basis,
        claim.state === "VERIFIED" ? "ESTABLISHED" : "UNRESOLVED",
        [claim.id, ...claim.sourceRefs, ...claim.evidenceRefs, ...claim.attestationRefs],
        claim.state === "VERIFIED" ? undefined : `CLAIM_${claim.state}`
      )
    );
  }

  return build(
    input,
    "CLASSIFICATION",
    [`${object.id}/versions/${object.version}`, verification.id],
    assertions,
    [object.id, verification.id, object.classification.claimRef]
  );
}

export function explainRepresentationEquivalence(
  input: ExplainInput,
  object: EconomicObject,
  verification: VerificationReceipt,
  otherObject: EconomicObject,
  otherVerification: VerificationReceipt,
  representationId: Ref,
  otherRepresentationId: Ref
): CanonicalExplanation {
  const representation = object.representations.find((item) => item.id === representationId);
  const other = otherObject.representations.find((item) => item.id === otherRepresentationId);

  const assertions: ExplanationAssertion[] = [];

  if (representation === undefined || other === undefined) {
    assertions.push(
      assertion(
        "equivalence:missing-representation",
        representation === undefined
          ? `Representation ${representationId} not present in ${object.id}`
          : `Representation ${otherRepresentationId} not present in ${otherObject.id}`,
        "DETERMINISTIC_CONCLUSION",
        "ESTABLISHED",
        [representationId, otherRepresentationId, object.id, otherObject.id]
      )
    );
    return build(
      input,
      "REPRESENTATION_EQUIVALENCE",
      [representationId, otherRepresentationId],
      assertions,
      [object.id, otherObject.id, verification.id, otherVerification.id]
    );
  }

  const rootRefs = [verification.objectRoot, verification.evidenceRoot, otherVerification.objectRoot, otherVerification.evidenceRoot];
  const sameObjectRoot = verification.objectRoot === otherVerification.objectRoot;
  const sameEvidenceRoot = verification.evidenceRoot === otherVerification.evidenceRoot;

  assertions.push(
    assertion(
      "equivalence:canonical-roots",
      sameObjectRoot && sameEvidenceRoot
        ? "Representations share identical canonical verification roots"
        : "Representations have different canonical verification roots",
      "DETERMINISTIC_CONCLUSION",
      "ESTABLISHED",
      rootRefs,
      sameObjectRoot && sameEvidenceRoot ? undefined : "ROOTS_DIFFER"
    )
  );

  const identifiers = representation.identifiers;
  const otherIdentifiers = other.identifiers;
  const identifierSet = new Set(identifiers.map((item) => `${item.scheme}:${item.value}`));
  const otherIdentifierSet = new Set(otherIdentifiers.map((item) => `${item.scheme}:${item.value}`));
  const missingInOther = identifiers.filter((item) => !otherIdentifierSet.has(`${item.scheme}:${item.value}`));
  const missingInThis = otherIdentifiers.filter((item) => !identifierSet.has(`${item.scheme}:${item.value}`));

  if (missingInOther.length > 0 || missingInThis.length > 0) {
    assertions.push(
      assertion(
        "equivalence:identifier-mismatch",
        `Representations differ in identifiers: missing in ${representation.id}: ${missingInThis.map((item) => `${item.scheme}:${item.value}`).join(", ") || "none"}; missing in ${other.id}: ${missingInOther.map((item) => `${item.scheme}:${item.value}`).join(", ") || "none"}`,
        "SOURCE_FACT",
        "ESTABLISHED",
        [...identifiers.map((item) => item.source), ...otherIdentifiers.map((item) => item.source)],
        "IDENTIFIER_MISMATCH"
      )
    );
  } else if (identifiers.length === 0 && otherIdentifiers.length === 0) {
    assertions.push(
      assertion(
        "equivalence:no-identifiers",
        "Neither representation carries identifiers; equivalence cannot be established from canonical state alone",
        "DETERMINISTIC_CONCLUSION",
        "INSUFFICIENT_EVIDENCE",
        [representation.id, other.id]
      )
    );
  }

  const evidenceRefs = [...representation.evidence, ...other.evidence];
  if (evidenceRefs.length > 0) {
    assertions.push(
      assertion(
        "equivalence:evidence",
        `Equivalence assessment cites evidence: ${evidenceRefs.join(", ")}`,
        "SOURCE_FACT",
        "ESTABLISHED",
        evidenceRefs
      )
    );
  }

  return build(
    input,
    "REPRESENTATION_EQUIVALENCE",
    [representation.id, other.id, verification.id, otherVerification.id],
    assertions,
    [object.id, otherObject.id, verification.id, otherVerification.id, representationId, otherRepresentationId]
  );
}

export function explainMandateChange(
  input: ExplainInput,
  before: DecisionReceipt,
  after: DecisionReceipt,
  event?: SemanticEvent
): CanonicalExplanation {
  const assertions: ExplanationAssertion[] = [];
  const eventRefs = event === undefined ? [] : [event.eventId, ...event.sourceRefs, ...event.evidenceRefs, ...event.receiptRefs];

  assertions.push(
    assertion(
      "mandate-change:outcome",
      `Mandate outcome changed from ${before.decision} to ${after.decision}`,
      "DETERMINISTIC_CONCLUSION",
      "ESTABLISHED",
      [before.id, after.id]
    )
  );

  const beforeChecks = new Map(before.policyChecks.map((check) => [check.ruleId, check]));
  const afterChecks = new Map(after.policyChecks.map((check) => [check.ruleId, check]));
  const flipped: { ruleId: Ref; from: string; to: string; reasonCode: string }[] = [];

  for (const ruleId of new Set([...beforeChecks.keys(), ...afterChecks.keys()])) {
    const beforeCheck = beforeChecks.get(ruleId);
    const afterCheck = afterChecks.get(ruleId);
    if (beforeCheck === undefined || afterCheck === undefined) continue;
    if (beforeCheck.result !== afterCheck.result) {
      flipped.push({ ruleId, from: beforeCheck.result, to: afterCheck.result, reasonCode: afterCheck.reasonCode });
    }
  }

  if (flipped.length > 0) {
    for (const flip of flipped) {
      assertions.push(
        assertion(
          `mandate-change:flip:${flip.ruleId}`,
          `Policy check ${flip.ruleId} changed ${flip.from} -> ${flip.to}`,
          "DETERMINISTIC_CONCLUSION",
          "ESTABLISHED",
          [before.id, after.id, ...eventRefs],
          flip.reasonCode
        )
      );
    }
  } else {
    assertions.push(
      assertion(
        "mandate-change:no-flip",
        `No policy check result changed between ${before.id} and ${after.id}`,
        "DETERMINISTIC_CONCLUSION",
        "ESTABLISHED",
        [before.id, after.id]
      )
    );
  }

  if (event !== undefined) {
    assertions.push(
      assertion(
        "mandate-change:event",
        `Change correlates with semantic event ${event.eventId} (${event.eventType})`,
        "SOURCE_FACT",
        "ESTABLISHED",
        eventRefs
      )
    );
  }

  return build(
    input,
    "MANDATE_CHANGE",
    [before.id, after.id],
    assertions,
    [before.id, after.id, ...eventRefs]
  );
}

export function explainEvidenceState(
  input: ExplainInput,
  object: EconomicObject,
  nowMs: UnixMillis
): CanonicalExplanation {
  const assertions: ExplanationAssertion[] = [];

  const stale = object.evidence.filter((evidence) => evidence.freshness === "STALE");
  const unknown = object.evidence.filter((evidence) => evidence.freshness === "UNKNOWN" || evidence.freshness === undefined);
  const fresh = object.evidence.filter((evidence) => evidence.freshness === "FRESH");

  if (stale.length > 0) {
    assertions.push(
      assertion(
        "evidence-state:stale",
        `Stale evidence: ${stale.map((item) => item.id).join(", ")}`,
        "SOURCE_FACT",
        "ESTABLISHED",
        stale.map((item) => item.id),
        "EVIDENCE_STALE"
      )
    );
  }
  if (unknown.length > 0) {
    assertions.push(
      assertion(
        "evidence-state:unknown",
        `Evidence with unknown freshness: ${unknown.map((item) => item.id).join(", ") || "none"}`,
        "SOURCE_FACT",
        "ESTABLISHED",
        unknown.map((item) => item.id),
        "EVIDENCE_FRESHNESS_UNKNOWN"
      )
    );
  }
  if (object.evidence.length === 0) {
    assertions.push(
      assertion(
        "evidence-state:none",
        `No evidence present for ${object.id}`,
        "DETERMINISTIC_CONCLUSION",
        "ESTABLISHED",
        [object.id]
      )
    );
  } else {
    assertions.push(
      assertion(
        "evidence-state:summary",
        `${fresh.length} fresh, ${stale.length} stale, ${unknown.length} unknown evidence records for ${object.id}`,
        "DETERMINISTIC_CONCLUSION",
        "ESTABLISHED",
        object.evidence.map((item) => item.id)
      )
    );
  }

  const byProperty = new Map<string, Claim[]>();
  for (const claim of object.claims) {
    const list = byProperty.get(claim.property) ?? [];
    list.push(claim);
    byProperty.set(claim.property, list);
  }
  for (const [property, claims] of byProperty) {
    if (claims.length < 2) continue;
    const values = new Set(claims.map((claim) => JSON.stringify(claim.value)));
    if (values.size < 2) continue;
    assertions.push(
      assertion(
        `evidence-state:conflict:${property}`,
        `Conflicting claims on ${property}: ${claims.map((claim) => `${claim.id}=${JSON.stringify(claim.value)}`).join(" vs ")}`,
        "SOURCE_FACT",
        "ESTABLISHED",
        claims.flatMap((claim) => [claim.id, ...claim.evidenceRefs]),
        "CONFLICTING_CLAIMS"
      )
    );
  }

  const allEvidenceRefs = object.evidence.map((item) => item.id);
  const cited = new Set(object.claims.flatMap((claim) => claim.evidenceRefs));
  const uncited = allEvidenceRefs.filter((id) => !cited.has(id));
  if (uncited.length > 0) {
    assertions.push(
      assertion(
        "evidence-state:uncited",
        `Evidence not cited by any claim: ${uncited.join(", ")}`,
        "DETERMINISTIC_CONCLUSION",
        "ESTABLISHED",
        uncited,
        "UNCITED_EVIDENCE"
      )
    );
  }

  return build(
    input,
    "EVIDENCE_STATE",
    [`${object.id}/versions/${object.version}`],
    assertions,
    [object.id, ...object.evidence.map((item) => item.id), ...object.claims.map((claim) => claim.id)]
  );
}

export function explainVersionChange(
  input: ExplainInput,
  before: EconomicObject,
  after: EconomicObject
): CanonicalExplanation {
  const assertions: ExplanationAssertion[] = [];

  assertions.push(
    assertion(
      "version-change:identity",
      `${after.id} changed ${before.version} -> ${after.version} (status ${before.status} -> ${after.status})`,
      "DETERMINISTIC_CONCLUSION",
      "ESTABLISHED",
      [`${before.id}/versions/${before.version}`, `${after.id}/versions/${after.version}`]
    )
  );

  const beforeValues = JSON.stringify(before.economics.values);
  const afterValues = JSON.stringify(after.economics.values);
  if (beforeValues !== afterValues) {
    assertions.push(
      assertion(
        "version-change:economics",
        `Economics values changed between versions`,
        "SOURCE_FACT",
        "ESTABLISHED",
        [before.economics.asOf === after.economics.asOf ? before.economics.claimRefs[0] ?? before.id : before.economics.claimRefs[0] ?? before.id],
        "ECONOMICS_CHANGED"
      )
    );
  }

  const beforeEvidence = new Set(before.evidence.map((item) => item.id));
  const afterEvidence = new Set(after.evidence.map((item) => item.id));
  const added = after.evidence.filter((item) => !beforeEvidence.has(item.id));
  const removed = before.evidence.filter((item) => !afterEvidence.has(item.id));
  if (added.length > 0) {
    assertions.push(
      assertion(
        "version-change:evidence-added",
        `Evidence added: ${added.map((item) => item.id).join(", ")}`,
        "SOURCE_FACT",
        "ESTABLISHED",
        added.map((item) => item.id)
      )
    );
  }
  if (removed.length > 0) {
    assertions.push(
      assertion(
        "version-change:evidence-removed",
        `Evidence removed: ${removed.map((item) => item.id).join(", ")}`,
        "SOURCE_FACT",
        "ESTABLISHED",
        removed.map((item) => item.id)
      )
    );
  }

  return build(
    input,
    "VERSION_CHANGE",
    [`${before.id}/versions/${before.version}`, `${after.id}/versions/${after.version}`],
    assertions,
    [before.id, after.id]
  );
}

export function explainUnblockPath(
  input: ExplainInput,
  object: EconomicObject,
  verification: VerificationReceipt,
  mandate: Mandate,
  decision: DecisionReceipt
): CanonicalExplanation {
  const assertions: ExplanationAssertion[] = [];

  assertions.push(
    assertion(
      "unblock:current",
      `Current outcome is ${decision.decision}`,
      "DETERMINISTIC_CONCLUSION",
      "ESTABLISHED",
      [decision.id],
      undefined
    )
  );

  const failing = decision.policyChecks.filter((check) => check.result === "FAIL" || check.result === UNRESOLVED);
  if (failing.length === 0) {
    assertions.push(
      assertion(
        "unblock:none",
        `No failing policy checks; nothing is blocking ${decision.decision}`,
        "DETERMINISTIC_CONCLUSION",
        "ESTABLISHED",
        [decision.id]
      )
    );
    return build(input, "UNBLOCK_PATH", [decision.id, mandate.id], assertions, [object.id, verification.id, mandate.id, decision.id]);
  }

  const evidenceById = new Map(object.evidence.map((item) => [item.id, item]));
  for (const check of failing) {
    const evidenceRefs = check.evidenceRefs.filter((ref) => evidenceById.has(ref));
    const missingTypes = mandate.requiredEvidence
      .filter((requirement) => !object.evidence.some((item) => item.type === requirement.type))
      .map((requirement) => requirement.type);
    const claimProperties = mandate.requiredClaims
      .filter((requirement) => !object.claims.some((claim) => claim.property === requirement.property && claim.state === requirement.requiredState))
      .map((requirement) => `${requirement.property}=${requirement.requiredState}`);

    let requirement: string;
    if (evidenceRefs.length === 0 && missingTypes.length === 0 && claimProperties.length === 0) {
      requirement = `No canonical record establishes the missing input for check ${check.ruleId}`;
    } else {
      const parts: string[] = [];
      if (missingTypes.length > 0) parts.push(`evidence of type ${missingTypes.join(", ")}`);
      if (claimProperties.length > 0) parts.push(`claims ${claimProperties.join(", ")}`);
      if (evidenceRefs.length > 0) parts.push(`fresh evidence ${evidenceRefs.join(", ")}`);
      requirement = `Check ${check.ruleId} passes when canonical state provides ${parts.join(" and ")}`;
    }

    assertions.push(
      assertion(
        `unblock:path:${check.ruleId}`,
        requirement,
        "DETERMINISTIC_CONCLUSION",
        "UNRESOLVED",
        [check.ruleId, ...check.claimRefs, ...check.evidenceRefs],
        check.reasonCode
      )
    );
  }

  return build(
    input,
    "UNBLOCK_PATH",
    [decision.id, mandate.id],
    assertions,
    [object.id, verification.id, mandate.id, decision.id, ...failing.flatMap((check) => check.evidenceRefs)]
  );
}

export function renderExplanation(explanation: CanonicalExplanation): string {
  const lines = [
    `${explanation.kind} (${explanation.schemaVersion})`,
    `subjects: ${explanation.subjectRefs.join(", ")}`
  ];
  for (const assertion of explanation.assertions) {
    const reason = assertion.reasonCode === undefined ? "" : ` [${assertion.reasonCode}]`;
    lines.push(`- [${assertion.basis}:${assertion.confidence}] ${assertion.claim}${reason}`);
    lines.push(`  refs: ${assertion.refs.join(", ")}`);
  }
  return lines.join("\n");
}

export function explanationVersion(): string {
  return EXPLANATION_VERSION;
}
