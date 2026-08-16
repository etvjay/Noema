import { describe, expect, it } from "vitest";
import { canonicalJson, hashCanonical, computeRoots } from "@noema/canonicalization";
import {
  AmbiguousMigrationError,
  MigrationDowngradeError,
  MigrationGapError,
  MigrationCycleError,
  MigrationPathError,
  MigrationRegistry,
  SchemaRegistry,
  SchemaValidationError,
  UnsupportedSchemaError,
  noemaMigrationRegistry,
  noemaSchemaRegistry,
  versionedFromZod
} from "@noema/schemas";
import type { TestLedgerV3 } from "../fixtures/migration-ledger.js";
import {
  TEST_LEDGER_SCHEMA_ID,
  TEST_NOTE_SCHEMA_ID,
  ledgerV1Schema,
  ledgerV2Schema,
  ledgerV3Schema,
  makeLedgerV1,
  makeLedgerV2,
  makeLedgerV3,
  makeNoteV1,
  migrateLedgerV1ToV2,
  migrateLedgerV2ToV3,
  noteV1Schema,
  testLedgerMigrationRegistry,
  testLedgerSchemaRegistry
} from "../fixtures/migration-ledger.js";
import { makeEconomicObject } from "../helpers.js";

function fullLedgerRegistry() {
  return new SchemaRegistry()
    .register(versionedFromZod(TEST_LEDGER_SCHEMA_ID, 1, ledgerV1Schema))
    .register(versionedFromZod(TEST_LEDGER_SCHEMA_ID, 2, ledgerV2Schema))
    .register(versionedFromZod(TEST_LEDGER_SCHEMA_ID, 3, ledgerV3Schema));
}

