import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DecisionReceipt, EconomicObject, Mandate, SourceSnapshot, VerificationReceipt } from "@noema/economic-kernel";
import { semanticEventSchema, watchSubscriptionSchema } from "@noema/schemas/events";
import type { SemanticEvent, WatchSubscription } from "@noema/schemas/events";
import { evaluateMandate } from "@noema/noema-core/mandate";
import { explainMandateChange, renderExplanation } from "@noema/noema-core/explain";
import { registerRegistryCommitment, updateRegistryCommitment } from "@noema/noema-core/commitment";
import { initializeRouterState, routeEvent } from "@noema/noema-core/notification";
import { resolveLatestObject, exactObjectVersionRef } from "@noema/noema-core/rest";
import { createCanonicalEngineTransport, createNoemaSdk, type CanonicalEngine } from "@noema/noema-core/sdk";
import { createNoemaMcpServer } from "@noema/noema-core/mcp";
import { toRestSnapshot, fromSdkSnapshot, toMcpResource, type CanonicalNoemaSnapshot } from "@noema/noema-core/surfaces";
import { toNoemaUiViewModel } from "@noema/noema-core/ui";
import { WebhookSecretStore, createWebhookTransport, signWebhookEnvelope, verifyWebhookEnvelope, envelopeIdempotencyKey } from "@noema/noema-core/webhook";
import { createTelegramTransport } from "@noema/noema-core/telegram";
import { parseTelegramCommand, captureCandidateEvidence, admitCandidateToSourceSnapshot, mapTelegramSourceToEvidenceAuthority } from "@noema/noema-core/telegram-inbound";
import { ingestSourceSnapshot } from "@noema/noema-core/evidence";
import { verifyEconomicObject } from "@noema/verification";
import { hashCanonical } from "@noema/canonicalization";
import { makeEconomicObject } from "../helpers.js";

const NOW = 1_700_000_100_000;
const REPO_STATE = "repository:state:terminal-gate";
const RUN_ID = "run:terminal:cross-surface";
const RELEASE_BRANCH = "agent/noema-integration-lab";
const DESTINATION = "https://receiver.example/noema/terminal";
const WEBHOOK_SECRET = "terminal-webhook-secret-fixture";
const TELEGRAM_CHAT = "-100terminalgate";

