#!/usr/bin/env node
// Versioned, immutable benchmark fixture generator for the adversarial
// multi-venue economic synchrony benchmark (#64).
//
// Run: node tools/synchrony-benchmark-fixture.mjs
// Output: fixtures/synchrony/benchmark-v1.json
//
// The fixture is intentionally frozen: a committed JSON manifest with a
// fixtureVersion and frozenAt timestamp. The generator exists only to keep
// the manifest maintainable; the committed JSON is the source of truth.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = resolve(ROOT, "fixtures/synchrony/benchmark-v1.json");

// ---- base economic object (schema-valid, reused from the CLI examples) ----
const baseObject = JSON.parse(
  readFileSync(resolve(ROOT, "apps/cli/examples/rwa-object.json"), "utf8")
);

// ---- shared venue/attestor scaffolding ----
const ATTESTORS = {
  "venue:fund-admin": "0x1111111111111111111111111111111111111111",
  "venue:fund-admin-2": "0x7777777777777777777777777777777777777777",
  "venue:oracle-a": "0x2222222222222222222222222222222222222222",
  "venue:oracle-b": "0x3333333333333333333333333333333333333333",
  "venue:transfer-agent": "0x4444444444444444444444444444444444444444",
  "venue:chain-observer": "0x5555555555555555555555555555555555555555",
  "venue:issuer": "0x6666666666666666666666666666666666666666"
};

const FROZEN_AT = "2026-08-19T15:00:00Z";

function fakeSignature(seed) {
  const hex = seed.padEnd(64, "a").slice(0, 64);
  return `0x${hex}`;
}

function envelope(overrides) {
  return {
    schemaId: "noema:venue-attestation",
    schemaVersion: 1,
    attestationId: `attestation:${overrides.attestationId}`,
    venueId: overrides.venueId,
    attestor: ATTESTORS[overrides.venueId],
    authorityScope: overrides.authorityScope,
    binding: {
      subjectRef: overrides.subjectRef ?? baseObject.id,
      objectRef: overrides.objectRef ?? baseObject.id,
      objectVersion: 1
    },
    evidenceRefs: overrides.evidenceRefs ?? [],
    sourceRefs: overrides.sourceRefs ?? [],
    provenance: {
      chainId: "eip155:1952",
      finality: "FINALIZED",
      observedAt: 1700000000000
    },
    nonce: overrides.nonce ?? 1,
    issuedAt: overrides.issuedAt ?? 1700000000000,
    signatureScheme: "EIP-712",
    signatureDomainVersion: "noema-venue-attestation-v1",
    signature: fakeSignature(`${overrides.attestationId}-${overrides.nonce ?? 1}`),
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
      nonce: overrides.nonce ?? 1,
      status: overrides.status ?? "ACTIVE",
      evidenceRefs: overrides.evidenceRefs,
      sourceRefs: [overrides.sourceRef ?? `source:${overrides.venueId}`],
      issuedAt: overrides.issuedAt
    }),
    observations: overrides.observations ?? [],
    claims: [
      {
        proposition: overrides.proposition,
        subject: overrides.subject ?? baseObject.id,
        value: overrides.value,
        ...(overrides.unit ? { unit: overrides.unit } : {}),
        observedAt: overrides.observedAt ?? 1700000000000,
        ...(overrides.sourceRef ? { sourceRef: overrides.sourceRef } : {}),
        evidenceRefs: overrides.evidenceRefs ?? []
      }
    ],
    receivedAt: overrides.receivedAt ?? 1700000000100
  };
}

// ---- policy templates ----
function policy(venueCapabilities, overrides) {
  const trusted = Object.entries(venueCapabilities).map(([venueId]) => ATTESTORS[venueId]);
  return {
    venueCapabilities,
    trustedAttestors: [...new Set(trusted)],
    nowMs: overrides?.nowMs ?? 1700000001000,
    ...(overrides?.requireFinalizedObservations !== undefined
      ? { requireFinalizedObservations: overrides.requireFinalizedObservations }
      : {}),
    ...(overrides?.lateEvidenceThresholdMs !== undefined
      ? { lateEvidenceThresholdMs: overrides.lateEvidenceThresholdMs }
      : {}),
    ...(overrides?.maxEvidenceAgeMs !== undefined
      ? { maxEvidenceAgeMs: overrides.maxEvidenceAgeMs }
      : {})
  };
}

