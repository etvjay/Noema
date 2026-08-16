import { describe, expect, it } from "vitest";
import type { Attestation, EconomicObject, Hex } from "@noema/economic-kernel";
import {
  computeRoots,
  evidenceLeaves,
  HASHING_VERSION_V1,
  HASHING_VERSION_V2,
  CURRENT_HASHING_VERSION,
  HASHING_VERSIONS,
  OBJECT_DOMAIN_V1,
  OBJECT_DOMAIN_V2
} from "@noema/canonicalization";
import {
  noemaSchemaRegistry,
  SCHEMA_IDS,
  SCHEMA_VERSIONS,
  SchemaValidationError,
  UnsupportedSchemaError
} from "@noema/schemas";
import {
  createEvidenceRecord,
  createNextVersion,
  createSourceSnapshot,
  evaluateMandate,
  reduceEconomicObject,
  AppendOnlyVersionStore
} from "@noema/noema-core";
import { verifyEconomicObject } from "@noema/verification";
import { makeEconomicObject } from "../helpers.js";

describe("PR1 schema versioning: fail-closed registry and construction stamping", () => {
  it("registers exactly schema version 1 for every versioned canonical artifact", () => {
    for (const schemaId of Object.values(SCHEMA_IDS)) {
      expect(noemaSchemaRegistry.supportedVersions(schemaId)).toEqual([1]);
    }
    expect(noemaSchemaRegistry.isSupported(SCHEMA_IDS.ECONOMIC_OBJECT, 1)).toBe(true);
    expect(noemaSchemaRegistry.isSupported(SCHEMA_IDS.ECONOMIC_OBJECT, 2)).toBe(false);
  });

  it("rejects unstamped, unknown, and tampered artifacts instead of coercing them", () => {
    const object = makeEconomicObject();

    const unstamped = { ...object } as Record<string, unknown>;
    delete unstamped.schemaId;
    delete unstamped.schemaVersion;
    expect(() => noemaSchemaRegistry.decode(unstamped)).toThrow(SchemaValidationError);

    expect(() =>
      noemaSchemaRegistry.decode({ ...object, schemaId: "noema:unknown-artifact" })
    ).toThrow(UnsupportedSchemaError);

    expect(() => noemaSchemaRegistry.decode({ ...object, schemaVersion: 99 })).toThrow(
      UnsupportedSchemaError
    );

    expect(() =>
      noemaSchemaRegistry.decode({ ...object, classification: "not-an-object" })
    ).toThrow(SchemaValidationError);
  });

  it("fails closed on malformed nested schema identity inside a canonical EconomicObject", () => {
    const object = makeEconomicObject();
    const evidence = object.evidence[0];
    if (evidence === undefined) {
      throw new Error("fixture evidence missing");
    }
    const attestation = object.attestations[0];

    expect(() =>
      noemaSchemaRegistry.decode({
        ...object,
        evidence: [{ ...evidence, schemaId: "noema:attestation" }]
      })
    ).toThrow(SchemaValidationError);

    expect(() =>
      noemaSchemaRegistry.decode({
        ...object,
        evidence: [{ ...evidence, schemaVersion: 99 }]
      })
    ).toThrow(SchemaValidationError);

    if (attestation !== undefined) {
      expect(() =>
        noemaSchemaRegistry.decode({
          ...object,
          attestations: [{ ...attestation, schemaId: "noema:evidence" }]
        })
      ).toThrow(SchemaValidationError);
    }
  });

  it("prevents unsupported nested artifacts from entering AppendOnlyVersionStore", () => {
    const store = new AppendOnlyVersionStore();
    const object = makeEconomicObject();
    const evidence = object.evidence[0];
    if (evidence === undefined) {
      throw new Error("fixture evidence missing");
    }
    expect(() =>
      store.save({ ...object, evidence: [{ ...evidence, schemaVersion: 99 }] })
    ).toThrow(SchemaValidationError);
    expect(() => store.save(object)).not.toThrow();
  });

  it("stamps every constructor-produced artifact and decodes it round-trip", () => {
    const object = reduceEconomicObject(makeEconomicObject());
    expect(noemaSchemaRegistry.decode(object)).toEqual(object);
    expect(object.schemaId).toBe(SCHEMA_IDS.ECONOMIC_OBJECT);
    expect(object.schemaVersion).toBe(SCHEMA_VERSIONS.ECONOMIC_OBJECT);

    const snapshot = createSourceSnapshot({
      sourceId: "source:pr1",
      uri: "https://example.test/snapshot.json",
      contentType: "application/json",
      body: { ticker: "buidl" },
      fetchedAt: 1_700_000_000_000
    });
    expect(snapshot.schemaId).toBe(SCHEMA_IDS.SOURCE_SNAPSHOT);
    expect(noemaSchemaRegistry.decode(snapshot)).toEqual(snapshot);

    const evidence = createEvidenceRecord({
      id: "evidence:pr1",
      type: "API_RESPONSE",
      source: snapshot.id,
      contentHash: snapshot.contentHash,
      observedAt: 1_700_000_000_000,
      fetchedAt: 1_700_000_000_000,
      authority: "REFERENCE_DATA"
    });
    expect(evidence.schemaId).toBe(SCHEMA_IDS.EVIDENCE);
    expect(noemaSchemaRegistry.decode(evidence)).toEqual(evidence);
  });

  it("decodes a stamped Attestation at its own artifact schema", () => {
    const attestation: Attestation = {
      id: "attestation:pr1",
      schemaId: SCHEMA_IDS.ATTESTATION,
      schemaVersion: SCHEMA_VERSIONS.ATTESTATION,
      subject: "object:fixture",
      claimRef: "claim:fixture:identity",
      schema: "noema:test-attestation",
      attestor: "attestor:test",
      signature: ("0x" + "ab".repeat(32)) as Hex,
      issuedAt: 1_700_000_000_000,
      state: "ACTIVE"
    };
    expect(noemaSchemaRegistry.decode(attestation)).toEqual(attestation);
  });

  it("stamps verification and decision receipts with their own artifact schemas", () => {
    const object = makeEconomicObject();
    const receipt = verifyEconomicObject(object, { nowMs: 1_700_000_000_000 });
    expect(receipt.schemaId).toBe(SCHEMA_IDS.VERIFICATION_RECEIPT);
    expect(receipt.schemaVersion).toBe(SCHEMA_VERSIONS.VERIFICATION_RECEIPT);
    expect(receipt.hashingVersion).toBe(CURRENT_HASHING_VERSION);
    expect(noemaSchemaRegistry.decode(receipt)).toEqual(receipt);

    const decision = evaluateMandate(
      object,
      receipt,
      {
        id: "mandate:pr1",
        version: 1,
        principal: "principal:test",
        objective: "PR1 schema versioning",
        allowedAssetClasses: ["TOKENIZED_TREASURY"],
        prohibitedAssetClasses: [],
        jurisdictions: ["US"],
        requiredClaims: [{ property: "economicIdentity", requiredState: "SOURCED" as const }],
        requiredEvidence: [{ type: "API_RESPONSE" as const, maxAgeMs: 86_400_000 }],
        expiresAt: 1_800_000_000_000
      },
      { nowMs: 1_700_000_000_000 }
    );
    expect(decision.schemaId).toBe(SCHEMA_IDS.DECISION_RECEIPT);
    expect(decision.schemaVersion).toBe(SCHEMA_VERSIONS.DECISION_RECEIPT);
    expect(noemaSchemaRegistry.decode(decision)).toEqual(decision);
  });

  it("preserves schema identity across createNextVersion", () => {
    const object = makeEconomicObject();
    const next = createNextVersion(
      object,
      {
        economics: {
          asOf: 1_700_000_000_000,
          values: { nav: "101.50", currency: "USD" },
          claimRefs: object.claims.map((claim) => claim.id)
        }
      },
      { nowMs: 1_700_000_000_500 }
    );
    expect(next.version).toBe(2);
    expect(next.schemaId).toBe(object.schemaId);
    expect(next.schemaVersion).toBe(object.schemaVersion);
    expect(noemaSchemaRegistry.decode(next)).toEqual(next);
  });

  it("enforces the fail-closed decode boundary inside AppendOnlyVersionStore.save", () => {
    const store = new AppendOnlyVersionStore();
    const object = makeEconomicObject();
    store.save(object);

    const unstamped = { ...object } as Record<string, unknown>;
    delete unstamped.schemaId;
    delete unstamped.schemaVersion;
    expect(() => store.save(unstamped as unknown as EconomicObject)).toThrow(
      SchemaValidationError
    );

    expect(() => store.save({ ...object, schemaVersion: 99 })).toThrow(UnsupportedSchemaError);
  });
});

