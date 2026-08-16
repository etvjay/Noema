import { createHash } from "node:crypto";
import { z } from "zod";
import { verificationOutcomeSchema } from "./index.js";

export const SEMANTIC_EVENT_SCHEMA_VERSION = "noema-semantic-event-v1";
export const SEMANTIC_EVENT_HASH_VERSION = "noema-semantic-event-sha256-v1";
export const WATCH_SUBSCRIPTION_SCHEMA_VERSION = "noema-watch-subscription-v1";
export const DELIVERY_CORRELATION_SCHEMA_VERSION = "noema-delivery-correlation-v1";

const refSchema = z.string().min(1);
const hexSchema = z.string().regex(/^0x[0-9a-fA-F]+$/);
const unixMillisSchema = z.number().int().nonnegative();

export const eventTypeSchema = z.enum([
  "MATERIAL_CHANGE",
  "VERIFICATION_CHANGED",
  "MANDATE_DECISION_CHANGED",
  "REPRESENTATION_CHANGED",
  "ATTESTATION_CHANGED"
]);

export const mandateDecisionValueSchema = z.enum(["ALLOW", "BLOCK", "CONDITIONAL"]);

export const representationStatusValueSchema = z.enum([
  "ACTIVE",
  "SUSPENDED",
  "REVOKED",
  "UNKNOWN"
]);

export const attestationStateValueSchema = z.enum(["ACTIVE", "EXPIRED", "REVOKED"]);

export const eventSeveritySchema = z.enum(["INFO", "WARNING", "CRITICAL"]);

export const eventMaterialitySchema = z.enum(["MATERIAL", "NON_MATERIAL", "UNKNOWN"]);

export const stateFlagSchema = z.enum(["UNKNOWN", "STALE", "CONFLICTING", "UNSUPPORTED"]);

const baseEventFields = {
  schemaVersion: z.literal(SEMANTIC_EVENT_SCHEMA_VERSION),
  eventId: refSchema,
  correlationId: refSchema,
  replayKey: refSchema,
  objectId: refSchema,
  objectVersion: z.number().int().positive(),
  priorVersion: z.number().int().nonnegative().optional(),
  occurredAt: unixMillisSchema,
  sourceRefs: z.array(refSchema),
  evidenceRefs: z.array(refSchema),
  receiptRefs: z.array(refSchema),
  objectRoot: hexSchema.optional(),
  evidenceRoot: hexSchema.optional(),
  severity: eventSeveritySchema.optional(),
  materiality: eventMaterialitySchema.optional(),
  stateFlags: z.array(stateFlagSchema).default([])
};

export const materialChangeEventSchema = z
  .object({
    ...baseEventFields,
    eventType: z.literal("MATERIAL_CHANGE"),
    changeKind: z
      .enum([
        "ECONOMIC_STATE",
        "REPRESENTATION",
        "RIGHTS",
        "RESTRICTIONS",
        "CLAIM",
        "EVIDENCE",
        "ATTESTATION",
        "MANDATE_DECISION",
        "OTHER"
      ])
      .optional(),
    oldVersion: z.number().int().positive(),
    newVersion: z.number().int().positive(),
    oldDecision: mandateDecisionValueSchema.optional(),
    newDecision: mandateDecisionValueSchema.optional(),
    verificationReceiptRef: refSchema,
    decisionReceiptRef: refSchema.optional()
  })
  .strict();

export const verificationChangedEventSchema = z
  .object({
    ...baseEventFields,
    eventType: z.literal("VERIFICATION_CHANGED"),
    previousStatus: verificationOutcomeSchema,
    currentStatus: verificationOutcomeSchema,
    verificationReceiptRef: refSchema,
    previousVerificationReceiptRef: refSchema.optional()
  })
  .strict();

export const mandateDecisionChangedEventSchema = z
  .object({
    ...baseEventFields,
    eventType: z.literal("MANDATE_DECISION_CHANGED"),
    mandateId: refSchema,
    mandateVersion: z.number().int().positive(),
    previousDecision: mandateDecisionValueSchema,
    currentDecision: mandateDecisionValueSchema,
    decisionReceiptRef: refSchema,
    previousDecisionReceiptRef: refSchema.optional()
  })
  .strict();

