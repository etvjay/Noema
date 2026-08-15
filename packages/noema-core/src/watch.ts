import type {
  DecisionReceipt,
  EconomicObject,
  Hex,
  Mandate,
  MandateDecision,
  Ref,
  ResolutionException,
  UnixMillis,
  VerificationReceipt
} from "@noema/economic-kernel";
import { verifyEconomicObject, type VerificationContext } from "@noema/verification";
import { evaluateMandate, type MandateEvaluationContext } from "./mandate.js";
import {
  createNextVersion,
  isMaterialChange,
  AppendOnlyVersionStore
} from "./versioning.js";
import type { ReduceEconomicObjectInput } from "./index.js";

export type MaterialChangeType =
  | "EVIDENCE_REVOKED"
  | "EVIDENCE_STALE"
  | "EVIDENCE_CONFLICT"
  | "SOURCE_UPDATED"
  | "ATTESTATION_REVOKED"
  | "MANUAL_REFRESH";

export interface WatchChangeEvent {
  id: Ref;
  objectId: Ref;
  previousVersion: number;
  newVersion: number;
  changeType: MaterialChangeType;
  description: string;
  correlationId: string;
  timestamp: UnixMillis;
  previousDecision?: MandateDecision;
  newDecision: MandateDecision;
  verificationReceipt: VerificationReceipt;
  decisionReceipt: DecisionReceipt;
}

export interface NotificationPayload {
  target: "WEBHOOK" | "DISCORD" | "MCP_EVENT";
  correlationId: string;
  objectId: Ref;
  oldVersion: number;
  newVersion: number;
  oldDecision?: MandateDecision;
  newDecision: MandateDecision;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  summary: string;
  changeReasons: string[];
  evidenceRoot: Hex;
  objectRoot: Hex;
  timestamp: UnixMillis;
}

export interface ProcessMaterialChangeInput {
  currentObject: EconomicObject;
  previousDecision?: DecisionReceipt;
  mandate: Mandate;
  changeType: MaterialChangeType;
  description: string;
  correlationId: string;
  updates: Partial<ReduceEconomicObjectInput>;
  versionStore?: AppendOnlyVersionStore;
  nowMs?: UnixMillis;
}

export interface ProcessMaterialChangeResult {
  updatedObject: EconomicObject;
  verificationReceipt: VerificationReceipt;
  decisionReceipt: DecisionReceipt;
  changeEvent: WatchChangeEvent;
  webhookPayload: NotificationPayload;
  discordPayload: NotificationPayload;
}

export function formatDiscordNotification(event: WatchChangeEvent): NotificationPayload {
  const isDecisionChanged = event.previousDecision && event.previousDecision !== event.newDecision;
  const severity =
    event.newDecision === "BLOCK"
      ? "CRITICAL"
      : isDecisionChanged
      ? "WARNING"
      : "INFO";

  return {
    target: "DISCORD",
    correlationId: event.correlationId,
    objectId: event.objectId,
    oldVersion: event.previousVersion,
    newVersion: event.newVersion,
    ...(event.previousDecision !== undefined ? { oldDecision: event.previousDecision } : {}),
    newDecision: event.newDecision,
    severity,
    title: `[Noema Alert] Material Change on ${event.objectId} (v${event.previousVersion} -> v${event.newVersion})`,
    summary: `Change: ${event.changeType} - ${event.description}. Mandate decision changed from ${event.previousDecision ?? "N/A"} to ${event.newDecision}.`,
    changeReasons: event.decisionReceipt.reasonCodes,
    evidenceRoot: event.verificationReceipt.evidenceRoot,
    objectRoot: event.verificationReceipt.objectRoot,
    timestamp: event.timestamp
  };
}

export function formatWebhookNotification(event: WatchChangeEvent): NotificationPayload {
  const isDecisionChanged = event.previousDecision && event.previousDecision !== event.newDecision;
  const severity =
    event.newDecision === "BLOCK"
      ? "CRITICAL"
      : isDecisionChanged
      ? "WARNING"
      : "INFO";

  return {
    target: "WEBHOOK",
    correlationId: event.correlationId,
    objectId: event.objectId,
    oldVersion: event.previousVersion,
    newVersion: event.newVersion,
    ...(event.previousDecision !== undefined ? { oldDecision: event.previousDecision } : {}),
    newDecision: event.newDecision,
    severity,
    title: `Material Change: ${event.objectId}`,
    summary: `${event.description}`,
    changeReasons: event.decisionReceipt.reasonCodes,
    evidenceRoot: event.verificationReceipt.evidenceRoot,
    objectRoot: event.verificationReceipt.objectRoot,
    timestamp: event.timestamp
  };
}

export function processMaterialChange(
  input: ProcessMaterialChangeInput
): ProcessMaterialChangeResult {
  const nowMs = input.nowMs ?? Date.now();

  // 1. Create next immutable version
  const nextObject = createNextVersion(input.currentObject, input.updates, {
    nowMs,
    reason: input.description
  });

  // Save to version store if present
  if (input.versionStore) {
    input.versionStore.save(input.currentObject);
    input.versionStore.save(nextObject);
  }

  // 2. Re-verify
  const verificationContext: VerificationContext = { nowMs };
  const verificationReceipt = verifyEconomicObject(nextObject, verificationContext);

  // 3. Re-evaluate mandate
  const mandateContext: MandateEvaluationContext = { nowMs };
  const decisionReceipt = evaluateMandate(
    nextObject,
    verificationReceipt,
    input.mandate,
    mandateContext
  );

  // 4. Construct semantic change event
  const previousDecision = input.previousDecision?.decision;
  const changeEvent: WatchChangeEvent = {
    id: `event:watch:${nextObject.id}:v${nextObject.version}:${nowMs}`,
    objectId: nextObject.id,
    previousVersion: input.currentObject.version,
    newVersion: nextObject.version,
    changeType: input.changeType,
    description: input.description,
    correlationId: input.correlationId,
    timestamp: nowMs,
    ...(previousDecision !== undefined ? { previousDecision } : {}),
    newDecision: decisionReceipt.decision,
    verificationReceipt,
    decisionReceipt
  };

  // 5. Generate notification payloads
  const webhookPayload = formatWebhookNotification(changeEvent);
  const discordPayload = formatDiscordNotification(changeEvent);

  return {
    updatedObject: nextObject,
    verificationReceipt,
    decisionReceipt,
    changeEvent,
    webhookPayload,
    discordPayload
  };
}
