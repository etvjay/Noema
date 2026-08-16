import { createHash } from "node:crypto";
import type { Ref, SourceSnapshot, UnixMillis } from "@noema/economic-kernel";
import type { WatchSubscription } from "@noema/schemas/events";

export const TELEGRAM_INBOUND_VERSION = "noema-telegram-inbound-v1";
export const TELEGRAM_CANDIDATE_EVIDENCE_VERSION = "noema-telegram-candidate-evidence-v1";

export type TelegramInboundIntent =
  | { command: "status"; args: { objectId: Ref } }
  | { command: "compare"; args: { leftRef: string; rightRef: string } }
  | { command: "why"; args: { decisionReceiptRef: Ref } }
  | { command: "evidence"; args: { objectId: Ref } }
  | { command: "representations"; args: { objectId: Ref } }
  | { command: "attestations"; args: { objectId: Ref } }
  | { command: "evaluate"; args: { objectId: Ref; mandateId: Ref } }
  | { command: "watch"; args: { objectId: Ref; eventTypes: string[] } }
  | { command: "unwatch"; args: { subscriptionId: Ref } }
  | { command: "watches"; args: {} }
  | { command: "evidence-claim"; args: { candidateId: Ref; assertion: string } }
  | { command: "help"; args: {} };

export type TelegramInboundParseResult =
  | { ok: true; intent: TelegramInboundIntent }
  | { ok: false; reason: "UNKNOWN_COMMAND" | "MALFORMED_ARGS"; message: string };

export const TELEGRAM_COMMAND_WHITELIST: readonly string[] = [
  "status",
  "compare",
  "why",
  "evidence",
  "representations",
  "attestations",
  "evaluate",
  "watch",
  "unwatch",
  "watches",
  "evidence-claim",
  "help"
];

const COMMAND_PATTERN = /^\/([a-z-]+)(?:\s+(.*))?$/s;

