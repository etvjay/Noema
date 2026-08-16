import { z } from "zod";
import { hashCanonical } from "@noema/canonicalization";
import type {
  Hex,
  MigrationReceipt,
  SchemaId,
  SchemaVersion
} from "@noema/economic-kernel";
import {
  SchemaRegistry,
  SchemaValidationError,
  SCHEMA_IDS,
  SCHEMA_VERSIONS
} from "./registry.js";

const refSchema = z.string().min(1);
const hexSchema = z.string().regex(/^0x[0-9a-fA-F]+$/);
const schemaIdSchema = z.string().min(1);
const schemaVersionSchema = z.number().int().positive();

export const migrationReceiptSchema = z
  .object({
    id: refSchema,
    schemaId: z.literal(SCHEMA_IDS.MIGRATION_RECEIPT),
    schemaVersion: z.literal(SCHEMA_VERSIONS.MIGRATION_RECEIPT),
    subjectSchemaId: schemaIdSchema,
    fromVersion: schemaVersionSchema,
    toVersion: schemaVersionSchema,
    migrationId: z.string().min(1),
    inputHash: hexSchema,
    outputHash: hexSchema
  })
  .strict();

export const NO_OP_MIGRATION_ID = "no-op";
export const MIGRATION_HOP_BOUND = 1000;

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export class MigrationDowngradeError extends MigrationError {
  constructor(message: string) {
    super(message);
    this.name = "MigrationDowngradeError";
  }
}

export class MigrationPathError extends MigrationError {
  constructor(message: string) {
    super(message);
    this.name = "MigrationPathError";
  }
}

export class AmbiguousMigrationError extends MigrationError {
  constructor(message: string) {
    super(message);
    this.name = "AmbiguousMigrationError";
  }
}

export class MigrationGapError extends MigrationError {
  constructor(message: string) {
    super(message);
    this.name = "MigrationGapError";
  }
}

export class MigrationCycleError extends MigrationError {
  constructor(message: string) {
    super(message);
    this.name = "MigrationCycleError";
  }
}

export type VersionedArtifact = {
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
};

export interface MigrationEdge {
  schemaId: SchemaId;
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  migrationId: string;
}

export interface MigrationTraceStep {
  migrationId: string;
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  inputHash: Hex;
  outputHash: Hex;
}

export interface MigrationResult<T> {
  artifact: T;
  receipt: MigrationReceipt;
  steps: readonly MigrationTraceStep[];
}

export interface MigrationSummary {
  schemaId: SchemaId;
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  migrationId: string;
}

function migrationKey(schemaId: SchemaId, version: SchemaVersion): string {
  return `${schemaId}:v${version}`;
}

function hashArtifact(value: unknown): Hex {
  return hashCanonical(value as Record<string, unknown>);
}

interface RegisteredMigration extends MigrationEdge {
  migrate: (input: unknown) => unknown;
}

