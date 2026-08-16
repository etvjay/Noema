import { describe, expect, it } from "vitest";
import type { Evidence, SourceSnapshot } from "@noema/economic-kernel";
import type { ProposedClaim } from "@noema/schemas/ai";
import {
  RightsRestrictionsError,
  interpretRightsAndRestrictions,
  type RightsRestrictionsModel
} from "../../packages/noema-ai/src/rights.js";
import fixture from "../../fixtures/ai/tokenized-treasury-issuer-terms.json";

const snapshot = fixture.sourceSnapshot as SourceSnapshot;
const evidence = fixture.evidence as Evidence;
const evidenceInput = { snapshot, evidence, content: fixture.content };

const claims: ProposedClaim[] = [
  {
    id: "proposal-claim:arcadia:redemption",
    subject: "object:arcadia:class-a",
    property: "redemptionPeriodMs",
    value: 86_400_000,
    unit: "ms",
    basis: "DIRECT_STATEMENT",
    confidence: 0.99,
    evidence: [
      {
        sourceSnapshotRef: snapshot.id,
        evidenceRef: evidence.id,
        locator: "document://arcadia-treasury/class-a/terms#redemption"
      }
    ]
  },
  {
    id: "proposal-claim:arcadia:eligibility",
    subject: "object:arcadia:class-a",
    property: "eligibleInvestorClass",
    value: "QUALIFIED_INSTITUTIONAL_OR_PROFESSIONAL",
    basis: "INFERRED",
    confidence: 0.82,
    evidence: [
      {
        sourceSnapshotRef: snapshot.id,
        evidenceRef: evidence.id,
        locator: "document://arcadia-treasury/class-a/terms#eligibility"
      }
    ]
  }
];

function locator(fragment: string) {
  return {
    sourceSnapshotRef: snapshot.id,
    evidenceRef: evidence.id,
    locator: `document://arcadia-treasury/class-a/terms#${fragment}`
  };
}

function modelReturning(output: unknown): RightsRestrictionsModel {
  return {
    async interpret() {
      return structuredClone(output);
    }
  };
}

describe("Noema AI rights and restrictions interpretation", () => {
  it("grounds redemption rights and investor restrictions in supplied claims/evidence", async () => {
    const result = await interpretRightsAndRestrictions({
      evidenceInput,
      claims,
      model: modelReturning({
        rights: [
          {
            id: "proposed-right:arcadia:redemption",
            subject: "object:arcadia:class-a",
            type: "REDEMPTION",
            terms: { periodMs: 86_400_000 },
            confidence: 0.98,
            evidence: [locator("redemption")],
            supportingClaimRefs: ["proposal-claim:arcadia:redemption"],
            unresolvedDimensions: []
          }
        ],
        restrictions: [
          {
            id: "proposed-restriction:arcadia:eligibility",
            subject: "object:arcadia:class-a",
            type: "INVESTOR_ELIGIBILITY",
            scope: "HOLDING_AND_TRANSFER",
            terms: { eligibleClass: "QUALIFIED_INSTITUTIONAL_OR_PROFESSIONAL" },
            confidence: 0.9,
            evidence: [locator("eligibility")],
            supportingClaimRefs: ["proposal-claim:arcadia:eligibility"],
            unresolvedDimensions: []
          }
        ],
        unresolvedIssues: []
      })
    });

    expect(result.rights[0]?.type).toBe("REDEMPTION");
    expect(result.restrictions[0]?.type).toBe("INVESTOR_ELIGIBILITY");
    expect(result.rights[0]?.supportingClaimRefs).toEqual(["proposal-claim:arcadia:redemption"]);
  });

  it("keeps unsupported rights unresolved rather than inventing them", async () => {
    const result = await interpretRightsAndRestrictions({
      evidenceInput,
      claims,
      model: modelReturning({
        rights: [],
        restrictions: [],
        unresolvedIssues: [
          {
            id: "unresolved:arcadia:governance-rights",
            subject: "object:arcadia:class-a",
            property: "governanceRights",
            reasonCode: "EVIDENCE_MISSING",
            evidence: [],
            requiredEvidence: ["issuer governing document or shareholder rights schedule"],
            explanation: "The supplied terms do not state governance or voting rights."
          }
        ]
      })
    });

    expect(result.rights).toEqual([]);
    expect(result.unresolvedIssues[0]?.reasonCode).toBe("EVIDENCE_MISSING");
  });

  it("allows materially different share classes to carry different proposed rights despite naming similarity", async () => {
    const classA = await interpretRightsAndRestrictions({
      evidenceInput,
      claims,
      model: modelReturning({
        rights: [
          {
            id: "right:class-a:redemption",
            subject: "representation:TNOTE-A",
            type: "REDEMPTION",
            terms: { periodDays: 1 },
            confidence: 0.99,
            evidence: [locator("redemption")],
            supportingClaimRefs: ["proposal-claim:arcadia:redemption"],
            unresolvedDimensions: []
          }
        ],
        restrictions: [],
        unresolvedIssues: []
      })
    });
    const classB = await interpretRightsAndRestrictions({
      evidenceInput,
      claims,
      model: modelReturning({
        rights: [
          {
            id: "right:class-b:redemption",
            subject: "representation:TNOTE-B",
            type: "REDEMPTION",
            terms: { periodDays: 5 },
            confidence: 0.99,
            evidence: [locator("redemption")],
            supportingClaimRefs: ["proposal-claim:arcadia:redemption"],
            unresolvedDimensions: ["share-class-specific effective terms require confirmation"]
          }
        ],
        restrictions: [],
        unresolvedIssues: []
      })
    });

    expect(classA.rights[0]?.terms).not.toEqual(classB.rights[0]?.terms);
  });

  it("rejects rights backed by claims outside the supplied extraction result", async () => {
    await expect(
      interpretRightsAndRestrictions({
        evidenceInput,
        claims,
        model: modelReturning({
          rights: [
            {
              id: "right:unsupported",
              subject: "object:arcadia:class-a",
              type: "DISTRIBUTION",
              terms: { frequency: "MONTHLY" },
              confidence: 0.9,
              evidence: [locator("distributions")],
              supportingClaimRefs: ["proposal-claim:not-supplied"],
              unresolvedDimensions: []
            }
          ],
          restrictions: [],
          unresolvedIssues: []
        })
      })
    ).rejects.toMatchObject({ code: "UNKNOWN_SUPPORTING_CLAIM" });
  });

  it("rejects foreign evidence references", async () => {
    await expect(
      interpretRightsAndRestrictions({
        evidenceInput,
        claims,
        model: modelReturning({
          rights: [],
          restrictions: [
            {
              id: "restriction:foreign",
              subject: "object:arcadia:class-a",
              type: "TRANSFER",
              scope: "TRANSFER",
              terms: {},
              confidence: 0.9,
              evidence: [
                {
                  sourceSnapshotRef: "source-snapshot:foreign",
                  evidenceRef: "evidence:foreign",
                  locator: "document://foreign"
                }
              ],
              supportingClaimRefs: ["proposal-claim:arcadia:eligibility"],
              unresolvedDimensions: []
            }
          ],
          unresolvedIssues: []
        })
      })
    ).rejects.toBeInstanceOf(RightsRestrictionsError);
  });
});