const FUND_ADMIN = { role: "FUND_ADMINISTRATOR", propositions: ["NAV", "VALUATION"] };
const ORACLE = { role: "ORACLE", propositions: ["OBSERVED_PRICE", "MARKET_DATA"] };
const TRANSFER_AGENT = { role: "TRANSFER_AGENT", propositions: ["SHARE_REGISTER_BALANCE", "TRANSFER_RESTRICTIONS"] };
const CHAIN_OBSERVER = { role: "CHAIN_OBSERVER", propositions: ["BALANCE", "ONCHAIN_EVENT"] };
const ISSUER = { role: "ISSUER", propositions: ["ISSUANCE", "RIGHTS", "SHARE_CLASS_DEFINITION"] };

// ---- cases ----
const cases = [];

// 1. out-of-order observations: three venues agree on NAV value, delivered in varied order.
cases.push({
  id: "out-of-order-agreement",
  label: "out-of-order-observations",
  description: "Three venues report agreeing NAV/price values in conflicting arrival order",
  object: baseObject,
  deliveries: [
    delivery({ deliveryId: "fund-admin:1", venueId: "venue:fund-admin", authorityScope: FUND_ADMIN, proposition: "NAV", value: "1.000000", receivedAt: 1700000000200 }),
    delivery({ deliveryId: "oracle-a:1", venueId: "venue:oracle-a", authorityScope: ORACLE, proposition: "OBSERVED_PRICE", value: "1.000000", receivedAt: 1700000000100 }),
    delivery({ deliveryId: "oracle-b:1", venueId: "venue:oracle-b", authorityScope: ORACLE, proposition: "OBSERVED_PRICE", value: "1.000000", receivedAt: 1700000000300 })
  ],
  policy: policy({ "venue:fund-admin": "FUND_ADMINISTRATOR", "venue:oracle-a": "ORACLE", "venue:oracle-b": "ORACLE" }),
  permute: true,
  expect: {
    admitted: 3,
    conflicts: 0,
    orderInvariant: true,
    finalStatus: "RESOLVED"
  }
});

// 2. conflicting authoritative attestations: two fund administrators disagree on NAV.
cases.push({
  id: "conflicting-authoritative",
  label: "conflicting-authoritative-attestations",
  description: "Two authoritative fund administrator venues attest different NAV values for the same subject/proposition",
  object: baseObject,
  deliveries: [
    delivery({ deliveryId: "fund-admin:1", venueId: "venue:fund-admin", authorityScope: FUND_ADMIN, proposition: "NAV", value: "1.000000", nonce: 1 }),
    delivery({ deliveryId: "fund-admin-2:1", venueId: "venue:fund-admin-2", authorityScope: FUND_ADMIN, proposition: "NAV", value: "1.100000", nonce: 1 })
  ],
  policy: policy({ "venue:fund-admin": "FUND_ADMINISTRATOR", "venue:fund-admin-2": "FUND_ADMINISTRATOR" }),
  permute: true,
  expect: {
    admitted: 2,
    conflicts: 1,
    orderInvariant: true,
    silentConflictLoss: false,
    finalStatus: "CONFLICTING"
  }
});

// 3. duplicate delivery: the same delivery replayed/retried.
cases.push({
  id: "duplicate-delivery",
  label: "duplicate-delivery",
  description: "The identical venue delivery is delivered twice (retry/replay); must be idempotent",
  object: baseObject,
  deliveries: [
    delivery({ deliveryId: "fund-admin:1", venueId: "venue:fund-admin", authorityScope: FUND_ADMIN, proposition: "NAV", value: "1.000000" }),
    delivery({ deliveryId: "fund-admin:1", venueId: "venue:fund-admin", authorityScope: FUND_ADMIN, proposition: "NAV", value: "1.000000" })
  ],
  policy: policy({ "venue:fund-admin": "FUND_ADMINISTRATOR" }),
  permute: false,
  expect: {
    admitted: 2,
    duplicatesDropped: 1,
    conflicts: 0,
    finalStatus: "RESOLVED"
  }
});

