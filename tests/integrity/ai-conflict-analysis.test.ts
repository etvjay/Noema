import { describe, expect, it } from "vitest";
import {
  ConflictAnalysisError,
  analyzeConflicts,
  conflictExceptionCandidates,
  type ConflictAnalysisModel,
  type ConflictEvidenceObservation
} from "../../packages/noema-ai/src/conflicts.js";

function locator(id: string) {
  return {
    sourceSnapshotRef: `source-snapshot:${id}`,
    evidenceRef: `evidence:${id}`,
    locator: `document://${id}`
  };
}

function observation(input: {
  id: string;
  subject?: string;
  property: string;
  value: unknown;
  freshness?: "FRESH" | "STALE" | "UNKNOWN";
  authority?: string;
  scope?: string;
  shareClass?: string;
  effectiveAt?: number;
}): ConflictEvidenceObservation {
  return {
    id: input.id,
    subject: input.subject ?? "object:arcadia:class-a",
    property: input.property,
    value: input.value,
    evidence: locator(input.id),
    freshness: input.freshness ?? "FRESH",
    authority: input.authority ?? "PRIMARY_SOURCE",
    ...(input.scope === undefined ? {} : { scope: input.scope }),
    ...(input.shareClass === undefined ? {} : { shareClass: input.shareClass }),
    ...(input.effectiveAt === undefined ? {} : { effectiveAt: input.effectiveAt })
  };
}

function modelReturning(output: unknown): ConflictAnalysisModel {
  return {
    async analyze() {
      return structuredClone(output);
    }
  };
}

function conflict(input: {
  id: string;
  subject?: string;
  property: string;
  conflictType:
    | "VALUE_MISMATCH"
    | "IDENTITY_MISMATCH"
    | "RIGHTS_MISMATCH"
    | "RESTRICTION_MISMATCH"
    | "RELATIONSHIP_MISMATCH"
    | "EFFECTIVE_DATE_MISMATCH"
    | "SCOPE_MISMATCH"
    | "AUTHORITY_MISMATCH"
    | "OTHER";
  evidenceIds: string[];
  likelyCause?: string;
}) {
  return {
    id: input.id,
    subject: input.subject ?? "object:arcadia:class-a",
    property: input.property,
    conflictType: input.conflictType,
    evidence: input.evidenceIds.map(locator),
    ...(input.likelyCause === undefined ? {} : { likelyCause: input.likelyCause }),
    confidence: 0.9
  };
}

