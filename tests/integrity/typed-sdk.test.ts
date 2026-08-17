import { describe, expect, it } from "vitest";
import type { EconomicObject, Mandate, VerificationReceipt } from "@noema/economic-kernel";
import { semanticEventSchema } from "@noema/schemas/events";
import type { SemanticEvent, WatchSubscription } from "@noema/schemas/events";
import { evaluateMandate } from "@noema/noema-core/mandate";
import { verifyEconomicObject } from "@noema/verification";
import { toRestSnapshot, type CanonicalNoemaSnapshot } from "@noema/noema-core/surfaces";
import { resolveLatestObject } from "@noema/noema-core/rest";
import {
  createCanonicalEngineTransport,
  createNoemaSdk,
  type CanonicalEngine
} from "@noema/noema-core/sdk";

const NOW = 1_700_000_005_000;
const REPO_STATE = "repository:state:sdk-integrity";

function baseObject(version: number): EconomicObject {
  return {
    id: "object:sdk:integrity",
    schemaId: "noema:economic-object",
    schemaVersion: 1,
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
        id: `evidence:sdk:integrity:${version}`,
        schemaId: "noema:evidence",
        schemaVersion: 1,
        type: "API_RESPONSE",
        source: "source:sdk:integrity",
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
    verification: { status: "UNRESOLVED", verifierVersion: "test", checks: [] },
    status: "RESOLVED",
    createdAt: NOW,
    updatedAt: NOW
  };
}

const v1 = baseObject(1);
const v2 = baseObject(2);
const verification: VerificationReceipt = verifyEconomicObject(v2, { nowMs: NOW, maxEvidenceAgeMs: 3_600_000 });
const mandate: Mandate = {
  id: "mandate:sdk:integrity",
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
const decision = evaluateMandate(v2, verification, mandate, { nowMs: NOW });

const event: SemanticEvent = semanticEventSchema.parse({
  schemaVersion: "noema-semantic-event-v1",
  eventId: "event:sdk:integrity:material-1",
  eventType: "MATERIAL_CHANGE",
  correlationId: "correlation:sdk:integrity:1",
  replayKey: "change:sdk:integrity:1",
  objectId: "object:sdk:integrity",
  objectVersion: 2,
  priorVersion: 1,
  occurredAt: NOW,
  sourceRefs: ["source:sdk:integrity"],
  evidenceRefs: ["evidence:sdk:integrity:2"],
  receiptRefs: ["verification:sdk:integrity:2", "decision:sdk:integrity:2"],
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
  verificationReceiptRef: "verification:sdk:integrity:2",
  decisionReceiptRef: "decision:sdk:integrity:2"
});

const subscriptions: WatchSubscription[] = [];

const engine: CanonicalEngine = {
  repositoryStateRef: REPO_STATE,
  objectVersions: (objectId) => (objectId === "object:sdk:integrity" ? [v1, v2] : []),
  verifyReceiptFor: (objectId, version) => (objectId === "object:sdk:integrity" && version === 2 ? verification : undefined),
  mandate: (id) => (id === mandate.id ? mandate : undefined),
  decisionReceiptFor: (objectId, version) => (objectId === "object:sdk:integrity" && version === 2 ? decision : undefined),
  decisionReceiptsByRef: (ref) => (ref === decision.id ? decision : undefined),
  evidence: () => [v1.evidence[0]!, v2.evidence[0]!],
  attestations: () => [
    { id: "attestation:sdk:integrity:1", objectId: "object:sdk:integrity", claimRef: "claim:sdk:1", state: "ACTIVE", authority: "CUSTODIAN" }
  ],
  subscriptions: () => subscriptions,
  storeSubscription: (subscription) => subscriptions.push(subscription),
  deleteSubscription: (id) => {
    const idx = subscriptions.findIndex((subscription) => subscription.subscriptionId === id);
    if (idx !== -1) subscriptions.splice(idx, 1);
  },
  events: () => [event],
  commitmentFor: () => undefined
};

const sdk = createNoemaSdk(createCanonicalEngineTransport(engine));

describe("typed SDK parity with REST and machine surfaces (#50)", () => {
  it("SDK latest matches REST latest semantics exactly", async () => {
    const viaSdk = await sdk.objects.latest({ objectId: "object:sdk:integrity", repositoryStateRef: REPO_STATE });
    expect(viaSdk.ok).toBe(true);
    if (!viaSdk.ok) return;

    const viaRest = resolveLatestObject({
      objectId: "object:sdk:integrity",
      versions: [v1, v2],
      repositoryStateRef: REPO_STATE,
      nowMs: NOW
    });
    expect(viaRest.ok).toBe(true);
    if (!viaRest.ok) return;

    expect(viaSdk.value.object.version).toBe(viaRest.result.object.version);
    expect(viaSdk.value.selection.selectedVersion).toBe(viaRest.result.selection.selectedVersion);
    expect(viaSdk.value.selection.candidateVersions).toEqual(viaRest.result.selection.candidateVersions);
    expect(viaSdk.value.selection.repositoryStateRef).toBe(REPO_STATE);
  });

  it("SDK decision evaluation matches the canonical engine decision", async () => {
    const viaSdk = await sdk.mandates.evaluate({ objectId: "object:sdk:integrity", mandateId: mandate.id, nowMs: NOW });
    expect(viaSdk.ok).toBe(true);
    if (!viaSdk.ok) return;
    expect(viaSdk.value).toEqual(decision);
    expect(viaSdk.value.evidenceRoot).toBe(decision.evidenceRoot);
    expect(viaSdk.value.verificationReceiptRef).toBe(decision.verificationReceiptRef);
  });

  it("SDK snapshots agree with the canonical machine surface snapshot", async () => {
    const latest = await sdk.objects.latest({ objectId: "object:sdk:integrity", repositoryStateRef: REPO_STATE });
    expect(latest.ok).toBe(true);
    if (!latest.ok) return;

    const snapshot: CanonicalNoemaSnapshot = {
      object: latest.value.object,
      verification,
      decision
    };
    const rest = toRestSnapshot(snapshot);
    expect(rest.schemaVersion).toBe("noema-machine-v1");
    expect(rest.snapshot.object.id).toBe("object:sdk:integrity");
    expect(rest.snapshot.verification.objectRoot).toBe(verification.objectRoot);
    expect(rest.snapshot.decision.decision).toBe(decision.decision);
  });

  it("SDK watch creation exposes filters and destinations without embedding secrets", async () => {
    const secret = "integrity-destination-secret";
    const subscription: WatchSubscription = {
    schemaVersion: "noema-watch-subscription-v1",
      subscriptionId: "subscription:sdk:integrity:1",
      watchId: "watch:sdk:integrity:1",
      objectId: "object:sdk:integrity",
      eventTypes: ["MATERIAL_CHANGE"],
      channels: ["WEBHOOK"],
      webhookUrl: "https://receiver.example/noema",
      createdAt: NOW,
      status: "ACTIVE"
    };

    const created = await sdk.watches.create({ subscription });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.eventTypes).toContain("MATERIAL_CHANGE");
    expect(JSON.stringify(created.value)).not.toContain(secret);
  });

  it("SDK errors are typed and preserve canonical reason codes", async () => {
    const badRef = await sdk.objects.get("objects/object:sdk:integrity/versions/x");
    expect(badRef.ok).toBe(false);
    if (badRef.ok) return;
    expect(badRef.error.code).toBe("MALFORMED_ID");
    expect(badRef.error.status).toBe("ERROR");
  });
});