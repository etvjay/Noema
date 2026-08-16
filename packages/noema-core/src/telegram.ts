import { createHash } from "node:crypto";
import type { SemanticEvent, WatchSubscription } from "@noema/schemas/events";
import type { DeliveryChannel, Transport, TransportResult } from "./notification.js";

export const TELEGRAM_RENDER_VERSION = "noema-telegram-render-v1";
export const TELEGRAM_DELIVERY_CORRELATION_VERSION = "noema-telegram-delivery-correlation-v1";

export interface TelegramPresentationConfig {
  header?: string;
  maxLines?: number;
  includeEvidenceRefs?: boolean;
  includeReceiptRefs?: boolean;
  includeStateFlags?: boolean;
  locale?: string;
}

export interface TelegramAlert {
  text: string;
  chatId: string;
  eventId: string;
  correlationId: string;
  replayKey: string;
  objectId: string;
  objectVersion: number;
  priorVersion?: number;
  receiptRefs: string[];
  evidenceRefs: string[];
  stateFlags: string[];
  digest: string;
}

export interface TelegramDeliveryCorrelation {
  schemaVersion: typeof TELEGRAM_DELIVERY_CORRELATION_VERSION;
  deliveryId: string;
  eventId: string;
  correlationId: string;
  replayKey: string;
  subscriptionId: string;
  chatId: string;
  messageId: string;
  renderedDigest: string;
  renderedAt: number;
}

export const DEFAULT_TELEGRAM_CONFIG: Required<Pick<TelegramPresentationConfig, "includeEvidenceRefs" | "includeReceiptRefs" | "includeStateFlags" | "maxLines">> = {
  includeEvidenceRefs: true,
  includeReceiptRefs: true,
  includeStateFlags: true,
  maxLines: 40
};

const SECRET_PATTERN = /(secret|token|password|api[-_]?key|bearer|private[-_]?key|chat[-_]?credentials)\b[^\n]{0,80}/i;

function normalizeConfig(config: TelegramPresentationConfig): Required<Pick<TelegramPresentationConfig, "includeEvidenceRefs" | "includeReceiptRefs" | "includeStateFlags" | "maxLines">> {
  return {
    includeEvidenceRefs: config.includeEvidenceRefs ?? DEFAULT_TELEGRAM_CONFIG.includeEvidenceRefs,
    includeReceiptRefs: config.includeReceiptRefs ?? DEFAULT_TELEGRAM_CONFIG.includeReceiptRefs,
    includeStateFlags: config.includeStateFlags ?? DEFAULT_TELEGRAM_CONFIG.includeStateFlags,
    maxLines: config.maxLines ?? DEFAULT_TELEGRAM_CONFIG.maxLines
  };
}

function digestOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function decisionLine(event: SemanticEvent): string | null {
  if (event.eventType === "MANDATE_DECISION_CHANGED") {
    return `decision: ${event.previousDecision} -> ${event.currentDecision}`;
  }
  if (event.eventType === "MATERIAL_CHANGE" && event.oldDecision !== undefined && event.newDecision !== undefined) {
    return `decision: ${event.oldDecision} -> ${event.newDecision}`;
  }
  return null;
}

function statusLine(event: SemanticEvent): string | null {
  if (event.eventType === "VERIFICATION_CHANGED") {
    return `verification: ${event.previousStatus} -> ${event.currentStatus}`;
  }
  if (event.eventType === "REPRESENTATION_CHANGED") {
    return `representation ${event.representationId}: ${event.previousStatus} -> ${event.currentStatus}`;
  }
  if (event.eventType === "ATTESTATION_CHANGED") {
    return `attestation ${event.attestationId}: ${event.previousState} -> ${event.currentState}`;
  }
  return null;
}

function stateFlagLine(flags: readonly string[], include: boolean): string[] {
  if (!include || flags.length === 0) return [];
  return [`state: ${flags.join(", ")}`];
}

