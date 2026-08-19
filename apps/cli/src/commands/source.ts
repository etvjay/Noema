import { hashUtf8 } from "@noema/canonicalization";
import { ingestSourceSnapshot } from "@noema/noema-core/evidence";
import type { Evidence, SourceSnapshot } from "@noema/economic-kernel";
import { noemaSchemaRegistry, SchemaValidationError, UnsupportedSchemaError } from "@noema/schemas";
import { readJsonArtifact } from "../io.js";
import { output, usageError, internalError, EXIT, type CommandOutput } from "../exit.js";

function snapshotDetails(snapshot: SourceSnapshot): Record<string, unknown> {
  return {
    id: snapshot.id,
    schemaId: snapshot.schemaId,
    schemaVersion: snapshot.schemaVersion,
    sourceId: snapshot.sourceId,
    uri: snapshot.uri,
    contentType: snapshot.contentType,
    contentHash: snapshot.contentHash,
    fetchedAt: snapshot.fetchedAt,
    httpStatus: snapshot.httpStatus,
    bodyStorageRef: snapshot.bodyStorageRef,
    extractionVersion: snapshot.extractionVersion
  };
}

export async function sourceInspect(path: string): Promise<CommandOutput> {
  if (!path) return usageError("source inspect requires an artifact path");
  try {
    const input = await readJsonArtifact(path);
    const snapshot = noemaSchemaRegistry.decode<SourceSnapshot>(input);
    return output(EXIT.VALID, "source snapshot valid", snapshotDetails(snapshot));
  } catch (error) {
    if (error instanceof UnsupportedSchemaError) return output(EXIT.UNSUPPORTED_VERSION, error.message, {});
    if (error instanceof SchemaValidationError) return output(EXIT.INVALID, error.message, {});
    return internalError(error);
  }
}

export async function sourceCapture(path: string): Promise<CommandOutput> {
  if (!path) return usageError("source capture requires a path to a raw JSON document");
  try {
    const input = await readJsonArtifact(path);
    const record = input as Record<string, unknown>;
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      return output(EXIT.INVALID, "source capture input must be an object", {});
    }
    const missing = ["id", "sourceId", "uri", "contentType", "body", "fetchedAt"].filter(
      (key) => record[key] === undefined
    );
    if (missing.length > 0) {
      return output(EXIT.INVALID, `source capture input missing fields: ${missing.join(", ")}`, {});
    }
    const body = String(record["body"]);
    const contentHash = hashUtf8(body);
    const snapshot: SourceSnapshot = {
      id: String(record["id"]),
      schemaId: "noema:source-snapshot",
      schemaVersion: 1,
      sourceId: String(record["sourceId"]),
      uri: String(record["uri"]),
      contentType: String(record["contentType"]),
      contentHash,
      fetchedAt: Number(record["fetchedAt"]),
      bodyStorageRef: String(record["bodyStorageRef"] ?? record["id"])
    };
    if (typeof record["httpStatus"] === "number") {
      snapshot.httpStatus = record["httpStatus"];
    }
    return output(EXIT.VALID, "source snapshot captured", {
      snapshot: snapshotDetails(snapshot),
      note: "contentHash is the canonical Keccak-256 over the UTF-8 body"
    });
  } catch (error) {
    if (error instanceof SyntaxError) return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    return internalError(error);
  }
}

export async function sourceReplay(snapshotPath: string, evidencePath: string): Promise<CommandOutput> {
  if (!snapshotPath || !evidencePath) {
    return usageError("source replay requires <snapshot> and <evidence-input> artifact paths");
  }
  try {
    const snapshotInput = await readJsonArtifact(snapshotPath);
    const snapshot = noemaSchemaRegistry.decode<SourceSnapshot>(snapshotInput);
    const evidenceInput = (await readJsonArtifact(evidencePath)) as Record<string, unknown>;
    const ingestionInput: Parameters<typeof ingestSourceSnapshot>[0] = {
      snapshot,
      evidenceId: String(evidenceInput["evidenceId"] ?? `evidence:${snapshot.id}`),
      type: String(evidenceInput["type"] ?? "API_RESPONSE") as Evidence["type"],
      authority: String(evidenceInput["authority"] ?? "REFERENCE_DATA") as Evidence["authority"],
      observedAt: Number(evidenceInput["observedAt"] ?? snapshot.fetchedAt),
      nowMs: Number(evidenceInput["nowMs"] ?? snapshot.fetchedAt)
    };
    if (typeof evidenceInput["locator"] === "string") {
      ingestionInput.locator = evidenceInput["locator"];
    }
    const result = ingestSourceSnapshot(ingestionInput);
    if (result.status === "SOURCE_FAILURE") {
      return output(EXIT.SOURCE_FAILURE, `source replay failed: ${result.message}`, {
        reasonCode: result.reasonCode,
        snapshotId: snapshot.id
      });
    }
    const evidence = result.evidence;
    return output(EXIT.VALID, `source replayed as ${result.status.toLowerCase()}`, {
      snapshotId: snapshot.id,
      evidenceId: evidence.id,
      status: result.status,
      contentHash: evidence.contentHash,
      evidenceType: evidence.type
    });
  } catch (error) {
    if (error instanceof UnsupportedSchemaError) return output(EXIT.UNSUPPORTED_VERSION, error.message, {});
    if (error instanceof SchemaValidationError) return output(EXIT.INVALID, error.message, {});
    if (error instanceof SyntaxError) return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    return internalError(error);
  }
}