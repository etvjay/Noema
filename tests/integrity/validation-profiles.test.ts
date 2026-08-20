import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Claim, EconomicObject, Evidence, Mandate } from "@noema/economic-kernel";
import { verifyEconomicObject } from "@noema/verification";
import { evaluateMandate } from "@noema/noema-core/mandate";
import {
  evaluateProfileSet,
  evaluateValidationProfile,
  selectApplicableProfiles,
  PROFILE_REASON_CODES
} from "@noema/noema-core/profile";
import {
  noemaSchemaRegistry,
  SchemaValidationError,
  SCHEMA_IDS,
  SCHEMA_VERSIONS,
  type ValidationProfile
} from "@noema/schemas";
import { makeEconomicObject } from "../helpers.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PROFILES_PATH = resolve(HERE, "../../fixtures/validation-profiles/profiles-v1.json");

const NOW = 1_700_000_001_000;
const T = 1_700_000_000_000;

function loadProfiles(): ValidationProfile[] {
  const fixture = JSON.parse(readFileSync(PROFILES_PATH, "utf8")) as {
    profiles: ValidationProfile[];
  };
  return fixture.profiles;
}

const HEX = "0x1111111111111111111111111111111111111111111111111111111111111111";

function makeEvidence(id: string, type: Evidence["type"], authority: Evidence["authority"] = "PRIMARY_SOURCE"): Evidence {
  return {
    id,
    schemaId: "noema:evidence",
    schemaVersion: 1,
    type,
    source: `source:${id}`,
    contentHash: HEX,
    observedAt: T,
    fetchedAt: T + 100,
    authority,
    freshness: "FRESH",
    metadata: {}
  };
}

const EVIDENCE: Record<"doc" | "filing" | "api" | "oracle" | "chain", Evidence> = {
  doc: makeEvidence("evidence:profiles:doc", "DOCUMENT"),
  filing: makeEvidence("evidence:profiles:filing", "FILING"),
  api: makeEvidence("evidence:profiles:api", "API_RESPONSE"),
  oracle: makeEvidence("evidence:profiles:oracle", "ORACLE"),
  chain: makeEvidence("evidence:profiles:chain", "ONCHAIN_STATE", "ONCHAIN_STATE")
};

function makeClaim(property: string, index: number, state: Claim["state"] = "SOURCED"): Claim {
  return {
    id: `claim:profiles:${property}:${index}`,
    subject: "object:profiles",
    property,
    value: `value-${property}-${index}`,
    state,
    sourceRefs: ["source:fixture:primary"],
    evidenceRefs: [EVIDENCE.api.id, EVIDENCE.doc.id, EVIDENCE.filing.id],
    attestationRefs: [],
    createdAt: T
  };
}

function makeCandidate(assetClass: string, properties: string[]): EconomicObject {
  const claims = properties.map((property, index) => makeClaim(property, index));
  return makeEconomicObject({
    id: "object:profiles",
    classification: {
      primary: assetClass,
      secondary: [],
      confidence: 1,
      claimRef: claims[0]?.id ?? EVIDENCE.api.id
    },
    claims,
    evidence: Object.values(EVIDENCE)
  });
}

const FUND_SHARE_PROPERTIES = [
  "issuer",
  "fundName",
  "shareClass",
  "ownershipRights",
  "redemptionWindow",
  "eligibility",
  "transferRestrictions",
  "valuationNav",
  "backingPortfolio",
  "custodyArrangement",
  "sourceLocator",
  "observedAt",
  "representationId",
  "underlyingReference"
];

const WRAPPED_PROPERTIES = [
  "issuer",
  "representationId",
  "underlyingReference",
  "backingPortfolio",
  "sourceLocator",
  "observedAt",
  "custodyArrangement",
  "redemptionWindow"
];

const DEBT_PROPERTIES = ["issuer", "obligationTerms", "maturity", "redemptionWindow", "sourceLocator", "observedAt"];

