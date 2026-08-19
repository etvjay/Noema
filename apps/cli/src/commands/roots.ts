import { computeRoots, CURRENT_HASHING_VERSION } from "@noema/canonicalization";
import { verifyEconomicObject, type VerificationContext } from "@noema/verification";
import type { EconomicObject } from "@noema/economic-kernel";
import { noemaSchemaRegistry, SchemaValidationError, UnsupportedSchemaError } from "@noema/schemas";
import { readJsonArtifact } from "../io.js";
import { output, usageError, internalError, EXIT, type CommandOutput } from "../exit.js";

export async function rootsCompute(path: string): Promise<CommandOutput> {
  if (!path) return usageError("roots compute requires an artifact path");
  try {
    const input = await readJsonArtifact(path);
    const object = noemaSchemaRegistry.decode<EconomicObject>(input);
    const roots = computeRoots(object);
    return output(EXIT.VALID, "roots computed", {
      objectRoot: roots.objectRoot,
      evidenceRoot: roots.evidenceRoot,
      hashingVersion: roots.hashingVersion,
      canonicalObject: roots.canonicalObject,
      evidenceLeaves: roots.evidenceLeaves
    });
  } catch (error) {
    if (error instanceof UnsupportedSchemaError) return output(EXIT.UNSUPPORTED_VERSION, error.message, {});
    if (error instanceof SchemaValidationError) return output(EXIT.INVALID, error.message, {});
    if (error instanceof SyntaxError) return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    return internalError(error);
  }
}

export async function rootsVerify(path: string, nowMs?: number): Promise<CommandOutput> {
  if (!path) return usageError("roots verify requires an artifact path");
  try {
    const input = await readJsonArtifact(path);
    const object = noemaSchemaRegistry.decode<EconomicObject>(input);
    const context: VerificationContext = { nowMs: nowMs ?? Date.now() };
    const receipt = verifyEconomicObject(object, context);
    if (receipt.overallStatus === "FAIL") {
      return output(EXIT.VERIFICATION_FAILURE, "roots verification failed", {
        objectRoot: receipt.objectRoot,
        evidenceRoot: receipt.evidenceRoot,
        overallStatus: receipt.overallStatus,
        failedChecks: receipt.checks.filter((check) => check.result === "FAIL").map((check) => check.id),
        unresolvedChecks: receipt.checks.filter((check) => check.result === "UNRESOLVED").map((check) => check.id)
      });
    }
    if (receipt.overallStatus === "UNRESOLVED") {
      return output(EXIT.UNRESOLVED, "roots verification unresolved", {
        objectRoot: receipt.objectRoot,
        evidenceRoot: receipt.evidenceRoot,
        overallStatus: receipt.overallStatus,
        unresolvedChecks: receipt.checks.filter((check) => check.result === "UNRESOLVED").map((check) => check.id)
      });
    }
    return output(EXIT.VALID, "roots verification passed", {
      objectRoot: receipt.objectRoot,
      evidenceRoot: receipt.evidenceRoot,
      overallStatus: receipt.overallStatus,
      checkCount: receipt.checks.length
    });
  } catch (error) {
    if (error instanceof UnsupportedSchemaError) return output(EXIT.UNSUPPORTED_VERSION, error.message, {});
    if (error instanceof SchemaValidationError) return output(EXIT.INVALID, error.message, {});
    if (error instanceof SyntaxError) return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    return internalError(error);
  }
}

export { CURRENT_HASHING_VERSION };