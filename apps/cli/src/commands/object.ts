import { reduceEconomicObject } from "@noema/noema-core";
import { isMaterialEconomicObjectChange } from "@noema/noema-core/versioning";
import type { EconomicObject } from "@noema/economic-kernel";
import { noemaSchemaRegistry, SchemaValidationError, UnsupportedSchemaError } from "@noema/schemas";
import { readJsonArtifact } from "../io.js";
import { output, usageError, internalError, EXIT, type CommandOutput } from "../exit.js";

function objectSummary(object: EconomicObject): Record<string, unknown> {
  return {
    id: object.id,
    version: object.version,
    schemaId: object.schemaId,
    schemaVersion: object.schemaVersion,
    classification: object.classification.primary,
    status: object.status,
    claimCount: object.claims.length,
    evidenceCount: object.evidence.length,
    representationCount: object.representations.length,
    attestationCount: object.attestations.length,
    exceptionCount: object.exceptions.length,
    createdAt: object.createdAt,
    updatedAt: object.updatedAt,
    identifiers: object.identifiers.map((item) => `${item.scheme}:${item.value}`)
  };
}

export async function objectInspect(path: string): Promise<CommandOutput> {
  if (!path) return usageError("object inspect requires an artifact path");
  try {
    const input = await readJsonArtifact(path);
    const object = noemaSchemaRegistry.decode<EconomicObject>(input);
    return output(EXIT.VALID, "economic object inspected", objectSummary(object));
  } catch (error) {
    if (error instanceof UnsupportedSchemaError) return output(EXIT.UNSUPPORTED_VERSION, error.message, {});
    if (error instanceof SchemaValidationError) return output(EXIT.INVALID, error.message, {});
    if (error instanceof SyntaxError) return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    return internalError(error);
  }
}

export async function objectDiff(leftPath: string, rightPath: string): Promise<CommandOutput> {
  if (!leftPath || !rightPath) return usageError("object diff requires two artifact paths");
  try {
    const left = noemaSchemaRegistry.decode<EconomicObject>(await readJsonArtifact(leftPath));
    const right = noemaSchemaRegistry.decode<EconomicObject>(await readJsonArtifact(rightPath));
    const material = isMaterialEconomicObjectChange(left, right);
    return output(EXIT.VALID, material ? "material change detected" : "no material change", {
      leftId: left.id,
      leftVersion: left.version,
      rightId: right.id,
      rightVersion: right.version,
      material
    });
  } catch (error) {
    if (error instanceof UnsupportedSchemaError) return output(EXIT.UNSUPPORTED_VERSION, error.message, {});
    if (error instanceof SchemaValidationError) return output(EXIT.INVALID, error.message, {});
    if (error instanceof SyntaxError) return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    return internalError(error);
  }
}

export { reduceEconomicObject };