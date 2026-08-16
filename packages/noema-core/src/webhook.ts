import { createHmac, timingSafeEqual } from "node:crypto";
import type { SemanticEvent } from "@noema/schemas/events";
import { semanticEventSchema } from "@noema/schemas/events";
import type { DeliveryChannel, Transport, TransportResult } from "./notification.js";

export const WEBHOOK_ENVELOPE_VERSION = "noema-webhook-envelope-v1";
export const WEBHOOK_SIGNATURE_VERSION = "noema-webhook-hmac-sha256-v1";

export interface WebhookLinks {
  objectId: string;
  objectVersion: number;
  verificationReceiptRef: string;
  decisionReceiptRef?: string;
  evidenceRoot?: string;
  objectRoot?: string;
}

export interface WebhookEnvelope {
  envelopeVersion: typeof WEBHOOK_ENVELOPE_VERSION;
  signatureVersion: typeof WEBHOOK_SIGNATURE_VERSION;
  eventId: string;
  correlationId: string;
  deliveryId: string;
  attempt: number;
  timestamp: number;
  links: WebhookLinks;
  payload: SemanticEvent;
  signature: string;
}

export interface SignWebhookEnvelopeInput {
  event: SemanticEvent;
  deliveryId: string;
  attempt: number;
  timestamp: number;
  secret: string;
  links?: WebhookLinks;
}

function defaultLinks(event: SemanticEvent): WebhookLinks {
  const [verificationReceiptRef, decisionReceiptRef] = event.receiptRefs;
  return {
    objectId: event.objectId,
    objectVersion: event.objectVersion,
    verificationReceiptRef: verificationReceiptRef ?? event.receiptRefs[0] ?? event.eventId,
    ...(decisionReceiptRef === undefined ? {} : { decisionReceiptRef }),
    ...(event.evidenceRoot === undefined ? {} : { evidenceRoot: event.evidenceRoot }),
    ...(event.objectRoot === undefined ? {} : { objectRoot: event.objectRoot })
  };
}

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
    throw new Error("Webhook envelope cannot contain non-finite numbers");
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Webhook envelope contains an unsupported value");
  return encoded;
}

export function webhookSignaturePayload(input: {
  eventId: string;
  correlationId: string;
  deliveryId: string;
  attempt: number;
  timestamp: number;
  links: WebhookLinks;
  payload: SemanticEvent;
}): string {
  return canonical({
    envelopeVersion: WEBHOOK_ENVELOPE_VERSION,
    signatureVersion: WEBHOOK_SIGNATURE_VERSION,
    eventId: input.eventId,
    correlationId: input.correlationId,
    deliveryId: input.deliveryId,
    attempt: input.attempt,
    timestamp: input.timestamp,
    links: input.links,
    payload: input.payload
  });
}

