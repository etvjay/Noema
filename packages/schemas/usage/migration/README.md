# Explicit Schema Migration Usage

## Purpose

Provides the deterministic, explicit, forward-only migration boundary for versioned Noema artifacts. `MigrationRegistry` + `migrateArtifact` advance an artifact from its exact registered source schema version to a higher target by following an explicitly registered chain, validating every intermediate result against its exact registered target schema, and emitting a separately validated `MigrationReceipt` audit artifact that links the exact pre-migration hash to the exact post-migration hash.

**Import:** `@noema/schemas/migration`
**Source:** `packages/schemas/src/migration.ts`
**Receipt artifact registered in:** `@noema/schemas` (`noemaSchemaRegistry`)

## Primary exports

- `MigrationRegistry` — explicit per-schemaId/fromVersion migration registration and execution
- `migrateArtifact(registry, artifact, targetVersion)` — standalone explicit migration API
- `migrationReceiptSchema` — strict audit receipt schema
- `detectMigrationCycle(edges)` — cycle-detection validation helper
- Errors: `MigrationError`, `MigrationDowngradeError`, `MigrationPathError`, `AmbiguousMigrationError`, `MigrationGapError`, `MigrationCycleError`
- Constants: `NO_OP_MIGRATION_ID`, `MIGRATION_HOP_BOUND`
- Types: `VersionedArtifact`, `MigrationEdge`, `MigrationTraceStep`, `MigrationResult`, `MigrationSummary`, `MigrationReceipt` (from `@noema/economic-kernel`)

## Input / output contract

`migrate(artifact, targetVersion)` takes any artifact carrying in-band `schemaId` + `schemaVersion` whose source schema is registered in the bound `SchemaRegistry`, and returns:

```ts
{
  artifact,            // migrated artifact, every step validated at its exact target schema
  receipt,             // MigrationReceipt audit artifact
  steps                // per-step migrationId/fromVersion/toVersion/inputHash/outputHash trace
}
```

Behavior:
- exact source schema/version resolved from the artifact and validated before any migration;
- `targetVersion < schemaVersion` → `MigrationDowngradeError` (fail closed);
- `targetVersion === schemaVersion` → canonical no-op with `migrationId = "no-op"` and `inputHash === outputHash`;
- `targetVersion > schemaVersion` → explicit registered chain, every intermediate result validated at its exact registered target schema, final result validated;
- `MigrationReceipt.inputHash` = canonical hash of the exact pre-migration serialized artifact; `outputHash` = canonical hash of the exact returned migrated artifact;
- fully deterministic: no `Date.now()`, randomness, network, environment reads, or nondeterministic ordering. `MigrationReceipt` carries no `createdAt` so wall-clock time can never enter migration output.

## Minimal example

```ts
import { MigrationRegistry } from "@noema/schemas/migration";
import { versionedFromZod, SchemaRegistry } from "@noema/schemas";

const registry = new MigrationRegistry(schemaRegistry)
  .register(schemaId, 1, 2, "ledger:v1-to-v2", (v1) => ({ ...v1, schemaVersion: 2, balanceUnits: toMicroUnits(v1.balance) }));

const { artifact, receipt } = registry.migrate(stampedV1Artifact, 2);
```

## Frontend-safe usage

No frontend should ever invoke a migration. Migration is a backend/ops audit operation performed only on explicitly versioned stored artifacts. Frontends consume the migrated artifact's canonical schema (`@noema/schemas`) or a higher-level `@noema/noema-core` surface.

## Authority boundary

A migration changes representation, never economic truth. It cannot verify claims, grant evidence authority, change economic identity, or rewrite history. The historical source artifact and its recorded hash/root are never rewritten.

## Failure semantics

Unknown schema/version, missing paths, downgrades, duplicate/ambiguous registrations, cycle-forming registrations, chain gaps, and malformed intermediate output are rejected. Source and intermediate artifacts are validated with the same fail-closed `SchemaRegistry` boundary used everywhere else in Noema.

## Compatibility

Production schemas remain at schema version 1. `noemaMigrationRegistry` (bound to `noemaSchemaRegistry`) intentionally contains zero migrations until a real production v2 is accepted; test-only schemas such as `noema:test:ledger` live in isolated registries and are never registered in the production default registry.

See the canonical [Schema Compatibility Matrix](../../../../docs/reference/schema-compatibility-matrix.md) and [ADR 0010](../../../../docs/adr/0010-schema-versioning.md) for the artifact-by-artifact versioning, deprecation, migration, and hashing/replay policy.

## Proof

- `packages/schemas/src/migration.test.ts`
- `tests/integrity/schema-migration.test.ts`
- QA gate: `schema-migration`