describe("explicit schema migration: determinism and provenance", () => {
  it("produces identical artifacts, receipts, and hashes across at least 5 executions", () => {
    const input = makeLedgerV1();
    const runs = Array.from({ length: 5 }, () => testLedgerMigrationRegistry.migrate(input, 2));

    const first = runs[0]!;
    for (const run of runs) {
      expect(run.artifact).toEqual(first.artifact);
      expect(run.receipt).toEqual(first.receipt);
      expect(run.steps).toEqual(first.steps);
      expect(canonicalJson(run.artifact)).toBe(canonicalJson(first.artifact));
      expect(canonicalJson(run.receipt)).toBe(canonicalJson(first.receipt));
      expect(run.receipt.outputHash).toBe(first.receipt.outputHash);
      expect(run.receipt.inputHash).toBe(first.receipt.inputHash);
    }
  });

  it("replays the same canonical JSON and canonical hash on every execution", () => {
    const input = makeLedgerV1();
    const snapshot = canonicalJson(input);
    const snapshotHash = hashCanonical(input);

    for (let index = 0; index < 5; index += 1) {
      const result = testLedgerMigrationRegistry.migrate(input, 2);
      expect(canonicalJson(result.artifact)).toBe(canonicalJson(migrateLedgerV1ToV2(input)));
      expect(hashCanonical(result.artifact)).toBe(
        hashCanonical(migrateLedgerV1ToV2(input))
      );
      expect(canonicalJson(input)).toBe(snapshot);
      expect(hashCanonical(input)).toBe(snapshotHash);
    }
  });

  it("migrate(current, current) is canonically equal and hash-identical", () => {
    const input = makeLedgerV2();
    const result = testLedgerMigrationRegistry.migrate(input, 2);
    expect(result.artifact).toEqual(input);
    expect(canonicalJson(result.artifact)).toBe(canonicalJson(input));
    expect(result.receipt.inputHash).toBe(hashCanonical(input));
    expect(result.receipt.outputHash).toBe(result.receipt.inputHash);
  });

  it("does not rely on JavaScript reference equality for idempotence", () => {
    const input = makeLedgerV1();
    const first = testLedgerMigrationRegistry.migrate(input, 2);
    const second = testLedgerMigrationRegistry.migrate(input, 2);

    expect(first.artifact).not.toBe(second.artifact);
    expect(first.receipt).not.toBe(second.receipt);
    expect(first.artifact).toEqual(second.artifact);
    expect(first.receipt).toEqual(second.receipt);
  });

  it("links MigrationReceipt inputHash/outputHash to the exact serialized artifacts", () => {
    const input = makeLedgerV1();
    const result = testLedgerMigrationRegistry.migrate(input, 2);

    expect(result.receipt.inputHash).toBe(hashCanonical(input));
    expect(result.receipt.outputHash).toBe(hashCanonical(result.artifact));
    expect(result.receipt.outputHash).not.toBe(result.receipt.inputHash);
    expect(result.receipt.subjectSchemaId).toBe(TEST_LEDGER_SCHEMA_ID);
    expect(result.receipt.fromVersion).toBe(1);
    expect(result.receipt.toVersion).toBe(2);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.migrationId).toBe(result.receipt.migrationId);

    const decoded = noemaSchemaRegistry.decode(result.receipt);
    expect(decoded).toEqual(result.receipt);
  });

  it("keeps migrationId stable across runs and reports the final step id", () => {
    const input = makeLedgerV1();
    const first = testLedgerMigrationRegistry.migrate(input, 3);
    const second = testLedgerMigrationRegistry.migrate(input, 3);

    expect(first.receipt.migrationId).toBe(second.receipt.migrationId);
    expect(first.receipt.id).toBe(second.receipt.id);
    expect(first.receipt.migrationId).toBe("test:ledger:v2-to-v3");
    expect(first.steps.map((step) => step.migrationId)).toEqual([
      "test:ledger:v1-to-v2",
      "test:ledger:v2-to-v3"
    ]);
  });

  it("follows the explicit registered chain v1 -> v2 -> v3 and validates every intermediate", () => {
    const input = makeLedgerV1();
    const result = testLedgerMigrationRegistry.migrate(input, 3);

    expect(result.artifact.schemaVersion).toBe(3);
    expect(result.artifact).toEqual(migrateLedgerV2ToV3(migrateLedgerV1ToV2(input)));
    expect(result.steps.map((step) => `${step.fromVersion}->${step.toVersion}`)).toEqual([
      "1->2",
      "2->3"
    ]);
    expect(result.receipt.toVersion).toBe(3);
    expect(result.steps[1]!.inputHash).toBe(result.steps[0]!.outputHash);
  });

  it("gives the migrated artifact a new expected hash/root distinct from the source", () => {
    const input = makeLedgerV1();
    const expected = migrateLedgerV1ToV2(input);
    const result = testLedgerMigrationRegistry.migrate(input, 2);

    expect(result.receipt.outputHash).toBe(hashCanonical(expected));
    expect(result.receipt.outputHash).not.toBe(hashCanonical(input));
  });

  it("never rewrites the historical source artifact or its recorded hash", () => {
    const input = makeLedgerV1();
    const originalHash = hashCanonical(input);
    const originalJson = canonicalJson(input);

    testLedgerMigrationRegistry.migrate(input, 3);
    testLedgerMigrationRegistry.migrate(input, 2);

    expect(canonicalJson(input)).toBe(originalJson);
    expect(hashCanonical(input)).toBe(originalHash);

    const object = makeEconomicObject();
    const originalRoots = computeRoots(object);
    testLedgerMigrationRegistry.migrate(makeLedgerV1(), 3);
    const replayedRoots = computeRoots(object);
    expect(replayedRoots.objectRoot).toBe(originalRoots.objectRoot);
    expect(replayedRoots.evidenceRoot).toBe(originalRoots.evidenceRoot);
    expect(replayedRoots.canonicalObject).toBe(originalRoots.canonicalObject);
  });

  it("preserves provenance and non-transformed references through migration", () => {
    const input = makeLedgerV1({
      id: "ledger:acme:shares",
      holder: "holder:acme",
      balance: "0.000125",
      assetClass: "PRIVATE"
    });
    const result = testLedgerMigrationRegistry.migrate(input, 3);
    const migrated = result.artifact as TestLedgerV3;

    expect(migrated.id).toBe("ledger:acme:shares");
    expect(migrated.holder).toBe("holder:acme");
    expect(migrated.balance).toBe("0.000125");
    expect(migrated.assetClass).toBe("PRIVATE");
    expect(migrated.balanceUnits).toBe("125");
    expect(migrated.eligibility).toBe("QUALIFIED");
    expect(result.receipt.subjectSchemaId).toBe(TEST_LEDGER_SCHEMA_ID);
  });
});

