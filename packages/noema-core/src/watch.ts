import type {
  DecisionReceipt,
  EconomicObject,
  MandateDecision,
  Ref,
  UnixMillis,
  VerificationReceipt
} from "@noema/economic-kernel";
import {
  appendEconomicObjectChange,
  initializeVersionHistory,
  type EconomicObjectVersionRecord
} from "./versioning.js";

export interface WatchRegistration {
  id: Ref;
  objectId: Ref;
  mandateId: Ref;
  webhookUrl?: string;
  discordChannel?: string;
}

export interface SemanticChangeEvent {
  id: Ref;
  correlationId: Ref;
  watchId: Ref;
  changeId: Ref;
  objectId: Ref;
  oldVersion: number;
  newVersion: number;
  oldDecisionRef: Ref;
  newDecisionRef: Ref;
  oldDecision: MandateDecision;
  newDecision: MandateDecision;
  verificationReceiptRef: Ref;
  createdAt: UnixMillis;
}

export interface WatchNotificationPayload {
  id: Ref;
  eventId: Ref;
  correlationId: Ref;
  channel: "WEBHOOK" | "DISCORD";
  destination: string;
  objectId: Ref;
  oldVersion: number;
  newVersion: number;
  oldDecision: MandateDecision;
  newDecision: MandateDecision;
  decisionReceiptRef: Ref;
}

export interface WatchEvaluation {
  verification: VerificationReceipt;
  decision: DecisionReceipt;
}

export interface WatchChangeResult {
  changed: boolean;
  object: EconomicObject;
  verification: VerificationReceipt;
  decision: DecisionReceipt;
  event?: SemanticChangeEvent;
  notifications: WatchNotificationPayload[];
}

export interface WatchState {
  history: EconomicObjectVersionRecord[];
  processed: Record<string, WatchChangeResult>;
}

export interface ProcessWatchChangeInput {
  state: WatchState;
  watch: WatchRegistration;
  candidate: EconomicObject;
  changeId: Ref;
  previousVerification: VerificationReceipt;
  previousDecision: DecisionReceipt;
  nowMs: UnixMillis;
  evaluate: (object: EconomicObject) => WatchEvaluation;
}

export function initializeWatchState(object: EconomicObject): WatchState {
  return {
    history: initializeVersionHistory(object, "initial"),
    processed: {}
  };
}

function notificationPayloads(
  watch: WatchRegistration,
  event: SemanticChangeEvent,
  decision: DecisionReceipt
): WatchNotificationPayload[] {
  const payloads: WatchNotificationPayload[] = [];
  if (watch.webhookUrl !== undefined) {
    payloads.push({
      id: `notification:${event.id}:webhook`,
      eventId: event.id,
      correlationId: event.correlationId,
      channel: "WEBHOOK",
      destination: watch.webhookUrl,
      objectId: event.objectId,
      oldVersion: event.oldVersion,
      newVersion: event.newVersion,
      oldDecision: event.oldDecision,
      newDecision: event.newDecision,
      decisionReceiptRef: decision.id
    });
  }
  if (watch.discordChannel !== undefined) {
    payloads.push({
      id: `notification:${event.id}:discord`,
      eventId: event.id,
      correlationId: event.correlationId,
      channel: "DISCORD",
      destination: watch.discordChannel,
      objectId: event.objectId,
      oldVersion: event.oldVersion,
      newVersion: event.newVersion,
      oldDecision: event.oldDecision,
      newDecision: event.newDecision,
      decisionReceiptRef: decision.id
    });
  }
  return payloads;
}

export function processWatchedChange(
  input: ProcessWatchChangeInput
): { state: WatchState; result: WatchChangeResult } {
  const replay = input.state.processed[input.changeId];
  if (replay !== undefined) {
    return {
      state: structuredClone(input.state),
      result: structuredClone(replay)
    };
  }

  const append = appendEconomicObjectChange(
    input.state.history,
    input.candidate,
    input.changeId
  );

  if (!append.created) {
    const result: WatchChangeResult = {
      changed: false,
      object: structuredClone(append.current.object),
      verification: structuredClone(input.previousVerification),
      decision: structuredClone(input.previousDecision),
      notifications: []
    };
    return {
      state: {
        history: append.history,
        processed: {
          ...structuredClone(input.state.processed),
          [input.changeId]: structuredClone(result)
        }
      },
      result
    };
  }

  const nextObject = append.current.object;
  const evaluated = input.evaluate(nextObject);
  const oldVersion = input.state.history.at(-1)!.object.version;
  const correlationId = `correlation:${input.watch.id}:${input.changeId}`;
  const event: SemanticChangeEvent = {
    id: `event:${input.watch.id}:${input.changeId}`,
    correlationId,
    watchId: input.watch.id,
    changeId: input.changeId,
    objectId: nextObject.id,
    oldVersion,
    newVersion: nextObject.version,
    oldDecisionRef: input.previousDecision.id,
    newDecisionRef: evaluated.decision.id,
    oldDecision: input.previousDecision.decision,
    newDecision: evaluated.decision.decision,
    verificationReceiptRef: evaluated.verification.id,
    createdAt: input.nowMs
  };
  const notifications = notificationPayloads(input.watch, event, evaluated.decision);
  const result: WatchChangeResult = {
    changed: true,
    object: structuredClone(nextObject),
    verification: structuredClone(evaluated.verification),
    decision: structuredClone(evaluated.decision),
    event,
    notifications
  };
  const state: WatchState = {
    history: append.history,
    processed: {
      ...structuredClone(input.state.processed),
      [input.changeId]: structuredClone(result)
    }
  };
  return { state, result };
}
