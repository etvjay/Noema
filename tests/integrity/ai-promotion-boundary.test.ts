import { describe, expect, it } from "vitest";
import type { Evidence, SourceSnapshot } from "@noema/economic-kernel";
import { reduceEconomicObject } from "@noema/noema-core";
import {
  hashNoemaAiProposal,
  type NoemaAiProposal
} from "@noema/schemas/ai";
import {
  applyAcceptedAiProposal,
  reduceAiProposalPromotion
} from "../../packages/noema-ai/src/promotion.js";
import fixture from "../../fixtures/ai/tokenized-treasury-issuer-terms.json";

const NOW = 1_700_000_100_000;
const snapshot = fixture.sourceSnapshot as SourceSnapshot;
const evidence = fixture.evidence as Evidence;

function objectWithEvidence(currentEvidence: Evidence = evidence) {
  return reduceEconomicObject({
    id: "object:arcadia:class-a",
    version: 1,
    classification: {
      primary: "TOKENIZED_TREASURY",
      secondary: ["RWA"],
      confidence: 1,
      claimRef: "claim:classification"
    },
    identifiers: [],
    representations: [],
    relationships: [],
    parties: [],
    rights: [],
    obligations: [],
    restrictions: [],
    economics: {
      asOf: NOW,
      values: {},
      claimRefs: []
    },
    claims: [],
    evidence: [currentEvidence],
    attestations: [],
    exceptions: [],
    provenance: { edges: [] },
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000
  });
}

function locator() {
  return {
    sourceSnapshotRef: snapshot.id,
    evidenceRef: evidence.id,
    locator: evidence.locator ?? "document://arcadia"
  };
}

function proposal(overrides: Partial<NoemaAiProposal> = {}): NoemaAiProposal {
  return {
    schemaVersion: "noema-ai-proposal-v1",
    proposalId: "proposal:promotion:1",
    sourceSnapshotRefs: [snapshot.id],
    evidenceRefs: [evidence.id],
    claims: [
      {
        id: "proposed-claim:redemption-days",
        subject: "object:arcadia:class-a",
        property: "redemptionPeriodDays",
        value: 1,
        unit: "business-day",
        basis: "DIRECT_STATEMENT",
        confidence: 0.99,
        evidence: [locator()]
      }
    ],
    rights: [],
    restrictions: [],
    relationships: [],
    conflicts: [],
    unresolvedIssues: [],
    ...overrides
  };
}

function context(input: {
  proposal: NoemaAiProposal;
  object?: ReturnType<typeof objectWithEvidence>;
  sourceSnapshots?: SourceSnapshot[];
  allowedAuthorities?: Evidence["authority"][];
}) {
  return {
    object: input.object ?? objectWithEvidence(),
    sourceSnapshots: input.sourceSnapshots ?? [snapshot],
    proposalHash: hashNoemaAiProposal(input.proposal),
    aiRunId: "ai-run:promotion:1",
    policy: {
      nowMs: NOW,
      maxEvidenceAgeMs: 86_400_000,
      allowedAuthorities: input.allowedAuthorities ?? ["DEMO_FIXTURE"]
    }
  };
}