describe("explicit schema migration: fail-closed adversarial rejection", () => {
  it("rejects a downgrade target below the source version", () => {
    expect(() => testLedgerMigrationRegistry.migrate(makeLedgerV3(), 2)).toThrow(
      MigrationDowngradeError
    );
  });

  it("rejects unknown schema and unknown source version before any migration runs", () => {
    expect(() =>
      testLedgerMigrationRegistry.migrate({ ...makeLedgerV1(), schemaId: "noema:unknown" }, 2)
    ).toThrow(UnsupportedSchemaError);

    expect(() =>
      testLedgerMigrationRegistry.migrate({ ...makeLedgerV1(), schemaVersion: 99 }, 2)
    ).toThrow(UnsupportedSchemaError);
  });

  it("rejects a missing migration path and an unregistered target schema", () => {
    const partial = new MigrationRegistry(fullLedgerRegistry()).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "m:v1-v2",
      migrateLedgerV1ToV2
    );
    expect(() => partial.migrate(makeLedgerV1(), 3)).toThrow(MigrationPathError);
    expect(() => partial.migrate(makeLedgerV2(), 3)).toThrow(MigrationPathError);

    const orphan = new MigrationRegistry(fullLedgerRegistry()).register(
      TEST_LEDGER_SCHEMA_ID,
      2,
      3,
      "m:v2-v3",
      migrateLedgerV2ToV3
    );
    expect(() => orphan.migrate(makeLedgerV1(), 2)).toThrow(MigrationPathError);
  });

  it("rejects duplicate and ambiguous migration registrations", () => {
    const duplicate = new MigrationRegistry(fullLedgerRegistry()).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "m:v1-v2",
      migrateLedgerV1ToV2
    );
    expect(() =>
      duplicate.register(TEST_LEDGER_SCHEMA_ID, 1, 2, "m:v1-v2-dup", migrateLedgerV1ToV2)
    ).toThrow(AmbiguousMigrationError);

    const ambiguous = new MigrationRegistry(fullLedgerRegistry()).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "m:v1-v2",
      migrateLedgerV1ToV2
    );
    expect(() =>
      ambiguous.register(TEST_LEDGER_SCHEMA_ID, 1, 3, "m:v1-v3", migrateLedgerV1ToV2)
    ).toThrow(AmbiguousMigrationError);
  });

  it("rejects cycle-forming and downgrade registrations", () => {
    const registry = new MigrationRegistry(fullLedgerRegistry());
    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 2, 1, "m:v2-v1", migrateLedgerV1ToV2)
    ).toThrow(MigrationDowngradeError);
    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 2, 2, "m:v2-v2", migrateLedgerV1ToV2)
    ).toThrow(MigrationDowngradeError);
    expect(MigrationCycleError).toBeDefined();
  });

  it("rejects an invalid chain that skips a known schema version", () => {
    const registry = new MigrationRegistry(fullLedgerRegistry());
    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 1, 3, "m:v1-v3", migrateLedgerV1ToV2)
    ).toThrow(MigrationGapError);
  });

  it("rejects malformed intermediate output against the exact registered target schema", () => {
    const registry = new MigrationRegistry(fullLedgerRegistry()).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "m:bad-output",
      () => ({ ...makeLedgerV1(), schemaVersion: 2, balanceUnits: "0x12" })
    );
    expect(() => registry.migrate(makeLedgerV1(), 2)).toThrow(SchemaValidationError);
  });

  it("rejects intermediate output stamped as a different registered schema (cross-schema switch)", () => {
    const schemas = fullLedgerRegistry().register(
      versionedFromZod(TEST_NOTE_SCHEMA_ID, 1, noteV1Schema)
    );
    const registry = new MigrationRegistry(schemas).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "m:cross-schema",
      () => makeNoteV1()
    );
    expect(() => registry.migrate(makeLedgerV1(), 2)).toThrow(SchemaValidationError);
  });

  it("rejects intermediate output stamped at a different version than the exact target", () => {
    const registry = new MigrationRegistry(fullLedgerRegistry()).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "m:wrong-version",
      () => makeLedgerV3()
    );
    expect(() => registry.migrate(makeLedgerV1(), 2)).toThrow(SchemaValidationError);
  });

  it("rejects an unstamped artifact and a malformed source shape", () => {
    const unstamped: Record<string, unknown> = { ...makeLedgerV1() };
    delete unstamped.schemaId;
    delete unstamped.schemaVersion;
    expect(() => testLedgerMigrationRegistry.migrate(unstamped as never, 2)).toThrow(
      SchemaValidationError
    );
    expect(() =>
      testLedgerMigrationRegistry.migrate({ ...makeLedgerV1(), balance: "not-json" }, 2)
    ).toThrow(SchemaValidationError);
  });
});

