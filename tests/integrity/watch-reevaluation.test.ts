import { describe, expect, it } from "vitest";
import type {
  Claim,
  EconomicObject,
  Evidence,
  Mandate,
  ResolutionException
} from "@noema/economic-kernel";
import {
  evaluateMandate,
  processMaterialChange,
  AppendOnlyVersionStore
} from "@noema/noema-core";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

function makeMandate(): Mandate {
  return {
    id: "mandate:treasury-watch",
    version: 1,
    principal: "principal:agent-001",
    objective: "Safe treasury allocation",
    allowedAssetClasses: ["TOKENIZED_TREASURY"],
    prohibitedAssetClasses: ["UNCOLLATERALIZED_CREDIT"],
    jurisdictions: ["US"],
    requiredClaims: [
      { property: "economicIdentity", requiredState: "SOURCED" }
    ],
    requiredEvidence: [
      { type: "API_RESPONSE", maxAgeMs: 86_400_000 }
    ],
    expiresAt: 1_800_000_000_000
  };
}

describe("watch-triggered re-evaluation and notification integrity", () => {
  it("processes a material change: creates vN+1, re-verifies, re-evaluates mandate to BLOCK, and generates notifications", () => {
    const store = new AppendOnlyVersionStore();
    const mandate = makeMandate();

    // 1. Initial State: v1 is verified and ALLOW
    const v1 = makeEconomicObject({
      id: "object:watched:asset",
      version: 1
    });
    const verificationV1 = verifyEconomicObject(v1, { nowMs: 1_700_000_000_000 });
    const decisionV1 = evaluateMandate(v1, verificationV1, mandate, { nowMs: 1_700_000_000_000 });

    expect(decisionV1.decision).toBe("ALLOW");
    store.save(v1);

    // 2. Inject Material Change: Evidence becomes STALE and claim transitions to STALE
    const staleEvidence: Evidence = {
      ...v1.evidence[0]!,
      freshness: "STALE"
    };

    const staleClaim: Claim = {
      ...v1.claims[0]!,
      state: "STALE"
    };

    const staleException: ResolutionException = {
      id: "exception:stale:01",
      objectId: v1.id,
      type: "EVIDENCE_STALE",
      severity: "BLOCKING",
      affectedClaims: [staleClaim.id],
      evidence: [staleEvidence.id],
      detectedAt: 1_700_050_000_000,
      status: "OPEN"
    };

    const correlationId = "corr:watch:cycle:001";

    const result = processMaterialChange({
      currentObject: v1,
      previousDecision: decisionV1,
      mandate,
      changeType: "EVIDENCE_STALE",
      description: "Primary oracle evidence freshness expired without refresh",
      correlationId,
      updates: {
        evidence: [staleEvidence],
        claims: [staleClaim],
        exceptions: [staleException]
      },
      versionStore: store,
      nowMs: 1_700_050_000_000
    });

    // Assert v2 creation
    expect(result.updatedObject.version).toBe(2);
    expect(result.updatedObject.status).toBe("STALE");

    // Assert re-verification failed on stale evidence
    expect(result.verificationReceipt.overallStatus).toBe("FAIL");
    expect(result.verificationReceipt.objectVersion).toBe(2);

    // Assert mandate re-evaluation changed decision to BLOCK
    expect(result.decisionReceipt.decision).toBe("BLOCK");
    expect(result.decisionReceipt.objectVersion).toBe(2);
    expect(result.decisionReceipt.reasonCodes).toContain("VERIFICATION_FAILED");

    // Assert semantic change event
    expect(result.changeEvent.previousVersion).toBe(1);
    expect(result.changeEvent.newVersion).toBe(2);
    expect(result.changeEvent.previousDecision).toBe("ALLOW");
    expect(result.changeEvent.newDecision).toBe("BLOCK");
    expect(result.changeEvent.correlationId).toBe(correlationId);

    // Assert webhook and discord notification payloads
    expect(result.webhookPayload.target).toBe("WEBHOOK");
    expect(result.webhookPayload.oldDecision).toBe("ALLOW");
    expect(result.webhookPayload.newDecision).toBe("BLOCK");
    expect(result.webhookPayload.severity).toBe("CRITICAL");

    expect(result.discordPayload.target).toBe("DISCORD");
    expect(result.discordPayload.title).toContain("v1 -> v2");
    expect(result.discordPayload.summary).toContain("BLOCK");

    // Assert v1 is untouched in store
    const storedV1 = store.get(v1.id, 1)!;
    expect(storedV1.version).toBe(1);
    expect(storedV1.status).toBe("RESOLVED");
  });

  it("ensures re-running with the same material change is idempotent and does not mutate history", () => {
    const store = new AppendOnlyVersionStore();
    const mandate = makeMandate();

    const v1 = makeEconomicObject({ id: "object:idempotent", version: 1 });
    const verificationV1 = verifyEconomicObject(v1, { nowMs: 1_700_000_000_000 });
    const decisionV1 = evaluateMandate(v1, verificationV1, mandate, { nowMs: 1_700_000_000_000 });
    store.save(v1);

    const revokedClaim: Claim = {
      ...v1.claims[0]!,
      state: "REVOKED"
    };

    const input = {
      currentObject: v1,
      previousDecision: decisionV1,
      mandate,
      changeType: "EVIDENCE_REVOKED" as const,
      description: "Attestation revoked by issuer",
      correlationId: "corr:idempotency:001",
      updates: { claims: [revokedClaim] },
      versionStore: store,
      nowMs: 1_700_050_000_000
    };

    const run1 = processMaterialChange(input);
    const run2 = processMaterialChange(input);

    expect(run1.updatedObject.version).toBe(run2.updatedObject.version);
    expect(run1.decisionReceipt.decision).toBe(run2.decisionReceipt.decision);
    expect(run1.verificationReceipt.objectRoot).toBe(run2.verificationReceipt.objectRoot);
    expect(store.getAllVersions(v1.id).length).toBe(2);
  });
});
