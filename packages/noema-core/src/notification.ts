import type { SemanticEvent, WatchSubscription } from "@noema/schemas/events";

export type DeliveryChannel =
  | "WEBHOOK"
  | "DISCORD"
  | "TELEGRAM"
  | "MCP"
  | "REST_POLL";

export type DeliveryState =
  | "QUEUED"
  | "SENT"
  | "ACKNOWLEDGED"
  | "RETRYING"
  | "FAILED"
  | "DEAD_LETTERED";

export interface DeliveryAttempt {
  attempt: number;
  state: "QUEUED" | "SENT" | "ACKNOWLEDGED" | "FAILED";
  scheduledAt: number;
  sentAt?: number;
  acknowledgedAt?: number;
  errorCode?: string;
}

export interface Delivery {
  deliveryId: string;
  eventId: string;
  correlationId: string;
  replayKey: string;
  subscriptionId: string;
  channel: DeliveryChannel;
  destination: string;
  eventType: SemanticEvent["eventType"];
  attempts: DeliveryAttempt[];
  state: DeliveryState;
  createdAt: number;
  updatedAt: number;
}

export type DeliveryReceipt = Delivery;

export interface RouterState {
  deliveries: Record<string, Delivery>;
}

export interface RoutingPolicy {
  includeEventTypes?: readonly SemanticEvent["eventType"][];
  includeSeverity?: readonly ("INFO" | "WARNING" | "CRITICAL")[];
  includeMateriality?: readonly ("MATERIAL" | "NON_MATERIAL" | "UNKNOWN")[];
}

export interface RetryPolicy {
  maxAttempts: number;
  baseBackoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
}

export interface TransportResult {
  ok: boolean;
  acknowledged?: boolean;
  errorCode?: string;
}

export interface Transport {
  send(input: {
    event: SemanticEvent;
    subscriptionId: string;
    channel: DeliveryChannel;
    destination: string;
    deliveryId: string;
    attempt: number;
  }): TransportResult;
}

export interface RouteEventInput {
  event: SemanticEvent;
  subscriptions: readonly WatchSubscription[];
  state: RouterState;
  nowMs: number;
  transport: Transport;
  policy?: RoutingPolicy;
  retry?: Partial<RetryPolicy>;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseBackoffMs: 1_000,
  backoffMultiplier: 2,
  maxBackoffMs: 60_000
};

export function initializeRouterState(): RouterState {
  return { deliveries: {} };
}

function channelFromSubscription(
  subscription: WatchSubscription
): { channel: DeliveryChannel; destination: string }[] {
  const targets: { channel: DeliveryChannel; destination: string }[] = [];
  if (subscription.channels.includes("WEBHOOK")) {
    if (subscription.webhookUrl !== undefined) {
      targets.push({ channel: "WEBHOOK", destination: subscription.webhookUrl });
    } else if (subscription.destinationRef !== undefined) {
      targets.push({ channel: "WEBHOOK", destination: subscription.destinationRef });
    }
  }
  if (subscription.channels.includes("DISCORD")) {
    if (subscription.discordChannel !== undefined) {
      targets.push({ channel: "DISCORD", destination: subscription.discordChannel });
    } else if (subscription.destinationRef !== undefined) {
      targets.push({ channel: "DISCORD", destination: subscription.destinationRef });
    }
  }
  if (subscription.channels.includes("TELEGRAM")) {
    if (subscription.telegramChatId !== undefined) {
      targets.push({ channel: "TELEGRAM", destination: subscription.telegramChatId });
    } else if (subscription.destinationRef !== undefined) {
      targets.push({ channel: "TELEGRAM", destination: subscription.destinationRef });
    }
  }
  if (subscription.channels.includes("MCP")) {
    targets.push({ channel: "MCP", destination: subscription.destinationRef ?? subscription.subscriptionId });
  }
  if (subscription.channels.includes("REST_POLL")) {
    targets.push({ channel: "REST_POLL", destination: subscription.destinationRef ?? subscription.subscriptionId });
  }
  return targets;
}

function eventMatchesPolicy(
  event: SemanticEvent,
  policy: RoutingPolicy | undefined
): boolean {
  if (policy === undefined) return true;
  if (policy.includeEventTypes !== undefined && !policy.includeEventTypes.includes(event.eventType)) {
    return false;
  }
  if (
    policy.includeSeverity !== undefined &&
    event.severity !== undefined &&
    !policy.includeSeverity.includes(event.severity)
  ) {
    return false;
  }
  if (
    policy.includeMateriality !== undefined &&
    event.materiality !== undefined &&
    !policy.includeMateriality.includes(event.materiality)
  ) {
    return false;
  }
  return true;
}

function normalizeRetry(retry: Partial<RetryPolicy> | undefined): RetryPolicy {
  return {
    maxAttempts: retry?.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
    baseBackoffMs: retry?.baseBackoffMs ?? DEFAULT_RETRY_POLICY.baseBackoffMs,
    backoffMultiplier: retry?.backoffMultiplier ?? DEFAULT_RETRY_POLICY.backoffMultiplier,
    maxBackoffMs: retry?.maxBackoffMs ?? DEFAULT_RETRY_POLICY.maxBackoffMs
  };
}