export function signWebhookEnvelope(input: SignWebhookEnvelopeInput): WebhookEnvelope {
  const event = semanticEventSchema.parse(input.event);
  const links = input.links ?? defaultLinks(event);
  const payload = event;
  const unsigned = {
    envelopeVersion: WEBHOOK_ENVELOPE_VERSION,
    signatureVersion: WEBHOOK_SIGNATURE_VERSION,
    eventId: payload.eventId,
    correlationId: payload.correlationId,
    deliveryId: input.deliveryId,
    attempt: input.attempt,
    timestamp: input.timestamp,
    links,
    payload
  };
  const signature = createHmac("sha256", input.secret)
    .update(webhookSignaturePayload(unsigned))
    .digest("hex");
  return { ...unsigned, signature } as WebhookEnvelope;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export interface VerifyWebhookEnvelopeResult {
  valid: boolean;
  reason?: string;
  envelope?: WebhookEnvelope;
}

export interface VerifyWebhookEnvelopeInput {
  envelope: unknown;
  secret: string;
  nowMs: number;
  maxAgeMs?: number;
}

export function verifyWebhookEnvelope(input: VerifyWebhookEnvelopeInput): VerifyWebhookEnvelopeResult {
  const maxAgeMs = input.maxAgeMs ?? 5 * 60_000;
  if (typeof input.envelope !== "object" || input.envelope === null) {
    return { valid: false, reason: "Envelope is not an object" };
  }
  const candidate = input.envelope as Partial<WebhookEnvelope>;
  if (
    candidate.envelopeVersion !== WEBHOOK_ENVELOPE_VERSION ||
    candidate.signatureVersion !== WEBHOOK_SIGNATURE_VERSION
  ) {
    return { valid: false, reason: "Unsupported envelope or signature version" };
  }
  if (
    typeof candidate.eventId !== "string" ||
    typeof candidate.deliveryId !== "string" ||
    typeof candidate.timestamp !== "number" ||
    typeof candidate.signature !== "string"
  ) {
    return { valid: false, reason: "Envelope is missing required signed fields" };
  }

  if (input.nowMs < candidate.timestamp - maxAgeMs || input.nowMs > candidate.timestamp + maxAgeMs) {
    return { valid: false, reason: "Envelope timestamp is outside the accepted replay window" };
  }

  const unsigned = {
    envelopeVersion: candidate.envelopeVersion,
    signatureVersion: candidate.signatureVersion,
    eventId: candidate.eventId,
    correlationId: candidate.correlationId,
    deliveryId: candidate.deliveryId,
    attempt: candidate.attempt,
    timestamp: candidate.timestamp,
    links: candidate.links,
    payload: candidate.payload
  };
  const expected = createHmac("sha256", input.secret)
    .update(webhookSignaturePayload(unsigned as never))
    .digest("hex");

  if (!constantTimeEqual(expected, candidate.signature)) {
    return { valid: false, reason: "Signature does not match payload (tampering or wrong secret)" };
  }

  const parsed = semanticEventSchema.safeParse(candidate.payload);
  if (!parsed.success) {
    return { valid: false, reason: "Signed payload is not a valid canonical SemanticEvent" };
  }

  return {
    valid: true,
    envelope: {
      envelopeVersion: candidate.envelopeVersion,
      signatureVersion: candidate.signatureVersion,
      eventId: candidate.eventId,
      correlationId: candidate.correlationId!,
      deliveryId: candidate.deliveryId,
      attempt: candidate.attempt ?? 1,
      timestamp: candidate.timestamp,
      links: candidate.links as WebhookLinks,
      payload: parsed.data,
      signature: candidate.signature
    }
  };
}

export class WebhookSecretStore {
  private readonly secrets = new Map<string, string>();
  private readonly rotated = new Map<string, string>();

  set(destination: string, secret: string): void {
    if (secret.length === 0) throw new Error("Webhook secret must not be empty");
    const previous = this.secrets.get(destination);
    if (previous !== undefined && previous !== secret) {
      this.rotated.set(destination, previous);
    }
    this.secrets.set(destination, secret);
  }

  get(destination: string): string | undefined {
    return this.secrets.get(destination);
  }

  rotate(destination: string, secret: string): void {
    const previous = this.secrets.get(destination);
    if (previous !== undefined) this.rotated.set(destination, previous);
    this.secrets.set(destination, secret);
  }

  accepts(destination: string, secret: string): boolean {
    return this.secrets.get(destination) === secret || this.rotated.get(destination) === secret;
  }
}

export interface WebhookTransportOptions {
  secretStore: WebhookSecretStore;
  nowMs?: () => number;
  attempt?: (attempt: number) => number;
}

export function createWebhookTransport(options: WebhookTransportOptions): Transport {
  const nowMs = options.nowMs ?? (() => Date.now());
  return {
    send(input: {
      event: SemanticEvent;
      subscriptionId: string;
      channel: DeliveryChannel;
      destination: string;
      deliveryId: string;
      attempt: number;
    }): TransportResult {
      const secret = options.secretStore.get(input.destination);
      if (secret === undefined) {
        return { ok: false, errorCode: "WEBHOOK_SECRET_MISSING" };
      }
      const attempt = options.attempt ? options.attempt(input.attempt) : input.attempt;
      try {
        const envelope = signWebhookEnvelope({
          event: input.event,
          deliveryId: input.deliveryId,
          attempt,
          timestamp: nowMs(),
          secret
        });
        const serialized = JSON.stringify(envelope);
        if (serialized.length === 0) {
          return { ok: false, errorCode: "WEBHOOK_SERIALIZATION_FAILED" };
        }
        return { ok: true, acknowledged: true };
      } catch {
        return { ok: false, errorCode: "WEBHOOK_SIGNING_FAILED" };
      }
    }
  };
}

export function envelopeIdempotencyKey(envelope: WebhookEnvelope): string {
  return `${envelope.eventId}:${envelope.deliveryId}:${envelope.attempt}`;
}