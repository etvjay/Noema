import { describe, expect, it } from "vitest";
import type {
  ProposedClaim,
  ProposedRestriction,
  ProposedRight
} from "@noema/schemas/ai";
import type {
  SemanticRepresentationLink,
  SemanticRepresentationProfile
} from "@noema/noema-core/semantic";
import {
  RelationshipInterpretationError,
  classifyRelationships,
  type RelationshipInterpretationModel,
  type RelationshipRepresentationInput
} from "../../packages/noema-ai/src/relationships.js";

const SOURCE = "source-snapshot:semantic:rwa";
const EVIDENCE = "evidence:semantic:rwa";
const REQUIRED_DIMENSIONS = [
  "economicClaim",
  "issuer",
  "shareClass",
  "rights",
  "restrictions",
  "backing",
  "redemption",
  "supportedRepresentationLink"
];

function locator(fragment = "relationship") {
  return {
    sourceSnapshotRef: SOURCE,
    evidenceRef: EVIDENCE,
    locator: `document://semantic-rwa#${fragment}`
  };
}

const claims: ProposedClaim[] = [
  {
    id: "claim:semantic:economic-identity",
    subject: "object:semantic:rwa",
    property: "economicIdentity",
    value: "claim:arcadia-class-a",
    basis: "DIRECT_STATEMENT",
    confidence: 0.99,
    evidence: [locator("identity")]
  }
];

const rights: ProposedRight[] = [
  {
    id: "right:semantic:redemption",
    subject: "object:semantic:rwa",
    type: "REDEMPTION",
    terms: { windowMs: 86_400_000 },
    confidence: 0.99,
    evidence: [locator("rights")],
    supportingClaimRefs: [claims[0]!.id],
    unresolvedDimensions: []
  }
];

const restrictions: ProposedRestriction[] = [
  {
    id: "restriction:semantic:eligibility",
    subject: "object:semantic:rwa",
    type: "INVESTOR_ELIGIBILITY",
    scope: "HOLDING_AND_TRANSFER",
    terms: { class: "QUALIFIED_INVESTORS" },
    confidence: 0.98,
    evidence: [locator("restrictions")],
    supportingClaimRefs: [claims[0]!.id],
    unresolvedDimensions: []
  }
];

function profile(overrides: Partial<SemanticRepresentationProfile> = {}): SemanticRepresentationProfile {
  return {
    id: "representation:base",
    economicClaim: "claim:arcadia-class-a",
    issuerClaim: "issuer:arcadia-spv-i",
    shareClass: "CLASS_A",
    exposureClass: "US_TREASURY_BILL",
    rights: ["REDEMPTION_1D", "BENEFICIAL_INTEREST"],
    restrictions: ["QUALIFIED_INVESTORS"],
    backing: ["UST_POOL_ARCADIA_1"],
    redemption: { asset: "USD", windowMs: 86_400_000 },
    evidenceFreshness: "FRESH",
    ...overrides
  };
}

function representation(
  id: string,
  overrides: Partial<SemanticRepresentationProfile> = {},
  labels: { name?: string; ticker?: string } = {}
): RelationshipRepresentationInput {
  return {
    profile: profile({ id, ...overrides }),
    ...labels,
    claimRefs: [claims[0]!.id],
    rightRefs: [rights[0]!.id],
    restrictionRefs: [restrictions[0]!.id]
  };
}

function bridge(left: string, right: string): SemanticRepresentationLink[] {
  return [{ from: left, to: right, type: "BRIDGED_REPRESENTATION_OF" }];
}

function modelReturning(output: unknown): RelationshipInterpretationModel {
  return {
    async classify() {
      return structuredClone(output);
    }
  };
}

function relationship(input: {
  id: string;
  subject: string;
  object: string;
  predicate: "ECONOMICALLY_EQUIVALENT_TO" | "SIMILAR_EXPOSURE_TO";
  comparedDimensions?: string[];
  unresolvedDimensions?: string[];
}) {
  return {
    id: input.id,
    subject: input.subject,
    predicate: input.predicate,
    object: input.object,
    confidence: 0.99,
    evidence: [locator()],
    supportingClaimRefs: [claims[0]!.id],
    comparedDimensions: input.comparedDimensions ?? [...REQUIRED_DIMENSIONS],
    unresolvedDimensions: input.unresolvedDimensions ?? [],
    explanation: "Relationship proposal grounded in compared economic dimensions."
  };
}

function baseInput(left: RelationshipRepresentationInput, right: RelationshipRepresentationInput) {
  return {
    left,
    right,
    links: bridge(left.profile.id, right.profile.id),
    claims,
    rights,
    restrictions,
    evidenceScope: [{ sourceSnapshotRef: SOURCE, evidenceRef: EVIDENCE }]
  };
}