export const representationChangedEventSchema = z
  .object({
    ...baseEventFields,
    eventType: z.literal("REPRESENTATION_CHANGED"),
    representationId: refSchema,
    environment: z.string().min(1).optional(),
    network: z.string().min(1).optional(),
    previousStatus: representationStatusValueSchema,
    currentStatus: representationStatusValueSchema,
    relationshipToObject: refSchema.optional()
  })
  .strict();

export const attestationChangedEventSchema = z
  .object({
    ...baseEventFields,
    eventType: z.literal("ATTESTATION_CHANGED"),
    attestationId: refSchema,
    attestor: refSchema,
    claimRef: refSchema,
    previousState: attestationStateValueSchema,
    currentState: attestationStateValueSchema
  })
  .strict();

export const semanticEventSchema = z.discriminatedUnion("eventType", [
  materialChangeEventSchema,
  verificationChangedEventSchema,
  mandateDecisionChangedEventSchema,
  representationChangedEventSchema,
  attestationChangedEventSchema
]);

export const watchSubscriptionChannelSchema = z.enum([
  "WEBHOOK",
  "DISCORD",
  "TELEGRAM",
  "MCP",
  "REST_POLL"
]);

export const watchSubscriptionSchema = z
  .object({
    schemaVersion: z.literal(WATCH_SUBSCRIPTION_SCHEMA_VERSION),
    subscriptionId: refSchema,
    watchId: refSchema,
    objectId: refSchema,
    mandateId: refSchema.optional(),
    eventTypes: z.array(eventTypeSchema),
    channels: z.array(watchSubscriptionChannelSchema),
    webhookUrl: z.string().url().optional(),
    discordChannel: z.string().min(1).optional(),
    telegramChatId: z.string().min(1).optional(),
    destinationRef: refSchema.optional(),
    createdAt: unixMillisSchema,
    status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]).default("ACTIVE")
  })
  .strict();

export const subscriptionSchema = watchSubscriptionSchema;

export const deliveryCorrelationSchema = z
  .object({
    schemaVersion: z.literal(DELIVERY_CORRELATION_SCHEMA_VERSION),
    deliveryId: refSchema,
    eventId: refSchema,
    correlationId: refSchema,
    replayKey: refSchema,
    channel: watchSubscriptionChannelSchema,
    destination: refSchema
  })
  .strict();

export type SemanticEvent = z.infer<typeof semanticEventSchema>;
export type SemanticEventType = z.infer<typeof eventTypeSchema>;
export type MaterialChangeEvent = z.infer<typeof materialChangeEventSchema>;
export type VerificationChangedEvent = z.infer<typeof verificationChangedEventSchema>;
export type MandateDecisionChangedEvent = z.infer<typeof mandateDecisionChangedEventSchema>;
export type RepresentationChangedEvent = z.infer<typeof representationChangedEventSchema>;
export type AttestationChangedEvent = z.infer<typeof attestationChangedEventSchema>;
export type WatchSubscription = z.infer<typeof watchSubscriptionSchema>;
export type DeliveryCorrelation = z.infer<typeof deliveryCorrelationSchema>;

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Semantic event cannot contain non-finite numbers");
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Semantic event contains an unsupported value");
  return encoded;
}

