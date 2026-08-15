import { describe, expect, it } from "vitest";
import {
  hashProposal,
  validateProposal,
  createAiRunReceipt,
  validateRunReceipt,
  type NoemaAiProposal
} from "./index.js";

describe("Noema AI proposal contract and run provenance", () => {
  it("computes deterministic proposal hashes and validates valid proposals", () => {
    const rawProposal: Omit<NoemaAiProposal, "proposalHash"> = {
      proposalId: "proposal:ondo:ousg:001",
      runId: "run:ai:001",
      promptVersion: "noema-prompt-v1",
      schemaVersion: "noema-ai-schema-v1",
      proposedClaims: [
        {
          id: "claim:prop:identity",
          subject: "object:ondo:ousg",
          property: "economicIdentity",
          value: "Ondo Short-Term US Government Bond Fund",
          confidence: 0.99,
          isDirect: true,
          sourceRefs: ["source:sec:filing:001"],
          evidenceRefs: ["evidence:doc:001"],
          locator: "section:header",
          explanation: "Direct statement in SEC prospectus"
        }
      ],
      proposedRights: [
        {
          id: "right:prop:redemption",
          subject: "object:ondo:ousg",
          holderType: "TOKEN_HOLDER",
          rightType: "REDEMPTION",
          terms: "Daily liquidity subject to KYC/AML verification",
          transferability: "RESTRICTED",
          redemptionWindow: "T+1 daily",
          claimRefs: ["claim:prop:identity"],
          evidenceRefs: ["evidence:doc:001"],
          confidence: 0.95
        }
      ],
      proposedRestrictions: [
        {
          id: "rest:prop:eligibility",
          subject: "object:ondo:ousg",
          restrictionType: "ELIGIBILITY",
          jurisdiction: "US",
          eligibilityCriteria: "Qualified Purchaser only",
          claimRefs: ["claim:prop:identity"],
          evidenceRefs: ["evidence:doc:001"],
          confidence: 0.98
        }
      ],
      proposedRelationships: [
        {
          id: "rel:prop:bridge",
          subject: "rep:ondo:xlayer",
          predicate: "BRIDGED_REPRESENTATION_OF",
          object: "rep:ondo:ethereum",
          rationale: "Official canonical bridge deployment",
          claimRefs: ["claim:prop:identity"],
          evidenceRefs: ["evidence:doc:001"],
          confidence: 0.99,
          isEquivalent: true
        }
      ],
      proposedConflicts: [],
      proposedUnresolvedIssues: [],
      summary: "High-confidence extracted identity and redemption terms from official prospectus",
      createdAt: 1_700_000_000_000
    };

    const hash1 = hashProposal(rawProposal);
    const hash2 = hashProposal(rawProposal);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);

    const fullProposal: NoemaAiProposal = {
      ...rawProposal,
      proposalHash: hash1
    };

    const validated = validateProposal(fullProposal);
    expect(validated.proposalId).toBe("proposal:ondo:ousg:001");
    expect(validated.proposalHash).toBe(hash1);
  });

  it("fails validation when proposal hash is forged or mutated", () => {
    const rawProposal: NoemaAiProposal = {
      proposalId: "proposal:ondo:ousg:002",
      runId: "run:ai:002",
      promptVersion: "noema-prompt-v1",
      schemaVersion: "noema-ai-schema-v1",
      proposedClaims: [],
      proposedRights: [],
      proposedRestrictions: [],
      proposedRelationships: [],
      proposedConflicts: [],
      proposedUnresolvedIssues: [],
      summary: "Empty proposal",
      proposalHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      createdAt: 1_700_000_000_000
    };

    expect(() => validateProposal(rawProposal)).toThrow(/Proposal hash mismatch/);
  });

  it("creates and validates reproducible AI run receipts with latency and token usage", () => {
    const startedAt = 1_700_000_000_000;
    const completedAt = 1_700_000_000_850;

    const receipt = createAiRunReceipt({
      runId: "run:ai:receipt:001",
      modelId: "model:noema-economic-v1",
      inputSourceRefs: ["source:sec:001"],
      inputEvidenceRefs: ["evidence:doc:001"],
      outputProposalHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      startedAt,
      completedAt,
      inputTokens: 1200,
      outputTokens: 450,
      status: "SUCCESS"
    });

    expect(receipt.runId).toBe("run:ai:receipt:001");
    expect(receipt.latencyMs).toBe(850);
    expect(receipt.tokenUsage.totalTokens).toBe(1650);
    expect(receipt.status).toBe("SUCCESS");

    const validated = validateRunReceipt(receipt);
    expect(validated.modelId).toBe("model:noema-economic-v1");
  });

  it("extracts evidence-grounded claims from structured JSON and prose documents", async () => {
    const { extractClaims } = await import("./extract-claims.js");

    const jsonBody = JSON.stringify({
      fundName: "BlackRock USD Institutional Digital Liquidity Fund (BUIDL)",
      cusip: "09260B107",
      isin: "US09260B1075",
      ticker: "BUIDL",
      nav: 1.0,
      currency: "USD",
      yield: 4.85,
      shareClass: "institutional",
      issuer: "BlackRock Financial Management, Inc.",
      reservesAdequacy: "ADEQUATE"
    });

    const structuredSource = {
      id: "source:json:001",
      sourceId: "src:buidl:feed",
      uri: "https://blackrock.com/buidl/feed.json",
      contentType: "application/json",
      contentHash: "0x1111111111111111111111111111111111111111111111111111111111111111" as const,
      fetchedAt: 1_700_000_000_000,
      bodyStorageRef: "storage:source:json:001"
    };

    const structuredEvidence = {
      id: "evidence:ev:001",
      type: "API_RESPONSE" as const,
      source: "source:json:001",
      contentHash: "0x1111111111111111111111111111111111111111111111111111111111111111" as const,
      observedAt: 1_700_000_000_000,
      authority: "REFERENCE_DATA" as const,
      freshness: "FRESH" as const,
      fetchedAt: 1_700_000_000_000,
      metadata: {}
    };

    const proseBody =
      "Official prospectus summary: The fund reports a Net Asset Value of $105.50 USD as of market close. CUSIP: 912828ZG8. ISIN: US912828ZG84. Share Class is Retail.";

    const proseSource = {
      id: "source:prose:002",
      sourceId: "src:sec:prospectus",
      uri: "https://sec.gov/edgar/prospectus.txt",
      contentType: "text/plain",
      contentHash: "0x2222222222222222222222222222222222222222222222222222222222222222" as const,
      fetchedAt: 1_700_000_000_000,
      bodyStorageRef: "storage:source:prose:002"
    };

    const proseEvidence = {
      id: "evidence:ev:002",
      type: "FILING" as const,
      source: "source:prose:002",
      contentHash: "0x2222222222222222222222222222222222222222222222222222222222222222" as const,
      observedAt: 1_700_000_000_000,
      authority: "PRIMARY_SOURCE" as const,
      freshness: "FRESH" as const,
      fetchedAt: 1_700_000_000_000,
      metadata: {}
    };

    const claimsFromStructured = extractClaims({
      subject: "object:buidl",
      sourceSnapshots: [structuredSource],
      evidence: [structuredEvidence],
      sourceBodies: {
        "source:json:001": jsonBody
      }
    });

    expect(claimsFromStructured.length).toBeGreaterThanOrEqual(7);
    const navClaim = claimsFromStructured.find((c) => c.property === "nav");
    expect(navClaim).toBeDefined();
    expect(navClaim?.value).toBe(1.0);
    expect(navClaim?.unit).toBe("USD");
    expect(navClaim?.isDirect).toBe(true);
    expect(navClaim?.locator).toBe("json:$.nav");

    const yieldClaim = claimsFromStructured.find((c) => c.property === "yieldBps");
    expect(yieldClaim).toBeDefined();
    expect(yieldClaim?.value).toBe(485);
    expect(yieldClaim?.unit).toBe("bps");
    expect(yieldClaim?.isDirect).toBe(false);

    const claimsFromProse = extractClaims({
      subject: "object:prose_asset",
      sourceSnapshots: [proseSource],
      evidence: [proseEvidence],
      sourceBodies: {
        "source:prose:002": proseBody
      }
    });

    const proseNav = claimsFromProse.find((c) => c.property === "nav");
    expect(proseNav?.value).toBe(105.5);
    expect(proseNav?.unit).toBe("USD");

    const proseCusip = claimsFromProse.find((c) => c.property === "cusip");
    expect(proseCusip?.value).toBe("912828ZG8");
    expect(proseCusip?.isDirect).toBe(true);
  });

  it("interprets economic rights and restrictions from filings without assuming uniform terms", async () => {
    const { interpretRightsAndRestrictions } = await import("./interpret-rights.js");

    const instSource = {
      id: "source:filing:inst",
      sourceId: "src:sec:inst",
      uri: "https://sec.gov/filing-inst.json",
      contentType: "application/json",
      contentHash: "0x3333333333333333333333333333333333333333333333333333333333333333" as const,
      fetchedAt: 1_700_000_000_000,
      bodyStorageRef: "storage:source:filing:inst"
    };

    const instEvidence = {
      id: "evidence:filing:inst",
      type: "FILING" as const,
      source: "source:filing:inst",
      contentHash: "0x3333333333333333333333333333333333333333333333333333333333333333" as const,
      observedAt: 1_700_000_000_000,
      authority: "PRIMARY_SOURCE" as const,
      freshness: "FRESH" as const,
      fetchedAt: 1_700_000_000_000,
      metadata: {}
    };

    const instBody = JSON.stringify({
      redemption: {
        window: "T+1 daily",
        terms: "Immediate redemption to USDC via smart contract liquidity buffer",
        transferable: false
      },
      beneficialOwnership: true,
      eligibility: {
        criteria: "Qualified Purchaser ($5M+ investable assets)"
      },
      jurisdiction: "US Section 3(c)(7)"
    });

    const result = interpretRightsAndRestrictions({
      subject: "object:fund:inst",
      sourceSnapshots: [instSource],
      evidence: [instEvidence],
      sourceBodies: {
        "source:filing:inst": instBody
      }
    });

    expect(result.proposedRights.length).toBeGreaterThanOrEqual(1);
    const redRight = result.proposedRights.find((r) => r.rightType === "REDEMPTION");
    expect(redRight).toBeDefined();
    expect(redRight?.holderType).toBe("BENEFICIAL_OWNER");
    expect(redRight?.transferability).toBe("RESTRICTED");
    expect(redRight?.redemptionWindow).toBe("T+1 daily");

    expect(result.proposedRestrictions.length).toBeGreaterThanOrEqual(2);
    const eligRest = result.proposedRestrictions.find((r) => r.restrictionType === "ELIGIBILITY");
    expect(eligRest?.eligibilityCriteria).toContain("Qualified Purchaser");
  });

  it("classifies semantic relationships from evidence, refusing false equivalence", async () => {
    const { classifyRelationships } = await import("./classify-relationships.js");

    // Case A: 1:1 Bridged representation with matching CUSIP and issuer
    const repEth = {
      id: "rep:ousg:eth",
      chainId: 1,
      issuer: "Ondo Finance",
      cusip: "68248X104",
      assetClass: "US_TREASURY",
      shareClass: "institutional",
      ticker: "OUSG",
      evidenceRefs: ["evidence:doc:ousg:eth"]
    };

    const repXLayer = {
      id: "rep:ousg:xlayer",
      chainId: 196,
      issuer: "Ondo Finance",
      cusip: "68248X104",
      assetClass: "US_TREASURY",
      shareClass: "institutional",
      ticker: "OUSG",
      bridgeMechanism: "Ondo Canonical Bridge",
      evidenceRefs: ["evidence:doc:ousg:xlayer"]
    };

    const caseAResult = classifyRelationships({
      representationA: repXLayer,
      representationB: repEth
    });

    const isBridged = caseAResult.proposedRelationships.some(
      (r) => r.predicate === "BRIDGED_REPRESENTATION_OF"
    );
    const isEquiv = caseAResult.proposedRelationships.some(
      (r) => r.predicate === "ECONOMICALLY_EQUIVALENT_TO" && r.isEquivalent === true
    );
    expect(isBridged).toBe(true);
    expect(isEquiv).toBe(true);

    // Case B: Same issuer but different share classes (institutional vs retail)
    const repRetail = {
      id: "rep:ousg:retail",
      chainId: 1,
      issuer: "Ondo Finance",
      cusip: "68248X104",
      assetClass: "US_TREASURY",
      shareClass: "retail",
      ticker: "OUSG-R"
    };

    const caseBResult = classifyRelationships({
      representationA: repRetail,
      representationB: repEth
    });

    const hasShareClassRel = caseBResult.proposedRelationships.some(
      (r) => r.predicate === "SHARE_CLASS_OF"
    );
    const hasFalseEquivB = caseBResult.proposedRelationships.some(
      (r) => r.predicate === "ECONOMICALLY_EQUIVALENT_TO"
    );
    expect(hasShareClassRel).toBe(true);
    expect(hasFalseEquivB).toBe(false);

    // Case C: Different issuers providing US Treasury exposure (Ondo vs Matrixdock)
    const repMatrixdock = {
      id: "rep:matrixdock:stbt",
      chainId: 1,
      issuer: "Matrixdock",
      assetClass: "US_TREASURY",
      ticker: "STBT",
      evidenceRefs: ["evidence:doc:stbt"]
    };

    const caseCResult = classifyRelationships({
      representationA: repMatrixdock,
      representationB: repEth
    });

    const isSimilar = caseCResult.proposedRelationships.some(
      (r) => r.predicate === "SIMILAR_EXPOSURE_TO" && r.isEquivalent === false
    );
    const hasFalseEquivC = caseCResult.proposedRelationships.some(
      (r) => r.predicate === "ECONOMICALLY_EQUIVALENT_TO"
    );
    expect(isSimilar).toBe(true);
    expect(hasFalseEquivC).toBe(false);
  });
});
