import { describe, expect, it } from "vitest";
import {
  SchemaRegistry,
  UnsupportedSchemaError,
  SchemaValidationError,
  versionedFromZod
} from "./index.js";
import {
  AmbiguousMigrationError,
  MigrationDowngradeError,
  MigrationGapError,
  MigrationCycleError,
  MigrationPathError,
  MigrationRegistry,
  NO_OP_MIGRATION_ID,
  detectMigrationCycle,
  migrateArtifact
} from "./migration.js";
import type {
  TestLedgerV1
} from "../../../tests/fixtures/migration-ledger.js";
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
} from "../../../tests/fixtures/migration-ledger.js";

function freshLedgerRegistry() {
  return new SchemaRegistry()
    .register(versionedFromZod(TEST_LEDGER_SCHEMA_ID, 1, ledgerV1Schema))
    .register(versionedFromZod(TEST_LEDGER_SCHEMA_ID, 2, ledgerV2Schema))
    .register(versionedFromZod(TEST_LEDGER_SCHEMA_ID, 3, ledgerV3Schema));
}

describe("MigrationRegistry registration validation", () => {
  it("registers forward migrations and lists them sorted by fromVersion", () => {
    const registry = new MigrationRegistry(freshLedgerRegistry())
      .register(TEST_LEDGER_SCHEMA_ID, 1, 2, "m:v1-v2", migrateLedgerV1ToV2)
      .register(TEST_LEDGER_SCHEMA_ID, 2, 3, "m:v2-v3", migrateLedgerV2ToV3);

    expect(registry.hasMigration(TEST_LEDGER_SCHEMA_ID, 1)).toBe(true);
    expect(registry.hasMigration(TEST_LEDGER_SCHEMA_ID, 2)).toBe(true);
    expect(registry.supportedMigrations(TEST_LEDGER_SCHEMA_ID).map((m) => m.migrationId)).toEqual([
      "m:v1-v2",
      "m:v2-v3"
    ]);
  });

  it("rejects downgrade, self-loop, and non-positive version registrations", () => {
    const registry = new MigrationRegistry(freshLedgerRegistry());

    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 2, 1, "m:down", migrateLedgerV2ToV3)
    ).toThrow(MigrationDowngradeError);

    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 2, 2, "m:self", migrateLedgerV2ToV3)
    ).toThrow(MigrationDowngradeError);

    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 0, 1, "m:zero", migrateLedgerV1ToV2)
    ).toThrow(/fromVersion must be a positive integer/);

    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 1, 0, "m:zero-target", migrateLedgerV1ToV2)
    ).toThrow(/toVersion must be a positive integer/);
  });

  it("rejects a duplicate registration for the same schemaId/fromVersion path", () => {
    const registry = new MigrationRegistry(freshLedgerRegistry())
      .register(TEST_LEDGER_SCHEMA_ID, 1, 2, "m:v1-v2", migrateLedgerV1ToV2);

    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 1, 2, "m:v1-v2-dup", migrateLedgerV1ToV2)
    ).toThrow(AmbiguousMigrationError);

    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 1, 3, "m:v1-v3", migrateLedgerV1ToV2)
    ).toThrow(AmbiguousMigrationError);
  });

  it("rejects a reused migration id on a different path", () => {
    const registry = new MigrationRegistry(freshLedgerRegistry())
      .register(TEST_LEDGER_SCHEMA_ID, 1, 2, "m:shared", migrateLedgerV1ToV2);

    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 2, 3, "m:shared", migrateLedgerV2ToV3)
    ).toThrow(AmbiguousMigrationError);
  });

  it("rejects an edge that skips a known schema version (chain gap)", () => {
    const registry = new MigrationRegistry(freshLedgerRegistry());

    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 1, 3, "m:jump-v3", migrateLedgerV1ToV2)
    ).toThrow(MigrationGapError);

    expect(() =>
      registry.register(TEST_LEDGER_SCHEMA_ID, 2, 4, "m:jump-v4", migrateLedgerV2ToV3)
    ).toThrow(MigrationGapError);
  });

  it("allows an edge that does not skip any known version", () => {
    const schemas = new SchemaRegistry().register(
      versionedFromZod(TEST_LEDGER_SCHEMA_ID, 1, ledgerV1Schema)
    );
    const registry = new MigrationRegistry(schemas).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      3,
      "m:v1-v3",
      (input: TestLedgerV1) => ({ ...input, schemaVersion: 3 })
    );
    expect(registry.hasMigration(TEST_LEDGER_SCHEMA_ID, 1)).toBe(true);
  });
});