describe("explicit schema migration: production registry isolation", () => {
  it("never registers the test-only ledger schemas in the production default registry", () => {
    expect(noemaSchemaRegistry.isSupported(TEST_LEDGER_SCHEMA_ID, 1)).toBe(false);
    expect(noemaSchemaRegistry.isSupported(TEST_LEDGER_SCHEMA_ID, 2)).toBe(false);
    expect(noemaSchemaRegistry.isSupported(TEST_LEDGER_SCHEMA_ID, 3)).toBe(false);
    expect(testLedgerSchemaRegistry.isSupported(TEST_LEDGER_SCHEMA_ID, 1)).toBe(true);
  });

  it("keeps the production migration registry free of test-only migrations", () => {
    expect(noemaMigrationRegistry.hasMigration(TEST_LEDGER_SCHEMA_ID, 1)).toBe(false);
    expect(noemaMigrationRegistry.supportedMigrations(TEST_LEDGER_SCHEMA_ID)).toEqual([]);
    expect(testLedgerMigrationRegistry.supportedMigrations(TEST_LEDGER_SCHEMA_ID)).toHaveLength(2);
  });

  it("decodes the production MigrationReceipt artifact at its own schema", () => {
    const receipt = testLedgerMigrationRegistry.migrate(makeLedgerV1(), 2).receipt;
    expect(receipt.schemaId).toBe("noema:migration-receipt");
    expect(receipt.schemaVersion).toBe(1);
    expect(noemaSchemaRegistry.decode(receipt)).toEqual(receipt);
  });
});

describe("explicit schema migration: isolated registries do not share state", () => {
  it("supports concurrent isolated registries with independent migration sets", () => {
    const alpha = new MigrationRegistry(fullLedgerRegistry()).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "alpha:v1-v2",
      migrateLedgerV1ToV2
    );
    const beta = new MigrationRegistry(fullLedgerRegistry()).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "beta:v1-v2",
      migrateLedgerV1ToV2
    );

    expect(alpha.supportedMigrations(TEST_LEDGER_SCHEMA_ID)[0]!.migrationId).toBe(
      "alpha:v1-v2"
    );
    expect(beta.supportedMigrations(TEST_LEDGER_SCHEMA_ID)[0]!.migrationId).toBe(
      "beta:v1-v2"
    );
    const alphaResult = alpha.migrate(makeLedgerV1(), 2);
    const betaResult = beta.migrate(makeLedgerV1(), 2);
    expect(alphaResult.artifact).toEqual(betaResult.artifact);
    expect(alphaResult.receipt.migrationId).not.toBe(betaResult.receipt.migrationId);
  });

  it("makes the deterministic no-op target version independent of registry contents", () => {
    const result = testLedgerMigrationRegistry.migrate(makeLedgerV3(), 3);
    expect(result.artifact.schemaVersion).toBe(3);
    expect(result.steps).toEqual([]);
  });
});