function backoffMs(retry: RetryPolicy, attempt: number): number {
  const raw = retry.baseBackoffMs * Math.pow(retry.backoffMultiplier, attempt - 1);
  return Math.min(raw, retry.maxBackoffMs);
}

function deliveryIdFor(
  event: SemanticEvent,
  subscriptionId: string,
  channel: DeliveryChannel,
  destination: string
): string {
  return `delivery:${event.eventId}:${subscriptionId}:${channel}:${destination}`;
}

function terminalState(state: DeliveryState): boolean {
  return state === "ACKNOWLEDGED" || state === "FAILED" || state === "DEAD_LETTERED";
}

function advance(
  delivery: Delivery,
  nowMs: number,
  retry: RetryPolicy,
  transport: Transport,
  event: SemanticEvent,
  subscriptionId: string
): Delivery {
  const latest = delivery.attempts.at(-1);
  if (latest === undefined) return delivery;
  if (latest.state !== "QUEUED" || latest.scheduledAt > nowMs) return delivery;
  if (terminalState(delivery.state)) return delivery;

  const result = transport.send({
    event,
    subscriptionId,
    channel: delivery.channel,
    destination: delivery.destination,
    deliveryId: delivery.deliveryId,
    attempt: latest.attempt
  });

  const attempts = delivery.attempts.slice(0, -1);
  const sentAttempt: DeliveryAttempt = {
    ...latest,
    state: "SENT",
    sentAt: nowMs,
    ...(result.errorCode === undefined ? {} : { errorCode: result.errorCode })
  };

  if (result.ok && result.acknowledged !== false) {
    const acknowledged: DeliveryAttempt = {
      ...sentAttempt,
      state: "ACKNOWLEDGED",
      acknowledgedAt: nowMs
    };
    return {
      ...delivery,
      attempts: [...attempts, acknowledged],
      state: "ACKNOWLEDGED",
      updatedAt: nowMs
    };
  }

  if (delivery.attempts.length >= retry.maxAttempts) {
    return {
      ...delivery,
      attempts: [...attempts, sentAttempt],
      state: result.ok ? "FAILED" : "DEAD_LETTERED",
      updatedAt: nowMs
    };
  }

  const nextAttemptNumber = delivery.attempts.length + 1;
  const scheduledAt = nowMs + backoffMs(retry, nextAttemptNumber - 1);
  const queued: DeliveryAttempt = {
    attempt: nextAttemptNumber,
    state: "QUEUED",
    scheduledAt
  };
  return {
    ...delivery,
    attempts: [...attempts, sentAttempt, queued],
    state: "RETRYING",
    updatedAt: nowMs
  };
}

function createDelivery(
  event: SemanticEvent,
  subscription: WatchSubscription,
  target: { channel: DeliveryChannel; destination: string },
  nowMs: number
): Delivery {
  return {
    deliveryId: deliveryIdFor(event, subscription.subscriptionId, target.channel, target.destination),
    eventId: event.eventId,
    correlationId: event.correlationId,
    replayKey: event.replayKey,
    subscriptionId: subscription.subscriptionId,
    channel: target.channel,
    destination: target.destination,
    eventType: event.eventType,
    attempts: [{ attempt: 1, state: "QUEUED", scheduledAt: nowMs }],
    state: "QUEUED",
    createdAt: nowMs,
    updatedAt: nowMs
  };
}

export function routeEvent(input: RouteEventInput): { state: RouterState; receipts: DeliveryReceipt[] } {
  const retry = normalizeRetry(input.retry);
  const state: RouterState = {
    deliveries: { ...input.state.deliveries }
  };
  const receipts: DeliveryReceipt[] = [];

  for (const subscription of input.subscriptions) {
    if (subscription.status === "SUSPENDED" || subscription.status === "REVOKED") continue;
    if (!subscription.eventTypes.includes(input.event.eventType)) continue;
    if (!eventMatchesPolicy(input.event, input.policy)) continue;

    for (const target of channelFromSubscription(subscription)) {
      const deliveryId = deliveryIdFor(
        input.event,
        subscription.subscriptionId,
        target.channel,
        target.destination
      );

      const existing = state.deliveries[deliveryId];
      if (existing === undefined) {
        const created = createDelivery(input.event, subscription, target, input.nowMs);
        const advanced = advance(created, input.nowMs, retry, input.transport, input.event, subscription.subscriptionId);
        state.deliveries[deliveryId] = advanced;
        receipts.push(advanced);
        continue;
      }

      const advanced = advance(existing, input.nowMs, retry, input.transport, input.event, subscription.subscriptionId);
      state.deliveries[deliveryId] = advanced;
      receipts.push(advanced);
    }
  }

  return { state, receipts };
}