#!/usr/bin/env node
// Versioned, immutable terminal-convergence fixture generator for the
// representation/attestation/synchrony terminal gate (#65).
//
// Run: node tools/terminal-convergence-fixture.mjs
// Output: fixtures/terminal/terminal-rwa-v1.json
//         fixtures/terminal/scenario/*.json (CLI-replayable artifacts)
//
// The committed JSON is the source of truth; the generator exists only to keep
// the manifest maintainable.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = resolve(ROOT, "fixtures/terminal/terminal-rwa-v1.json");
const SCENARIO_DIR = resolve(ROOT, "fixtures/terminal/scenario");

// ---- base economic object (schema-valid, reused from the CLI examples) ----
const baseObject = JSON.parse(
  readFileSync(resolve(ROOT, "apps/cli/examples/rwa-object.json"), "utf8")
);

const FROZEN_AT = "2026-08-19T18:00:00Z";

// ---- deterministic content hashes (no real documents; demo fixtures) ----
const H = {
  issuance: `0x${"1".repeat(64)}`,
  nav: `0x${"2".repeat(64)}`,
  price: `0x${"3".repeat(64)}`,
  onchain: `0x${"4".repeat(64)}`,
  registration: `0x${"5".repeat(64)}`
};

// ---- venue/attestor scaffolding (distinct observation times, no simultaneity) ----
const ATTESTORS = {
  "venue:issuer": "0x6666666666666666666666666666666666666666",
  "venue:fund-admin": "0x1111111111111111111111111111111111111111",
  "venue:oracle": "0x2222222222222222222222222222222222222222",
  "venue:chain-observer": "0x5555555555555555555555555555555555555555"
};

const T0 = 1_700_000_000_000;
const T1 = T0 + 1_000; // issuer observed
const T2 = T0 + 2_000; // oracle observed
const T3 = T0 + 3_000; // chain observed
const T4 = T0 + 4_000; // fund-admin observed
const RECEIVED_BASE = T0 + 5_000;

const ISSUER = { role: "ISSUER", propositions: ["ISSUANCE", "SHARE_CLASS_DEFINITION"] };
const FUND_ADMIN = { role: "FUND_ADMINISTRATOR", propositions: ["NAV", "VALUATION"] };
const ORACLE = { role: "ORACLE", propositions: ["OBSERVED_PRICE"] };
const CHAIN_OBSERVER = { role: "CHAIN_OBSERVER", propositions: ["BALANCE", "ONCHAIN_EVENT"] };

function fakeSignature(seed) {
  return `0x${createHash("sha256").update(seed, "utf8").digest("hex")}`;
}

function sourceSnapshot(id, contentHash, uri, fetchedAt) {
  return {
    id,
    schemaId: "noema:source-snapshot",
    schemaVersion: 1,
    sourceId: id,
    uri,
    contentType: "application/json",
    contentHash,
    fetchedAt,
    httpStatus: 200,
    bodyStorageRef: `storage:${id}`
  };
}

function evidence(id, source, type, authority, contentHash, observedAt, fetchedAt) {
  return {
    id,
    schemaId: "noema:evidence",
    schemaVersion: 1,
    type,
    source,
    contentHash,
    observedAt,
    fetchedAt,
    authority,
    freshness: "FRESH",
    metadata: { fixtureRole: "terminal-convergence" }
  };
}

const objectId = "object:rwa:treasury-fund";

// Venue attestation records for the object's attestation set (lineage resolution).
function attestationRecord(attestationId, attestor, claimRef, issuedAt) {
  return {
    id: attestationId,
    schemaId: "noema:attestation",
    schemaVersion: 1,
    subject: objectId,
    claimRef,
    schema: "noema:venue-economic-attestation",
    attestor,
    evidenceRoot: `0x${"e".repeat(64)}`,
    signature: fakeSignature(`${attestationId}-sig`),
    issuedAt,
    state: "ACTIVE"
  };
}

