import {
  classifyRepresentationRelationship,
  deriveRepresentationIdentityKey,
  type RepresentationIdentity
} from "@noema/noema-core/representation";
import { readJsonArtifact } from "../io.js";
import { output, usageError, internalError, EXIT, type CommandOutput } from "../exit.js";

const EQUIVALENT_KINDS = new Set([
  "SAME_REPRESENTATION",
  "SAME_ECONOMIC_CLAIM",
  "SHARE_CLASS_OF",
  "BRIDGED_REPRESENTATION_OF",
  "WRAPPED_REPRESENTATION_OF",
  "DERIVATIVE_OF",
  "FUNCTIONALLY_FUNGIBLE_WITH",
  "ECONOMICALLY_EQUIVALENT_TO"
]);

function identityDetails(identity: RepresentationIdentity): Record<string, unknown> {
  return {
    representationId: identity.representationId,
    schemaId: identity.schemaId,
    schemaVersion: identity.schemaVersion,
    economicObjectRef: identity.economicObjectRef,
    locator: identity.locator,
    shareClass: identity.shareClass,
    generation: identity.generation,
    originRepresentation: identity.originRepresentation,
    lineage: identity.lineage,
    status: identity.status
  };
}

export async function representationInspect(path: string): Promise<CommandOutput> {
  if (!path) return usageError("representation inspect requires an artifact path");
  try {
    const input = await readJsonArtifact(path);
    const identity = asRepresentationIdentity(input);
    const key = deriveRepresentationIdentityKey(identity);
    return output(EXIT.VALID, "representation identity inspected", {
      identity: identityDetails(identity),
      identityKey: key
    });
  } catch (error) {
    if (error instanceof SyntaxError) return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    if (error instanceof Error && error.message.startsWith("representation artifact")) {
      return output(EXIT.INVALID, error.message, {});
    }
    return internalError(error);
  }
}

function asRepresentationIdentity(input: unknown): RepresentationIdentity {
  const record = input as Record<string, unknown>;
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error("representation artifact is not an object");
  }
  if (typeof record["representationId"] !== "string" || typeof record["locator"] !== "object" || record["locator"] === null) {
    throw new Error("representation artifact missing representationId or locator");
  }
  return input as RepresentationIdentity;
}

export async function representationValidate(path: string): Promise<CommandOutput> {
  if (!path) return usageError("representation validate requires an artifact path");
  try {
    const input = (await readJsonArtifact(path)) as {
      left: RepresentationIdentity;
      right: RepresentationIdentity;
      links?: readonly { from: string; to: string; type: string }[];
    };
    if (!input.left || !input.right) {
      return output(EXIT.INVALID, "representation validate requires left and right identities", {});
    }
    const left = asRepresentationIdentity(input.left);
    const right = asRepresentationIdentity(input.right);
    const equivalence = classifyRepresentationRelationship({
      left,
      right,
      links: input.links as never
    });
    const kind = equivalence.kind;
    if (kind === "AMBIGUOUS") {
      return output(EXIT.UNRESOLVED, "representation relationship is ambiguous", {
        leftId: left.representationId,
        rightId: right.representationId,
        equivalence: kind,
        reasonCodes: equivalence.reasonCodes
      });
    }
    if (!EQUIVALENT_KINDS.has(kind)) {
      return output(EXIT.INVALID, `representation relationship resolved as ${kind}`, {
        leftId: left.representationId,
        rightId: right.representationId,
        equivalence: kind,
        reasonCodes: equivalence.reasonCodes
      });
    }
    return output(EXIT.VALID, `representation relationship: ${kind}`, {
      leftId: left.representationId,
      rightId: right.representationId,
      equivalence: kind,
      reasonCodes: equivalence.reasonCodes
    });
  } catch (error) {
    if (error instanceof SyntaxError) return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    if (error instanceof Error && error.message.startsWith("representation artifact")) {
      return output(EXIT.INVALID, error.message, {});
    }
    return internalError(error);
  }
}