import { describe, expect, it } from "vitest";
import type { EconomicObject, Evidence, Mandate } from "@noema/economic-kernel";
import {
  noemaSchemaRegistry,
  SchemaValidationError
} from "@noema/schemas";
import { evaluateMandate } from "@noema/noema-core/mandate";
import { appendEconomicObjectChange, initializeVersionHistory } from "@noema/noema-core/versioning";
import { resolveSemanticRelationship } from "@noema/noema-core/semantic";
import type {
  SemanticRepresentationLink,
  SemanticRepresentationProfile
} from "@noema/noema-core/semantic";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

const NOW = 1_700_000_000_000;

function mandateFor(overrides: Partial<Mandate> = {}): Mandate {
  return {
    id: "mandate:semantics",
    version: 1,
    principal: "principal:semantics",
    objective: "schema semantics audit",
    allowedAssetClasses: ["TOKENIZED_TREASURY"],
    prohibitedAssetClasses: [],
    jurisdictions: ["US"],
    requiredClaims: [{ property: "economicIdentity", requiredState: "VERIFIED" }],
    requiredEvidence: [{ type: "API_RESPONSE" }],
    expiresAt: 1_800_000_000_000,
    ...overrides
  };
}

function policyCheckOf(decision: ReturnType<typeof evaluateMandate>, ruleId: string) {
  const check = decision.policyChecks.find((item) => item.ruleId === ruleId);
  if (check === undefined) {
    throw new Error(`missing policy check ${ruleId}`);
  }
  return check;
}

