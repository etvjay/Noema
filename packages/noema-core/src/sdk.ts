import type {
  DecisionReceipt,
  EconomicObject,
  Evidence,
  Mandate,
  Ref,
  UnixMillis,
  VerificationReceipt
} from "@noema/economic-kernel";
import type { SemanticEvent, WatchSubscription } from "@noema/schemas/events";
import { watchSubscriptionSchema } from "@noema/schemas/events";
import type { RegistryCommitment } from "./commitment.js";
import { evaluateMandate } from "./mandate.js";
import {
  createDeterministicCursor,
  parseDeterministicCursor,
  parseObjectVersionRef,
  resolveLatestObject,
  type DeterministicCursor,
  type NoemaErrorCode,
  type NoemaRestError
} from "./rest.js";

export const SDK_VERSION = "noema-sdk-v1";

export interface SdkError extends NoemaRestError {
  operation: string;
}

export function sdkError(input: {
  code: NoemaErrorCode;
  message: string;
  operation: string;
  ref?: string;
  objectId?: string;
  version?: number;
}): SdkError {
  const { operation, ...rest } = input;
  return { status: "ERROR", operation, ...rest };
}

export type SdkResult<T> = { ok: true; value: T } | { ok: false; error: SdkError };

function ok<T>(value: T): SdkResult<T> {
  return { ok: true, value };
}

function fail<T>(error: SdkError): SdkResult<T> {
  return { ok: false, error };
}

export interface SdkRequestOptions {
  timeoutMs?: number;
  retries?: number;
}

export interface AttestationSummary {
  id: Ref;
  objectId: Ref;
  claimRef: Ref;
  state: string;
  authority: string;
}

export interface ObjectComparison {
  left: { objectId: Ref; version: number; status: string };
  right: { objectId: Ref; version: number; status: string };
  sameCanonicalRoots: boolean;
  versionDelta: number;
  equivalenceDeterminedBy: "canonical-roots";
}

export interface DecisionExplanation {
  decisionReceiptRef: Ref;
  decision: string;
  reasonCodes: string[];
  policyChecks: { ruleId: Ref; result: string; reasonCode: string }[];
  supportingClaims: Ref[];
}

export interface SdkOperationMap {
  "objects.latest": {
    input: { objectId: Ref; repositoryStateRef: Ref };
    result: {
      object: EconomicObject;
      selection: { selectedVersion: number; repositoryStateRef: Ref; candidateVersions: number[] };
    };
  };
  "objects.get": {
    input: { ref: string };
    result: EconomicObject;
  };
  "objects.versionHistory": {
    input: { objectId: Ref; cursor?: string; pageSize?: number; order?: "asc" | "desc" };
    result: { items: EconomicObject[]; nextCursor: string | null; hasMore: boolean };
  };
  "objects.compare": {
    input: { leftRef: string; rightRef: string };
    result: ObjectComparison;
  };
  "evidence.list": {
    input: { objectId?: Ref };
    result: Evidence[];
  };
  "evidence.get": {
    input: { id: Ref };
    result: Evidence;
  };
  "attestations.list": {
    input: { objectId?: Ref };
    result: AttestationSummary[];
  };
  "attestations.get": {
    input: { id: Ref };
    result: AttestationSummary;
  };
  "verification.get": {
    input: { objectId: Ref; version: number };
    result: VerificationReceipt;
  };
  "mandates.evaluate": {
    input: { objectId: Ref; mandateId: Ref; nowMs: UnixMillis };
    result: DecisionReceipt;
  };
  "decisions.get": {
    input: { objectId: Ref; version: number };
    result: DecisionReceipt;
  };
  "decisions.explainReference": {
    input: { decisionReceiptRef: Ref };
    result: DecisionExplanation;
  };
  "watches.create": {
    input: { subscription: WatchSubscription };
    result: WatchSubscription;
  };
  "watches.get": {
    input: { subscriptionId: Ref };
    result: WatchSubscription;
  };
  "watches.list": {
    input: { cursor?: string; pageSize?: number };
    result: { items: WatchSubscription[]; nextCursor: string | null; hasMore: boolean };
  };
  "watches.delete": {
    input: { subscriptionId: Ref };
    result: { deleted: true; subscriptionId: Ref };
  };
  "events.list": {
    input: { cursor?: string; pageSize?: number };
    result: { items: SemanticEvent[]; nextCursor: string | null; hasMore: boolean };
  };
  "events.get": {
    input: { eventId: Ref };
    result: SemanticEvent;
  };
  "commitments.get": {
    input: { objectId: Ref };
    result: RegistryCommitment;
  };
}

