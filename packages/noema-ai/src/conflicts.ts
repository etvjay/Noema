import {
  proposedConflictSchema,
  proposedUnresolvedIssueSchema,
  type AiEvidenceLocator,
  type ProposedConflict,
  type ProposedUnresolvedIssue
} from "@noema/schemas/ai";

export const CONFLICT_ANALYSIS_JOB_VERSION = "noema-ai-conflict-analysis-v1";

export interface ConflictEvidenceObservation {
  id: string;
  subject: string;
  property: string;
  value: unknown;
  evidence: AiEvidenceLocator;
  freshness: "FRESH" | "STALE" | "UNKNOWN";
  authority: string;
  scope?: string;
  shareClass?: string;
  effectiveAt?: number;
}

export interface ConflictAnalysisModelEnvelope {
  job: "ANALYZE_EVIDENCE_CONFLICTS";
  jobVersion: typeof CONFLICT_ANALYSIS_JOB_VERSION;
  observations: ConflictEvidenceObservation[];
  rules: {
    outputProposalOnly: true;
    preserveAllMaterialConflicts: true;
    confidenceCannotSelectCanonicalTruth: true;
    freshnessAuthorityScopeMayExplainButNotEraseConflict: true;
    insufficientEvidenceMustRemainUnresolved: true;
  };
}

export interface ConflictAnalysisModel {
  analyze(envelope: ConflictAnalysisModelEnvelope): Promise<unknown>;
}

export interface ConflictAnalysisResult {
  conflicts: ProposedConflict[];
  unresolvedIssues: ProposedUnresolvedIssue[];
}

export type ConflictExceptionCandidate =
  | "EVIDENCE_CONFLICT"
  | "EVIDENCE_STALE"
  | "IDENTITY_AMBIGUOUS"
  | "RELATIONSHIP_AMBIGUOUS";

export class ConflictAnalysisError extends Error {
  constructor(
    readonly code:
      | "MALFORMED_MODEL_OUTPUT"
      | "UNAUTHORIZED_EVIDENCE_REFERENCE"
      | "DROPPED_MATERIAL_CONFLICT"
      | "INCOMPLETE_CONFLICT_EVIDENCE",
    message: string
  ) {
    super(message);
    this.name = "ConflictAnalysisError";
  }
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) return String(value);
  return encoded;
}

function evidenceKey(locator: AiEvidenceLocator): string {
  return `${locator.sourceSnapshotRef}\u0000${locator.evidenceRef}\u0000${locator.locator}`;
}

function propositionKey(observation: ConflictEvidenceObservation): string {
  return `${observation.subject}\u0000${observation.property}`;
}

function materialConflictGroups(observations: readonly ConflictEvidenceObservation[]) {
  const groups = new Map<string, ConflictEvidenceObservation[]>();
  for (const observation of observations) {
    const key = propositionKey(observation);
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }

  return [...groups.values()].filter((group) => {
    const distinctValues = new Set(group.map((observation) => canonical(observation.value)));
    return distinctValues.size > 1;
  });
}

function parseOutput(output: unknown): ConflictAnalysisResult {
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    throw new ConflictAnalysisError("MALFORMED_MODEL_OUTPUT", "Model output must be an object");
  }
  const record = output as Record<string, unknown>;
  if (!Array.isArray(record.conflicts) || !Array.isArray(record.unresolvedIssues)) {
    throw new ConflictAnalysisError(
      "MALFORMED_MODEL_OUTPUT",
      "Model output must contain conflicts and unresolvedIssues arrays"
    );
  }

  try {
    return {
      conflicts: record.conflicts.map((item) => proposedConflictSchema.parse(item)),
      unresolvedIssues: record.unresolvedIssues.map((item) => proposedUnresolvedIssueSchema.parse(item))
    };
  } catch (error) {
    throw new ConflictAnalysisError(
      "MALFORMED_MODEL_OUTPUT",
      error instanceof Error ? error.message : "Model output failed strict conflict validation"
    );
  }
}

