import { describe, expect, it } from "vitest";
import type {
  Mandate,
  ResolutionException
} from "@noema/economic-kernel";
import {
  createSourceSnapshot,
  createEvidenceRecord,
  createCandidateClaim,
  traceEvidenceLineage,
  reduceEconomicObject,
  resolveSemanticRelationship,
  evaluateMandate,
  processMaterialChange,
  AppendOnlyVersionStore,
  MockXLayerRegistryClient,
  buildEconomicObjectViewModel
} from "@noema/noema-core";
import { computeRoots, objectRoot, evidenceRoot } from "@noema/canonicalization";
import { verifyEconomicObject } from "@noema/verification";

describe("Noema golden path end-to-end integration and convergence", () => {
  it("executes the full 12-step golden path: resolve -> evidence -> verify -> interpret -> evaluate -> commit -> watch -> re-evaluate -> notify with full provenance", () => {
    const store = new AppendOnlyVersionStore();
    const registry = new MockXLayerRegistryClient();

    // Step 1: Resolve three RWA candidates
    const candidateA = { id: "object:ondo:ousg", ticker: "OUSG", shareClass: "institutional" };
    const candidateB = { id: "object:matrixdock:stbt", ticker: "STBT", shareClass: "retail" };
    const candidateC = { id: "object:buidl:token", ticker: "BUIDL", shareClass: "institutional" };

    expect([candidateA, candidateB, candidateC].length).toBe(3);

    // Step 2: Ingest raw sources, evidence, and claims for selected object (Ondo OUSG)
    const nowMs = 1_700_000_000_000;
    const sourceSnapshot = createSourceSnapshot({
      id: "source:ondo:sec-filing",
      sourceId: "source:sec",
      contentType: "application/json",
      uri: "https://sec.gov/edgar/data/ondo-ousg-2026.json",
      body: JSON.stringify({ fund: "Ondo Short-Term US Government Bond Fund", nav: 105.42, cusip: "912828XX0" }),
      fetchedAt: nowMs
    });

    const evidence1 = createEvidenceRecord({
      id: "evidence:ondo:sec-filing",
      source: sourceSnapshot.id,
      type: "DOCUMENT",
      authority: "PRIMARY_SOURCE",
      freshness: "FRESH",
      contentHash: sourceSnapshot.contentHash,
      observedAt: nowMs
    });

    const claim1 = createCandidateClaim({
      id: "claim:ondo:identity",
      subject: "object:ondo:ousg",
      property: "economicIdentity",
      value: "Ondo Short-Term US Government Bond Fund (OUSG)",
      state: "SOURCED",
      sourceRefs: [sourceSnapshot.id],
      evidenceRefs: [evidence1.id],
      confidence: 1.0,
      observedAt: nowMs
    });

    const candidateRepPrimary = {
      id: "rep:ondo:ethereum",
      shareClass: "institutional",
      relationship: "REPRESENTS"
    };

    const candidateRepBridged = {
      id: "rep:ondo:xlayer",
      parent: "rep:ondo:ethereum",
      shareClass: "institutional",
      relationship: "BRIDGED_REPRESENTATION_OF"
    };

    // Step 3: Derive semantic relationship from evidence (not hardcoded labels)
    const semanticComparison = resolveSemanticRelationship(candidateRepPrimary, candidateRepBridged);
    expect(semanticComparison.relationship).toBe("ECONOMICALLY_EQUIVALENT_TO");
    expect(semanticComparison.isEquivalent).toBe(true);

    // Compare with non-equivalent candidate B
    const compB = resolveSemanticRelationship(candidateRepPrimary, { id: "rep:matrixdock:stbt", shareClass: "retail" });
    expect(compB.relationship).toBe("SIMILAR_EXPOSURE_TO");
    expect(compB.isEquivalent).toBe(false);

    // Assemble EconomicObject v1
    const objectV1 = reduceEconomicObject({
      id: "object:ondo:ousg",
      version: 1,
      classification: {
        primary: "TOKENIZED_TREASURY",
        secondary: ["SOVEREIGN_DEBT"],
        confidence: 1.0,
        claimRef: claim1.id
      },
      identifiers: [
        { scheme: "CUSIP", value: "912828XX0", source: sourceSnapshot.id, status: "SOURCED" }
      ],
      representations: [
        {
          id: "rep:ondo:ethereum",
          environment: "EVM",
          network: "ethereum-mainnet",
          contract: "0x1b19C8264e25109C46Ab3b860b0F9004d4B7E871",
          identifiers: [],
          relationshipToObject: "object:ondo:ousg",
          status: "ACTIVE",
          evidence: [evidence1.id]
        },
        {
          id: "rep:ondo:xlayer",
          environment: "EVM",
          network: "xlayer-testnet",
          contract: "0x00000000000000000000000000000000000000a2",
          identifiers: [],
          relationshipToObject: "object:ondo:ousg",
          status: "ACTIVE",
          evidence: [evidence1.id]
        }
      ],
      relationships: [
        {
          id: "rel:rep:bridge",
          subject: "rep:ondo:xlayer",
          predicate: "ECONOMICALLY_EQUIVALENT_TO",
          object: "rep:ondo:ethereum",
          state: "SOURCED",
          evidence: [evidence1.id],
          attestations: []
        }
      ],
      parties: [],
      rights: [],
      obligations: [],
      restrictions: [],
      economics: {
        asOf: nowMs,
        values: { nav: 105.42, yieldBps: 510 },
        claimRefs: [claim1.id]
      },
      claims: [claim1],
      evidence: [evidence1],
      attestations: [],
      exceptions: [],
      provenance: { edges: [] },
      createdAt: nowMs,
      updatedAt: nowMs
    });

    store.save(objectV1);
    const rootsV1 = computeRoots(objectV1);

    // Step 4: Produce deterministic VerificationReceipt
    const verificationV1 = verifyEconomicObject(objectV1, { nowMs });
    expect(verificationV1.overallStatus).toBe("PASS");
    expect(verificationV1.evidenceRoot).toBe(rootsV1.evidenceRoot);
    expect(verificationV1.objectRoot).toBe(rootsV1.objectRoot);

    // Step 5: Evaluate Mandate and produce DecisionReceipt
    const mandate: Mandate = {
      id: "mandate:treasury-allocation-v1",
      version: 1,
      principal: "principal:agent-007",
      objective: "Allocate only to verified tokenized treasury assets",
      allowedAssetClasses: ["TOKENIZED_TREASURY"],
      prohibitedAssetClasses: ["UNCOLLATERALIZED_CREDIT"],
      jurisdictions: ["US"],
      requiredClaims: [{ property: "economicIdentity", requiredState: "SOURCED" }],
      requiredEvidence: [{ type: "DOCUMENT", maxAgeMs: 86_400_000 }],
      expiresAt: 1_800_000_000_000
    };

    const decisionV1 = evaluateMandate(objectV1, verificationV1, mandate, { nowMs });
    expect(decisionV1.decision).toBe("ALLOW");
    expect(decisionV1.reasonCodes).toContain("VERIFICATION_PASSED");
    expect(decisionV1.reasonCodes).toContain("ASSET_CLASS_ALLOWED");

    // Step 6: Commit canonical roots through X Layer registry contract
    const regReceipt = registry.registerObject(objectV1.id, rootsV1.objectRoot, rootsV1.evidenceRoot);
    expect(regReceipt.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    const commitmentV1 = registry.getCommitment(objectV1.id);
    expect(commitmentV1?.version).toBe(1);
    expect(commitmentV1?.objectRoot).toBe(rootsV1.objectRoot);

    // Step 7: Build and inspect UI ViewModel & Lineage
    const viewModelV1 = buildEconomicObjectViewModel(objectV1, verificationV1, decisionV1);
    expect(viewModelV1.status).toBe("RESOLVED");
    expect(viewModelV1.decision?.decision).toBe("ALLOW");

    // Step 8 & 9: Watch catches material change: regulatory filing is marked STALE
    const staleEvidence: typeof evidence1 = {
      ...evidence1,
      freshness: "STALE"
    };

    const staleClaim: typeof claim1 = {
      ...claim1,
      state: "STALE"
    };

    const staleException: ResolutionException = {
      id: "exception:stale:filing",
      objectId: objectV1.id,
      type: "EVIDENCE_STALE",
      severity: "BLOCKING",
      affectedClaims: [staleClaim.id],
      evidence: [staleEvidence.id],
      detectedAt: nowMs + 100_000,
      status: "OPEN"
    };

    const watchResult = processMaterialChange({
      currentObject: objectV1,
      previousDecision: decisionV1,
      mandate,
      changeType: "EVIDENCE_STALE",
      description: "Regulatory filing observation window expired",
      correlationId: "watch-cycle-001",
      updates: {
        evidence: [staleEvidence],
        claims: [staleClaim],
        exceptions: [staleException]
      },
      versionStore: store,
      nowMs: nowMs + 100_000
    });

    // Assert v2 creation without mutating v1
    const objectV2 = watchResult.updatedObject;
    expect(objectV2.version).toBe(2);
    expect(objectV2.status).toBe("STALE");

    const rootsV2 = computeRoots(objectV2);
    expect(rootsV2.objectRoot).not.toBe(rootsV1.objectRoot);

    // Assert historical v1 remains unchanged
    const storedV1 = store.get(objectV1.id, 1)!;
    expect(storedV1.version).toBe(1);
    expect(objectRoot(storedV1)).toBe(rootsV1.objectRoot);

    // Step 10: Re-verification and Mandate Re-evaluation
    expect(watchResult.verificationReceipt.overallStatus).toBe("FAIL");
    expect(watchResult.decisionReceipt.decision).toBe("BLOCK");
    expect(watchResult.decisionReceipt.reasonCodes).toContain("VERIFICATION_FAILED");

    // Update onchain registry for v2
    const updateReceipt = registry.updateObject(objectV1.id, 1, rootsV2.objectRoot, rootsV2.evidenceRoot);
    expect(updateReceipt.txHash).toBeDefined();
    const commitmentV2 = registry.getCommitment(objectV1.id);
    expect(commitmentV2?.version).toBe(2);
    expect(commitmentV2?.objectRoot).toBe(rootsV2.objectRoot);

    // Step 11: Semantic event and Notifications
    expect(watchResult.changeEvent.previousDecision).toBe("ALLOW");
    expect(watchResult.changeEvent.newDecision).toBe("BLOCK");
    expect(watchResult.discordPayload.severity).toBe("CRITICAL");
    expect(watchResult.webhookPayload.newDecision).toBe("BLOCK");

    // Step 12: Complete inspectable lineage trace
    const lineage = traceEvidenceLineage(objectV1, [sourceSnapshot]);
    expect(lineage.claims.length).toBeGreaterThan(0);
    expect(lineage.claims[0]?.claimId).toBe(claim1.id);
    expect(lineage.claims[0]?.evidence.map((e) => e.evidenceId)).toContain(evidence1.id);
    expect(lineage.claims[0]?.evidence.map((e) => e.sourceId)).toContain(sourceSnapshot.id);
  });
});