describe("PR1 schema versioning: hashing v1 legacy replay and v2 binding", () => {
  it("replays v1 roots byte-for-byte regardless of in-band schema fields", () => {
    expect(HASHING_VERSIONS).toEqual(["noema-hashing-v1", "noema-hashing-v2"]);

    const stampedA = makeEconomicObject();
    const stampedB = makeEconomicObject({ schemaVersion: 2 });

    const rootsA = computeRoots(stampedA, HASHING_VERSION_V1);
    const rootsB = computeRoots(stampedB, HASHING_VERSION_V1);
    expect(rootsA.objectRoot).toBe(rootsB.objectRoot);
    expect(rootsA.evidenceRoot).toBe(rootsB.evidenceRoot);
    expect(rootsA.canonicalObject).toBe(rootsB.canonicalObject);
    expect(rootsA.hashingVersion).toBe(HASHING_VERSION_V1);
  });

  it("keeps v1 canonical commitments free of schema fields and bound to v1 domains", () => {
    const v1 = computeRoots(makeEconomicObject(), HASHING_VERSION_V1);
    expect(v1.canonicalObject).toContain(`\"domain\":\"${OBJECT_DOMAIN_V1}\"`);
    expect(v1.canonicalObject).toContain(`\"hashingVersion\":\"${HASHING_VERSION_V1}\"`);
    expect(v1.canonicalObject).not.toContain("schemaId");
    expect(v1.canonicalObject).not.toContain("schemaVersion");
  });

  it("binds schema identity and v2 domains into current canonical commitments", () => {
    const v2 = computeRoots(makeEconomicObject());
    expect(v2.hashingVersion).toBe(CURRENT_HASHING_VERSION);
    expect(CURRENT_HASHING_VERSION).toBe(HASHING_VERSION_V2);
    expect(v2.canonicalObject).toContain(`\"domain\":\"${OBJECT_DOMAIN_V2}\"`);
    expect(v2.canonicalObject).toContain(`\"hashingVersion\":\"${HASHING_VERSION_V2}\"`);
    expect(v2.canonicalObject).toContain(`\"schemaId\":\"noema:economic-object\"`);
    expect(v2.canonicalObject).toContain(`\"schemaVersion\":1`);
  });

  it("fails closed when a v2 commitment cannot bind in-band schema identity", () => {
    const object = makeEconomicObject();
    const unstamped = { ...object } as Record<string, unknown>;
    delete unstamped.schemaId;
    delete unstamped.schemaVersion;
    expect(() => computeRoots(unstamped as never)).toThrow(
      /missing in-band schema identity/
    );

    const evidence = object.evidence[0];
    if (evidence === undefined) {
      throw new Error("fixture evidence missing");
    }
    const unstampedEvidence = { ...evidence } as Record<string, unknown>;
    delete unstampedEvidence.schemaId;
    delete unstampedEvidence.schemaVersion;
    expect(() => evidenceLeaves([unstampedEvidence as never])).toThrow(
      /missing in-band schema identity/
    );
  });

  it("replays v1 roots byte-for-byte for legacy-shaped artifacts with schema fields removed", () => {
    const stamped = makeEconomicObject();

    const legacy = JSON.parse(
      JSON.stringify(stamped, (key, value) =>
        key === "schemaId" || key === "schemaVersion" ? undefined : value
      )
    ) as Record<string, unknown>;

    expect(computeRoots(stamped, HASHING_VERSION_V1).objectRoot).toBe(
      computeRoots(legacy as never, HASHING_VERSION_V1).objectRoot
    );
    expect(computeRoots(stamped, HASHING_VERSION_V1).evidenceRoot).toBe(
      computeRoots(legacy as never, HASHING_VERSION_V1).evidenceRoot
    );
    expect(computeRoots(stamped, HASHING_VERSION_V1).canonicalObject).toBe(
      computeRoots(legacy as never, HASHING_VERSION_V1).canonicalObject
    );
  });

  it("does not promote legacy inputs to the current scheme silently", () => {
    const stamped = makeEconomicObject();
    const supersededStamp = makeEconomicObject({ schemaVersion: 2 });

    expect(computeRoots(stamped).objectRoot).not.toBe(
      computeRoots(supersededStamp).objectRoot
    );
    expect(computeRoots(stamped).evidenceRoot).toBe(
      computeRoots(supersededStamp).evidenceRoot
    );

    expect(() => noemaSchemaRegistry.decode(supersededStamp)).toThrow(UnsupportedSchemaError);
    expect(() => noemaSchemaRegistry.decode(stamped)).not.toThrow();
  });

  it("binds evidence schema fields into v2 leaves while keeping v1 leaves independent", () => {
    const object = makeEconomicObject();
    const baseEvidence = object.evidence[0];
    if (baseEvidence === undefined) {
      throw new Error("fixture evidence missing");
    }
    const reversionedEvidence = { ...baseEvidence, schemaVersion: 2 };

    const v1Leaves = evidenceLeaves(object.evidence, HASHING_VERSION_V1);
    const v2Leaves = evidenceLeaves(object.evidence);
    expect(v2Leaves).not.toEqual(v1Leaves);
    expect(v2Leaves).not.toEqual(evidenceLeaves([reversionedEvidence]));
    expect(v1Leaves).toEqual(evidenceLeaves([reversionedEvidence], HASHING_VERSION_V1));

    const v2ObjectJson = computeRoots(object).canonicalObject;
    expect(v2ObjectJson).toContain(`\"schemaId\":\"noema:evidence\"`);
    expect(v2ObjectJson).toContain(`\"schemaVersion\":1`);
  });
});