describe("Noema AI semantic relationship interpreter", () => {
  it("Case A permits economic-equivalence proposal only when all qualifying dimensions and representation linkage agree", async () => {
    const left = representation("representation:arcadia:canonical");
    const right = representation("representation:arcadia:bridged");
    const result = await classifyRelationships({
      ...baseInput(left, right),
      model: modelReturning({
        relationships: [
          relationship({
            id: "relationship:case-a",
            subject: left.profile.id,
            object: right.profile.id,
            predicate: "ECONOMICALLY_EQUIVALENT_TO"
          })
        ],
        unresolvedIssues: []
      })
    });

    expect(result.relationships[0]?.predicate).toBe("ECONOMICALLY_EQUIVALENT_TO");
    expect(result.relationships[0]?.comparedDimensions.sort()).toEqual([...REQUIRED_DIMENSIONS].sort());
  });

  it("Case B rejects equivalence for same-name/ticker share classes with materially different rights", async () => {
    const left = representation(
      "representation:treasury-note:class-a",
      {},
      { name: "Treasury Note", ticker: "TNOTE" }
    );
    const right = representation(
      "representation:treasury-note:class-b",
      {
        economicClaim: "claim:arcadia-class-b",
        shareClass: "CLASS_B",
        rights: ["REDEMPTION_5D", "BENEFICIAL_INTEREST"],
        redemption: { asset: "USD", windowMs: 432_000_000 }
      },
      { name: "Treasury Note", ticker: "TNOTE" }
    );

    await expect(
      classifyRelationships({
        ...baseInput(left, right),
        model: modelReturning({
          relationships: [
            relationship({
              id: "relationship:case-b:false-equivalence",
              subject: left.profile.id,
              object: right.profile.id,
              predicate: "ECONOMICALLY_EQUIVALENT_TO"
            })
          ],
          unresolvedIssues: []
        })
      })
    ).rejects.toMatchObject({ code: "FALSE_EQUIVALENCE_PROPOSAL" });

    const safe = await classifyRelationships({
      ...baseInput(left, right),
      model: modelReturning({
        relationships: [
          relationship({
            id: "relationship:case-b:similar",
            subject: left.profile.id,
            object: right.profile.id,
            predicate: "SIMILAR_EXPOSURE_TO",
            comparedDimensions: ["economicClaim", "shareClass", "rights", "redemption"]
          })
        ],
        unresolvedIssues: []
      })
    });
    expect(safe.relationships[0]?.predicate).toBe("SIMILAR_EXPOSURE_TO");
  });

  it("Case C keeps similar Treasury exposure non-equivalent when issuer and economic claim differ", async () => {
    const left = representation("representation:arcadia:treasury");
    const right = representation("representation:borealis:treasury", {
      economicClaim: "claim:borealis-treasury",
      issuerClaim: "issuer:borealis-fund",
      shareClass: "BOREALIS_A",
      backing: ["UST_POOL_BOREALIS_7"]
    });

    const result = await classifyRelationships({
      ...baseInput(left, right),
      model: modelReturning({
        relationships: [
          relationship({
            id: "relationship:case-c",
            subject: left.profile.id,
            object: right.profile.id,
            predicate: "SIMILAR_EXPOSURE_TO",
            comparedDimensions: ["economicClaim", "issuer", "shareClass", "backing", "exposureClass"]
          })
        ],
        unresolvedIssues: []
      })
    });

    expect(result.relationships[0]?.predicate).toBe("SIMILAR_EXPOSURE_TO");
  });

  it("rejects ticker/name-only equivalence even at high model confidence", async () => {
    const left = representation("representation:alpha", {}, { name: "USD Treasury", ticker: "USTX" });
    const right = representation(
      "representation:beta",
      {
        economicClaim: "claim:beta",
        issuerClaim: "issuer:beta",
        shareClass: "BETA",
        rights: ["NO_REDEMPTION"],
        restrictions: [],
        backing: ["UST_POOL_BETA"],
        redemption: { asset: "USD", windowMs: 2_592_000_000 }
      },
      { name: "USD Treasury", ticker: "USTX" }
    );

    await expect(
      classifyRelationships({
        ...baseInput(left, right),
        model: modelReturning({
          relationships: [
            relationship({
              id: "relationship:ticker-only",
              subject: left.profile.id,
              object: right.profile.id,
              predicate: "ECONOMICALLY_EQUIVALENT_TO"
            })
          ],
          unresolvedIssues: []
        })
      })
    ).rejects.toBeInstanceOf(RelationshipInterpretationError);
  });

  it("requires every material equivalence dimension and refuses unresolved equivalence", async () => {
    const left = representation("representation:complete:left");
    const right = representation("representation:complete:right");

    await expect(
      classifyRelationships({
        ...baseInput(left, right),
        model: modelReturning({
          relationships: [
            relationship({
              id: "relationship:missing-dimensions",
              subject: left.profile.id,
              object: right.profile.id,
              predicate: "ECONOMICALLY_EQUIVALENT_TO",
              comparedDimensions: ["economicClaim", "issuer"],
              unresolvedDimensions: ["rights"]
            })
          ],
          unresolvedIssues: []
        })
      })
    ).rejects.toMatchObject({ code: "EQUIVALENCE_DIMENSIONS_INCOMPLETE" });
  });

  it("preserves ambiguity when the evidence cannot support a relationship classification", async () => {
    const left = representation("representation:ambiguous:left");
    const right = representation("representation:ambiguous:right");
    const result = await classifyRelationships({
      ...baseInput(left, right),
      model: modelReturning({
        relationships: [],
        unresolvedIssues: [
          {
            id: "unresolved:relationship:backing",
            subject: left.profile.id,
            property: "relationship",
            reasonCode: "RELATIONSHIP_AMBIGUOUS",
            evidence: [locator("identity")],
            requiredEvidence: ["issuer-authenticated representation linkage"],
            explanation: "The supplied evidence does not establish whether these representations share one economic claim."
          }
        ]
      })
    });

    expect(result.relationships).toEqual([]);
    expect(result.unresolvedIssues[0]?.reasonCode).toBe("RELATIONSHIP_AMBIGUOUS");
  });
});