describe("PR3 schema semantics: action-critical decisions derive from typed fields, not generic blobs", () => {
  it("required-claim checks read the typed claim.state enum, ignoring contradictory metadata/value blobs", () => {
    const claim = makeEconomicObject().claims[0]!;

    const inferredButBlobClaimsVerified = makeEconomicObject({
      claims: [{ ...claim, state: "INFERRED" }],
      economics: {
        asOf: NOW,
        values: { semanticClaimState: "VERIFIED", requiredState: "VERIFIED" },
        claimRefs: [claim.id]
      }
    });
    const receipt = verifyEconomicObject(inferredButBlobClaimsVerified, { nowMs: NOW });
    const blocked = evaluateMandate(
      inferredButBlobClaimsVerified,
      receipt,
      mandateFor(),
      { nowMs: NOW }
    );
    const check = policyCheckOf(blocked, "mandate:claim:economicIdentity:VERIFIED");
    expect(check.result).toBe("FAIL");
    expect(check.reasonCode).toBe("REQUIRED_CLAIM_MISSING");

    const verifiedButBlobSaysInferred = makeEconomicObject({
      claims: [{ ...claim, state: "VERIFIED" }],
      economics: {
        asOf: NOW,
        values: { semanticClaimState: "INFERRED" },
        claimRefs: [claim.id]
      }
    });
    const cleanReceipt = verifyEconomicObject(verifiedButBlobSaysInferred, { nowMs: NOW });
    const allowed = evaluateMandate(
      verifiedButBlobSaysInferred,
      cleanReceipt,
      mandateFor(),
      { nowMs: NOW }
    );
    const cleanCheck = policyCheckOf(allowed, "mandate:claim:economicIdentity:VERIFIED");
    expect(cleanCheck.result).toBe("PASS");
    expect(cleanCheck.reasonCode).toBe("REQUIRED_CLAIM_PRESENT");
  });

  it("object-state checks read the typed status enum, ignoring a contradictory semanticStatus blob", () => {
    const conflictingButBlobSaysResolved = makeEconomicObject({
      status: "CONFLICTING",
      economics: {
        asOf: NOW,
        values: { semanticStatus: "RESOLVED" },
        claimRefs: makeEconomicObject().claims.map((claim) => claim.id)
      }
    });
    const receipt = verifyEconomicObject(conflictingButBlobSaysResolved, { nowMs: NOW });
    const decision = evaluateMandate(conflictingButBlobSaysResolved, receipt, mandateFor(), {
      nowMs: NOW
    });
    const check = policyCheckOf(decision, "mandate:object-state");
    expect(check.result).toBe("FAIL");
    expect(check.reasonCode).toBe("OBJECT_CONFLICTING");

    const resolvedButBlobSaysConflicting = makeEconomicObject({
      economics: {
        asOf: NOW,
        values: { semanticStatus: "CONFLICTING" },
        claimRefs: makeEconomicObject().claims.map((claim) => claim.id)
      }
    });
    const cleanDecision = evaluateMandate(
      resolvedButBlobSaysConflicting,
      verifyEconomicObject(resolvedButBlobSaysConflicting, { nowMs: NOW }),
      mandateFor(),
      { nowMs: NOW }
    );
    const cleanCheck = policyCheckOf(cleanDecision, "mandate:object-state");
    expect(cleanCheck.result).toBe("PASS");
    expect(cleanCheck.reasonCode).toBe("OBJECT_STATE_ACCEPTABLE");
  });

  it("evidence-requirement checks read typed evidence.freshness/observedAt, not evidence.metadata", () => {
    const base = makeEconomicObject();
    const evidence = base.evidence[0]!;
    const claimRefs = base.claims.map((claim) => claim.id);

    const staleTypedButBlobSaysFresh: EconomicObject = makeEconomicObject({
      evidence: [
        {
          ...evidence,
          freshness: "STALE",
          metadata: { freshness: "FRESH", freshnessLabel: "verified-live" }
        }
      ],
      economics: { asOf: NOW, values: { evidenceFreshness: "FRESH" }, claimRefs }
    });
    const staleDecision = evaluateMandate(
      staleTypedButBlobSaysFresh,
      verifyEconomicObject(staleTypedButBlobSaysFresh, { nowMs: NOW }),
      mandateFor(),
      { nowMs: NOW }
    );
    const staleCheck = policyCheckOf(staleDecision, "mandate:evidence:API_RESPONSE");
    expect(staleCheck.result).toBe("FAIL");
    expect(staleCheck.reasonCode).toBe("REQUIRED_EVIDENCE_STALE");

    const freshTypedButBlobSaysStale: EconomicObject = makeEconomicObject({
      evidence: [
        {
          ...evidence,
          freshness: "FRESH",
          observedAt: NOW,
          metadata: { freshness: "STALE", freshnessLabel: "expired-cached" }
        }
      ],
      economics: { asOf: NOW, values: { evidenceFreshness: "STALE" }, claimRefs }
    });
    const freshDecision = evaluateMandate(
      freshTypedButBlobSaysStale,
      verifyEconomicObject(freshTypedButBlobSaysStale, { nowMs: NOW }),
      mandateFor(),
      { nowMs: NOW }
    );
    const freshCheck = policyCheckOf(freshDecision, "mandate:evidence:API_RESPONSE");
    expect(freshCheck.result).toBe("PASS");
    expect(freshCheck.reasonCode).toBe("REQUIRED_EVIDENCE_ACCEPTABLE");
  });

  it("verification checks read the typed receipt overallStatus, ignoring a contradictory verification blob", () => {
    const claim = makeEconomicObject().claims[0]!;
    const evidence = makeEconomicObject().evidence[0]!;

    const unresolvedTypedButBlobSaysPass = makeEconomicObject({
      claims: [{ ...claim, state: "INFERRED" }],
      economics: { asOf: NOW, values: { verificationStatus: "PASS" }, claimRefs: [claim.id] }
    });
    const receipt = verifyEconomicObject(unresolvedTypedButBlobSaysPass, { nowMs: NOW });
    expect(receipt.overallStatus).toBe("UNRESOLVED");
    const conditional = evaluateMandate(
      unresolvedTypedButBlobSaysPass,
      receipt,
      mandateFor(),
      { nowMs: NOW }
    );
    const check = policyCheckOf(conditional, "mandate:verification");
    expect(check.result).toBe("UNRESOLVED");
    expect(check.reasonCode).toBe("VERIFICATION_UNRESOLVED");

    const revokedTypedButBlobSaysPass = makeEconomicObject({
      claims: [{ ...claim, state: "REVOKED" }],
      evidence: [{ ...evidence }],
      economics: { asOf: NOW, values: { verificationStatus: "PASS" }, claimRefs: [claim.id] }
    });
    const failReceipt = verifyEconomicObject(revokedTypedButBlobSaysPass, { nowMs: NOW });
    expect(failReceipt.overallStatus).toBe("FAIL");
    const blocked = evaluateMandate(revokedTypedButBlobSaysPass, failReceipt, mandateFor(), {
      nowMs: NOW
    });
    const failCheck = policyCheckOf(blocked, "mandate:verification");
    expect(failCheck.result).toBe("FAIL");
    expect(failCheck.reasonCode).toBe("VERIFICATION_FAILED");
  });

  it("semantic relationship classification never trusts a caller-supplied equivalence label", () => {
    const profile: SemanticRepresentationProfile = {
      id: "representation:label:left",
      economicClaim: "claim:same",
      issuerClaim: "issuer:same",
      shareClass: "class-same",
      exposureClass: "US_TREASURY_BILL",
      rights: ["BENEFICIAL_INTEREST"],
      restrictions: [],
      backing: ["pool:same"],
      redemption: { asset: "USD", windowMs: 86_400_000 },
      evidenceFreshness: "FRESH"
    };
    const result = resolveSemanticRelationship({
      left: { ...profile, id: "representation:label:left" },
      right: { ...profile, id: "representation:label:right" },
      links: [
        {
          from: "representation:label:left",
          to: "representation:label:right",
          type: "ECONOMICALLY_EQUIVALENT_TO"
        } as unknown as SemanticRepresentationLink
      ]
    });
    expect(result.relationship).toBe("SIMILAR_EXPOSURE_TO");
    expect(result.relationship).not.toBe("ECONOMICALLY_EQUIVALENT_TO");
    expect(result.reasonCodes).toContain("SUPPORTED_REPRESENTATION_LINK_MISSING");
  });
});

