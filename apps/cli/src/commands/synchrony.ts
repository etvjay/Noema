import { synchronizeEconomicObject, type SynchronizeResult } from "@noema/noema-core/synchronizer";
import type { EconomicObject } from "@noema/economic-kernel";
import { noemaSchemaRegistry, SchemaValidationError, UnsupportedSchemaError } from "@noema/schemas";
import { readJsonArtifact } from "../io.js";
import { output, usageError, internalError, EXIT, type CommandOutput } from "../exit.js";

function rootFingerprint(result: SynchronizeResult): string {
  return result.reconciliation.synchronizationRoot;
}

function summaryOf(result: SynchronizeResult): Record<string, unknown> {
  return {
    objectId: result.current.object.id,
    version: result.current.object.version,
    created: result.created,
    synchronizationRoot: rootFingerprint(result),
    admitted: result.reconciliation.admitted.length,
    applied: result.reconciliation.applied.length,
    conflicts: result.reconciliation.conflicts.map((conflict) => ({
      subject: conflict.subject,
      proposition: conflict.proposition,
      values: conflict.values,
      venueIds: conflict.venueIds,
      unresolved: conflict.unresolved
    })),
    duplicatesDropped: result.reconciliation.duplicatesDropped,
    temporalSkew: result.reconciliation.temporalSkew,
    reasonCodes: result.reconciliation.reasonCodes,
    historyLength: result.history.length
  };
}

export async function synchronyReplay(path: string, options: { shuffle?: boolean } = {}): Promise<CommandOutput> {
  if (!path) return usageError("synchrony replay requires a scenario artifact path");
  try {
    const input = (await readJsonArtifact(path)) as {
      object: EconomicObject;
      deliveries: unknown[];
      policy: Record<string, unknown>;
    };
    if (!input.object || !Array.isArray(input.deliveries) || !input.policy) {
      return output(EXIT.INVALID, "synchrony scenario requires object, deliveries, and policy", {});
    }
    const object = noemaSchemaRegistry.decode<EconomicObject>(input.object);

    let deliveries = input.deliveries as Parameters<typeof synchronizeEconomicObject>[0]["deliveries"];
    if (options.shuffle) {
      deliveries = [...deliveries].sort((left, right) => {
        return String(right.deliveryId ?? "").localeCompare(String(left.deliveryId ?? ""));
      });
    }

    const policy = {
      venueCapabilities: input.policy["venueCapabilities"] as Record<string, string>,
      trustedAttestors: new Set(
        (input.policy["trustedAttestors"] as string[] | undefined) ?? []
      ),
      nowMs: Number(input.policy["nowMs"] ?? Date.now()),
      requireFinalizedObservations: Boolean(input.policy["requireFinalizedObservations"]),
      lateEvidenceThresholdMs: typeof input.policy["lateEvidenceThresholdMs"] === "number"
        ? input.policy["lateEvidenceThresholdMs"]
        : undefined
    };

    const ordered = synchronizeEconomicObject({
      object,
      history: [],
      deliveries,
      policy: policy as never
    });
    const shuffled = synchronizeEconomicObject({
      object,
      history: [],
      deliveries: [...deliveries].reverse(),
      policy: policy as never
    });

    const orderedRoot = rootFingerprint(ordered);
    const shuffledRoot = rootFingerprint(shuffled);
    const deterministic = orderedRoot === shuffledRoot;

    const summary = summaryOf(ordered);
    return output(
      deterministic ? EXIT.VALID : EXIT.UNRESOLVED,
      deterministic
        ? `synchrony replay converged deterministically (${ordered.current.object.version} v${ordered.current.object.id})`
        : "synchrony replay diverged between orderings",
      {
        ...summary,
        deterministicConvergence: deterministic,
        orderedSynchronizationRoot: orderedRoot,
        shuffledSynchronizationRoot: shuffledRoot,
        orderedAdmissions: ordered.reconciliation.admitted.map((admission) => ({
          deliveryId: admission.deliveryId,
          status: admission.status,
          reasonCodes: admission.reasonCodes
        }))
      }
    );
  } catch (error) {
    if (error instanceof UnsupportedSchemaError) return output(EXIT.UNSUPPORTED_VERSION, error.message, {});
    if (error instanceof SchemaValidationError) return output(EXIT.INVALID, error.message, {});
    if (error instanceof SyntaxError) return output(EXIT.INVALID, `invalid JSON: ${error.message}`, {});
    return internalError(error);
  }
}