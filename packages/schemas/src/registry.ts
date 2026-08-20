import { z } from "zod";
import type { SchemaId, SchemaVersion } from "@noema/economic-kernel";

export const SCHEMA_IDS = {
  ECONOMIC_OBJECT: "noema:economic-object",
  EVIDENCE: "noema:evidence",
  SOURCE_SNAPSHOT: "noema:source-snapshot",
  ATTESTATION: "noema:attestation",
  VERIFICATION_RECEIPT: "noema:verification-receipt",
  DECISION_RECEIPT: "noema:decision-receipt",
  VALIDATION_PROFILE: "noema:validation-profile"
} as const;

export const SCHEMA_VERSIONS = {
  ECONOMIC_OBJECT: 1,
  EVIDENCE: 1,
  SOURCE_SNAPSHOT: 1,
  ATTESTATION: 1,
  VERIFICATION_RECEIPT: 1,
  DECISION_RECEIPT: 1,
  VALIDATION_PROFILE: 1
} as const;

export interface VersionedSchema<T> {
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  validate: (input: unknown) => input is T;
  decode: (input: unknown) => T;
}

export class UnsupportedSchemaError extends Error {
  constructor(schemaId: SchemaId, schemaVersion: SchemaVersion) {
    super(`Unsupported schema ${schemaId} v${schemaVersion}`);
    this.name = "UnsupportedSchemaError";
  }
}

export class SchemaValidationError extends Error {
  constructor(
    schemaId: SchemaId,
    schemaVersion: SchemaVersion,
    issues: readonly string[]
  ) {
    super(
      `Schema ${schemaId} v${schemaVersion} validation failed: ${issues.join("; ")}`
    );
    this.name = "SchemaValidationError";
  }
}

export function versionedFromZod<T>(
  schemaId: SchemaId,
  schemaVersion: SchemaVersion,
  schema: z.ZodType<T>
): VersionedSchema<T> {
  return {
    schemaId,
    schemaVersion,
    validate: (input: unknown): input is T => schema.safeParse(input).success,
    decode: (input: unknown): T => {
      const result = schema.safeParse(input);
      if (!result.success) {
        throw new SchemaValidationError(
          schemaId,
          schemaVersion,
          result.error.issues.map(
            (issue) =>
              `${issue.path.length === 0 ? "$" : issue.path.join(".")}: ${issue.message}`
          )
        );
      }
      return result.data;
    }
  };
}

export class SchemaRegistry {
  private readonly entries = new Map<SchemaId, Map<SchemaVersion, VersionedSchema<unknown>>>();

  register<T>(schema: VersionedSchema<T>): this {
    let versions = this.entries.get(schema.schemaId);
    if (!versions) {
      versions = new Map();
      this.entries.set(schema.schemaId, versions);
    }
    versions.set(schema.schemaVersion, schema as VersionedSchema<unknown>);
    return this;
  }

  isSupported(schemaId: SchemaId, schemaVersion: SchemaVersion): boolean {
    return this.entries.get(schemaId)?.has(schemaVersion) === true;
  }

  supportedVersions(schemaId: SchemaId): SchemaVersion[] {
    const versions = this.entries.get(schemaId);
    if (versions === undefined) {
      return [];
    }
    return Array.from(versions.keys()).sort((left, right) => left - right);
  }

  decode<T>(input: unknown): T {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new SchemaValidationError("unknown", 0, ["input is not an object"]);
    }
    const record = input as Record<string, unknown>;
    const schemaId = record["schemaId"];
    const schemaVersion = record["schemaVersion"];
    if (typeof schemaId !== "string") {
      throw new SchemaValidationError("unknown", 0, ["missing or non-string schemaId"]);
    }
    if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) {
      throw new SchemaValidationError(schemaId, 0, ["missing or non-integer schemaVersion"]);
    }
    const schema = this.entries.get(schemaId)?.get(schemaVersion);
    if (schema === undefined) {
      throw new UnsupportedSchemaError(schemaId, schemaVersion);
    }
    if (!schema.validate(input)) {
      throw new SchemaValidationError(schemaId, schemaVersion, ["shape does not match the registered schema"]);
    }
    return input as T;
  }
}