describe("PR3 schema semantics: typed enums and state transitions fail closed", () => {
  it("rejects unknown enum values for claim state, relationship predicate, and exception state fields", () => {
    const object = makeEconomicObject();

    expect(() =>
      noemaSchemaRegistry.decode({
        ...object,
        claims: [{ ...object.claims[0]!, state: "VERIFIED_BY_BLOB" }]
      })
    ).toThrow(SchemaValidationError);

    expect(() =>
      noemaSchemaRegistry.decode({
        ...object,
        relationships: [{ ...object.relationships[0]!, predicate: "EQUIVALENT_PER_BLOB" }]
      })
    ).toThrow(SchemaValidationError);

    expect(() =>
      noemaSchemaRegistry.decode({
        ...object,
        exceptions: [
          {
            id: "exception:bad",
            objectId: object.id,
            type: "UNSUPPORTED_EXCEPTION",
            severity: "BLOCKING",
            affectedClaims: [],
            evidence: [],
            detectedAt: NOW,
            status: "OPEN"
          }
        ]
      })
    ).toThrow(SchemaValidationError);

    expect(() =>
      noemaSchemaRegistry.decode({
        ...object,
        exceptions: [
          {
            id: "exception:bad-severity",
            objectId: object.id,
            type: "EVIDENCE_CONFLICT",
            severity: "CATASTROPHIC",
            affectedClaims: [],
            evidence: [],
            detectedAt: NOW,
            status: "OPEN"
          }
        ]
      })
    ).toThrow(SchemaValidationError);
  });

  it("keeps generic metadata blobs opaque and never lets them manufacture verified state", () => {
    const claim = makeEconomicObject().claims[0]!;
    const evidence = makeEconomicObject().evidence[0]!;
    const blobby = makeEconomicObject({
      claims: [{ ...claim, state: "INFERRED" }],
      evidence: [
        {
          ...evidence,
          metadata: {
            semanticState: "VERIFIED",
            claimState: "VERIFIED",
            verificationStatus: "PASS",
            evidenceFreshness: "FRESH"
          }
        }
      ]
    });

    expect(noemaSchemaRegistry.decode(blobby)).toEqual(blobby);
    const receipt = verifyEconomicObject(blobby, { nowMs: NOW });
    expect(receipt.overallStatus).toBe("UNRESOLVED");

    const decision = evaluateMandate(blobby, receipt, mandateFor(), { nowMs: NOW });
    expect(decision.policyChecks.some((check) => check.result === "PASS" && check.reasonCode === "VERIFICATION_PASS")).toBe(false);
    expect(decision.policyChecks.some((check) => check.reasonCode === "REQUIRED_CLAIM_MISSING")).toBe(true);
  });

  it("propagates typed status transitions through the version store and rejects unknown states", () => {
    const object = makeEconomicObject();
    const history = initializeVersionHistory(object);

    const conflicted = makeEconomicObject({ status: "CONFLICTING" });
    const result = appendEconomicObjectChange(history, conflicted, "typed-status-transition");
    expect(result.created).toBe(true);
    expect(result.current.object.version).toBe(2);
    expect(result.current.object.status).toBe("CONFLICTING");
    expect(result.current.object.economics.values).toEqual(object.economics.values);

    const bogus = makeEconomicObject({ status: "RESOLVED_BY_BLOB" } as never);
    expect(() => appendEconomicObjectChange(history, bogus, "unknown-status")).toThrow(
      SchemaValidationError
    );
  });
});