// Base object with a complete evidence set covering every venue claim ref.
const object = {
  ...baseObject,
  claims: baseObject.claims.map((claim) => ({
    ...claim,
    ...(claim.id === "claim:rwa:nav" ? { sourceRefs: ["source:fund-admin"] } : {})
  })),
  evidence: [
    evidence("evidence:rwa:registration", "source:issuer:primary", "FILING", "PRIMARY_SOURCE", H.registration, T0, T0),
    evidence("evidence:rwa:issuance", "source:issuer", "FILING", "PRIMARY_SOURCE", H.issuance, T1, T1),
    evidence("evidence:rwa:nav", "source:fund-admin", "API_RESPONSE", "PRIMARY_SOURCE", H.nav, T4, T4),
    evidence("evidence:rwa:price", "source:oracle", "API_RESPONSE", "MARKET_DATA", H.price, T2, T2),
    evidence("evidence:rwa:onchain", "source:chain-observer", "ONCHAIN_STATE", "ONCHAIN_STATE", H.onchain, T3, T3)
  ],
  provenance: {
    edges: [
      ...baseObject.provenance.edges,
      { id: "edge:rwa:classification", from: "claim:rwa:classification", to: "evidence:rwa:registration", relation: "SUPPORTED_BY" },
      { id: "edge:rwa:nav", from: "claim:rwa:nav", to: "evidence:rwa:nav", relation: "SUPPORTED_BY" },
      { id: "edge:rwa:redemption", from: "claim:rwa:redemption", to: "evidence:rwa:registration", relation: "SUPPORTED_BY" }
    ]
  },
  attestations: [
    attestationRecord("attestation:venue-issuer:SHARE_CLASS_DEFINITION", ATTESTORS["venue:issuer"], "claim:issuer:share-class", T1),
    attestationRecord("attestation:venue-oracle:OBSERVED_PRICE", ATTESTORS["venue:oracle"], "claim:oracle:price", T2),
    attestationRecord("attestation:venue-chain-observer:BALANCE", ATTESTORS["venue:chain-observer"], "claim:chain-observer:balance", T3),
    attestationRecord("attestation:venue-fund-admin:NAV", ATTESTORS["venue:fund-admin"], "claim:fund-admin:nav", T4)
  ]
};

const snapshots = [
  sourceSnapshot("source:issuer:primary", H.registration, "https://issuer.example/arcadia/registration.json", T0),
  sourceSnapshot("source:issuer", H.issuance, "https://issuer.example/arcadia/issuance.json", T1),
  sourceSnapshot("source:fund-admin", H.nav, "https://fund-admin.example/arcadia/nav.json", T4),
  sourceSnapshot("source:oracle", H.price, "https://oracle.example/arcadia/price.json", T2),
  sourceSnapshot("source:chain-observer", H.onchain, "https://chain-observer.example/arcadia/state.json", T3)
];

function envelope(overrides) {
  const nonce = overrides.nonce ?? 1;
  return {
    schemaId: "noema:venue-attestation",
    schemaVersion: 1,
    attestationId: `attestation:${overrides.attestationId}${nonce > 1 ? `:${nonce}` : ""}`,
    venueId: overrides.venueId,
    attestor: ATTESTORS[overrides.venueId],
    authorityScope: overrides.authorityScope,
    binding: {
      subjectRef: object.id,
      objectRef: object.id,
      objectVersion: 1
    },
    evidenceRefs: overrides.evidenceRefs,
    sourceRefs: [overrides.sourceRef],
    provenance: {
      chainId: "eip155:1952",
      finality: overrides.finality ?? "FINALIZED",
      observedAt: overrides.observedAt,
      fetchedAt: overrides.observedAt + 100
    },
    nonce,
    issuedAt: overrides.observedAt,
    signatureScheme: "EIP-712",
    signatureDomainVersion: "noema-venue-attestation-v1",
    signature: fakeSignature(`${overrides.attestationId}-${nonce}`),
    status: overrides.status ?? "ACTIVE",
    reasonCodes: []
  };
}