export type SdkOperationName = keyof SdkOperationMap;
export type SdkResultValue = { [K in SdkOperationName]: SdkOperationMap[K]["result"] };

export type SdkOperation<K extends SdkOperationName> = {
  name: K;
  input: SdkOperationMap[K]["input"];
  options?: SdkRequestOptions;
};

export interface NoemaTransport {
  request<K extends SdkOperationName>(op: SdkOperation<K>): Promise<SdkResult<SdkResultValue[K]>>;
}

export interface NoemaSdk {
  objects: {
    latest(input: SdkOperationMap["objects.latest"]["input"], options?: SdkRequestOptions): Promise<SdkResult<SdkOperationMap["objects.latest"]["result"]>>;
    get(ref: string, options?: SdkRequestOptions): Promise<SdkResult<EconomicObject>>;
    versionHistory(input: SdkOperationMap["objects.versionHistory"]["input"], options?: SdkRequestOptions): Promise<SdkResult<SdkOperationMap["objects.versionHistory"]["result"]>>;
    compare(input: SdkOperationMap["objects.compare"]["input"], options?: SdkRequestOptions): Promise<SdkResult<ObjectComparison>>;
  };
  evidence: {
    list(objectId?: Ref, options?: SdkRequestOptions): Promise<SdkResult<Evidence[]>>;
    get(id: Ref, options?: SdkRequestOptions): Promise<SdkResult<Evidence>>;
  };
  attestations: {
    list(objectId?: Ref, options?: SdkRequestOptions): Promise<SdkResult<AttestationSummary[]>>;
    get(id: Ref, options?: SdkRequestOptions): Promise<SdkResult<AttestationSummary>>;
  };
  verification: {
    get(input: SdkOperationMap["verification.get"]["input"], options?: SdkRequestOptions): Promise<SdkResult<VerificationReceipt>>;
  };
  mandates: {
    evaluate(input: SdkOperationMap["mandates.evaluate"]["input"], options?: SdkRequestOptions): Promise<SdkResult<DecisionReceipt>>;
  };
  decisions: {
    get(input: SdkOperationMap["decisions.get"]["input"], options?: SdkRequestOptions): Promise<SdkResult<DecisionReceipt>>;
    explainReference(input: SdkOperationMap["decisions.explainReference"]["input"], options?: SdkRequestOptions): Promise<SdkResult<DecisionExplanation>>;
  };
  watches: {
    create(input: SdkOperationMap["watches.create"]["input"], options?: SdkRequestOptions): Promise<SdkResult<WatchSubscription>>;
    get(input: SdkOperationMap["watches.get"]["input"], options?: SdkRequestOptions): Promise<SdkResult<WatchSubscription>>;
    list(input?: SdkOperationMap["watches.list"]["input"], options?: SdkRequestOptions): Promise<SdkResult<SdkOperationMap["watches.list"]["result"]>>;
    delete(input: SdkOperationMap["watches.delete"]["input"], options?: SdkRequestOptions): Promise<SdkResult<SdkOperationMap["watches.delete"]["result"]>>;
  };
  events: {
    list(input?: SdkOperationMap["events.list"]["input"], options?: SdkRequestOptions): Promise<SdkResult<SdkOperationMap["events.list"]["result"]>>;
    get(input: SdkOperationMap["events.get"]["input"], options?: SdkRequestOptions): Promise<SdkResult<SemanticEvent>>;
  };
  commitments: {
    get(input: SdkOperationMap["commitments.get"]["input"], options?: SdkRequestOptions): Promise<SdkResult<RegistryCommitment>>;
  };
}