export function renderTelegramAlert(
  event: SemanticEvent,
  chatId: string,
  config: TelegramPresentationConfig = {}
): TelegramAlert {
  const normalized = normalizeConfig(config);
  const lines: string[] = [];

  if (config.header !== undefined && config.header.length > 0) {
    lines.push(config.header);
  }

  const fromVersion = event.eventType === "MATERIAL_CHANGE" ? event.oldVersion : event.priorVersion ?? event.objectVersion;
  lines.push(`${event.eventType} · ${event.objectId} v${fromVersion} -> v${event.objectVersion}`);

  const changeKind =
    event.eventType === "MATERIAL_CHANGE" && event.changeKind !== undefined ? event.changeKind : event.eventType;
  lines.push(`change: ${changeKind}`);

  const decision = decisionLine(event);
  if (decision !== null) lines.push(decision);

  const status = statusLine(event);
  if (status !== null) lines.push(status);

  const flags = stateFlagLine(event.stateFlags, normalized.includeStateFlags);
  for (const flag of flags) lines.push(flag);

  if (normalized.includeReceiptRefs) {
    if (event.receiptRefs.length > 0) lines.push(`receipts: ${event.receiptRefs.join(", ")}`);
    if (event.eventType === "MATERIAL_CHANGE" || event.eventType === "VERIFICATION_CHANGED") {
      lines.push(`verification: ${event.verificationReceiptRef}`);
    }
    if ("decisionReceiptRef" in event && event.decisionReceiptRef !== undefined) lines.push(`decision: ${event.decisionReceiptRef}`);
    if ("mandateId" in event) lines.push(`mandate: ${event.mandateId}`);
  }

  if (normalized.includeEvidenceRefs && event.evidenceRefs.length > 0) {
    lines.push(`evidence: ${event.evidenceRefs.join(", ")}`);
  }
  if (event.sourceRefs.length > 0) {
    lines.push(`sources: ${event.sourceRefs.join(", ")}`);
  }
  lines.push(`event: ${event.eventId} · ${event.correlationId}`);

  const text = lines.join("\n").slice(0, 4096);
  const alert: TelegramAlert = {
    text,
    chatId,
    eventId: event.eventId,
    correlationId: event.correlationId,
    replayKey: event.replayKey,
    objectId: event.objectId,
    objectVersion: event.objectVersion,
    receiptRefs: [...event.receiptRefs],
    evidenceRefs: [...event.evidenceRefs],
    stateFlags: [...event.stateFlags],
    digest: digestOf(text)
  };
  if (event.priorVersion !== undefined) alert.priorVersion = event.priorVersion;
  return alert;
}

export function assertNoSecretsInAlert(alert: TelegramAlert): TelegramAlert {
  if (SECRET_PATTERN.test(alert.text)) {
    throw new Error("Telegram alert must not contain secret-bearing content");
  }
  return alert;
}

export function telegramMessageId(alert: TelegramAlert, attempt: number): string {
  return `tg:${alert.eventId}:${alert.chatId}:${alert.replayKey}:${attempt}`;
}

export function createTelegramDeliveryCorrelation(input: {
  deliveryId: string;
  alert: TelegramAlert;
  subscriptionId: string;
  messageId: string;
  renderedAt: number;
}): TelegramDeliveryCorrelation {
  return {
    schemaVersion: TELEGRAM_DELIVERY_CORRELATION_VERSION,
    deliveryId: input.deliveryId,
    eventId: input.alert.eventId,
    correlationId: input.alert.correlationId,
    replayKey: input.alert.replayKey,
    subscriptionId: input.subscriptionId,
    chatId: input.alert.chatId,
    messageId: input.messageId,
    renderedDigest: input.alert.digest,
    renderedAt: input.renderedAt
  };
}

export interface TelegramTransportOptions {
  config?: TelegramPresentationConfig;
  onDeliver?: (input: { alert: TelegramAlert; correlation: TelegramDeliveryCorrelation }) => void;
  failNext?: number;
  chatIdFor?: (subscriptionId: string, destination: string) => string;
  chatId?: string;
}

export function createTelegramTransport(options: TelegramTransportOptions = {}): Transport {
  let failRemaining = options.failNext ?? 0;
  return {
    send(input): TransportResult {
      const { event, subscriptionId, destination, deliveryId, attempt } = input;
      if (input.channel !== "TELEGRAM") {
        return { ok: false, errorCode: "WRONG_CHANNEL" };
      }
      if (failRemaining > 0) {
        failRemaining -= 1;
        return { ok: false, errorCode: "TELEGRAM_UNAVAILABLE" };
      }
      const chatId = options.chatIdFor !== undefined
        ? options.chatIdFor(subscriptionId, destination)
        : options.chatId ?? destination;
      const alert = renderTelegramAlert(event, chatId, options.config);
      assertNoSecretsInAlert(alert);
      const messageId = telegramMessageId(alert, attempt);
      const correlation = createTelegramDeliveryCorrelation({
        deliveryId,
        alert,
        subscriptionId,
        messageId,
        renderedAt: event.occurredAt
      });
      if (options.onDeliver !== undefined) {
        options.onDeliver({ alert, correlation });
      }
      return { ok: true, acknowledged: true };
    }
  };
}

export function telegramChannel(): DeliveryChannel {
  return "TELEGRAM";
}

export function telegramRenderVersion(): string {
  return TELEGRAM_RENDER_VERSION;
}