// 4. late authoritative evidence: authoritative NAV arrives after threshold.
cases.push({
  id: "late-authoritative-evidence",
  label: "late-authoritative-evidence",
  description: "Authoritative evidence arrives with skew beyond lateEvidenceThresholdMs",
  object: baseObject,
  deliveries: [
    delivery({
      deliveryId: "fund-admin:1",
      venueId: "venue:fund-admin",
      authorityScope: FUND_ADMIN,
      proposition: "NAV",
      value: "1.000000",
      observedAt: 1700000000000,
      receivedAt: 1700000002000
    })
  ],
  policy: policy({ "venue:fund-admin": "FUND_ADMINISTRATOR" }, { lateEvidenceThresholdMs: 500 }),
  permute: false,
  expect: {
    admitted: 1,
    conflicts: 0,
    lateVisible: true,
    finalStatus: "RESOLVED"
  }
});

// 5. stale evidence: evidence referenced by the delivery is stale per maxEvidenceAgeMs.
cases.push({
  id: "stale-evidence",
  label: "stale-evidence",
  description: "Venue delivery references evidence older than the policy maxEvidenceAgeMs",
  object: baseObject,
  deliveries: [
    delivery({
      deliveryId: "fund-admin:1",
      venueId: "venue:fund-admin",
      authorityScope: FUND_ADMIN,
      proposition: "NAV",
      value: "1.000000",
      evidenceRefs: ["evidence:rwa:nav"]
    })
  ],
  policy: policy({ "venue:fund-admin": "FUND_ADMINISTRATOR" }, { maxEvidenceAgeMs: 1 }),
  evidenceIndex: { "evidence:rwa:nav": { observedAt: 1700000000000 } },
  permute: false,
  expect: {
    admitted: 0,
    rejected: ["delivery:fund-admin:1"],
    staleHandled: true,
    finalStatus: "RESOLVED"
  }
});

// 6. expired/revoked attestation: envelope status is REVOKED.
cases.push({
  id: "revoked-attestation",
  label: "expired-revoked-attestation",
  description: "A venue attestation envelope is REVOKED and must not be admitted",
  object: baseObject,
  deliveries: [
    delivery({ deliveryId: "fund-admin:1", venueId: "venue:fund-admin", authorityScope: FUND_ADMIN, proposition: "NAV", value: "1.000000", status: "REVOKED" })
  ],
  policy: policy({ "venue:fund-admin": "FUND_ADMINISTRATOR" }),
  permute: false,
  expect: {
    admitted: 0,
    rejected: ["delivery:fund-admin:1"],
    revocationHandled: true,
    finalStatus: "RESOLVED"
  }
});

// 7. valid but wrong-scope attestation: attestor is trusted but claims a proposition outside its scope.
cases.push({
  id: "wrong-scope-attestation",
  label: "valid-but-wrong-scope-attestation",
  description: "A trusted ORACLE venue attempts to attest NAV (out of scope for ORACLE)",
  object: baseObject,
  deliveries: [
    delivery({
      deliveryId: "oracle-a:1",
      venueId: "venue:oracle-a",
      authorityScope: { role: "ORACLE", propositions: ["NAV"] },
      proposition: "NAV",
      value: "1.000000"
    })
  ],
  policy: policy({ "venue:oracle-a": "ORACLE" }),
  permute: false,
  expect: {
    admitted: 0,
    rejected: ["delivery:oracle-a:1"],
    unauthorizedScopePromotion: false,
    finalStatus: "RESOLVED"
  }
});

// 8. representation/share-class mismatch: two representations of different share classes.
cases.push({
  id: "share-class-mismatch",
  label: "representation-share-class-mismatch",
  description: "Representation identities whose share classes differ must not be equivalent",
  object: baseObject,
  profile: {
    left: { shareClass: "A", issuerClaim: "arcadia-treasury-spv-i" },
    right: { shareClass: "B", issuerClaim: "arcadia-treasury-spv-i" }
  },
  deliveries: [],
  policy: policy({}),
  permute: false,
  expect: {
    equivalence: false,
    finalStatus: "RESOLVED"
  }
});

// 9. bridge/wrapper ambiguity: wrapped representation without bridge lineage.
cases.push({
  id: "bridge-wrapper-ambiguity",
  label: "bridge-wrapper-ambiguity",
  description: "A wrapped representation lacks explicit bridge lineage, so equivalence is unsupported",
  object: baseObject,
  profile: {
    left: { shareClass: "A", issuerClaim: "arcadia-treasury-spv-i" },
    right: { shareClass: "A", issuerClaim: "arcadia-treasury-spv-i" },
    linkType: "WRAPPED_REPRESENTATION_OF"
  },
  deliveries: [],
  policy: policy({}),
  permute: false,
  expect: {
    equivalence: false,
    finalStatus: "RESOLVED"
  }
});