export function createNoemaSdk(transport: NoemaTransport): NoemaSdk {
  async function run<K extends SdkOperationName>(
    operation: SdkOperation<K>
  ): Promise<SdkResult<SdkResultValue[K]>> {
    return transport.request(operation);
  }

  function build<K extends SdkOperationName>(
    name: K,
    input: SdkOperationMap[K]["input"],
    options?: SdkRequestOptions
  ): SdkOperation<K> {
    return options === undefined ? { name, input } : { name, input, options };
  }

  return {
    objects: {
      latest: (input, options) => run(build("objects.latest", input, options)),
      get: (ref, options) => run(build("objects.get", { ref }, options)),
      versionHistory: (input, options) => run(build("objects.versionHistory", input, options)),
      compare: (input, options) => run(build("objects.compare", input, options))
    },
    evidence: {
      list: (objectId, options) => run(build("evidence.list", objectId === undefined ? {} : { objectId }, options)),
      get: (id, options) => run(build("evidence.get", { id }, options))
    },
    attestations: {
      list: (objectId, options) => run(build("attestations.list", objectId === undefined ? {} : { objectId }, options)),
      get: (id, options) => run(build("attestations.get", { id }, options))
    },
    verification: {
      get: (input, options) => run(build("verification.get", input, options))
    },
    mandates: {
      evaluate: (input, options) => run(build("mandates.evaluate", input, options))
    },
    decisions: {
      get: (input, options) => run(build("decisions.get", input, options)),
      explainReference: (input, options) => run(build("decisions.explainReference", input, options))
    },
    watches: {
      create: (input, options) => run(build("watches.create", input, options)),
      get: (input, options) => run(build("watches.get", input, options)),
      list: (input, options) => run(build("watches.list", input ?? {}, options)),
      delete: (input, options) => run(build("watches.delete", input, options))
    },
    events: {
      list: (input, options) => run(build("events.list", input ?? {}, options)),
      get: (input, options) => run(build("events.get", input, options))
    },
    commitments: {
      get: (input, options) => run(build("commitments.get", input, options))
    }
  };
}

export interface CanonicalEngine {
  repositoryStateRef: Ref;
  objectVersions(objectId: Ref): EconomicObject[];
  verifyReceiptFor(objectId: Ref, version: number): VerificationReceipt | undefined;
  mandate(mandateId: Ref): Mandate | undefined;
  decisionReceiptFor(objectId: Ref, version: number): DecisionReceipt | undefined;
  decisionReceiptsByRef(ref: Ref): DecisionReceipt | undefined;
  evidence(objectId?: Ref): Evidence[];
  attestations(objectId?: Ref): AttestationSummary[];
  subscriptions(): WatchSubscription[];
  storeSubscription(subscription: WatchSubscription): void;
  deleteSubscription(subscriptionId: Ref): void;
  events(): SemanticEvent[];
  commitmentFor(objectId: Ref): RegistryCommitment | undefined;
}

function parseCursor(cursor: string | undefined): DeterministicCursor | undefined {
  if (cursor === undefined) return undefined;
  const parsed = parseDeterministicCursor(cursor);
  if (!parsed.ok) return undefined;
  return parsed.cursor;
}

function pageByCursor<T>(items: readonly T[], cursor: DeterministicCursor): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const start = cursor.afterVersion;
  const slice = items.slice(start, start + cursor.pageSize);
  const hasMore = start + cursor.pageSize < items.length;
  let nextCursor: string | null = null;
  if (hasMore) {
    const built = createDeterministicCursor({
      afterVersion: start + cursor.pageSize,
      pageSize: cursor.pageSize,
      order: cursor.order
    });
    if (built.ok) nextCursor = built.cursor;
  }
  return { items: slice, nextCursor, hasMore };
}