function delivery(overrides) {
  return {
    deliveryId: `delivery:${overrides.deliveryId}`,
    venueId: overrides.venueId,
    attestation: envelope({
      attestationId: `${overrides.venueId.replace(":", "-")}:${overrides.proposition}`,
      venueId: overrides.venueId,
      authorityScope: overrides.authorityScope,
      evidenceRefs: overrides.evidenceRefs,
      sourceRef: overrides.sourceRef,
      observedAt: overrides.observedAt,
      finality: overrides.finality,
      nonce: overrides.nonce ?? 1,
      status: overrides.status ?? "ACTIVE"
    }),
    observations: overrides.observations ?? [],
    claims: [
      {
        proposition: overrides.proposition,
        subject: overrides.subject ?? object.id,
        value: overrides.value,
        observedAt: overrides.observedAt,
        evidenceRefs: overrides.evidenceRefs
      }
    ],
    receivedAt: overrides.receivedAt ?? RECEIVED_BASE
  };
}

function chainObservation(venueId, finality, observedAt, value) {
  return {
    schemaId: "noema:chain-observation",
    schemaVersion: 1,
    observationId: `observation:${venueId}:1`,
    sourceId: `source:${venueId}`,
    provenance: {
      chainId: "eip155:1952",
      chainKind: "EVM",
      height: "12345",
      stateId: `0x${"7".repeat(64)}`,
      locator: "0x00000000000000000000000000000000000000AA",
      value,
      finality,
      observedAt,
      fetchedAt: observedAt + 100,
      confirmationPolicy: "noema-chain-finality-v1"
    },
    contentHash: H.onchain,
    metadata: {}
  };
}

// ---- phase 1: four independent venues agree (distinct observation times) ----
const phase1Deliveries = [
  delivery({
    deliveryId: "issuer:1",
    venueId: "venue:issuer",
    authorityScope: ISSUER,
    proposition: "SHARE_CLASS_DEFINITION",
    value: "class-a",
    evidenceRefs: ["evidence:rwa:issuance"],
    sourceRef: "source:issuer",
    observedAt: T1,
    receivedAt: T1 + 50
  }),
  delivery({
    deliveryId: "oracle:1",
    venueId: "venue:oracle",
    authorityScope: ORACLE,
    proposition: "OBSERVED_PRICE",
    value: "1.000000",
    evidenceRefs: ["evidence:rwa:price"],
    sourceRef: "source:oracle",
    observedAt: T2,
    receivedAt: T2 + 50
  }),
  delivery({
    deliveryId: "chain-observer:1",
    venueId: "venue:chain-observer",
    authorityScope: CHAIN_OBSERVER,
    proposition: "BALANCE",
    value: "100000000",
    evidenceRefs: ["evidence:rwa:onchain"],
    sourceRef: "source:chain-observer",
    observedAt: T3,
    receivedAt: T3 + 50,
    observations: [chainObservation("chain-observer", "FINALIZED", T3, "100000000")]
  }),
  delivery({
    deliveryId: "fund-admin:1",
    venueId: "venue:fund-admin",
    authorityScope: FUND_ADMIN,
    proposition: "NAV",
    value: "1.000000",
    evidenceRefs: ["evidence:rwa:nav"],
    sourceRef: "source:fund-admin",
    observedAt: T4,
    receivedAt: T4 + 50
  })
];

// ---- phase 2: late authoritative NAV (observed earlier, received much later) ----
const lateNavDelivery = delivery({
  deliveryId: "fund-admin:2",
  venueId: "venue:fund-admin",
  authorityScope: FUND_ADMIN,
  proposition: "NAV",
  value: "1.000000",
  evidenceRefs: ["evidence:rwa:nav"],
  sourceRef: "source:fund-admin",
  observedAt: T0, // observed before v1 formation
  receivedAt: T4 + 1_000_000, // arrives much later -> skew beyond threshold
  nonce: 2
});

// ---- phase 3: duplicate/no-op redelivery of the late NAV (same envelope/claim) ----
const noOpDelivery = {
  ...structuredClone(lateNavDelivery),
  deliveryId: "delivery:fund-admin:3",
  receivedAt: T4 + 1_000_100
};