describe("Noema AI deterministic proposal promotion", () => {
  it("replays the same proposal and canonical context deterministically", () => {
    const candidate = proposal();
    const first = reduceAiProposalPromotion(candidate, context({ proposal: candidate }));
    const second = reduceAiProposalPromotion(candidate, context({ proposal: candidate }));

    expect(second).toEqual(first);
    expect(first.decisions).toHaveLength(1);
    expect(first.decisions[0]).toMatchObject({
      itemKind: "CLAIM",
      outcome: "ACCEPT_AS_CANDIDATE",
      proposalId: candidate.proposalId,
      aiRunId: "ai-run:promotion:1"
    });
    expect(first.decisions[0]?.evidenceRefs).toEqual([evidence.id]);
    expect(first.decisions[0]?.sourceSnapshotRefs).toEqual([snapshot.id]);
  });

  it("never lets high model confidence compensate for missing canonical evidence", () => {
    const candidate = proposal({
      evidenceRefs: ["evidence:missing"],
      claims: [
        {
          id: "proposed-claim:unsupported",
          subject: "object:arcadia:class-a",
          property: "guaranteedYield",
          value: 999,
          basis: "INFERRED",
          confidence: 1,
          evidence: [
            {
              sourceSnapshotRef: snapshot.id,
              evidenceRef: "evidence:missing",
              locator: "model://invented"
            }
          ]
        }
      ]
    });

    const result = reduceAiProposalPromotion(candidate, context({ proposal: candidate }));
    expect(result.decisions[0]).toMatchObject({
      outcome: "REJECT_UNSUPPORTED",
      reasonCodes: ["EVIDENCE_NOT_FOUND"]
    });
  });

  it("requires review for stale evidence instead of promoting by confidence", () => {
    const staleEvidence: Evidence = { ...evidence, freshness: "STALE" };
    const candidate = proposal();
    const result = reduceAiProposalPromotion(
      candidate,
      context({ proposal: candidate, object: objectWithEvidence(staleEvidence) })
    );

    expect(result.decisions[0]).toMatchObject({ outcome: "REQUIRE_REVIEW" });
    expect(result.decisions[0]?.reasonCodes).toContain("EVIDENCE_STALE");
  });

  it("rejects a proposal when its stored proposal hash does not match", () => {
    const candidate = proposal();
    const ctx = context({ proposal: candidate });
    const result = reduceAiProposalPromotion(candidate, {
      ...ctx,
      proposalHash: `0x${"00".repeat(32)}`
    });

    expect(result.decisions[0]).toMatchObject({
      outcome: "REJECT_POLICY",
      reasonCodes: ["PROPOSAL_HASH_MISMATCH"]
    });
  });

  it("applies accepted AI output through the canonical reducer without creating VERIFIED state", () => {
    const candidate = proposal();
    const currentObject = objectWithEvidence();
    const promotion = reduceAiProposalPromotion(candidate, context({ proposal: candidate, object: currentObject }));
    const next = applyAcceptedAiProposal({
      proposal: candidate,
      promotion,
      object: currentObject,
      nowMs: NOW
    });

    const promoted = next.claims.find((claim) => claim.property === "redemptionPeriodDays");
    expect(promoted).toBeDefined();
    expect(promoted?.state).toBe("SOURCED");
    expect(promoted?.state).not.toBe("VERIFIED");
    expect(next.verification.status).toBe("UNRESOLVED");
    expect(next.provenance.edges.some((edge) => edge.to === candidate.proposalId)).toBe(true);
    expect(next.provenance.edges.some((edge) => edge.to === "ai-run:promotion:1")).toBe(true);
    expect(next.provenance.edges.some((edge) => edge.to === evidence.id)).toBe(true);
  });

  it("keeps explicit AI inference explicitly INFERRED after accepted promotion", () => {
    const candidate = proposal({
      claims: [
        {
          id: "proposed-claim:inferred",
          subject: "object:arcadia:class-a",
          property: "economicInterpretation",
          value: "short-duration Treasury exposure",
          basis: "INFERRED",
          confidence: 0.99,
          evidence: [locator()]
        }
      ]
    });
    const currentObject = objectWithEvidence();
    const promotion = reduceAiProposalPromotion(candidate, context({ proposal: candidate, object: currentObject }));
    const next = applyAcceptedAiProposal({ proposal: candidate, promotion, object: currentObject, nowMs: NOW });

    expect(promotion.decisions[0]?.outcome).toBe("ACCEPT_AS_INFERRED");
    expect(next.claims.find((claim) => claim.property === "economicInterpretation")?.state).toBe("INFERRED");
  });
});