function tokenize(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function parseTelegramCommand(raw: string): TelegramInboundParseResult {
  const match = COMMAND_PATTERN.exec(raw.trim());
  if (match === null) {
    return { ok: false, reason: "UNKNOWN_COMMAND", message: "Not a Telegram command" };
  }
  const name = match[1]!.toLowerCase();
  const rest = match[2] ?? "";
  if (!TELEGRAM_COMMAND_WHITELIST.includes(name)) {
    return { ok: false, reason: "UNKNOWN_COMMAND", message: `Command /${name} is outside the declared Telegram boundary` };
  }
  const tokens = tokenize(rest);

  switch (name) {
    case "status": {
      const objectId = tokens[0];
      if (objectId === undefined) return { ok: false, reason: "MALFORMED_ARGS", message: "/status requires <objectId>" };
      return { ok: true, intent: { command: "status", args: { objectId } } };
    }
    case "compare": {
      const leftRef = tokens[0];
      const rightRef = tokens[1];
      if (leftRef === undefined || rightRef === undefined) {
        return { ok: false, reason: "MALFORMED_ARGS", message: "/compare requires <leftRef> <rightRef>" };
      }
      return { ok: true, intent: { command: "compare", args: { leftRef, rightRef } } };
    }
    case "why": {
      const decisionReceiptRef = tokens[0];
      if (decisionReceiptRef === undefined) {
        return { ok: false, reason: "MALFORMED_ARGS", message: "/why requires <decisionReceiptRef>" };
      }
      return { ok: true, intent: { command: "why", args: { decisionReceiptRef } } };
    }
    case "evidence": {
      const objectId = tokens[0];
      if (objectId === undefined) return { ok: false, reason: "MALFORMED_ARGS", message: "/evidence requires <objectId>" };
      return { ok: true, intent: { command: "evidence", args: { objectId } } };
    }
    case "representations": {
      const objectId = tokens[0];
      if (objectId === undefined) return { ok: false, reason: "MALFORMED_ARGS", message: "/representations requires <objectId>" };
      return { ok: true, intent: { command: "representations", args: { objectId } } };
    }
    case "attestations": {
      const objectId = tokens[0];
      if (objectId === undefined) return { ok: false, reason: "MALFORMED_ARGS", message: "/attestations requires <objectId>" };
      return { ok: true, intent: { command: "attestations", args: { objectId } } };
    }
    case "evaluate": {
      const objectId = tokens[0];
      const mandateId = tokens[1];
      if (objectId === undefined || mandateId === undefined) {
        return { ok: false, reason: "MALFORMED_ARGS", message: "/evaluate requires <objectId> <mandateId>" };
      }
      return { ok: true, intent: { command: "evaluate", args: { objectId, mandateId } } };
    }
    case "watch": {
      const objectId = tokens[0];
      const eventTypes = tokens.slice(1);
      if (objectId === undefined || eventTypes.length === 0) {
        return { ok: false, reason: "MALFORMED_ARGS", message: "/watch requires <objectId> <eventType> [eventType...]" };
      }
      return { ok: true, intent: { command: "watch", args: { objectId, eventTypes } } };
    }
    case "unwatch": {
      const subscriptionId = tokens[0];
      if (subscriptionId === undefined) return { ok: false, reason: "MALFORMED_ARGS", message: "/unwatch requires <subscriptionId>" };
      return { ok: true, intent: { command: "unwatch", args: { subscriptionId } } };
    }
    case "watches":
      return { ok: true, intent: { command: "watches", args: {} } };
    case "evidence-claim": {
      const candidateId = tokens[0];
      if (candidateId === undefined) {
        return { ok: false, reason: "MALFORMED_ARGS", message: "/evidence-claim requires <candidateId> <assertion>" };
      }
      const assertion = rest.trim().slice(tokens[0]!.length).trim();
      if (assertion.length === 0) {
        return { ok: false, reason: "MALFORMED_ARGS", message: "/evidence-claim requires an assertion text" };
      }
      return { ok: true, intent: { command: "evidence-claim", args: { candidateId, assertion } } };
    }
    case "help":
      return { ok: true, intent: { command: "help", args: {} } };
    default:
      return { ok: false, reason: "UNKNOWN_COMMAND", message: `Command /${name} is outside the declared Telegram boundary` };
  }
}

export interface TelegramUpdateIdentity {
  updateId: Ref;
  chatId: Ref;
  userId: Ref;
  messageId: Ref;
  receivedAt: UnixMillis;
}

export interface TelegramAuthorization {
  allowed: boolean;
  chatId: Ref;
  userId: Ref;
  reason?: string;
}

export function authorizeTelegramUser(input: {
  identity: TelegramUpdateIdentity;
  authorizedUserIds: readonly Ref[];
  authorizedChatIds: readonly Ref[];
}): TelegramAuthorization {
  const userAllowed = input.authorizedUserIds.includes(input.identity.userId);
  const chatAllowed = input.authorizedChatIds.includes(input.identity.chatId);
  if (!userAllowed && !chatAllowed) {
    return {
      allowed: false,
      chatId: input.identity.chatId,
      userId: input.identity.userId,
      reason: "Unauthorized Telegram user/chat"
    };
  }
  return { allowed: true, chatId: input.identity.chatId, userId: input.identity.userId };
}

export interface CandidateEvidenceCapture {
  candidateId: Ref;
  schemaVersion: typeof TELEGRAM_CANDIDATE_EVIDENCE_VERSION;
  sourceId: Ref;
  sourceAuthority: string;
  telegramUserId: Ref;
  telegramChatId: Ref;
  contentHash: Ref;
  uri: string;
  fetchedAt: UnixMillis;
  status: "CANDIDATE";
  isFromChat: true;
}

export function captureCandidateEvidence(input: {
  candidateId: Ref;
  sourceId: Ref;
  sourceAuthority: string;
  telegramUserId: Ref;
  telegramChatId: Ref;
  contentType: string;
  uri: string;
  body: string;
  fetchedAt: UnixMillis;
}): CandidateEvidenceCapture {
  const contentHash = `0x${createHash("sha256").update(input.body).digest("hex")}` as `0x${string}`;
  return {
    candidateId: input.candidateId,
    schemaVersion: TELEGRAM_CANDIDATE_EVIDENCE_VERSION,
    sourceId: input.sourceId,
    sourceAuthority: input.sourceAuthority,
    telegramUserId: input.telegramUserId,
    telegramChatId: input.telegramChatId,
    contentHash,
    uri: input.uri,
    fetchedAt: input.fetchedAt,
    status: "CANDIDATE",
    isFromChat: true
  };
}

export interface SourceSnapshotAdmissionInput {
  capture: CandidateEvidenceCapture;
  nowMs: UnixMillis;
  makeSnapshot: (input: { sourceId: Ref; uri: string; contentType: string; contentHash: Ref; bodyStorageRef: Ref; fetchedAt: UnixMillis }) => SourceSnapshot;
  bodyStorageRef: Ref;
  contentType: string;
}

export function admitCandidateToSourceSnapshot(input: SourceSnapshotAdmissionInput): SourceSnapshot {
  return input.makeSnapshot({
    sourceId: input.capture.sourceId,
    uri: input.capture.uri,
    contentType: input.contentType,
    contentHash: input.capture.contentHash,
    bodyStorageRef: input.bodyStorageRef,
    fetchedAt: input.capture.fetchedAt
  });
}

export interface InboundTelegramBoundary {
  isCommand: (message: string) => boolean;
  parse: (message: string) => TelegramInboundParseResult;
  authorize: (input: { identity: TelegramUpdateIdentity; authorizedUserIds: readonly Ref[]; authorizedChatIds: readonly Ref[] }) => TelegramAuthorization;
  captureEvidence: (input: Omit<Parameters<typeof captureCandidateEvidence>[0], "isFromChat">) => CandidateEvidenceCapture;
  isCandidateEvidence: (intent: TelegramInboundIntent) => boolean;
  admitsOnlyAsCandidate: (capture: CandidateEvidenceCapture) => boolean;
  version: () => string;
}

export function createInboundTelegramBoundary(): InboundTelegramBoundary {
  return {
    isCommand: (message) => COMMAND_PATTERN.test(message.trim()),
    parse: parseTelegramCommand,
    authorize: authorizeTelegramUser,
    captureEvidence: captureCandidateEvidence,
    isCandidateEvidence: (intent) => intent.command === "evidence-claim",
    admitsOnlyAsCandidate: (capture) => capture.status === "CANDIDATE" && capture.isFromChat === true,
    version: () => TELEGRAM_INBOUND_VERSION
  };
}

export function telegramInboundVersion(): string {
  return TELEGRAM_INBOUND_VERSION;
}

export type TelegramEvidenceAuthority =
  | "DERIVED"
  | "AI_INFERENCE"
  | "DEMO_FIXTURE";

export function mapTelegramSourceToEvidenceAuthority(
  sourceAuthority: string
): TelegramEvidenceAuthority {
  switch (sourceAuthority) {
    case "TELEGRAM_CHAT":
    case "TELEGRAM_OPERATOR":
      return "DERIVED";
    case "TELEGRAM_AI":
      return "AI_INFERENCE";
    case "DEMO_FIXTURE":
      return "DEMO_FIXTURE";
    default:
      return "DERIVED";
  }
}