// ---- phase 4: reorged chain observation (PENDING finality, policy requires finalized) ----
const reorgDelivery = {
  deliveryId: "delivery:chain-observer:2",
  venueId: "venue:chain-observer",
  attestation: envelope({
    attestationId: "chain-observer:balance",
    venueId: "venue:chain-observer",
    authorityScope: CHAIN_OBSERVER,
    evidenceRefs: ["evidence:rwa:onchain"],
    sourceRef: "source:chain-observer",
    observedAt: T3,
    finality: "PENDING",
    nonce: 2
  }),
  observations: [chainObservation("chain-observer", "PENDING", T3, "100000000")],
  claims: [
    {
      proposition: "BALANCE",
      subject: object.id,
      value: "100000000",
      observedAt: T3,
      evidenceRefs: ["evidence:rwa:onchain"]
    }
  ],
  receivedAt: T4 + 2_000_000
};

// ---- phase 5: revoked fund-admin attestation ----
const revokedNavDelivery = delivery({
  deliveryId: "fund-admin:4",
  venueId: "venue:fund-admin",
  authorityScope: FUND_ADMIN,
  proposition: "NAV",
  value: "1.100000",
  evidenceRefs: ["evidence:rwa:nav"],
  sourceRef: "source:fund-admin",
  observedAt: T4 + 10_000,
  receivedAt: T4 + 10_000 + 50,
  nonce: 4,
  status: "REVOKED"
});

// ---- policy ----
const policy = {
  venueCapabilities: {
    "venue:issuer": "ISSUER",
    "venue:fund-admin": "FUND_ADMINISTRATOR",
    "venue:oracle": "ORACLE",
    "venue:chain-observer": "CHAIN_OBSERVER"
  },
  trustedAttestors: Object.values(ATTESTORS),
  nowMs: T4 + 2_500_000,
  maxEvidenceAgeMs: 3_600_000,
  lateEvidenceThresholdMs: 100_000,
  requireFinalizedObservations: true
};

// ---- mandate: requires the venue-attested claims to be action-authoritative ----
const mandate = {
  id: "mandate:terminal:rwa-treasury",
  version: 1,
  principal: "treasury:terminal",
  objective: "Hold fresh verified tokenized Treasury exposure across issuer, fund administration, oracle, and onchain venues",
  allowedAssetClasses: ["TOKENIZED_TREASURY"],
  prohibitedAssetClasses: [],
  jurisdictions: [],
  requiredClaims: [
    { property: "SHARE_CLASS_DEFINITION", requiredState: "ATTESTED" },
    { property: "OBSERVED_PRICE", requiredState: "ATTESTED" },
    { property: "BALANCE", requiredState: "ATTESTED" },
    { property: "NAV", requiredState: "ATTESTED" }
  ],
  requiredEvidence: [
    { type: "API_RESPONSE", maxAgeMs: 3_600_000 },
    { type: "FILING", maxAgeMs: 3_600_000 },
    { type: "ONCHAIN_STATE", maxAgeMs: 3_600_000 }
  ],
  maxEvidenceAgeMs: 3_600_000
};

// ---- representation identities: evidence-derived lineage, no ticker/name basis ----
const representationIdentities = [
  {
    schemaId: "noema:representation-identity",
    schemaVersion: 1,
    representationId: "representation:rwa:fund-share",
    economicObjectRef: object.id,
    locator: "ledger://arcadia/fund-share/class-a",
    shareClass: "class-a",
    generation: 1,
    lineage: [],
    supersedes: undefined,
    validFrom: T0,
    issuerRef: "venue:issuer",
    administratorRef: "venue:fund-admin",
    identifiers: [],
    evidenceRefs: ["evidence:rwa:issuance", "evidence:rwa:nav"],
    attestationRefs: ["attestation:venue-issuer:SHARE_CLASS_DEFINITION"],
    status: "ACTIVE"
  },
  {
    schemaId: "noema:representation-identity",
    schemaVersion: 1,
    representationId: "representation:xlayer:wrapped",
    economicObjectRef: object.id,
    locator: "xlayer:0x0000000000000000000000000000000000000abc",
    shareClass: "class-a",
    generation: 2,
    originRepresentation: "representation:rwa:fund-share",
    lineage: [
      {
        kind: "WRAPPED_REPRESENTATION_OF",
        from: "representation:xlayer:wrapped",
        to: "representation:rwa:fund-share",
        evidenceRefs: ["evidence:rwa:onchain", "evidence:rwa:issuance"],
        attestationRefs: ["attestation:venue-chain-observer:BALANCE"],
        observedAt: T3,
        status: "ACTIVE"
      }
    ],
    supersedes: undefined,
    validFrom: T3,
    issuerRef: "venue:issuer",
    administratorRef: "venue:fund-admin",
    identifiers: [],
    evidenceRefs: ["evidence:rwa:onchain", "evidence:rwa:issuance"],
    attestationRefs: ["attestation:venue-chain-observer:BALANCE"],
    status: "ACTIVE"
  }
];

