import { noemaSchemaRegistry, SchemaValidationError, UnsupportedSchemaError } from "@noema/schemas";
import { readJsonArtifact } from "../io.js";
import { output, usageError, internalError, EXIT, type CommandOutput } from "../exit.js";

export async function schemaValidate(artifactPath: string): Promise<CommandOutput> {
  if (!artifactPath) return usageError("schema validate requires an artifact path");
  try {
    const input = await readJsonArtifact(artifactPath);
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return output(EXIT.INVALID, "artifact is not a JSON object", {});
    }
    const record = input as Record<string, unknown>;
    const schemaId = record["schemaId"];
    const schemaVersion = record["schemaVersion"];
    noemaSchemaRegistry.decode(input);
    return output(EXIT.VALID, "schema valid", {
      schemaId: String(schemaId),
      schemaVersion: Number(schemaVersion)
    });
  } catch (error) {
    if (error instanceof UnsupportedSchemaError) {
      return output(EXIT.UNSUPPORTED_VERSION, error.message, {});
    }
    if (error instanceof SchemaValidationError) {
      return output(EXIT.INVALID, error.message, {});
    }
    if (error instanceof SyntaxError) {
      return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    }
    return internalError(error);
  }
}