export function detectMigrationCycle(
  edges: readonly MigrationEdge[]
): readonly MigrationEdge[] | null {
  const keyToEdge = new Map<string, MigrationEdge>();
  for (const edge of edges) {
    keyToEdge.set(migrationKey(edge.schemaId, edge.fromVersion), edge);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: MigrationEdge[] = [];

  const visit = (nodeKey: string): boolean => {
    color.set(nodeKey, GRAY);
    const edge = keyToEdge.get(nodeKey);
    if (edge !== undefined) {
      const nextKey = migrationKey(edge.schemaId, edge.toVersion);
      const nextColor = color.get(nextKey) ?? WHITE;
      if (nextColor === GRAY) {
        stack.push(edge);
        return true;
      }
      if (nextColor === WHITE) {
        stack.push(edge);
        if (visit(nextKey)) {
          return true;
        }
        stack.pop();
      }
    }
    color.set(nodeKey, BLACK);
    return false;
  };

  for (const nodeKey of keyToEdge.keys()) {
    const currentColor = color.get(nodeKey) ?? WHITE;
    if (currentColor === WHITE && visit(nodeKey)) {
      return stack.slice();
    }
  }
  return null;
}

export class MigrationRegistry {
  private readonly schemaRegistry: SchemaRegistry;
  private readonly migrations = new Map<string, RegisteredMigration>();
  private readonly migrationIds = new Set<string>();

  constructor(schemaRegistry: SchemaRegistry) {
    this.schemaRegistry = schemaRegistry;
  }

  register<TIn, TOut>(
    schemaId: SchemaId,
    fromVersion: SchemaVersion,
    toVersion: SchemaVersion,
    migrationId: string,
    migrate: (input: TIn) => TOut
  ): this {
    if (typeof schemaId !== "string" || schemaId.length === 0) {
      throw new MigrationError("schemaId must be a non-empty string");
    }
    if (!Number.isInteger(fromVersion) || fromVersion < 1) {
      throw new MigrationError(
        `fromVersion must be a positive integer, got ${String(fromVersion)}`
      );
    }
    if (!Number.isInteger(toVersion) || toVersion < 1) {
      throw new MigrationError(
        `toVersion must be a positive integer, got ${String(toVersion)}`
      );
    }
    if (toVersion <= fromVersion) {
      throw new MigrationDowngradeError(
        `Migration ${migrationId} for ${schemaId} must move forward (v${fromVersion} -> v${toVersion}); downgrades, self-loops, and duplicate re-versioning are rejected`
      );
    }
    if (typeof migrationId !== "string" || migrationId.length === 0) {
      throw new MigrationError("migrationId must be a non-empty string");
    }
    if (this.migrationIds.has(migrationId)) {
      throw new AmbiguousMigrationError(
        `Migration id ${migrationId} is already registered for a different path`
      );
    }
    const key = migrationKey(schemaId, fromVersion);
    const existing = this.migrations.get(key);
    if (existing !== undefined) {
      throw new AmbiguousMigrationError(
        `Migration path ${schemaId} v${fromVersion} is already registered as ${existing.migrationId} (-> v${existing.toVersion}); ${migrationId} would be ambiguous`
      );
    }
    if (typeof migrate !== "function") {
      throw new MigrationError("migrate must be a function");
    }

    const skipped = this.schemaRegistry
      .supportedVersions(schemaId)
      .filter((version) => version > fromVersion && version < toVersion);
    if (skipped.length > 0) {
      throw new MigrationGapError(
        `Migration ${migrationId} for ${schemaId} jumps from v${fromVersion} to v${toVersion} and skips known schema version(s) ${skipped.join(", ")}; register a consecutive migration chain instead`
      );
    }

    this.migrations.set(key, {
      schemaId,
      fromVersion,
      toVersion,
      migrationId,
      migrate: migrate as (input: unknown) => unknown
    });
    this.migrationIds.add(migrationId);

    const cycle = detectMigrationCycle(this.edges(schemaId));
    if (cycle !== null) {
      this.migrations.delete(key);
      this.migrationIds.delete(migrationId);
      throw new MigrationCycleError(
        `Registering ${migrationId} would create a migration cycle: ${cycle
          .map((edge) => `v${edge.fromVersion}->v${edge.toVersion}`)
          .join(" -> ")}`
      );
    }
    return this;
  }

  hasMigration(schemaId: SchemaId, fromVersion: SchemaVersion): boolean {
    return this.migrations.has(migrationKey(schemaId, fromVersion));
  }

  supportedMigrations(schemaId: SchemaId): readonly MigrationSummary[] {
    return Array.from(this.migrations.values())
      .filter((migration) => migration.schemaId === schemaId)
      .sort((left, right) => left.fromVersion - right.fromVersion)
      .map((migration) => ({
        schemaId: migration.schemaId,
        fromVersion: migration.fromVersion,
        toVersion: migration.toVersion,
        migrationId: migration.migrationId
      }));
  }

  migrate<T extends VersionedArtifact>(
    artifact: T,
    targetVersion: SchemaVersion
  ): MigrationResult<T> {
    if (!Number.isInteger(targetVersion) || targetVersion < 1) {
      throw new MigrationError(
        `targetVersion must be a positive integer, got ${String(targetVersion)}`
      );
    }

    const source = this.schemaRegistry.decode(artifact) as T;
    const subjectSchemaId = artifact.schemaId;
    const fromVersion = artifact.schemaVersion;
    const inputHash = hashArtifact(artifact);

    if (targetVersion < fromVersion) {
      throw new MigrationDowngradeError(
        `Cannot migrate ${subjectSchemaId} from v${fromVersion} down to v${targetVersion}; migration is forward-only`
      );
    }

    if (targetVersion === fromVersion) {
      const receipt = this.buildReceipt({
        subjectSchemaId,
        fromVersion,
        toVersion: fromVersion,
        migrationId: NO_OP_MIGRATION_ID,
        inputHash,
        outputHash: inputHash
      });
      return { artifact: source, receipt, steps: [] };
    }

    if (!this.schemaRegistry.isSupported(subjectSchemaId, targetVersion)) {
      throw new MigrationPathError(
        `Target schema ${subjectSchemaId} v${targetVersion} is not registered; no migration can be validated against it`
      );
    }

    const chain = this.resolveChain(subjectSchemaId, fromVersion, targetVersion);

    let result: unknown = source;
    const steps: MigrationTraceStep[] = [];
    for (const migration of chain) {
      const stepInputHash = hashArtifact(result);
      const produced = migration.migrate(result);
      const validated = this.schemaRegistry.decode(produced) as VersionedArtifact;
      const targetKey = migrationKey(migration.schemaId, migration.toVersion);
      const producedKey = migrationKey(
        validated.schemaId,
        validated.schemaVersion
      );
      if (producedKey !== targetKey) {
        throw new SchemaValidationError(
          migration.schemaId,
          migration.toVersion,
          [
            `migration ${migration.migrationId} produced artifact stamped ${validated.schemaId} v${validated.schemaVersion}; expected exact target ${migration.schemaId} v${migration.toVersion}`
          ]
        );
      }
      steps.push({
        migrationId: migration.migrationId,
        fromVersion: migration.fromVersion,
        toVersion: migration.toVersion,
        inputHash: stepInputHash,
        outputHash: hashArtifact(validated)
      });
      result = validated;
    }

    const finalMigration = chain[chain.length - 1];
    if (finalMigration === undefined) {
      throw new MigrationPathError(
        `No migration executed for ${subjectSchemaId} v${fromVersion} -> v${targetVersion}`
      );
    }
    const outputHash = hashArtifact(result);
    const receipt = this.buildReceipt({
      subjectSchemaId,
      fromVersion,
      toVersion: targetVersion,
      migrationId: finalMigration.migrationId,
      inputHash,
      outputHash
    });
    return { artifact: result as T, receipt, steps };
  }

  private resolveChain(
    schemaId: SchemaId,
    fromVersion: SchemaVersion,
    targetVersion: SchemaVersion
  ): readonly RegisteredMigration[] {
    const chain: RegisteredMigration[] = [];
    const visited = new Set<SchemaVersion>([fromVersion]);
    let current = fromVersion;
    let hops = 0;

    while (current < targetVersion) {
      const next = this.migrations.get(migrationKey(schemaId, current));
      if (next === undefined) {
        throw new MigrationPathError(
          `No registered migration from ${schemaId} v${current}; cannot reach v${targetVersion}`
        );
      }
      if (next.toVersion <= current) {
        throw new MigrationCycleError(
          `Migration ${next.migrationId} does not advance ${schemaId} past v${current}`
        );
      }
      if (visited.has(next.toVersion)) {
        throw new MigrationCycleError(
          `Migration chain for ${schemaId} revisits v${next.toVersion}; cycle detected`
        );
      }
      if (!this.schemaRegistry.isSupported(schemaId, next.toVersion)) {
        throw new MigrationPathError(
          `Invalid chain: ${schemaId} v${current}->v${next.toVersion} (${next.migrationId}) targets a schema version that is not registered`
        );
      }
      chain.push(next);
      current = next.toVersion;
      visited.add(current);
      hops += 1;
      if (hops > MIGRATION_HOP_BOUND) {
        throw new MigrationCycleError(
          `Migration chain for ${schemaId} exceeded the hop bound; refusing to continue`
        );
      }
    }

    if (current !== targetVersion) {
      throw new MigrationPathError(
        `Migration chain for ${schemaId} reached v${current} instead of target v${targetVersion}`
      );
    }
    return chain;
  }

  private buildReceipt(input: {
    subjectSchemaId: SchemaId;
    fromVersion: SchemaVersion;
    toVersion: SchemaVersion;
    migrationId: string;
    inputHash: Hex;
    outputHash: Hex;
  }): MigrationReceipt {
    const id = `migration-receipt:${hashCanonical({
      subjectSchemaId: input.subjectSchemaId,
      fromVersion: input.fromVersion,
      toVersion: input.toVersion,
      migrationId: input.migrationId,
      inputHash: input.inputHash
    }).slice(2, 18)}`;
    return {
      id,
      schemaId: SCHEMA_IDS.MIGRATION_RECEIPT,
      schemaVersion: SCHEMA_VERSIONS.MIGRATION_RECEIPT,
      subjectSchemaId: input.subjectSchemaId,
      fromVersion: input.fromVersion,
      toVersion: input.toVersion,
      migrationId: input.migrationId,
      inputHash: input.inputHash,
      outputHash: input.outputHash
    };
  }

  private edges(schemaId: SchemaId): readonly MigrationEdge[] {
    return Array.from(this.migrations.values())
      .filter((migration) => migration.schemaId === schemaId)
      .map(({ schemaId: edgeSchemaId, fromVersion, toVersion, migrationId }) => ({
        schemaId: edgeSchemaId,
        fromVersion,
        toVersion,
        migrationId
      }));
  }
}

export function migrateArtifact<T extends VersionedArtifact>(
  registry: MigrationRegistry,
  artifact: T,
  targetVersion: SchemaVersion
): MigrationResult<T> {
  return registry.migrate(artifact, targetVersion);
}