describe("detectMigrationCycle", () => {
  it("returns null for acyclic consecutive edges", () => {
    expect(
      detectMigrationCycle([
        { schemaId: TEST_LEDGER_SCHEMA_ID, fromVersion: 1, toVersion: 2, migrationId: "a" },
        { schemaId: TEST_LEDGER_SCHEMA_ID, fromVersion: 2, toVersion: 3, migrationId: "b" }
      ])
    ).toBeNull();
  });

  it("returns the cycle edges for a crafted migration cycle", () => {
    const cycle = detectMigrationCycle([
      { schemaId: TEST_LEDGER_SCHEMA_ID, fromVersion: 1, toVersion: 4, migrationId: "a" },
      { schemaId: TEST_LEDGER_SCHEMA_ID, fromVersion: 4, toVersion: 2, migrationId: "b" },
      { schemaId: TEST_LEDGER_SCHEMA_ID, fromVersion: 2, toVersion: 1, migrationId: "c" }
    ]);
    expect(cycle).not.toBeNull();
    const ids = cycle!.map((edge) => edge.migrationId);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
  });

  it("detects a two-node cycle", () => {
    expect(
      detectMigrationCycle([
        { schemaId: TEST_LEDGER_SCHEMA_ID, fromVersion: 1, toVersion: 2, migrationId: "a" },
        { schemaId: TEST_LEDGER_SCHEMA_ID, fromVersion: 2, toVersion: 1, migrationId: "b" }
      ])
    ).not.toBeNull();
  });
});

describe("migrateArtifact source resolution and fail-closed rejection", () => {
  it("rejects an unstamped artifact and an unknown schemaId", () => {
    const unstamped: Record<string, unknown> = { ...makeLedgerV1() };
    delete unstamped.schemaId;
    delete unstamped.schemaVersion;
    expect(() => testLedgerMigrationRegistry.migrate(unstamped as never, 2)).toThrow(SchemaValidationError);

    expect(() =>
      testLedgerMigrationRegistry.migrate({ ...makeLedgerV1(), schemaId: "noema:unknown:artifact" }, 2)
    ).toThrow(UnsupportedSchemaError);
  });

  it("rejects an unknown source schemaVersion", () => {
    expect(() =>
      testLedgerMigrationRegistry.migrate({ ...makeLedgerV1(), schemaVersion: 99 }, 2)
    ).toThrow(UnsupportedSchemaError);
  });

  it("rejects a downgrade target below the source version", () => {
    expect(() => testLedgerMigrationRegistry.migrate(makeLedgerV2(), 1)).toThrow(
      MigrationDowngradeError
    );
  });

  it("rejects a missing migration path", () => {
    const onlyPartial = new MigrationRegistry(freshLedgerRegistry()).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "m:v1-v2",
      migrateLedgerV1ToV2
    );
    expect(() => onlyPartial.migrate(makeLedgerV1(), 3)).toThrow(MigrationPathError);
  });

  it("rejects a migration whose target schema is not registered (invalid chain)", () => {
    const schemas = new SchemaRegistry().register(
      versionedFromZod(TEST_LEDGER_SCHEMA_ID, 1, ledgerV1Schema)
    );
    const registry = new MigrationRegistry(schemas).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "m:v1-v2",
      migrateLedgerV1ToV2
    );
    expect(() => registry.migrate(makeLedgerV1(), 2)).toThrow(MigrationPathError);
  });

  it("rejects malformed intermediate output at the exact registered target schema", () => {
    const registry = new MigrationRegistry(freshLedgerRegistry()).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "m:bad",
      () => ({ ...makeLedgerV1(), schemaVersion: 2, balanceUnits: "not-an-integer" })
    );
    expect(() => registry.migrate(makeLedgerV1(), 2)).toThrow(SchemaValidationError);
  });

  it("rejects intermediate output stamped as a different registered schema (cross-schema switch)", () => {
    const schemas = freshLedgerRegistry().register(
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
    const registry = new MigrationRegistry(freshLedgerRegistry()).register(
      TEST_LEDGER_SCHEMA_ID,
      1,
      2,
      "m:wrong-version",
      () => makeLedgerV3()
    );
    expect(() => registry.migrate(makeLedgerV1(), 2)).toThrow(SchemaValidationError);
  });

  it("no-ops canonically when target equals the source version", () => {
    const artifact = makeLedgerV1();
    const result = testLedgerMigrationRegistry.migrate(artifact, 1);
    expect(result.artifact).toEqual(artifact);
    expect(result.receipt.fromVersion).toBe(1);
    expect(result.receipt.toVersion).toBe(1);
    expect(result.receipt.migrationId).toBe(NO_OP_MIGRATION_ID);
    expect(result.receipt.inputHash).toBe(result.receipt.outputHash);
    expect(result.steps).toEqual([]);
  });

  it("standalone migrateArtifact delegates to the registry", () => {
    const artifact = makeLedgerV1();
    const result = migrateArtifact(testLedgerMigrationRegistry, artifact, 2);
    expect(result.artifact.schemaVersion).toBe(2);
    expect(result.receipt.subjectSchemaId).toBe(TEST_LEDGER_SCHEMA_ID);
  });
});