// ---- Noema AI proposal: INFERRED claim, proposal-only ----
const aiProposal = {
  schemaVersion: "noema-ai-proposal-v1",
  proposalId: "proposal:terminal:nav-projection",
  sourceSnapshotRefs: ["source:fund-admin"],
  evidenceRefs: ["evidence:rwa:nav"],
  claims: [
    {
      id: "claim:ai:nav-projection",
      subject: object.id,
      property: "NAV",
      value: "1.05",
      basis: "INFERRED",
      confidence: 0.62,
      evidence: [
        {
          sourceSnapshotRef: "source:fund-admin",
          evidenceRef: "evidence:rwa:nav",
          locator: "https://fund-admin.example/arcadia/nav.json#current"
        }
      ]
    }
  ],
  rights: [],
  restrictions: [],
  relationships: [],
  conflicts: [],
  unresolvedIssues: []
};

const fixture = {
  fixtureVersion: "noema-terminal-convergence-v1",
  frozenAt: FROZEN_AT,
  protocolVersion: "noema-terminal-convergence-protocol-v1",
  description: "Terminal convergence scenario: one multi-venue RWA economic object end to end (#65)",
  object,
  snapshots,
  representations: representationIdentities,
  mandate,
  aiProposal,
  phases: {
    formation: phase1Deliveries,
    lateNav: [lateNavDelivery],
    noOp: [noOpDelivery],
    reorg: [reorgDelivery],
    revokedNav: [revokedNavDelivery]
  },
  policy,
  times: { T0, T1, T2, T3, T4, receivedBase: RECEIVED_BASE }
};

// ---- CLI-replayable scenario artifacts ----
function replayableScenario(deliveries) {
  return {
    scenarioVersion: "noema-terminal-replay-v1",
    fixtureVersion: fixture.fixtureVersion,
    frozenAt: fixture.frozenAt,
    replay: "deterministic",
    object: fixture.object,
    deliveries,
    policy: {
      venueCapabilities: fixture.policy.venueCapabilities,
      trustedAttestors: fixture.policy.trustedAttestors,
      nowMs: fixture.policy.nowMs,
      maxEvidenceAgeMs: fixture.policy.maxEvidenceAgeMs,
      lateEvidenceThresholdMs: fixture.policy.lateEvidenceThresholdMs,
      requireFinalizedObservations: fixture.policy.requireFinalizedObservations,
      evidenceIndex: Object.fromEntries(
        fixture.object.evidence.map((e) => [e.id, e])
      )
    }
  };
}

mkdirSync(SCENARIO_DIR, { recursive: true });
mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);

writeFileSync(
  resolve(SCENARIO_DIR, "scenario-v1.json"),
  `${JSON.stringify(replayableScenario(phase1Deliveries), null, 2)}\n`
);
writeFileSync(
  resolve(SCENARIO_DIR, "scenario-v2-late.json"),
  `${JSON.stringify(replayableScenario([lateNavDelivery]), null, 2)}\n`
);

console.log(`wrote ${FIXTURE_PATH}`);
console.log(`wrote ${SCENARIO_DIR}/scenario-v1.json`);
console.log(`wrote ${SCENARIO_DIR}/scenario-v2-late.json`);