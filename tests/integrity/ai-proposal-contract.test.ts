import { describe, expect, it } from "vitest";
import {
  NOEMA_AI_PROPOSAL_HASH_VERSION,
  NOEMA_AI_PROPOSAL_SCHEMA_VERSION,
  NOEMA_AI_RUN_SCHEMA_VERSION,
  hashNoemaAiProposal,
  noemaAiProposalSchema,
  noemaAiRunReceiptSchema,
  type NoemaAiProposal
} from "@noema/schemas/ai";

const STARTED_AT = 1_700_000_000_000;
const COMPLETED_AT = STARTED_AT + 240;

function locator(index: number) {
  return {
    sourceSnapshotRef: `source-snapshot:${index}`,
    evidenceRef: `evidence:${index}`,
    locator: `document://issuer/section/${index}`
  };
}

function proposal(reverse = false): NoemaAiProposal {
  const claims = [
    {
      id: "proposal-claim:redemption",
      subject: "object:rwa:1",
      property: "redemptionPeriodMs",
      value: 86_400_000,
      unit: "ms",
      basis: "DIRECT_STATEMENT" as const,
      confidence: 0.96,
      evidence: [locator(1)],
      explanation: "Issuer terms directly state a one-day redemption period."
    },
    {
      id: "proposal-claim:eligibility",
      subject: "object:rwa:1",
      property: "eligibility",
      value: "QUALIFIED_INVESTORS",
      basis: "INFERRED" as const,
      confidence: 0.72,
      evidence: [locator(2)],
      explanation: "Eligibility is proposed from the cited restriction language."
    }
  ];

  const value = {
    schemaVersion: NOEMA_AI_PROPOSAL_SCHEMA_VERSION,
    proposalId: "proposal:rwa:1:v1",
    sourceSnapshotRefs: reverse
      ? ["source-snapshot:2", "source-snapshot:1"]
      : ["source-snapshot:1", "source-snapshot:2"],
    evidenceRefs: reverse ? ["evidence:2", "evidence:1"] : ["evidence:1", "evidence:2"],
    claims: reverse ? [...claims].reverse() : claims,
    rights: [],
    restrictions: [],
    relationships: [],
    conflicts: [],
    unresolvedIssues: []
  };

  return noemaAiProposalSchema.parse(value);
}

describe("Noema AI proposal contract and run provenance", () => {
  it("accepts structured proposal-only output with exact evidence/source locators", () => {
    const parsed = proposal();

    expect(parsed.claims).toHaveLength(2);
    expect(parsed.claims[0]!.evidence[0]).toEqual(locator(1));
    expect(parsed.claims[1]!.basis).toBe("INFERRED");
    expect(parsed).not.toHaveProperty("verificationStatus");
    expect(parsed).not.toHaveProperty("mandateDecision");
    expect(parsed).not.toHaveProperty("canonicalObject");
  });

  it("rejects malformed or authority-smuggling model output instead of coercing it", () => {
    const valid = proposal();

    expect(() =>
      noemaAiProposalSchema.parse({
        ...valid,
        verified: true
      })
    ).toThrow();

    expect(() =>
      noemaAiProposalSchema.parse({
        ...valid,
        claims: [
          {
            ...valid.claims[0],
            evidence: []
          }
        ]
      })
    ).toThrow();

    expect(() =>
      noemaAiProposalSchema.parse({
        ...valid,
        schemaVersion: "future-unknown-schema"
      })
    ).toThrow();
  });

  it("replays the same proposal content to the same deterministic proposal hash", () => {
    const first = proposal(false);
    const permuted = proposal(true);

    expect(hashNoemaAiProposal(first)).toBe(hashNoemaAiProposal(first));
    expect(hashNoemaAiProposal(permuted)).toBe(hashNoemaAiProposal(first));
    expect(hashNoemaAiProposal(first)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes the proposal hash when material proposed economic content changes", () => {
    const base = proposal();
    const changed = noemaAiProposalSchema.parse({
      ...base,
      claims: base.claims.map((claim) =>
        claim.id === "proposal-claim:redemption"
          ? { ...claim, value: 172_800_000 }
          : claim
      )
    });

    expect(hashNoemaAiProposal(changed)).not.toBe(hashNoemaAiProposal(base));
  });

  it("records reproducible run provenance separately from proposal authority", () => {
    const parsedProposal = proposal();
    const outputProposalHash = hashNoemaAiProposal(parsedProposal);
    const input = {
      schemaVersion: NOEMA_AI_RUN_SCHEMA_VERSION,
      runId: "ai-run:rwa:1:001",
      model: "fixture-model",
      modelVersion: "fixture-model-v1",
      promptVersion: "noema-ai-prompt-v1",
      proposalSchemaVersion: NOEMA_AI_PROPOSAL_SCHEMA_VERSION,
      inputSourceSnapshotRefs: [...parsedProposal.sourceSnapshotRefs],
      inputEvidenceRefs: [...parsedProposal.evidenceRefs],
      outputProposalHash,
      proposalHashVersion: NOEMA_AI_PROPOSAL_HASH_VERSION,
      latencyMs: 240,
      tokenUsage: {
        inputTokens: 500,
        outputTokens: 120,
        totalTokens: 620
      },
      status: "SUCCESS" as const,
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT
    };

    const first = noemaAiRunReceiptSchema.parse(input);
    const replay = noemaAiRunReceiptSchema.parse(structuredClone(input));

    expect(replay).toEqual(first);
    expect(first.outputProposalHash).toBe(hashNoemaAiProposal(parsedProposal));
    expect(first).not.toHaveProperty("verified");
    expect(first).not.toHaveProperty("decision");
  });

  it("rejects internally inconsistent run receipts", () => {
    const parsedProposal = proposal();
    const common = {
      schemaVersion: NOEMA_AI_RUN_SCHEMA_VERSION,
      runId: "ai-run:rwa:1:bad",
      model: "fixture-model",
      promptVersion: "noema-ai-prompt-v1",
      proposalSchemaVersion: NOEMA_AI_PROPOSAL_SCHEMA_VERSION,
      inputSourceSnapshotRefs: parsedProposal.sourceSnapshotRefs,
      inputEvidenceRefs: parsedProposal.evidenceRefs,
      outputProposalHash: hashNoemaAiProposal(parsedProposal),
      proposalHashVersion: NOEMA_AI_PROPOSAL_HASH_VERSION,
      latencyMs: 10,
      status: "SUCCESS" as const,
      startedAt: STARTED_AT
    };

    expect(() =>
      noemaAiRunReceiptSchema.parse({
        ...common,
        tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 99 },
        completedAt: COMPLETED_AT
      })
    ).toThrow();

    expect(() =>
      noemaAiRunReceiptSchema.parse({
        ...common,
        tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        completedAt: STARTED_AT - 1
      })
    ).toThrow();
  });
});