// 10. chain reorg/superseded block state: observation PENDING requires finality policy gating.
cases.push({
  id: "chain-reorg-superseded",
  label: "chain-reorg-superseded-block",
  description: "Venue chain observation is PENDING/REORGED and the policy requires finalized observations",
  object: baseObject,
  deliveries: [
    {
      deliveryId: "delivery:chain-observer:1",
      venueId: "venue:chain-observer",
      attestation: envelope({
        attestationId: "chain-observer:balance",
        venueId: "venue:chain-observer",
        authorityScope: CHAIN_OBSERVER,
        evidenceRefs: [],
        sourceRefs: ["source:venue:chain-observer"]
      }),
      observations: [
        {
          schemaId: "noema:chain-observation",
          schemaVersion: 1,
          observationId: "observation:chain-observer:1",
          sourceId: "source:venue:chain-observer",
          provenance: {
            chainId: "eip155:1952",
            chainKind: "EVM",
            height: "12345",
            stateId: `0x${"7".repeat(64)}`,
            locator: "0x00000000000000000000000000000000000000AA",
            value: "100000000",
            finality: "PENDING",
            observedAt: 1700000000000,
            fetchedAt: 1700000000100,
            confirmationPolicy: "noema-chain-finality-v1"
          },
          contentHash: `0x${"8".repeat(64)}`,
          metadata: {}
        }
      ],
      claims: [
        {
          proposition: "BALANCE",
          subject: "representation:xlayer:fund-share",
          value: "100000000",
          observedAt: 1700000000000,
          evidenceRefs: []
        }
      ],
      receivedAt: 1700000000100
    }
  ],
  policy: policy({ "venue:chain-observer": "CHAIN_OBSERVER" }, { requireFinalizedObservations: true }),
  permute: false,
  expect: {
    admitted: 0,
    rejected: ["delivery:chain-observer:1"],
    reorgHandled: true,
    finalStatus: "RESOLVED"
  }
});

// 11. provider disagreement: two oracles disagree on observed price.
cases.push({
  id: "provider-disagreement",
  label: "provider-disagreement",
  description: "Two independent oracles attest conflicting observed prices",
  object: baseObject,
  deliveries: [
    delivery({ deliveryId: "oracle-a:1", venueId: "venue:oracle-a", authorityScope: ORACLE, proposition: "OBSERVED_PRICE", value: "1.000000" }),
    delivery({ deliveryId: "oracle-b:1", venueId: "venue:oracle-b", authorityScope: ORACLE, proposition: "OBSERVED_PRICE", value: "1.050000" })
  ],
  policy: policy({ "venue:oracle-a": "ORACLE", "venue:oracle-b": "ORACLE" }),
  permute: true,
  expect: {
    admitted: 2,
    conflicts: 1,
    orderInvariant: true,
    silentConflictLoss: false,
    finalStatus: "CONFLICTING"
  }
});

// 12. no-op vs material change: the first delivery is material, the identical
//     re-delivery of the already-applied NAV is a no-op that must not create a version.
cases.push({
  id: "no-op-vs-material",
  label: "no-op-vs-material-change",
  description: "Re-delivering the already-applied authoritative NAV is a no-op that must not create a version",
  object: baseObject,
  phases: [
    [
      delivery({ deliveryId: "fund-admin:1", venueId: "venue:fund-admin", authorityScope: FUND_ADMIN, proposition: "NAV", value: "1.000000", nonce: 1, receivedAt: 1700000000100 })
    ],
    [
      delivery({ deliveryId: "fund-admin:2", venueId: "venue:fund-admin", authorityScope: FUND_ADMIN, proposition: "NAV", value: "1.000000", nonce: 2, receivedAt: 1700000000200 })
    ]
  ],
  policy: policy({ "venue:fund-admin": "FUND_ADMINISTRATOR" }),
  permute: false,
  expect: {
    admitted: 1,
    conflicts: 0,
    phasesCreated: [true, false],
    spuriousVersion: false,
    finalStatus: "RESOLVED"
  }
});