export function createCanonicalEngineTransport(engine: CanonicalEngine): NoemaTransport {
  return {
    async request<K extends SdkOperationName>(operation: SdkOperation<K>): Promise<SdkResult<SdkResultValue[K]>> {
      const name = operation.name;

      switch (operation.name) {
        case "objects.latest": {
          const input = operation.input as SdkOperationMap["objects.latest"]["input"];
          const resolved = resolveLatestObject({
            objectId: input.objectId,
            versions: engine.objectVersions(input.objectId),
            repositoryStateRef: input.repositoryStateRef,
            nowMs: Date.now()
          });
          if (!resolved.ok) return fail(sdkError({ ...resolved.error, operation: name }));
          return ok({
            object: resolved.result.object,
            selection: {
              selectedVersion: resolved.result.selection.selectedVersion,
              repositoryStateRef: resolved.result.selection.repositoryStateRef,
              candidateVersions: resolved.result.selection.candidateVersions
            }
          }) as SdkResult<SdkResultValue[K]>;
        }
        case "objects.get": {
          const input = operation.input as SdkOperationMap["objects.get"]["input"];
          const parsed = parseObjectVersionRef(input.ref);
          if (!parsed.ok) return fail(sdkError({ ...parsed.error, operation: name, ref: input.ref }));
          const object = engine.objectVersions(parsed.objectId).find((candidate) => candidate.version === parsed.version);
          if (object === undefined) {
            return fail(sdkError({
              code: "VERSION_NOT_FOUND",
              message: `Version ${parsed.version} not found for ${parsed.objectId}`,
              operation: name,
              objectId: parsed.objectId,
              version: parsed.version
            }));
          }
          return ok(object) as SdkResult<SdkResultValue[K]>;
        }
        case "objects.versionHistory": {
          const input = operation.input as SdkOperationMap["objects.versionHistory"]["input"];
          const versions = engine.objectVersions(input.objectId).slice().sort((a, b) => a.version - b.version);
          const parsed = parseCursor(input.cursor);
          const cursor: DeterministicCursor = parsed ?? {
            afterVersion: input.order === "asc" ? 0 : Number.MAX_SAFE_INTEGER,
            pageSize: input.pageSize ?? 20,
            order: input.order ?? "desc"
          };
          const ordered = versions.sort((a, b) =>
            cursor.order === "asc" ? a.version - b.version : b.version - a.version
          );
          const filtered = ordered.filter((candidate) =>
            cursor.order === "asc" ? candidate.version > cursor.afterVersion : candidate.version < cursor.afterVersion
          );
          const page = filtered.slice(0, cursor.pageSize);
          const hasMore = filtered.length > cursor.pageSize;
          let nextCursor: string | null = null;
          if (hasMore && page.length > 0) {
            const built = createDeterministicCursor({
              afterVersion: page[page.length - 1]!.version,
              pageSize: cursor.pageSize,
              order: cursor.order
            });
            if (built.ok) nextCursor = built.cursor;
          }
          return ok({ items: page, nextCursor, hasMore }) as SdkResult<SdkResultValue[K]>;
        }
        case "objects.compare": {
          const input = operation.input as SdkOperationMap["objects.compare"]["input"];
          const left = parseObjectVersionRef(input.leftRef);
          const right = parseObjectVersionRef(input.rightRef);
          if (!left.ok) return fail(sdkError({ ...left.error, operation: name, ref: input.leftRef }));
          if (!right.ok) return fail(sdkError({ ...right.error, operation: name, ref: input.rightRef }));
          if (left.objectId !== right.objectId) {
            return fail(sdkError({
              code: "INVALID_REF",
              message: "compare requires both refs to reference the same object",
              operation: name
            }));
          }
          const leftVersion = engine.objectVersions(left.objectId).find((candidate) => candidate.version === left.version);
          const rightVersion = engine.objectVersions(right.objectId).find((candidate) => candidate.version === right.version);
          if (leftVersion === undefined) {
            return fail(sdkError({ code: "VERSION_NOT_FOUND", message: `Version ${left.version} missing`, operation: name, objectId: left.objectId, version: left.version }));
          }
          if (rightVersion === undefined) {
            return fail(sdkError({ code: "VERSION_NOT_FOUND", message: `Version ${right.version} missing`, operation: name, objectId: right.objectId, version: right.version }));
          }
          const leftVerification = engine.verifyReceiptFor(left.objectId, left.version);
          const rightVerification = engine.verifyReceiptFor(right.objectId, right.version);
          return ok({
            left: { objectId: left.objectId, version: leftVersion.version, status: leftVersion.status },
            right: { objectId: right.objectId, version: rightVersion.version, status: rightVersion.status },
            sameCanonicalRoots:
              leftVerification !== undefined &&
              rightVerification !== undefined &&
              leftVerification.objectRoot === rightVerification.objectRoot &&
              leftVerification.evidenceRoot === rightVerification.evidenceRoot,
            versionDelta: rightVersion.version - leftVersion.version,
            equivalenceDeterminedBy: "canonical-roots"
          }) as SdkResult<SdkResultValue[K]>;
        }
        case "evidence.list": {
          const input = operation.input as SdkOperationMap["evidence.list"]["input"];
          return ok(engine.evidence(input.objectId)) as SdkResult<SdkResultValue[K]>;
        }
        case "evidence.get": {
          const input = operation.input as SdkOperationMap["evidence.get"]["input"];
          const item = engine.evidence().find((candidate) => candidate.id === input.id);
          if (item === undefined) return fail(sdkError({ code: "NOT_FOUND", message: `Evidence ${input.id} not found`, operation: name }));
          return ok(item) as SdkResult<SdkResultValue[K]>;
        }
        case "attestations.list": {
          const input = operation.input as SdkOperationMap["attestations.list"]["input"];
          return ok(engine.attestations(input.objectId)) as SdkResult<SdkResultValue[K]>;
        }
        case "attestations.get": {
          const input = operation.input as SdkOperationMap["attestations.get"]["input"];
          const item = engine.attestations().find((candidate) => candidate.id === input.id);
          if (item === undefined) return fail(sdkError({ code: "NOT_FOUND", message: `Attestation ${input.id} not found`, operation: name }));
          return ok(item) as SdkResult<SdkResultValue[K]>;
        }
        case "verification.get": {
          const input = operation.input as SdkOperationMap["verification.get"]["input"];
          const receipt = engine.verifyReceiptFor(input.objectId, input.version);
          if (receipt === undefined) {
            return fail(sdkError({ code: "VERSION_NOT_FOUND", message: `Verification receipt not found for ${input.objectId} v${input.version}`, operation: name, objectId: input.objectId, version: input.version }));
          }
          return ok(receipt) as SdkResult<SdkResultValue[K]>;
        }
        case "mandates.evaluate": {
          const input = operation.input as SdkOperationMap["mandates.evaluate"]["input"];
          const versions = engine.objectVersions(input.objectId);
          const object = versions[versions.length - 1];
          if (object === undefined) {
            return fail(sdkError({ code: "NOT_FOUND", message: `Object ${input.objectId} not found`, operation: name, objectId: input.objectId }));
          }
          const verification = engine.verifyReceiptFor(input.objectId, object.version);
          if (verification === undefined) {
            return fail(sdkError({ code: "VERSION_NOT_FOUND", message: "No verification receipt for latest object", operation: name, objectId: input.objectId, version: object.version }));
          }
          const mandate = engine.mandate(input.mandateId);
          if (mandate === undefined) {
            return fail(sdkError({ code: "NOT_FOUND", message: `Mandate ${input.mandateId} not found`, operation: name }));
          }
          return ok(evaluateMandate(object, verification, mandate, { nowMs: input.nowMs })) as SdkResult<SdkResultValue[K]>;
        }
        case "decisions.get": {
          const input = operation.input as SdkOperationMap["decisions.get"]["input"];
          const receipt = engine.decisionReceiptFor(input.objectId, input.version);
          if (receipt === undefined) {
            return fail(sdkError({ code: "VERSION_NOT_FOUND", message: `Decision receipt not found for ${input.objectId} v${input.version}`, operation: name, objectId: input.objectId, version: input.version }));
          }
          return ok(receipt) as SdkResult<SdkResultValue[K]>;
        }
        case "decisions.explainReference": {
          const input = operation.input as SdkOperationMap["decisions.explainReference"]["input"];
          const receipt = engine.decisionReceiptsByRef(input.decisionReceiptRef);
          if (receipt === undefined) {
            return fail(sdkError({ code: "NOT_FOUND", message: `Decision receipt ${input.decisionReceiptRef} not found`, operation: name, ref: input.decisionReceiptRef }));
          }
          return ok({
            decisionReceiptRef: receipt.id,
            decision: receipt.decision,
            reasonCodes: receipt.reasonCodes,
            policyChecks: receipt.policyChecks.map((check) => ({
              ruleId: check.ruleId,
              result: check.result,
              reasonCode: check.reasonCode
            })),
            supportingClaims: receipt.supportingClaims
          }) as SdkResult<SdkResultValue[K]>;
        }
        case "watches.create": {
          const input = operation.input as SdkOperationMap["watches.create"]["input"];
          const parsed = watchSubscriptionSchema.safeParse(input.subscription);
          if (!parsed.success) {
            return fail(sdkError({ code: "VALIDATION_ERROR", message: `Invalid watch subscription: ${parsed.error.message}`, operation: name }));
          }
          engine.storeSubscription(parsed.data);
          return ok(parsed.data) as SdkResult<SdkResultValue[K]>;
        }
        case "watches.get": {
          const input = operation.input as SdkOperationMap["watches.get"]["input"];
          const subscription = engine.subscriptions().find((candidate) => candidate.subscriptionId === input.subscriptionId);
          if (subscription === undefined) return fail(sdkError({ code: "NOT_FOUND", message: `Watch ${input.subscriptionId} not found`, operation: name }));
          return ok(subscription) as SdkResult<SdkResultValue[K]>;
        }
        case "watches.list": {
          const input = operation.input as SdkOperationMap["watches.list"]["input"];
          const cursor: DeterministicCursor = parseCursor(input.cursor) ?? { afterVersion: 0, pageSize: input.pageSize ?? 20, order: "asc" };
          const items = engine.subscriptions();
          const page = pageByCursor(items, cursor);
          return ok(page) as SdkResult<SdkResultValue[K]>;
        }
        case "watches.delete": {
          const input = operation.input as SdkOperationMap["watches.delete"]["input"];
          const existing = engine.subscriptions().find((candidate) => candidate.subscriptionId === input.subscriptionId);
          if (existing === undefined) return fail(sdkError({ code: "NOT_FOUND", message: `Watch ${input.subscriptionId} not found`, operation: name }));
          engine.deleteSubscription(input.subscriptionId);
          return ok({ deleted: true, subscriptionId: input.subscriptionId }) as SdkResult<SdkResultValue[K]>;
        }
        case "events.list": {
          const input = operation.input as SdkOperationMap["events.list"]["input"];
          const cursor: DeterministicCursor = parseCursor(input.cursor) ?? { afterVersion: 0, pageSize: input.pageSize ?? 20, order: "asc" };
          const events = engine.events().slice().sort((a, b) => a.occurredAt - b.occurredAt);
          const page = pageByCursor(events, cursor);
          return ok(page) as SdkResult<SdkResultValue[K]>;
        }
        case "events.get": {
          const input = operation.input as SdkOperationMap["events.get"]["input"];
          const event = engine.events().find((candidate) => candidate.eventId === input.eventId);
          if (event === undefined) return fail(sdkError({ code: "NOT_FOUND", message: `Event ${input.eventId} not found`, operation: name }));
          return ok(event) as SdkResult<SdkResultValue[K]>;
        }
        case "commitments.get": {
          const input = operation.input as SdkOperationMap["commitments.get"]["input"];
          const commitment = engine.commitmentFor(input.objectId);
          if (commitment === undefined) return fail(sdkError({ code: "NOT_FOUND", message: `Commitment not found for ${input.objectId}`, operation: name, objectId: input.objectId }));
          return ok(commitment) as SdkResult<SdkResultValue[K]>;
        }
        default: {
          return fail(sdkError({ code: "INTERNAL", message: `Unhandled SDK operation: ${String(name)}`, operation: String(name) }));
        }
      }
    }
  };
}

export function validateWatchSubscriptionNoSecret(input: {
  subscription: WatchSubscription;
  candidateSecret: string;
}): { ok: true } | { ok: false; error: SdkError } {
  const serialized = JSON.stringify(input.subscription);
  if (serialized.includes(input.candidateSecret)) {
    return {
      ok: false,
      error: sdkError({
        code: "VALIDATION_ERROR",
        message: "Watch subscription must not embed destination secrets",
        operation: "watches.create"
      })
    };
  }
  return { ok: true };
}

export function sdkVersion(): string {
  return SDK_VERSION;
}