export function semanticEventHashProjection(event: SemanticEvent): Record<string, unknown> {
  const parsed = semanticEventSchema.parse(event);
  const base: Record<string, unknown> = {
    domain: "noema:semantic-event:v1",
    hashVersion: SEMANTIC_EVENT_HASH_VERSION,
    schemaVersion: parsed.schemaVersion,
    eventId: parsed.eventId,
    eventType: parsed.eventType,
    correlationId: parsed.correlationId,
    replayKey: parsed.replayKey,
    objectId: parsed.objectId,
    objectVersion: parsed.objectVersion,
    priorVersion: parsed.priorVersion ?? null,
    occurredAt: parsed.occurredAt,
    sourceRefs: [...parsed.sourceRefs].sort(),
    evidenceRefs: [...parsed.evidenceRefs].sort(),
    receiptRefs: [...parsed.receiptRefs].sort(),
    objectRoot: parsed.objectRoot ?? null,
    evidenceRoot: parsed.evidenceRoot ?? null,
    stateFlags: [...parsed.stateFlags].sort(),
    severity: parsed.severity ?? null,
    materiality: parsed.materiality ?? null
  };

  switch (parsed.eventType) {
    case "MATERIAL_CHANGE":
      return {
        ...base,
        changeKind: parsed.changeKind ?? null,
        oldVersion: parsed.oldVersion,
        newVersion: parsed.newVersion,
        oldDecision: parsed.oldDecision ?? null,
        newDecision: parsed.newDecision ?? null,
        verificationReceiptRef: parsed.verificationReceiptRef,
        decisionReceiptRef: parsed.decisionReceiptRef ?? null
      };
    case "VERIFICATION_CHANGED":
      return {
        ...base,
        previousStatus: parsed.previousStatus,
        currentStatus: parsed.currentStatus,
        verificationReceiptRef: parsed.verificationReceiptRef,
        previousVerificationReceiptRef: parsed.previousVerificationReceiptRef ?? null
      };
    case "MANDATE_DECISION_CHANGED":
      return {
        ...base,
        mandateId: parsed.mandateId,
        mandateVersion: parsed.mandateVersion,
        previousDecision: parsed.previousDecision,
        currentDecision: parsed.currentDecision,
        decisionReceiptRef: parsed.decisionReceiptRef,
        previousDecisionReceiptRef: parsed.previousDecisionReceiptRef ?? null
      };
    case "REPRESENTATION_CHANGED":
      return {
        ...base,
        representationId: parsed.representationId,
        environment: parsed.environment ?? null,
        network: parsed.network ?? null,
        previousStatus: parsed.previousStatus,
        currentStatus: parsed.currentStatus,
        relationshipToObject: parsed.relationshipToObject ?? null
      };
    case "ATTESTATION_CHANGED":
      return {
        ...base,
        attestationId: parsed.attestationId,
        attestor: parsed.attestor,
        claimRef: parsed.claimRef,
        previousState: parsed.previousState,
        currentState: parsed.currentState
      };
  }
}

export function semanticEventIdentityProjection(event: SemanticEvent): Record<string, unknown> {
  const parsed = semanticEventSchema.parse(event);
  const { eventId: _eventId, ...rest } = semanticEventHashProjection(parsed);
  return rest;
}

export function deriveSemanticEventId(event: SemanticEvent): `0x${string}` {
  const digest = createHash("sha256")
    .update(canonical(semanticEventIdentityProjection(event)), "utf8")
    .digest("hex");
  return `0x${digest}`;
}

export function hashSemanticEvent(event: SemanticEvent): `0x${string}` {
  const digest = createHash("sha256")
    .update(canonical(semanticEventHashProjection(event)), "utf8")
    .digest("hex");
  return `0x${digest}`;
}

export const SUPPORTED_SEMANTIC_EVENT_VERSIONS = [SEMANTIC_EVENT_SCHEMA_VERSION] as const;

export function migrateSemanticEventVersion(event: unknown): SemanticEvent {
  if (typeof event !== "object" || event === null) {
    throw new Error("Semantic event must be an object");
  }
  const candidate = event as { schemaVersion?: unknown };
  if (candidate.schemaVersion === SEMANTIC_EVENT_SCHEMA_VERSION) {
    return semanticEventSchema.parse(event);
  }
  const version = typeof candidate.schemaVersion === "string" ? candidate.schemaVersion : "missing";
  throw new Error(
    `Unsupported semantic event schema version "${version}". Supported: ${SUPPORTED_SEMANTIC_EVENT_VERSIONS.join(", ")}`
  );
}