// 13. event/retry replay: the same authoritative NAV is re-delivered with a
//     fresh delivery/attestation (identical content); must converge deterministically
//     with no conflict and no spurious version.
cases.push({
  id: "event-retry-replay",
  label: "event-retry-replay",
  description: "An identical authoritative NAV event is re-delivered; replay must be deterministic and conflict-free",
  object: baseObject,
  deliveries: [
    delivery({ deliveryId: "fund-admin:1", venueId: "venue:fund-admin", authorityScope: FUND_ADMIN, proposition: "NAV", value: "1.000000", nonce: 1, receivedAt: 1700000000100 }),
    delivery({ deliveryId: "fund-admin:2", venueId: "venue:fund-admin", authorityScope: FUND_ADMIN, proposition: "NAV", value: "1.000000", nonce: 2, receivedAt: 1700000000200 })
  ],
  policy: policy({ "venue:fund-admin": "FUND_ADMINISTRATOR" }),
  permute: true,
  expect: {
    admitted: 2,
    conflicts: 0,
    orderInvariant: true,
    supersededHandled: true,
    finalStatus: "RESOLVED"
  }
});

// 14. false-equivalence AI proposal: a proposal claiming economic equivalence on unsupported evidence.
cases.push({
  id: "false-equivalence-ai",
  label: "false-equivalence-ai-proposal",
  description: "AI proposes ECONOMICALLY_EQUIVALENT_TO on basis that cannot establish equivalence; must be rejected",
  object: baseObject,
  aiProposal: {
    relationship: {
      predicate: "ECONOMICALLY_EQUIVALENT_TO",
      subject: "representation:xlayer:fund-share",
      object: "representation:xlayer:fund-share-2",
      evidence: [],
      comparedDimensions: ["issuer"]
    }
  },
  deliveries: [],
  policy: policy({}),
  permute: false,
  expect: {
    equivalence: false,
    aiPromotionHandled: true,
    finalStatus: "RESOLVED"
  }
});

const fixture = {
  fixtureVersion: "noema-synchrony-benchmark-v1",
  frozenAt: FROZEN_AT,
  protocolVersion: "noema-synchrony-benchmark-protocol-v1",
  description: "Adversarial multi-venue economic synchrony benchmark corpus (#64)",
  attestors: ATTESTORS,
  cases
};

// ---- replay artifacts: deterministic CLI-replayable scenario files (#64) ----
// Each artifact carries the frozen object, the exact delivery ordering, and the
// full policy (including evidenceIndex) so `noema synchrony replay` can replay a
// preserved case — including a benchmark counterexample permutation — and
// converge to the identical synchronization root recorded in the raw runs.
const REPLAY_DIR = resolve(ROOT, "fixtures/synchrony/replay");
mkdirSync(REPLAY_DIR, { recursive: true });

function replayPolicy(caseDef) {
  const rawPolicy = { ...caseDef.policy };
  if (caseDef.evidenceIndex) {
    const objectEvidence = (caseDef.object.evidence ?? []) ?? [];
    rawPolicy.evidenceIndex = Object.fromEntries(
      Object.entries(caseDef.evidenceIndex).map(([ref, ev]) => [
        ref,
        { ...(objectEvidence.find((e) => e.id === ref) ?? {}), ...ev }
      ])
    );
  }
  return rawPolicy;
}

function writeReplayArtifact(caseId, deliveryOrder, suffix) {
  const caseDef = fixture.cases.find((candidate) => candidate.id === caseId);
  const scenario = {
    scenarioVersion: "noema-synchrony-replay-v1",
    fixtureVersion: fixture.fixtureVersion,
    frozenAt: fixture.frozenAt,
    caseId,
    replay: "deterministic",
    object: caseDef.object,
    deliveries: deliveryOrder,
    policy: replayPolicy(caseDef)
  };
  const fileName = `${caseId}${suffix ?? ""}.json`;
  writeFileSync(resolve(REPLAY_DIR, fileName), `${JSON.stringify(scenario, null, 2)}\n`);
}

for (const caseId of [
  "out-of-order-agreement",
  "conflicting-authoritative",
  "provider-disagreement",
  "event-retry-replay",
  "stale-evidence"
]) {
  const caseDef = fixture.cases.find((candidate) => candidate.id === caseId);
  if (caseDef.phases) continue;
  writeReplayArtifact(caseId, caseDef.deliveries, "");
}
writeReplayArtifact("out-of-order-agreement", [cases[0].deliveries[2], cases[0].deliveries[1], cases[0].deliveries[0]], "-permutation");

mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${FIXTURE_PATH} (${cases.length} cases)`);
console.log(`wrote ${REPLAY_DIR} (${REPLAY_DIR.endsWith("replay") ? "scenario artifacts" : ""})`);