import { describe, expect, it } from "vitest";
import { makeEconomicObject } from "../../../tests/helpers.js";
import type { VerificationReceipt } from "@noema/economic-kernel";
import {
  noemaSchemaRegistry,
  SchemaRegistry,
  UnsupportedSchemaError,
  SchemaValidationError,
  versionedFromZod,
  SCHEMA_IDS,
  SCHEMA_VERSIONS,
  evidenceSchema
} from "./index.js";
import { verifyEconomicObject } from "../../verification/src/index.js";
import { evaluateMandate } from "../../noema-core/src/mandate.js";

describe("SchemaRegistry fail-closed decoding", () => {
  it("registers the six canonical artifact schemas at schema version 1", () => {
    expect(noemaSchemaRegistry.isSupported(SCHEMA_IDS.ECONOMIC_OBJECT, 1)).toBe(true);
    expect(noemaSchemaRegistry.isSupported(SCHEMA_IDS.EVIDENCE, 1)).toBe(true);
    expect(noemaSchemaRegistry.isSupported(SCHEMA_IDS.SOURCE_SNAPSHOT, 1)).toBe(true);
    expect(noemaSchemaRegistry.isSupported(SCHEMA_IDS.ATTESTATION, 1)).toBe(true);
    expect(noemaSchemaRegistry.isSupported(SCHEMA_IDS.VERIFICATION_RECEIPT, 1)).toBe(true);
    expect(noemaSchemaRegistry.isSupported(SCHEMA_IDS.DECISION_RECEIPT, 1)).toBe(true);
  });

  it("decodes an in-band stamped EconomicObject", () => {
    const object = makeEconomicObject();
    const decoded = noemaSchemaRegistry.decode(object);
    expect(decoded).toEqual(object);
  });

  it("throws UnsupportedSchemaError for an unregistered schemaId/version", () => {
    const object = makeEconomicObject();
    expect(() =>
      noemaSchemaRegistry.decode({ ...object, schemaId: "noema:unknown-artifact" })
    ).toThrow(UnsupportedSchemaError);
    expect(() =>
      noemaSchemaRegistry.decode({ ...object, schemaVersion: 99 })
    ).toThrow(UnsupportedSchemaError);
  });

  it("never falls back to a nearest version for a missing version", () => {
    const object = makeEconomicObject();
    const missing = { ...object, schemaVersion: 0 };
    expect(noemaSchemaRegistry.isSupported(object.schemaId, 0)).toBe(false);
    expect(() => noemaSchemaRegistry.decode(missing)).toThrow(UnsupportedSchemaError);
  });

  it("throws SchemaValidationError for a stamped artifact whose shape is invalid", () => {
    const object = makeEconomicObject();
    expect(() =>
      noemaSchemaRegistry.decode({ ...object, classification: { primary: "" } })
    ).toThrow(SchemaValidationError);
  });

  it("throws for input missing the in-band schema identity", () => {
    const { schemaId: _schemaId, schemaVersion: _schemaVersion, ...object } = makeEconomicObject();
    void _schemaId;
    void _schemaVersion;
    expect(() => noemaSchemaRegistry.decode(object)).toThrow(SchemaValidationError);
  });

  it("rejects duplicate version registration on the same registry instance", () => {
    const registry = new SchemaRegistry()
      .register(versionedFromZod("schema:test", 1, evidenceSchema))
      .register(versionedFromZod("schema:test", 1, evidenceSchema));
    expect(registry.isSupported("schema:test", 1)).toBe(true);
    expect(registry.supportedVersions("schema:test")).toEqual([1]);
  });

  it("decodes verification and decision receipts produced by the deterministic pipeline", () => {
    const object = makeEconomicObject();
    const verification = verifyEconomicObject(object, { nowMs: 1_700_000_000_000 });
    const decodedVerification = noemaSchemaRegistry.decode(verification) as VerificationReceipt;
    expect(decodedVerification).toEqual(verification);
    expect(decodedVerification.hashingVersion).toBe("noema-hashing-v2");

    const mandate = {
      id: "mandate:registry-test",
      version: 1,
      principal: "principal:test",
      objective: "Registry decode coverage",
      allowedAssetClasses: ["TOKENIZED_TREASURY"],
      prohibitedAssetClasses: [],
      jurisdictions: ["US"],
      requiredClaims: [{ property: "economicIdentity", requiredState: "SOURCED" as const }],
      requiredEvidence: [{ type: "API_RESPONSE" as const, maxAgeMs: 86_400_000 }],
      expiresAt: 1_800_000_000_000
    };
    const decision = evaluateMandate(object, verification, mandate, { nowMs: 1_700_000_000_000 });
    const decodedDecision = noemaSchemaRegistry.decode(decision);
    expect(decodedDecision).toEqual(decision);
  });
});