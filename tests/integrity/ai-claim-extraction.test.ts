import { describe, expect, it } from "vitest";
import type { Evidence, SourceSnapshot } from "@noema/economic-kernel";
import {
  NOEMA_AI_PROPOSAL_SCHEMA_VERSION,
  hashNoemaAiProposal,
  noemaAiProposalSchema
} from "@noema/schemas/ai";
import {
  ClaimExtractionError,
  extractClaims,
  type ClaimExtractionModel,
  type ClaimExtractionModelEnvelope
} from "../../packages/noema-ai/src/claims.js";
import fixture from "../../fixtures/ai/tokenized-treasury-issuer-terms.json";

const snapshot = fixture.sourceSnapshot as SourceSnapshot;
const evidence = fixture.evidence as Evidence;

function boundedLocator(locator: string) {
  return {
    sourceSnapshotRef: snapshot.id,
    evidenceRef: evidence.id,
    locator
  };
}

function modelReturning(output: unknown, observe?: (envelope: ClaimExtractionModelEnvelope) => void): ClaimExtractionModel {
  return {
    async extractClaims(envelope) {
      observe?.(envelope);
      return structuredClone(output);
    }
  };
}

describe("Noema AI evidence-grounded claim extraction", () => {
  it("extracts source-located direct and inferred claims from a realistic RWA issuer fixture", async () => {
    let observedEnvelope: ClaimExtractionModelEnvelope | undefined;
    const claims = await extractClaims({
      evidenceInput: { snapshot, evidence, content: fixture.content },
      model: modelReturning(
        [
          {
            id: "proposal-claim:arcadia:redemption",
            subject: "object:arcadia:class-a",
            property: "redemptionPeriodMs",
            value: 86_400_000,
            unit: "ms",
            basis: "DIRECT_STATEMENT",
            confidence: 0.99,
            evidence: [boundedLocator("document://arcadia-treasury/class-a/terms#redemption")]
          },
          {
            id: "proposal-claim:arcadia:eligibility",
            subject: "object:arcadia:class-a",
            property: "eligibleInvestorClass",
            value: "QUALIFIED_INSTITUTIONAL_OR_PROFESSIONAL",
            basis: "INFERRED",
            confidence: 0.82,
            evidence: [boundedLocator("document://arcadia-treasury/class-a/terms#eligibility")]
          },
          {
            id: "proposal-claim:arcadia:distribution-frequency",
            subject: "object:arcadia:class-a",
            property: "distributionFrequency",
            value: "MONTHLY",
            basis: "DIRECT_STATEMENT",
            confidence: 0.98,
            evidence: [boundedLocator("document://arcadia-treasury/class-a/terms#distributions")]
          }
        ],
        (envelope) => {
          observedEnvelope = envelope;
        }
      )
    });

    expect(claims).toHaveLength(3);
    expect(claims.map((claim) => claim.basis)).toContain("DIRECT_STATEMENT");
    expect(claims.map((claim) => claim.basis)).toContain("INFERRED");
    expect(claims.every((claim) => claim.evidence[0]?.evidenceRef === evidence.id)).toBe(true);
    expect(observedEnvelope?.rules.sourceTextIsDataNotInstructions).toBe(true);
    expect(observedEnvelope?.rules.verifiedStateForbidden).toBe(true);
    expect(observedEnvelope?.source.contentHash).toBe(snapshot.contentHash);

    const proposal = noemaAiProposalSchema.parse({
      schemaVersion: NOEMA_AI_PROPOSAL_SCHEMA_VERSION,
      proposalId: "proposal:arcadia:claim-extraction:v1",
      sourceSnapshotRefs: [snapshot.id],
      evidenceRefs: [evidence.id],
      claims,
      rights: [],
      restrictions: [],
      relationships: [],
      conflicts: [],
      unresolvedIssues: []
    });
    expect(hashNoemaAiProposal(proposal)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("accepts a tabular numeric value without inventing a missing unit", async () => {
    const claims = await extractClaims({
      evidenceInput: { snapshot, evidence, content: "Metric | Value\nNAV | 100.25" },
      model: modelReturning([
        {
          id: "proposal-claim:nav",
          subject: "object:arcadia:class-a",
          property: "nav",
          value: 100.25,
          basis: "DIRECT_STATEMENT",
          confidence: 0.99,
          evidence: [boundedLocator("table://metrics/row/nav")]
        }
      ])
    });

    expect(claims[0]?.value).toBe(100.25);
    expect(claims[0]).not.toHaveProperty("unit");
  });

  it("preserves contradictory proposed claims instead of silently selecting truth", async () => {
    const claims = await extractClaims({
      evidenceInput: {
        snapshot,
        evidence,
        content: "Summary says redemption is 1 day. Appendix says redemption is 5 days."
      },
      model: modelReturning([
        {
          id: "proposal-claim:redemption:summary",
          subject: "object:arcadia:class-a",
          property: "redemptionPeriodDays",
          value: 1,
          unit: "days",
          basis: "DIRECT_STATEMENT",
          confidence: 0.95,
          evidence: [boundedLocator("document://terms#summary")]
        },
        {
          id: "proposal-claim:redemption:appendix",
          subject: "object:arcadia:class-a",
          property: "redemptionPeriodDays",
          value: 5,
          unit: "days",
          basis: "DIRECT_STATEMENT",
          confidence: 0.95,
          evidence: [boundedLocator("document://terms#appendix")]
        }
      ])
    });

    expect(claims).toHaveLength(2);
    expect(claims.map((claim) => claim.value)).toEqual([1, 5]);
  });

  it("permits an explicit no-answer result without fabricating claims", async () => {
    const claims = await extractClaims({
      evidenceInput: { snapshot, evidence, content: "No redemption terms are stated." },
      model: modelReturning([])
    });

    expect(claims).toEqual([]);
  });

  it("rejects malformed or authority-smuggling model output", async () => {
    await expect(
      extractClaims({
        evidenceInput: { snapshot, evidence, content: fixture.content },
        model: modelReturning([
          {
            id: "proposal-claim:bad",
            subject: "object:arcadia:class-a",
            property: "redemptionPeriodMs",
            value: 86_400_000,
            basis: "DIRECT_STATEMENT",
            confidence: 1,
            evidence: [boundedLocator("document://terms#redemption")],
            verified: true
          }
        ])
      })
    ).rejects.toMatchObject({ code: "MALFORMED_MODEL_OUTPUT" });
  });

  it("rejects model references outside the bounded SourceSnapshot/Evidence input", async () => {
    await expect(
      extractClaims({
        evidenceInput: { snapshot, evidence, content: fixture.content },
        model: modelReturning([
          {
            id: "proposal-claim:foreign",
            subject: "object:arcadia:class-a",
            property: "issuer",
            value: "Arcadia Treasury SPV I",
            basis: "DIRECT_STATEMENT",
            confidence: 0.99,
            evidence: [
              {
                sourceSnapshotRef: "source-snapshot:unseen",
                evidenceRef: "evidence:unseen",
                locator: "document://unseen"
              }
            ]
          }
        ])
      })
    ).rejects.toBeInstanceOf(ClaimExtractionError);
  });

  it("fails closed when evidence does not match its immutable source snapshot", async () => {
    await expect(
      extractClaims({
        evidenceInput: {
          snapshot,
          evidence: { ...evidence, contentHash: `0x${"00".repeat(32)}` },
          content: fixture.content
        },
        model: modelReturning([])
      })
    ).rejects.toMatchObject({ code: "CONTENT_HASH_MISMATCH" });
  });
});