describe("Noema AI conflict and ambiguity analyst", () => {
  it("preserves both sides of a conflicting redemption-period proposition", async () => {
    const observations = [
      observation({ id: "terms-summary", property: "redemptionPeriodDays", value: 1 }),
      observation({ id: "terms-appendix", property: "redemptionPeriodDays", value: 5 })
    ];
    const result = await analyzeConflicts({
      observations,
      model: modelReturning({
        conflicts: [
          conflict({
            id: "conflict:redemption",
            property: "redemptionPeriodDays",
            conflictType: "VALUE_MISMATCH",
            evidenceIds: ["terms-summary", "terms-appendix"],
            likelyCause: "The summary and appendix state incompatible redemption periods."
          })
        ],
        unresolvedIssues: []
      })
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.evidence.map((item) => item.evidenceRef).sort()).toEqual([
      "evidence:terms-appendix",
      "evidence:terms-summary"
    ]);
    expect(conflictExceptionCandidates({ result, observations })).toEqual(["EVIDENCE_CONFLICT"]);
  });

  it("rejects a model that drops one materially conflicting source", async () => {
    const observations = [
      observation({ id: "redemption-a", property: "redemptionPeriodDays", value: 1 }),
      observation({ id: "redemption-b", property: "redemptionPeriodDays", value: 5 })
    ];

    await expect(
      analyzeConflicts({
        observations,
        model: modelReturning({
          conflicts: [
            conflict({
              id: "conflict:redemption:incomplete",
              property: "redemptionPeriodDays",
              conflictType: "VALUE_MISMATCH",
              evidenceIds: ["redemption-a"]
            })
          ],
          unresolvedIssues: []
        })
      })
    ).rejects.toMatchObject({ code: "INCOMPLETE_CONFLICT_EVIDENCE" });
  });

  it("rejects silent confidence-based winner selection when a material contradiction exists", async () => {
    const observations = [
      observation({ id: "issuer-a", property: "issuerIdentity", value: "Arcadia Treasury SPV I" }),
      observation({ id: "issuer-b", property: "issuerIdentity", value: "Arcadia Treasury Fund LLC" })
    ];

    await expect(
      analyzeConflicts({
        observations,
        model: modelReturning({ conflicts: [], unresolvedIssues: [] })
      })
    ).rejects.toBeInstanceOf(ConflictAnalysisError);
  });

  it("maps issuer identity conflict to canonical identity ambiguity candidate", async () => {
    const observations = [
      observation({ id: "issuer-primary", property: "issuerIdentity", value: "Arcadia Treasury SPV I" }),
      observation({ id: "issuer-registry", property: "issuerIdentity", value: "Arcadia Treasury SPV II" })
    ];
    const result = await analyzeConflicts({
      observations,
      model: modelReturning({
        conflicts: [
          conflict({
            id: "conflict:issuer",
            property: "issuerIdentity",
            conflictType: "IDENTITY_MISMATCH",
            evidenceIds: ["issuer-primary", "issuer-registry"]
          })
        ],
        unresolvedIssues: []
      })
    });

    expect(conflictExceptionCandidates({ result, observations })).toEqual([
      "EVIDENCE_CONFLICT",
      "IDENTITY_AMBIGUOUS"
    ]);
  });

  it("preserves stale-vs-current filing disagreement and surfaces EVIDENCE_STALE", async () => {
    const observations = [
      observation({
        id: "filing-2025",
        property: "eligibleInvestorClass",
        value: "ACCREDITED_ONLY",
        freshness: "STALE",
        effectiveAt: 1_735_689_600_000
      }),
      observation({
        id: "filing-2026",
        property: "eligibleInvestorClass",
        value: "QUALIFIED_INSTITUTIONAL_OR_PROFESSIONAL",
        freshness: "FRESH",
        effectiveAt: 1_767_225_600_000
      })
    ];
    const result = await analyzeConflicts({
      observations,
      model: modelReturning({
        conflicts: [
          conflict({
            id: "conflict:effective-date",
            property: "eligibleInvestorClass",
            conflictType: "EFFECTIVE_DATE_MISMATCH",
            evidenceIds: ["filing-2025", "filing-2026"],
            likelyCause: "The observations appear to describe different effective periods."
          })
        ],
        unresolvedIssues: []
      })
    });

    expect(conflictExceptionCandidates({ result, observations })).toEqual([
      "EVIDENCE_CONFLICT",
      "EVIDENCE_STALE"
    ]);
  });

  it("preserves incompatible share-class/scope evidence rather than merging it", async () => {
    const observations = [
      observation({
        id: "class-a-rights",
        property: "redemptionRight",
        value: "DAILY",
        shareClass: "CLASS_A",
        scope: "CLASS_A"
      }),
      observation({
        id: "class-b-rights",
        property: "redemptionRight",
        value: "MONTHLY",
        shareClass: "CLASS_B",
        scope: "CLASS_B"
      })
    ];
    const result = await analyzeConflicts({
      observations,
      model: modelReturning({
        conflicts: [
          conflict({
            id: "conflict:share-class-scope",
            property: "redemptionRight",
            conflictType: "SCOPE_MISMATCH",
            evidenceIds: ["class-a-rights", "class-b-rights"],
            likelyCause: "The evidence applies to different share classes."
          })
        ],
        unresolvedIssues: []
      })
    });

    expect(result.conflicts[0]?.conflictType).toBe("SCOPE_MISMATCH");
    expect(result.conflicts[0]?.evidence).toHaveLength(2);
  });

  it("keeps insufficient/no-answer evidence unresolved without fabricating a conflict", async () => {
    const observations = [
      observation({ id: "single-source", property: "governanceRights", value: "NOT_STATED" })
    ];
    const result = await analyzeConflicts({
      observations,
      model: modelReturning({
        conflicts: [],
        unresolvedIssues: [
          {
            id: "unresolved:governance-rights",
            subject: "object:arcadia:class-a",
            property: "governanceRights",
            reasonCode: "EVIDENCE_MISSING",
            evidence: [locator("single-source")],
            requiredEvidence: ["issuer governing document"],
            explanation: "One source is insufficient to establish governance rights or a conflict."
          }
        ]
      })
    });

    expect(result.conflicts).toEqual([]);
    expect(result.unresolvedIssues[0]?.reasonCode).toBe("EVIDENCE_MISSING");
  });
});
