import { computeRoots, CURRENT_HASHING_VERSION } from "@noema/canonicalization";
import type { EconomicObject, VerificationReceipt } from "@noema/economic-kernel";
import { noemaSchemaRegistry, SchemaValidationError, UnsupportedSchemaError } from "@noema/schemas";
import { readJsonArtifact } from "../io.js";
import { output, usageError, internalError, EXIT, type CommandOutput } from "../exit.js";

export async function receiptVerify(receiptPath: string, objectPath?: string): Promise<CommandOutput> {
  if (!receiptPath) return usageError("receipt verify requires a receipt path");
  try {
    const receiptInput = await readJsonArtifact(receiptPath);
    const receipt = noemaSchemaRegistry.decode<VerificationReceipt>(receiptInput);
    if (!objectPath) {
      return output(EXIT.UNRESOLVED, "receipt present but no object supplied for recomputation", {
        receiptId: receipt.id,
        objectId: receipt.objectId,
        overallStatus: receipt.overallStatus,
        objectRoot: receipt.objectRoot,
        evidenceRoot: receipt.evidenceRoot
      });
    }
    const objectInput = await readJsonArtifact(objectPath);
    const object = noemaSchemaRegistry.decode<EconomicObject>(objectInput);
    if (object.id !== receipt.objectId || object.version !== receipt.objectVersion) {
      return output(EXIT.INVALID, "object does not match receipt", {
        receiptObjectId: receipt.objectId,
        receiptObjectVersion: receipt.objectVersion,
        objectId: object.id,
        objectVersion: object.version
      });
    }
    const roots = computeRoots(object);
    const objectRootMatch = roots.objectRoot.toLowerCase() === receipt.objectRoot.toLowerCase();
    const evidenceRootMatch = roots.evidenceRoot.toLowerCase() === receipt.evidenceRoot.toLowerCase();
    const checks = [
      { check: "objectRoot", matches: objectRootMatch },
      { check: "evidenceRoot", matches: evidenceRootMatch }
    ];
    if (receipt.overallStatus === "FAIL") {
      return output(EXIT.VERIFICATION_FAILURE, "receipt overall status is FAIL", {
        receiptId: receipt.id,
        checks,
        receiptStatus: receipt.overallStatus
      });
    }
    if (!objectRootMatch || !evidenceRootMatch) {
      return output(EXIT.VERIFICATION_FAILURE, "recomputed roots do not match receipt roots", {
        receiptId: receipt.id,
        checks,
        computedObjectRoot: roots.objectRoot,
        computedEvidenceRoot: roots.evidenceRoot
      });
    }
    if (receipt.overallStatus === "UNRESOLVED") {
      return output(EXIT.UNRESOLVED, "receipt overall status is UNRESOLVED", {
        receiptId: receipt.id,
        checks,
        receiptStatus: receipt.overallStatus
      });
    }
    return output(EXIT.VALID, "receipt verified", {
      receiptId: receipt.id,
      objectId: object.id,
      objectVersion: object.version,
      checks,
      overallStatus: receipt.overallStatus,
      hashingVersion: receipt.hashingVersion,
      canonicalHashingVersion: CURRENT_HASHING_VERSION
    });
  } catch (error) {
    if (error instanceof UnsupportedSchemaError) return output(EXIT.UNSUPPORTED_VERSION, error.message, {});
    if (error instanceof SchemaValidationError) return output(EXIT.INVALID, error.message, {});
    if (error instanceof SyntaxError) return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    return internalError(error);
  }
}