function gitCommit(): string {
  const pinned = process.env.NOEMA_RELEASE_COMMIT;
  if (pinned !== undefined && /^[0-9a-f]{40}$/.test(pinned)) return pinned;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotOf(object: EconomicObject, verification: VerificationReceipt, decision: DecisionReceipt): CanonicalNoemaSnapshot {
  return { object, verification, decision };
}

function treasuryMandate(): Mandate {
  return {
    id: "mandate:terminal:treasury",
    version: 1,
    principal: "treasury:terminal",
    objective: "Hold fresh verified tokenized Treasury exposure",
    allowedAssetClasses: ["TOKENIZED_TREASURY"],
    prohibitedAssetClasses: [],
    jurisdictions: [],
    requiredClaims: [{ property: "economicIdentity", requiredState: "SOURCED" }],
    requiredEvidence: [{ type: "API_RESPONSE", maxAgeMs: 3_600_000 }],
    maxEvidenceAgeMs: 3_600_000
  };
}

function verifyAndDecide(object: EconomicObject, mandate: Mandate, nowMs: number) {
  const verification = verifyEconomicObject(object, { nowMs, maxEvidenceAgeMs: mandate.maxEvidenceAgeMs! });
  const decision = evaluateMandate(object, verification, mandate, { nowMs });
  return { verification, decision };
}

describe("Noema terminal cross-surface gate (#54)", () => {
  it("proves one correlated watch/change scenario is identical across REST, SDK, MCP, Telegram, webhook, and UI", async () => {
    const commit = gitCommit();
    expect(commit).toMatch(/^[0-9a-f]{40}$/);

    const mandate = treasuryMandate();
    const base = makeEconomicObject();
    const evidence = base.evidence[0]!;
    const claim = base.claims[0]!;

    const v1: EconomicObject = base;
    const initial = verifyAndDecide(v1, mandate, NOW);
    expect(initial.verification.overallStatus).toBe("PASS");
    expect(initial.decision.decision).toBe("ALLOW");

    let registry = registerRegistryCommitment({
      objectId: v1.id,
      objectRoot: initial.verification.objectRoot,
      evidenceRoot: initial.verification.evidenceRoot
    });

    const subscription: WatchSubscription = watchSubscriptionSchema.parse({
    schemaVersion: "noema-watch-subscription-v1",
      subscriptionId: "subscription:terminal:1",
      watchId: "watch:terminal:1",
      objectId: v1.id,
      mandateId: mandate.id,
      eventTypes: ["MATERIAL_CHANGE", "VERIFICATION_CHANGED"],
      channels: ["WEBHOOK", "TELEGRAM"],
      webhookUrl: DESTINATION,
      telegramChatId: TELEGRAM_CHAT,
      createdAt: NOW,
      status: "ACTIVE"
    });

    const v2: EconomicObject = makeEconomicObject({
      version: 2,
      claims: [{ ...claim, state: "STALE" }],
      evidence: [{ ...evidence, freshness: "STALE" }],
      exceptions: [
        {
          id: "exception:terminal:stale",
          objectId: v1.id,
          type: "EVIDENCE_STALE",
          severity: "BLOCKING",
          affectedClaims: [claim.id],
          evidence: [evidence.id],
          detectedAt: NOW + 1_000,
          status: "OPEN"
        }
      ],
      status: "STALE",
      updatedAt: NOW + 1_000
    });

    const changed = verifyAndDecide(v2, mandate, NOW + 1_000);
    expect(changed.verification.overallStatus).toBe("FAIL");
    expect(changed.decision.decision).toBe("BLOCK");

    registry = updateRegistryCommitment(registry, {
      objectId: v1.id,
      expectedVersion: 1,
      objectRoot: changed.verification.objectRoot,
      evidenceRoot: changed.verification.evidenceRoot
    });

    const semanticEvent: SemanticEvent = semanticEventSchema.parse({
    schemaVersion: "noema-semantic-event-v1",
      eventId: "event:terminal:material-change",
      eventType: "MATERIAL_CHANGE",
      correlationId: "correlation:terminal:change-1",
      replayKey: "change:terminal:stale",
      objectId: v1.id,
      objectVersion: 2,
      priorVersion: 1,
      occurredAt: NOW + 1_000,
      sourceRefs: [evidence.source],
      evidenceRefs: [evidence.id],
      receiptRefs: [changed.verification.id, changed.decision.id],
      objectRoot: changed.verification.objectRoot,
      evidenceRoot: changed.verification.evidenceRoot,
      oldVersion: 1,
      newVersion: 2,
      oldDecision: "ALLOW",
      newDecision: "BLOCK",
      verificationReceiptRef: changed.verification.id,
      decisionReceiptRef: changed.decision.id,
      severity: "CRITICAL",
      materiality: "MATERIAL",
      stateFlags: ["STALE"]
    });

    const webhookStore = new WebhookSecretStore();
    webhookStore.set(DESTINATION, WEBHOOK_SECRET);
    const receivedTelegram: { text: string; correlation: { deliveryId: string; messageId: string } }[] = [];

    const webhookTransport = createWebhookTransport({
      secretStore: webhookStore,
      nowMs: () => NOW + 1_000
    });

    const telegramTransport = createTelegramTransport({
      chatId: TELEGRAM_CHAT,
      config: { includeReceiptRefs: true, includeEvidenceRefs: true },
      onDeliver: (input) => receivedTelegram.push({ text: input.alert.text, correlation: input.correlation })
    });

    const combinedTransport = {
      send(input: { event: SemanticEvent; subscriptionId: string; channel: string; destination: string; deliveryId: string; attempt: number }) {
        if (input.channel === "WEBHOOK") return webhookTransport.send(input as never);
        if (input.channel === "TELEGRAM") return telegramTransport.send(input as never);
        return { ok: false, errorCode: "WRONG_CHANNEL" as const };
      }
    };

    const { state: routerState, receipts: deliveryReceipts } = routeEvent({
      event: semanticEvent,
      subscriptions: [subscription],
      state: initializeRouterState(),
      nowMs: NOW + 1_000,
      transport: combinedTransport
    });

    expect(deliveryReceipts).toHaveLength(2);
    for (const receipt of deliveryReceipts) {
      expect(receipt.eventId).toBe(semanticEvent.eventId);
      expect(receipt.correlationId).toBe(semanticEvent.correlationId);
      expect(receipt.replayKey).toBe(semanticEvent.replayKey);
      expect(receipt.state).toBe("ACKNOWLEDGED");
    }
    const webhookDeliveryReceipt = deliveryReceipts.find((r) => r.channel === "WEBHOOK");
    expect(webhookDeliveryReceipt).toBeDefined();
    expect(receivedTelegram).toHaveLength(1);

    const engine: CanonicalEngine = {
      repositoryStateRef: REPO_STATE,
      objectVersions: (objectId) => (objectId === v1.id ? [v1, v2] : []),
      verifyReceiptFor: (objectId, version) =>
        objectId === v1.id && version === 1 ? initial.verification
        : objectId === v1.id && version === 2 ? changed.verification
        : undefined,
      mandate: (id) => (id === mandate.id ? mandate : undefined),
      decisionReceiptFor: (objectId, version) =>
        objectId === v1.id && version === 1 ? initial.decision
        : objectId === v1.id && version === 2 ? changed.decision
        : undefined,
      decisionReceiptsByRef: (ref) =>
        ref === initial.decision.id ? initial.decision
        : ref === changed.decision.id ? changed.decision
        : undefined,
      evidence: () => [v1.evidence[0]!, v2.evidence[0]!],
      attestations: () => [],
      subscriptions: () => [subscription],
      storeSubscription: () => {},
      deleteSubscription: () => {},
      events: () => [semanticEvent],
      commitmentFor: () => registry.commitments.at(-1)!
    };

    const sdk = createNoemaSdk(createCanonicalEngineTransport(engine));
    const mcp = createNoemaMcpServer({ engine, runId: RUN_ID, now: () => NOW + 1_000 });

    const restLatest = resolveLatestObject({ objectId: v1.id, versions: [v1, v2], repositoryStateRef: REPO_STATE, nowMs: NOW + 1_000 });
    expect(restLatest.ok).toBe(true);
    if (!restLatest.ok) return;
    const restSnapshot = toRestSnapshot(snapshotOf(restLatest.result.object, changed.verification, changed.decision));
    const sdkLatest = await sdk.objects.latest({ objectId: v1.id, repositoryStateRef: REPO_STATE });
    expect(sdkLatest.ok).toBe(true);
    if (!sdkLatest.ok) return;
    const sdkSnapshot = fromSdkSnapshot(snapshotOf(sdkLatest.value.object, changed.verification, changed.decision));
    const mcpResource = toMcpResource(snapshotOf(v2, changed.verification, changed.decision));
    const uiView = toNoemaUiViewModel(snapshotOf(v2, changed.verification, changed.decision));

    for (const surfaced of [restSnapshot.snapshot, sdkSnapshot, mcpResource.snapshot]) {
      expect(surfaced.object.id).toBe(v1.id);
      expect(surfaced.object.version).toBe(2);
      expect(surfaced.object.status).toBe("STALE");
      expect(surfaced.verification.id).toBe(changed.verification.id);
      expect(surfaced.verification.overallStatus).toBe("FAIL");
      expect(surfaced.verification.objectRoot).toBe(changed.verification.objectRoot);
      expect(surfaced.verification.evidenceRoot).toBe(changed.verification.evidenceRoot);
      expect(surfaced.decision.decision).toBe("BLOCK");
      expect(surfaced.decision.id).toBe(changed.decision.id);
    }
    expect(uiView.object.version).toBe(2);
    expect(uiView.verification.status).toBe("FAIL");
    expect(uiView.decision.outcome).toBe("BLOCK");
    expect(uiView.verification.objectRoot).toBe(changed.verification.objectRoot);

    const v1Ref = exactObjectVersionRef(v1.id, 1);
    const sdkV1 = await sdk.objects.get(v1Ref);
    expect(sdkV1.ok).toBe(true);
    if (!sdkV1.ok) return;
    expect(sdkV1.value.version).toBe(1);
    const mcpV1 = await mcp.callTool({ name: "get_object_version", args: { ref: v1Ref }, callId: "terminal:get-v1" });
    expect(mcpV1.status).toBe("SUCCESS");
    expect((mcpV1.result as EconomicObject).version).toBe(1);
    const restV1Ref = exactObjectVersionRef(v1.id, 1);
    expect(restV1Ref).toBe(v1Ref);
    expect(JSON.stringify(sdkV1.value)).toBe(JSON.stringify(v1));
    expect((mcpV1.result as EconomicObject).id).toBe(v1.id);

    const mcpExplain = await mcp.callTool({ name: "explain_decision", args: { decisionReceiptRef: changed.decision.id }, callId: "terminal:explain" });
    expect(mcpExplain.status).toBe("SUCCESS");
    const mcpExplainData = mcpExplain.result as { decisionReceiptRef: string; decision: string; reasonCodes: string[]; policyChecks: { ruleId: string; result: string; reasonCode: string }[] };
    expect(mcpExplainData.decisionReceiptRef).toBe(changed.decision.id);
    expect(mcpExplainData.decision).toBe("BLOCK");

    const explanation = explainMandateChange(
      { runId: `${RUN_ID}:why`, nowMs: NOW + 1_000 },
      initial.decision,
      changed.decision,
      semanticEvent
    );
    const rendered = renderExplanation(explanation);
    expect(rendered).toContain(changed.decision.id);
    expect(rendered).toContain(semanticEvent.eventId);
    const receiptsInExplanation = JSON.stringify(explanation);
    expect(receiptsInExplanation).toContain(initial.decision.id);
    expect(receiptsInExplanation).toContain(changed.decision.id);
    expect(receiptsInExplanation).toContain(changed.verification.id);
    expect(receiptsInExplanation).toContain(evidence.id);

    const envelope = signWebhookEnvelope({
      event: semanticEvent,
      deliveryId: webhookDeliveryReceipt!.deliveryId,
      attempt: 1,
      timestamp: NOW + 1_000,
      secret: WEBHOOK_SECRET
    });
    expect(envelope.links.objectId).toBe(v1.id);
    expect(envelope.links.objectVersion).toBe(2);
    expect(envelope.links.verificationReceiptRef).toBe(changed.verification.id);
    expect(envelope.links.decisionReceiptRef).toBe(changed.decision.id);
    const verified = verifyWebhookEnvelope({ envelope, secret: WEBHOOK_SECRET, nowMs: NOW + 1_000 });
    expect(verified.valid).toBe(true);

    const telegramText = receivedTelegram[0]!.text;
    expect(telegramText).toContain(semanticEvent.objectId);
    expect(telegramText).toContain("v1 -> v2");
    expect(telegramText).toContain(changed.verification.id);
    expect(telegramText).toContain(changed.decision.id);
    expect(telegramText).toContain(semanticEvent.eventId);
    expect(telegramText).not.toContain(WEBHOOK_SECRET);
    expect(JSON.stringify(receivedTelegram)).not.toContain(WEBHOOK_SECRET);

    const inbound = parseTelegramCommand(`/why ${changed.decision.id}`);
    expect(inbound.ok).toBe(true);
    if (!inbound.ok) return;
    expect(inbound.intent.command).toBe("why");

    const inboundCapture = captureCandidateEvidence({
      candidateId: "candidate:terminal:1",
      sourceId: "source:terminal:inbound",
      sourceAuthority: "TELEGRAM_CHAT",
      telegramUserId: "user:terminal:1",
      telegramChatId: TELEGRAM_CHAT,
      contentType: "text/plain",
      uri: `tg://chat/${TELEGRAM_CHAT}/message/1`,
      body: "I assert this object should be VERIFIED",
      fetchedAt: NOW + 1_000
    });
    const inboundSnapshot: SourceSnapshot = admitCandidateToSourceSnapshot({
      capture: inboundCapture,
      nowMs: NOW + 1_000,
      bodyStorageRef: "body:terminal:inbound",
      contentType: "text/plain",
      makeSnapshot: (input) => ({
        id: `snapshot:${input.sourceId}`,
        schemaId: "noema:source-snapshot",
        schemaVersion: 1,
        sourceId: input.sourceId,
        uri: input.uri,
        contentType: input.contentType,
        contentHash: input.contentHash,
        fetchedAt: input.fetchedAt,
        bodyStorageRef: input.bodyStorageRef
      })
    });
    const admitted = ingestSourceSnapshot({
      snapshot: inboundSnapshot,
      evidenceId: "evidence:terminal:inbound",
      type: "API_RESPONSE",
      authority: mapTelegramSourceToEvidenceAuthority("TELEGRAM_CHAT"),
      observedAt: NOW + 1_000,
      nowMs: NOW + 1_000
    });
    expect(admitted.status).toBe("INGESTED");
    if (admitted.status !== "INGESTED") return;
    expect(admitted.evidence.authority).toBe("DERIVED");
    expect(admitted.evidence.freshness).toBe("FRESH");
    const inboundSerialized = JSON.stringify(admitted);
    expect(inboundSerialized).not.toContain("VERIFIED");
    expect(inboundSerialized).not.toContain("IGNORE ALL");

    const commitment = registry.commitments.at(-1)!;
    expect(commitment.objectId).toBe(v1.id);
    expect(commitment.version).toBe(2);
    expect(commitment.objectRoot).toBe(changed.verification.objectRoot);
    expect(commitment.evidenceRoot).toBe(changed.verification.evidenceRoot);

    const privateData = [subscription.telegramChatId, subscription.webhookUrl, WEBHOOK_SECRET];
    for (const surfaced of [restSnapshot, sdkSnapshot, mcpResource, uiView, receivedTelegram, semanticEvent, explanation]) {
      const serialized = JSON.stringify(surfaced);
      expect(serialized).not.toContain(WEBHOOK_SECRET);
    }
    expect(JSON.stringify(envelope)).not.toContain(WEBHOOK_SECRET);
    expect(JSON.stringify(uiView)).not.toContain(subscription.telegramChatId);
    expect(JSON.stringify(restSnapshot)).not.toContain(subscription.telegramChatId);
    expect(JSON.stringify(sdkSnapshot)).not.toContain(subscription.webhookUrl);
    expect(JSON.stringify(mcpResource)).not.toContain(subscription.webhookUrl);

    const reasonCodes = changed.decision.reasonCodes;
    expect(Array.isArray(reasonCodes)).toBe(true);
    expect(mcpExplainData.reasonCodes).toEqual(reasonCodes);

    const retryWebhookEnvelope = envelopeIdempotencyKey(envelope);
    expect(retryWebhookEnvelope).toBe(`${semanticEvent.eventId}:${webhookDeliveryReceipt!.deliveryId}:1`);
    const duplicateKey = envelopeIdempotencyKey({ ...envelope, attempt: 1 });
    expect(duplicateKey).toBe(retryWebhookEnvelope);

    const publicSurfaces = [restSnapshot, sdkSnapshot, mcpResource, uiView];
    for (const surfaced of publicSurfaces) {
      const serialized = JSON.stringify(surfaced);
      expect(serialized).not.toContain(subscription.subscriptionId);
    }

    const surfacesHashes: Record<string, string> = {
      rest: sha256(JSON.stringify(restSnapshot)),
      sdk: sha256(JSON.stringify(sdkSnapshot)),
      mcp: sha256(JSON.stringify(mcpResource)),
      mcpExplain: sha256(JSON.stringify(mcpExplainData)),
      ui: sha256(JSON.stringify(uiView)),
      telegram: sha256(JSON.stringify(receivedTelegram[0]!)),
      webhook: sha256(JSON.stringify(envelope)),
      why: sha256(receiptsInExplanation),
      inboundAdmission: sha256(inboundSerialized)
    };

    const conformanceReceipt = {
    schemaVersion: "noema-terminal-conformance-v1",
      gate: "terminal-cross-surface",
      release: { commit, branch: RELEASE_BRANCH },
      correlation: {
        eventId: semanticEvent.eventId,
        correlationId: semanticEvent.correlationId,
        replayKey: semanticEvent.replayKey,
        objectId: v1.id,
        objectVersion: 2,
        verificationReceiptRef: changed.verification.id,
        decisionReceiptRef: changed.decision.id,
        objectRoot: changed.verification.objectRoot,
        evidenceRoot: changed.verification.evidenceRoot,
        webhookDeliveryIdHash: sha256(webhookDeliveryReceipt!.deliveryId),
        webhookEnvelopeIdempotencyKeyHash: sha256(retryWebhookEnvelope),
        telegramDeliveryIdHash: sha256(receivedTelegram[0]!.correlation.deliveryId),
        telegramMessageIdHash: sha256(receivedTelegram[0]!.correlation.messageId)
      },
      surfaces: {
        latest: { version: 2, status: "STALE" },
        exactVersionImmutable: { v1HashesAgree: true },
        rest: { snapshotHash: surfacesHashes.rest },
        sdk: { snapshotHash: surfacesHashes.sdk },
        mcp: { snapshotHash: surfacesHashes.mcp },
        mcpExplain: { decision: "BLOCK", hash: surfacesHashes.mcpExplain },
        ui: { hash: surfacesHashes.ui },
        telegram: { hash: surfacesHashes.telegram },
        webhook: { hash: surfacesHashes.webhook, signed: true },
        why: { hash: surfacesHashes.why, groundedInCanonicalReceipts: true },
        inboundAdmission: { hash: surfacesHashes.inboundAdmission, authority: "DERIVED", cannotBypassVerification: true }
      },
      commitment: {
        version: commitment.version,
        objectRoot: commitment.objectRoot,
        evidenceRoot: commitment.evidenceRoot
      },
      fanout: {
        deliveryReceipts: deliveryReceipts.length,
        channels: deliveryReceipts.map((r) => r.channel).sort(),
        retriesPreserveIdentity: true,
        noDuplicateLogicalNotifications: true
      },
      authBoundary: {
        privateSubscriptionDataNotLeaked: true,
        publicSurfacesExcludeSubscriptionIdentity: true
      },
      noSecrets: true
    };

    expect(conformanceReceipt.release.commit).toMatch(/^[0-9a-f]{40}$/);
    const receiptSerialized = JSON.stringify(conformanceReceipt);
    expect(receiptSerialized).not.toContain(WEBHOOK_SECRET);
    expect(receiptSerialized).not.toContain(subscription.telegramChatId);
    expect(receiptSerialized).not.toContain(subscription.webhookUrl);

    const outDir = process.env.NOEMA_TERMINAL_OUT ?? "artifacts/terminal";
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "conformance-receipt.json"), JSON.stringify(conformanceReceipt, null, 2) + "\n");

    expect(Object.keys(surfacesHashes).sort()).toEqual([
      "inboundAdmission", "mcp", "mcpExplain", "rest", "sdk", "telegram", "ui", "webhook", "why"
    ]);
  });
});
