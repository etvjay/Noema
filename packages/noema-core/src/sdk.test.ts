import { describe, expect, it } from "vitest";
import type { DecisionReceipt, EconomicObject, Mandate, VerificationReceipt } from "@noema/economic-kernel";
import { semanticEventSchema } from "@noema/schemas/events";
import type { SemanticEvent, WatchSubscription } from "@noema/schemas/events";
import { evaluateMandate } from "@noema/noema-core/mandate";
import { verifyEconomicObject } from "@noema/verification";
import {
  createCanonicalEngineTransport,
  createNoemaSdk,
  sdkVersion,
  validateWatchSubscriptionNoSecret,
  SDK_VERSION,
  type AttestationSummary,
  type CanonicalEngine
} from "@noema/noema-core/sdk";
import type { RegistryCommitment } from "@noema/noema-core/commitment";

const NOW = 1_700_000_004_000;
const REPO_STATE = "repository:state:sdk";

function baseObject(version: number, overrides: Partial<EconomicObject> = {}): EconomicObject {
  return {
    id: "object:sdk",
    version,
    classification: { primary: "TOKENIZED_TREASURY", secondary: [], confidence: 1, claimRef: "claim:sdk:1" },
    identifiers: [],
    representations: [],
    relationships: [],
    parties: [],
    rights: [],
    obligations: [],
    restrictions: [],
    economics: { asOf: NOW, values: {}, claimRefs: [] },
    claims: [],
    evidence: [
      {
        id: `evidence:sdk:${version}`,
        type: "API_RESPONSE",
        source: "source:sdk",
        contentHash: `0x${String(version).repeat(64)}`,
        observedAt: NOW,
        fetchedAt: NOW,
        authority: "DEMO_FIXTURE",
        freshness: "FRESH",
        metadata: {}
      }
    ],
    attestations: [],
    exceptions: [],
    provenance: { edges: [] },
    verification: {
      status: "UNRESOLVED",
      verifierVersion: "test",
      checks: []
    },
    status: "RESOLVED",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

const objectV1 = baseObject(1);
const objectV2 = baseObject(2);

const verificationV2: VerificationReceipt = verifyEconomicObject(objectV2, {
  nowMs: NOW,
  maxEvidenceAgeMs: 3_600_000
});

const mandate: Mandate = {
  id: "mandate:sdk",
  version: 1,
  principal: "treasury:sdk",
  objective: "Allow tokenized treasuries",
  allowedAssetClasses: ["TOKENIZED_TREASURY"],
  prohibitedAssetClasses: [],
  jurisdictions: [],
  requiredClaims: [],
  requiredEvidence: [{ type: "API_RESPONSE", maxAgeMs: 3_600_000 }],
  maxEvidenceAgeMs: 3_600_000
};

const decisionV2: DecisionReceipt = evaluateMandate(objectV2, verificationV2, mandate, { nowMs: NOW });

const events: SemanticEvent[] = [
  semanticEventSchema.parse({
    schemaVersion: "noema-semantic-event-v1",
    eventId: "event:sdk:material-1",
    eventType: "MATERIAL_CHANGE",
    correlationId: "correlation:sdk:1",
    replayKey: "change:sdk:1",
    objectId: "object:sdk",
    objectVersion: 2,
    priorVersion: 1,
    occurredAt: NOW,
    sourceRefs: ["source:sdk"],
    evidenceRefs: ["evidence:sdk:2"],
    receiptRefs: ["verification:sdk:2", "decision:sdk:2"],
    objectRoot: "0x2222222222222222222222222222222222222222222222222222222222222222",
    evidenceRoot: "0x1111111111111111111111111111111111111111111111111111111111111111",
    severity: "INFO",
    materiality: "MATERIAL",
    stateFlags: [],
    changeKind: "ECONOMIC_STATE",
    oldVersion: 1,
    newVersion: 2,
    oldDecision: "ALLOW",
    newDecision: "ALLOW",
    verificationReceiptRef: "verification:sdk:2",
    decisionReceiptRef: "decision:sdk:2"
  })
];

const subscriptions: WatchSubscription[] = [];

function decisionReceiptsByRef(ref: string): DecisionReceipt | undefined {
  return decisionV2.id === ref ? decisionV2 : undefined;
}

const commitment: RegistryCommitment = {
  objectId: "object:sdk",
  objectRoot: "0x2222222222222222222222222222222222222222222222222222222222222222",
  evidenceRoot: "0x1111111111111111111111111111111111111111111111111111111111111111",
  version: 2,
  active: true
};

const engine: CanonicalEngine = {
  repositoryStateRef: REPO_STATE,
  objectVersions: (objectId) => (objectId === "object:sdk" ? [objectV1, objectV2] : []),
  verifyReceiptFor: (objectId, version) => (objectId === "object:sdk" && version === 2 ? verificationV2 : undefined),
  mandate: (id) => (id === mandate.id ? mandate : undefined),
  decisionReceiptFor: (objectId, version) => (objectId === "object:sdk" && version === 2 ? decisionV2 : undefined),
  decisionReceiptsByRef,
  evidence: () => [objectV1.evidence[0]!, objectV2.evidence[0]!],
  attestations: () => [
    { id: "attestation:sdk:1", objectId: "object:sdk", claimRef: "claim:sdk:1", state: "ACTIVE", authority: "CUSTODIAN" } as AttestationSummary
  ],
  subscriptions: () => subscriptions,
  storeSubscription: (subscription) => subscriptions.push(subscription),
  deleteSubscription: (id) => {
    const idx = subscriptions.findIndex((subscription) => subscription.subscriptionId === id);
    if (idx !== -1) subscriptions.splice(idx, 1);
  },
  events: () => events,
  commitmentFor: (objectId) => (objectId === "object:sdk" ? commitment : undefined)
};

const transport = createCanonicalEngineTransport(engine);
const sdk = createNoemaSdk(transport);

describe("typed SDK", () => {
  it("is versioned", () => {
    expect(sdkVersion()).toBe(SDK_VERSION);
    expect(SDK_VERSION).toBe("noema-sdk-v1");
  });

  it("latest resolves the highest canonical version through the REST contract", async () => {
    const result = await sdk.objects.latest({ objectId: "object:sdk", repositoryStateRef: REPO_STATE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.object.version).toBe(2);
    expect(result.value.selection.selectedVersion).toBe(2);
    expect(result.value.selection.candidateVersions).toEqual([1, 2]);
    expect(result.value.selection.repositoryStateRef).toBe(REPO_STATE);
  });

  it("exact IDs and roots survive round trips without translation drift", async () => {
    const exact = await sdk.objects.get("objects/object:sdk/versions/2");
    expect(exact.ok).toBe(true);
    if (!exact.ok) return;
    expect(exact.value.id).toBe("object:sdk");
    expect(exact.value.version).toBe(2);
    expect(exact.value.evidence[0]!.id).toBe("evidence:sdk:2");

    const verification = await sdk.verification.get({ objectId: "object:sdk", version: 2 });
    expect(verification.ok).toBe(true);
    if (!verification.ok) return;
    expect(verification.value.objectRoot).toBe(verificationV2.objectRoot);
    expect(verification.value.evidenceRoot).toBe(verificationV2.evidenceRoot);
    expect(verification.value.objectId).toBe("object:sdk");
  });

  it("evaluates mandates server-side, never recomputing client-side", async () => {
    const decision = await sdk.mandates.evaluate({ objectId: "object:sdk", mandateId: "mandate:sdk", nowMs: NOW });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value).toEqual(decisionV2);
    expect(decision.value.decision).toBe(decisionV2.decision);
    expect(decision.value.reasonCodes).toEqual(decisionV2.reasonCodes);
  });

  it("decisions.get and explainReference preserve canonical reason codes", async () => {
    const decision = await sdk.decisions.get({ objectId: "object:sdk", version: 2 });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;

    const explanation = await sdk.decisions.explainReference({ decisionReceiptRef: decision.value.id });
    expect(explanation.ok).toBe(true);
    if (!explanation.ok) return;
    expect(explanation.value.decisionReceiptRef).toBe(decision.value.id);
    expect(explanation.value.decision).toBe(decision.value.decision);
    expect(explanation.value.reasonCodes).toEqual(decision.value.reasonCodes);
    expect(explanation.value.policyChecks.length).toBeGreaterThan(0);
  });

  it("watches.create validates event filters and delivery destinations without embedding secrets", async () => {
    const secret = "super-secret-destination-token";
    const subscription: WatchSubscription = {
      schemaVersion: "noema-watch-subscription-v1",
      subscriptionId: "subscription:sdk:1",
      watchId: "watch:sdk:1",
      objectId: "object:sdk",
      eventTypes: ["MATERIAL_CHANGE"],
      channels: ["WEBHOOK"],
      webhookUrl: "https://receiver.example/noema",
      createdAt: NOW,
      status: "ACTIVE"
    };

    const guard = validateWatchSubscriptionNoSecret({ subscription, candidateSecret: secret });
    expect(guard.ok).toBe(true);

    const created = await sdk.watches.create({ subscription });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.eventTypes).toContain("MATERIAL_CHANGE");
    expect(created.value.webhookUrl).toBe("https://receiver.example/noema");
    expect(JSON.stringify(created.value)).not.toContain(secret);
  });

  it("rejects watch subscriptions that would embed destination secrets", () => {
    const subscription: WatchSubscription = {
      schemaVersion: "noema-watch-subscription-v1",
      subscriptionId: "subscription:sdk:leak",
      watchId: "watch:sdk:leak",
      objectId: "object:sdk",
      eventTypes: ["MATERIAL_CHANGE"],
      channels: ["WEBHOOK"],
      webhookUrl: "https://receiver.example/noema",
      createdAt: NOW,
      status: "ACTIVE"
    };
    const withSecret = { ...subscription, webhookUrl: "https://receiver.example/noema?token=super-secret-destination-token" };
    const guard = validateWatchSubscriptionNoSecret({ subscription: withSecret, candidateSecret: "super-secret-destination-token" });
    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.error.code).toBe("VALIDATION_ERROR");
  });

  it("watches.get/list/delete round-trip canonical subscriptions", async () => {
    const subscription: WatchSubscription = {
      schemaVersion: "noema-watch-subscription-v1",
      subscriptionId: "subscription:sdk:2",
      watchId: "watch:sdk:2",
      objectId: "object:sdk",
      eventTypes: ["VERIFICATION_CHANGED"],
      channels: ["DISCORD"],
      discordChannel: "#treasury",
      createdAt: NOW,
      status: "ACTIVE"
    };
    await sdk.watches.create({ subscription });
    const got = await sdk.watches.get({ subscriptionId: "subscription:sdk:2" });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value.discordChannel).toBe("#treasury");

    const list = await sdk.watches.list({ pageSize: 10 });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.items.length).toBeGreaterThanOrEqual(2);

    const deleted = await sdk.watches.delete({ subscriptionId: "subscription:sdk:2" });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.value.deleted).toBe(true);

    const missing = await sdk.watches.get({ subscriptionId: "subscription:sdk:2" });
    expect(missing.ok).toBe(false);
  });

  it("events.list/get return canonical semantic events with deterministic cursors", async () => {
    const list = await sdk.events.list({ pageSize: 10 });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.items[0]!.eventId).toBe("event:sdk:material-1");
    expect(list.value.items[0]!.eventType).toBe("MATERIAL_CHANGE");

    const got = await sdk.events.get({ eventId: "event:sdk:material-1" });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value.objectId).toBe("object:sdk");
    expect(got.value.objectVersion).toBe(2);
  });

  it("commitments.get returns the X Layer commitment reference", async () => {
    const result = await sdk.commitments.get({ objectId: "object:sdk" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.objectId).toBe("object:sdk");
    expect(result.value.version).toBe(2);
    expect(result.value.active).toBe(true);
  });

  it("objects.versionHistory paginates deterministically", async () => {
    const history = await sdk.objects.versionHistory({ objectId: "object:sdk", order: "asc", pageSize: 1 });
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.value.items.map((item) => item.version)).toEqual([1]);
    expect(history.value.hasMore).toBe(true);
    expect(history.value.nextCursor).toBeTruthy();

    const page2 = await sdk.objects.versionHistory({ objectId: "object:sdk", cursor: history.value.nextCursor! });
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;
    expect(page2.value.items.map((item) => item.version)).toEqual([2]);
  });

  it("objects.compare uses canonical roots, never client-side equivalence", async () => {
    const comparison = await sdk.objects.compare({
      leftRef: "objects/object:sdk/versions/1",
      rightRef: "objects/object:sdk/versions/2"
    });
    expect(comparison.ok).toBe(true);
    if (!comparison.ok) return;
    expect(comparison.value.equivalenceDeterminedBy).toBe("canonical-roots");
    expect(comparison.value.versionDelta).toBe(1);
    expect(typeof comparison.value.sameCanonicalRoots).toBe("boolean");
  });

  it("returns typed errors preserving canonical machine-readable reason codes", async () => {
    const bad = await sdk.objects.get("objects/object:sdk/versions/not-a-number");
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.status).toBe("ERROR");
    expect(bad.error.code).toBe("MALFORMED_ID");
    expect(bad.error.operation).toBe("objects.get");

    const missing = await sdk.objects.get("objects/object:sdk/versions/9");
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.code).toBe("VERSION_NOT_FOUND");

    const noObject = await sdk.objects.latest({ objectId: "object:missing", repositoryStateRef: REPO_STATE });
    expect(noObject.ok).toBe(false);
    if (noObject.ok) return;
    expect(noObject.error.code).toBe("LATEST_UNAVAILABLE");
  });
});

