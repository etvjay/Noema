import { describe, expect, it } from "vitest";
import type { Mandate } from "@noema/economic-kernel";
import {
  AppendOnlyVersionStore,
  NoemaRestServer,
  NoemaSdk,
  NoemaMcpServer,
  normalizeExternalMcpResponse
} from "@noema/noema-core";
import { objectRoot, evidenceRoot } from "@noema/canonicalization";
import { makeEconomicObject } from "../helpers.js";

function makeMandate(): Mandate {
  return {
    id: "mandate:test-machine-surfaces",
    version: 1,
    principal: "principal:agent-42",
    objective: "Testing machine surface parity",
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

describe("REST, SDK, and MCP machine surface semantic parity integrity", () => {
  it("returns semantically equivalent canonical objects and receipts across REST, SDK, and MCP", async () => {
    const store = new AppendOnlyVersionStore();
    const mandate = makeMandate();
    const mandates = new Map([[mandate.id, mandate]]);

    const object = makeEconomicObject({ id: "object:rwa:ondo-ousg", version: 1 });
    store.save(object);

    const restServer = new NoemaRestServer(store, mandates);
    const sdk = new NoemaSdk(restServer);
    const mcpServer = new NoemaMcpServer(store, mandates);

    const nowMs = 1_700_000_000_000;

    // 1. Direct retrieval
    const restObj = restServer.getObject(object.id).data;
    const sdkObj = await sdk.getEconomicObject(object.id);
    const mcpObjRaw = await mcpServer.callTool("noema_get_object", { id: object.id });
    const mcpObj = JSON.parse(mcpObjRaw.content[0]!.text);

    expect(objectRoot(restObj)).toBe(objectRoot(object));
    expect(objectRoot(sdkObj)).toBe(objectRoot(object));
    expect(objectRoot(mcpObj)).toBe(objectRoot(object));
    expect(restObj).toEqual(sdkObj);
    expect(restObj).toEqual(mcpObj);

    // 2. Verification receipts parity
    const restVerification = restServer.verifyObject(object.id, nowMs).data;
    const sdkVerification = await sdk.verify(object.id, nowMs);
    const mcpVerificationRaw = await mcpServer.callTool("noema_verify_object", { id: object.id, nowMs });
    const mcpVerification = JSON.parse(mcpVerificationRaw.content[0]!.text);

    expect(restVerification.overallStatus).toBe("PASS");
    expect(sdkVerification.overallStatus).toBe("PASS");
    expect(mcpVerification.overallStatus).toBe("PASS");
    expect(restVerification.evidenceRoot).toBe(evidenceRoot(object.evidence));
    expect(sdkVerification.evidenceRoot).toBe(evidenceRoot(object.evidence));
    expect(mcpVerification.evidenceRoot).toBe(evidenceRoot(object.evidence));
    expect(restVerification).toEqual(sdkVerification);
    expect(restVerification).toEqual(mcpVerification);

    // 3. Mandate decision receipts parity
    const restDecision = restServer.evaluateMandate(object.id, mandate.id, nowMs).data;
    const sdkDecision = await sdk.evaluate(object.id, mandate.id, nowMs);
    const mcpDecisionRaw = await mcpServer.callTool("noema_evaluate_mandate", {
      objectId: object.id,
      mandateId: mandate.id,
      nowMs
    });
    const mcpDecision = JSON.parse(mcpDecisionRaw.content[0]!.text);

    expect(restDecision.decision).toBe("ALLOW");
    expect(sdkDecision.decision).toBe("ALLOW");
    expect(mcpDecision.decision).toBe("ALLOW");
    expect(restDecision).toEqual(sdkDecision);
    expect(restDecision).toEqual(mcpDecision);
  });

  it("ensures external MCP adapter outputs terminate at evidence boundary and cannot bypass verification", () => {
    // 1. Upstream failure becomes explicit ResolutionException
    const failedRes = normalizeExternalMcpResponse(
      { status: "AUTH_FAILED", errorMessage: "Invalid API key" },
      "source:external:okx",
      1_700_000_000_000
    );
    expect(failedRes.evidence).toBeUndefined();
    expect(failedRes.exception?.type).toBe("SOURCE_FAILURE");

    // 2. Successful response terminates as raw unverified OBSERVED evidence
    const successRes = normalizeExternalMcpResponse(
      { status: "OK", data: { ticker: "OUSG", nav: 105.4 } },
      "source:external:okx",
      1_700_000_000_000
    );
    expect(successRes.evidence).toBeDefined();
    expect(successRes.evidence?.authority).toBe("REFERENCE_DATA");
    expect(successRes.evidence?.freshness).toBe("FRESH");
    // Does NOT directly create claims, verification pass, or decision ALLOW
  });
});