function assertEvidenceScope(
  result: ConflictAnalysisResult,
  observations: readonly ConflictEvidenceObservation[]
): void {
  const allowed = new Set(observations.map((observation) => evidenceKey(observation.evidence)));
  for (const item of [...result.conflicts, ...result.unresolvedIssues]) {
    for (const locator of item.evidence) {
      if (!allowed.has(evidenceKey(locator))) {
        throw new ConflictAnalysisError(
          "UNAUTHORIZED_EVIDENCE_REFERENCE",
          `${item.id} references evidence outside the bounded conflict input`
        );
      }
    }
  }
}

function assertMaterialConflictsPreserved(
  result: ConflictAnalysisResult,
  observations: readonly ConflictEvidenceObservation[]
): void {
  for (const group of materialConflictGroups(observations)) {
    const first = group[0]!;
    const match = result.conflicts.find(
      (conflict) => conflict.subject === first.subject && conflict.property === first.property
    );
    if (match === undefined) {
      throw new ConflictAnalysisError(
        "DROPPED_MATERIAL_CONFLICT",
        `Model omitted material conflict for ${first.subject}.${first.property}`
      );
    }

    const cited = new Set(match.evidence.map(evidenceKey));
    const missing = group
      .map((observation) => observation.evidence)
      .filter((locator) => !cited.has(evidenceKey(locator)));
    if (missing.length > 0) {
      throw new ConflictAnalysisError(
        "INCOMPLETE_CONFLICT_EVIDENCE",
        `Conflict ${match.id} omitted ${missing.length} materially conflicting evidence reference(s)`
      );
    }
  }
}

export function conflictExceptionCandidates(input: {
  result: ConflictAnalysisResult;
  observations: readonly ConflictEvidenceObservation[];
}): ConflictExceptionCandidate[] {
  const candidates = new Set<ConflictExceptionCandidate>();

  for (const conflict of input.result.conflicts) {
    candidates.add("EVIDENCE_CONFLICT");
    if (conflict.conflictType === "IDENTITY_MISMATCH") candidates.add("IDENTITY_AMBIGUOUS");
    if (conflict.conflictType === "RELATIONSHIP_MISMATCH") candidates.add("RELATIONSHIP_AMBIGUOUS");

    const affected = input.observations.filter(
      (observation) => observation.subject === conflict.subject && observation.property === conflict.property
    );
    if (affected.some((observation) => observation.freshness === "STALE")) {
      candidates.add("EVIDENCE_STALE");
    }
  }

  for (const issue of input.result.unresolvedIssues) {
    if (issue.reasonCode === "IDENTITY_AMBIGUOUS") candidates.add("IDENTITY_AMBIGUOUS");
    if (issue.reasonCode === "RELATIONSHIP_AMBIGUOUS") candidates.add("RELATIONSHIP_AMBIGUOUS");
    if (issue.reasonCode === "EVIDENCE_STALE") candidates.add("EVIDENCE_STALE");
  }

  return [...candidates].sort();
}

export async function analyzeConflicts(input: {
  observations: readonly ConflictEvidenceObservation[];
  model: ConflictAnalysisModel;
}): Promise<ConflictAnalysisResult> {
  const envelope: ConflictAnalysisModelEnvelope = {
    job: "ANALYZE_EVIDENCE_CONFLICTS",
    jobVersion: CONFLICT_ANALYSIS_JOB_VERSION,
    observations: structuredClone([...input.observations]),
    rules: {
      outputProposalOnly: true,
      preserveAllMaterialConflicts: true,
      confidenceCannotSelectCanonicalTruth: true,
      freshnessAuthorityScopeMayExplainButNotEraseConflict: true,
      insufficientEvidenceMustRemainUnresolved: true
    }
  };

  const result = parseOutput(await input.model.analyze(envelope));
  assertEvidenceScope(result, input.observations);
  assertMaterialConflictsPreserved(result, input.observations);
  return structuredClone(result);
}