describe("typed SDK example integration (latest -> evaluate -> watch -> inspect event)", () => {
  it("demonstrates the documented developer flow end to end", async () => {
    const latest = await sdk.objects.latest({ objectId: "object:sdk", repositoryStateRef: REPO_STATE });
    expect(latest.ok).toBe(true);
    if (!latest.ok) return;
    const selectedVersion = latest.value.selection.selectedVersion;

    const decision = await sdk.mandates.evaluate({
      objectId: "object:sdk",
      mandateId: "mandate:sdk",
      nowMs: NOW
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.objectVersion).toBe(selectedVersion);

    const watch: WatchSubscription = {
      schemaVersion: "noema-watch-subscription-v1",
      subscriptionId: "subscription:sdk:flow",
      watchId: "watch:sdk:flow",
      objectId: "object:sdk",
      mandateId: "mandate:sdk",
      eventTypes: ["MANDATE_DECISION_CHANGED", "MATERIAL_CHANGE"],
      channels: ["WEBHOOK"],
      webhookUrl: "https://receiver.example/noema",
      createdAt: NOW,
      status: "ACTIVE"
    };
    const created = await sdk.watches.create({ subscription: watch });
    expect(created.ok).toBe(true);

    const event = await sdk.events.get({ eventId: "event:sdk:material-1" });
    expect(event.ok).toBe(true);
    if (!event.ok) return;
    expect(event.value.eventType).toBe("MATERIAL_CHANGE");
    expect(event.value.objectVersion).toBe(selectedVersion);
  });
});export type { RegistryCommitment };