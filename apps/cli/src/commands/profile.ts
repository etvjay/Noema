import { resolveSemanticRelationship, type SemanticRepresentationProfile } from "@noema/noema-core/semantic";
import type { EconomicObject } from "@noema/economic-kernel";
import { noemaSchemaRegistry, SchemaValidationError, UnsupportedSchemaError } from "@noema/schemas";
import { readJsonArtifact } from "../io.js";
import { output, usageError, internalError, EXIT, type CommandOutput } from "../exit.js";

export async function profileEvaluate(profilePath: string, objectPath: string, referenceProfilePath?: string): Promise<CommandOutput> {
  if (!profilePath || !objectPath) return usageError("profile evaluate requires <profile> and <object> artifact paths");
  try {
    const profileInput = await readJsonArtifact(profilePath);
    const profile = profileInput as SemanticRepresentationProfile;
    const object = noemaSchemaRegistry.decode<EconomicObject>(await readJsonArtifact(objectPath));

    let right: SemanticRepresentationProfile | undefined;
    if (referenceProfilePath) {
      right = (await readJsonArtifact(referenceProfilePath)) as SemanticRepresentationProfile;
    }

    const input: Parameters<typeof resolveSemanticRelationship>[0] = {
      left: profile,
      links: []
    };
    if (right !== undefined) {
      input.right = right;
    }

    const resolution = resolveSemanticRelationship(input);

    const hasBlocking = resolution.exceptionTypes.includes("EVIDENCE_STALE") ||
      resolution.exceptionTypes.includes("EVIDENCE_MISSING") ||
      resolution.exceptionTypes.includes("RELATIONSHIP_AMBIGUOUS");

    const relationship = resolution.relationship ?? null;
    if (!referenceProfilePath) {
      return output(EXIT.VALID, `profile ${profile.id} profiled against object ${object.id}`, {
        profileId: profile.id,
        objectId: object.id,
        objectVersion: object.version,
        objectState: resolution.objectState,
        relationship,
        exceptionTypes: resolution.exceptionTypes,
        reasonCodes: resolution.reasonCodes,
        note: "no reference profile supplied; object state and exceptions reported"
      });
    }

    return output(hasBlocking ? EXIT.UNRESOLVED : EXIT.VALID, `profile evaluated against object ${object.id}`, {
      profileId: profile.id,
      objectId: object.id,
      objectVersion: object.version,
      objectState: resolution.objectState,
      relationship,
      exceptionTypes: resolution.exceptionTypes,
      reasonCodes: resolution.reasonCodes
    });
  } catch (error) {
    if (error instanceof UnsupportedSchemaError) return output(EXIT.UNSUPPORTED_VERSION, error.message, {});
    if (error instanceof SchemaValidationError) return output(EXIT.INVALID, error.message, {});
    if (error instanceof SyntaxError) return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    return internalError(error);
  }
}