describe("RWA validation profiles (#57)", () => {
  it("profile schema is versioned and runtime validated", () => {
    for (const profile of loadProfiles()) {
      expect(profile.schemaId).toBe(SCHEMA_IDS.VALIDATION_PROFILE);
      expect(profile.schemaVersion).toBe(SCHEMA_VERSIONS.VALIDATION_PROFILE);
      const decoded = noemaSchemaRegistry.decode<ValidationProfile>(profile);
      expect(decoded.profileId).toBe(profile.profileId);
    }

    const tampered = { ...loadProfiles()[0]!, dimensions: [] };
    expect(() => noemaSchemaRegistry.decode(tampered)).toThrow(SchemaValidationError);
  });

  it("required/optional dimensions are explicit and machine-readable", () => {
    const profile = loadProfiles().find(
      (candidate) => candidate.profileId === "profile:moneymarket-fund-share"
    )!;
    expect(profile.dimensions.length).toBeGreaterThanOrEqual(10);
    const required = profile.dimensions.filter((dimension) => dimension.required);
    const optional = profile.dimensions.filter((dimension) => !dimension.required);
    expect(required.length).toBeGreaterThan(0);
    expect(optional.length).toBeGreaterThanOrEqual(1);
    for (const dimension of profile.dimensions) {
      expect(dimension.claimProperties?.length).toBeGreaterThan(0);
    }
  });

  it("positive fund-share candidate resolves without invented facts", () => {
    const profiles = loadProfiles();
    const object = makeCandidate("TOKENIZED_MONEY_MARKET_FUND", FUND_SHARE_PROPERTIES);
    const result = evaluateValidationProfile(
      profiles.find((candidate) => candidate.profileId === "profile:moneymarket-fund-share")!,
      object,
      { nowMs: NOW }
    );

    expect(result.resolution).toBe("RESOLVED");
    expect(result.distinguishesMandateSuitability).toBe(true);
    for (const dimension of result.dimensionResults) {
      expect(dimension.reasonCode).toMatch(/^PROFILE_DIMENSION_(PRESENT|OPTIONAL_PRESENT)/);
      expect(dimension.satisfied).toBe(true);
    }
    expect(result.requiredClaims.length).toBeGreaterThan(0);
    expect(result.requiredEvidence.length).toBeGreaterThan(0);
    for (const ref of result.requiredClaims) {
      expect(object.claims.some((claim) => claim.id === ref)).toBe(true);
    }
  });

  it("missing required dimensions yield deterministic insufficient evidence, not invented facts", () => {
    const profiles = loadProfiles();
    const object = makeCandidate(
      "TOKENIZED_MONEY_MARKET_FUND",
      FUND_SHARE_PROPERTIES.filter((property) => property !== "transferRestrictions")
    );
    const result = evaluateValidationProfile(
      profiles.find((candidate) => candidate.profileId === "profile:moneymarket-fund-share")!,
      object,
      { nowMs: NOW }
    );

    expect(result.resolution).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.reasonCodes).toContain("PROFILE_DIMENSION_MISSING:transferRestrictions");
    expect(object.claims.some((claim) => claim.property === "transferRestrictions")).toBe(false);
    expect(
      result.requiredClaims.some((ref) => ref.includes("transferRestrictions"))
    ).toBe(false);
  });

  it("conflicting evidence yields a conflicting unresolved state", () => {
    const profiles = loadProfiles();
    const object = makeCandidate("TOKENIZED_MONEY_MARKET_FUND", FUND_SHARE_PROPERTIES);
    object.claims = object.claims.map((claim) =>
      claim.property === "valuationNav" ? { ...claim, state: "CONFLICTING" } : claim
    );
    const result = evaluateValidationProfile(
      profiles.find((candidate) => candidate.profileId === "profile:moneymarket-fund-share")!,
      object,
      { nowMs: NOW }
    );

    expect(result.resolution).toBe("CONFLICTING");
    expect(result.reasonCodes).toContain("PROFILE_DIMENSION_CONFLICTING:valuationNav");
  });

  it("stale claims yield a stale unresolved state", () => {
    const profiles = loadProfiles();
    const object = makeCandidate("TOKENIZED_MONEY_MARKET_FUND", FUND_SHARE_PROPERTIES);
    object.claims = object.claims.map((claim) =>
      claim.property === "valuationNav" ? { ...claim, state: "STALE" } : claim
    );
    const result = evaluateValidationProfile(
      profiles.find((candidate) => candidate.profileId === "profile:moneymarket-fund-share")!,
      object,
      { nowMs: NOW }
    );

    expect(result.resolution).toBe("STALE");
    expect(result.reasonCodes).toContain("PROFILE_DIMENSION_STALE:valuationNav");
  });

  it("stale evidence violates freshness and yields insufficient evidence", () => {
    const profiles = loadProfiles();
    const object = makeCandidate("TOKENIZED_MONEY_MARKET_FUND", FUND_SHARE_PROPERTIES);
    object.evidence = Object.values(EVIDENCE).map((evidence) => ({
      ...evidence,
      observedAt: NOW - 2 * 86400000
    }));
    const result = evaluateValidationProfile(
      profiles.find((candidate) => candidate.profileId === "profile:moneymarket-fund-share")!,
      object,
      { nowMs: NOW }
    );

    expect(result.resolution).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.reasonCodes.some((code) => code.startsWith("PROFILE_EVIDENCE_MISSING"))).toBe(true);
  });

  it("unsupported asset classes are reported, never forced into a profile", () => {
    const profiles = loadProfiles();
    const object = makeCandidate("TOKENIZED_UNRECOGNIZED", FUND_SHARE_PROPERTIES);
    const result = evaluateProfileSet(profiles, object, { nowMs: NOW });

    expect(result.overall).toBe("UNSUPPORTED");
    expect(result.applicable).toHaveLength(0);
    expect(result.nonApplicable).toHaveLength(profiles.length);
    expect(result.reasonCodes).toContain(
      PROFILE_REASON_CODES.UNSUPPORTED_ASSET_CLASS("TOKENIZED_UNRECOGNIZED")
    );
  });

  it("a profile distinguishes economic resolution from mandate suitability", () => {
    const profiles = loadProfiles();
    const object = makeCandidate("TOKENIZED_MONEY_MARKET_FUND", FUND_SHARE_PROPERTIES);
    const profile = profiles.find(
      (candidate) => candidate.profileId === "profile:moneymarket-fund-share"
    )!;

    const resolution = evaluateValidationProfile(profile, object, { nowMs: NOW });
    expect(resolution.resolution).toBe("RESOLVED");

    const mandate: Mandate = {
      id: "mandate:profiles:prohibited-fund",
      version: 1,
      principal: "treasury:fixture",
      objective: "Hold only verified non-fund treasury exposure",
      allowedAssetClasses: ["TOKENIZED_TREASURY"],
      prohibitedAssetClasses: ["TOKENIZED_MONEY_MARKET_FUND"],
      jurisdictions: [],
      requiredClaims: [],
      requiredEvidence: []
    };
    const verification = verifyEconomicObject(object, { nowMs: NOW });
    const decision = evaluateMandate(object, verification, mandate, { nowMs: NOW });

    expect(decision.decision).toBe("BLOCK");
    expect(resolution.resolution).toBe("RESOLVED");
    expect(resolution.distinguishesMandateSuitability).toBe(true);
  });

  it("the same broad asset class contains materially different profiles without forced equivalence", () => {
    const profiles = loadProfiles();
    const wrapped = profiles.find(
      (candidate) => candidate.profileId === "profile:treasury-wrapped-representation"
    )!;
    const debt = profiles.find(
      (candidate) => candidate.profileId === "profile:treasury-debt-instrument"
    )!;
    expect(wrapped.assetClass).toBe(debt.assetClass);
    expect(wrapped.resolutionClass).not.toBe(debt.resolutionClass);

    const wrappedRequired = wrapped.dimensions
      .filter((dimension) => dimension.required)
      .map((dimension) => dimension.dimension);
    const debtRequired = debt.dimensions
      .filter((dimension) => dimension.required)
      .map((dimension) => dimension.dimension);
    expect(wrappedRequired).toContain("representationLineage");
    expect(debtRequired).toContain("obligationTerms");
    expect(debtRequired).not.toContain("representationLineage");
    expect(wrappedRequired).not.toContain("obligationTerms");

    const ousg = makeCandidate("TOKENIZED_TREASURY", WRAPPED_PROPERTIES);
    const ousgSet = evaluateProfileSet(profiles, ousg, { nowMs: NOW });
    const wrappedResult = ousgSet.applicable.find(
      (result) => result.profileId === wrapped.profileId
    )!;
    const debtResult = ousgSet.applicable.find((result) => result.profileId === debt.profileId)!;
    expect(wrappedResult.resolution).toBe("RESOLVED");
    expect(debtResult.resolution).toBe("INSUFFICIENT_EVIDENCE");
    expect(debtResult.reasonCodes).toContain("PROFILE_DIMENSION_MISSING:obligationTerms");
    expect(ousgSet.overall).toBe("INSUFFICIENT_EVIDENCE");

    const benji = makeCandidate("TOKENIZED_MONEY_MARKET_FUND", FUND_SHARE_PROPERTIES);
    const benjiSet = evaluateProfileSet(profiles, benji, { nowMs: NOW });
    expect(benjiSet.applicable).toHaveLength(1);
    expect(benjiSet.applicable[0]!.profileId).toBe("profile:moneymarket-fund-share");
    expect(benjiSet.applicable[0]!.resolution).toBe("RESOLVED");
  });

  it("real candidate classes map to their own profiles and never resolve identically", () => {
    const profiles = loadProfiles();

    const benji = evaluateProfileSet(
      profiles,
      makeCandidate("TOKENIZED_MONEY_MARKET_FUND", FUND_SHARE_PROPERTIES),
      { nowMs: NOW }
    );
    const ousg = evaluateProfileSet(
      profiles,
      makeCandidate("TOKENIZED_TREASURY", WRAPPED_PROPERTIES),
      { nowMs: NOW }
    );
    const tbill = evaluateProfileSet(
      profiles,
      makeCandidate("TOKENIZED_TREASURY", DEBT_PROPERTIES),
      { nowMs: NOW }
    );

    const benjiProfile = benji.applicable[0]!.profileId;
    const ousgResult = ousg.applicable.find(
      (result) => result.profileId === "profile:treasury-wrapped-representation"
    )!;
    const tbillResult = tbill.applicable.find(
      (result) => result.profileId === "profile:treasury-debt-instrument"
    )!;
    const ousgProfile = ousgResult.profileId;
    const tbillProfile = tbillResult.profileId;
    const ids = [benjiProfile, ousgProfile, tbillProfile];
    expect(new Set(ids).size).toBe(3);
    expect(benjiProfile).toBe("profile:moneymarket-fund-share");
    expect(ousgProfile).toBe("profile:treasury-wrapped-representation");
    expect(tbillProfile).toBe("profile:treasury-debt-instrument");
    expect(ousgResult.resolution).toBe("RESOLVED");
    expect(tbillResult.resolution).toBe("PARTIALLY_RESOLVED");

    const reasonSets = [benji, ousg, tbill].map((set) =>
      set.applicable.map((result) => JSON.stringify(result.reasonCodes))
    );
    expect(new Set(reasonSets).size).toBe(3);

    expect(selectApplicableProfiles(profiles, makeCandidate("TOKENIZED_TREASURY", DEBT_PROPERTIES)).map((p) => p.profileId).sort()).toEqual(
      ["profile:treasury-debt-instrument", "profile:treasury-wrapped-representation"]
    );
  });

  it("profile evaluation emits traceable reason codes and claim/evidence requirements", () => {
    const profiles = loadProfiles();
    const object = makeCandidate("TOKENIZED_MONEY_MARKET_FUND", FUND_SHARE_PROPERTIES);
    const result = evaluateValidationProfile(
      profiles.find((candidate) => candidate.profileId === "profile:moneymarket-fund-share")!,
      object,
      { nowMs: NOW }
    );

    expect(result.engineVersion).toBe("noema-validation-profile-v1");
    for (const dimension of result.dimensionResults) {
      expect(dimension.reasonCode).toMatch(/^PROFILE_DIMENSION_(PRESENT|OPTIONAL_)/);
      expect(dimension.claimRefs.length).toBeGreaterThan(0);
      expect(dimension.evidenceRefs.length).toBeGreaterThan(0);
    }
    expect(result.reasonCodes.length).toBe(result.dimensionResults.length);
  });
});