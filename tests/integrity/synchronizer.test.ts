import { describe, expect, it } from "vitest";
import type { EconomicObject, Evidence, Hex, Ref, UnixMillis } from "@noema/economic-kernel";
import {
  deriveVenueDeliveryIdentityKey,
  reconcileVenueDeliveries,
  synchronizeEconomicObject,
  type SynchronizerPolicy,
  type VenueClaimProposal,
  type VenueDelivery
} from "@noema/noema-core/synchronizer";
import type { VenueEconomicAttestationEnvelope } from "@noema/noema-core/attestation";
import type { ChainObservation, ChainObservationProvenance } from "@noema/noema-core/observation";

const NOW: UnixMillis = 1_700_000_000_000;
const OBJECT_ID: Ref = "object:integrity:treasury";
const ATTESTOR: Ref = "0x0652d43faab944e65d01e351ed2626c4265677fc";
const VENUE_TA: Ref = "venue:transfer-agent";
const VENUE_ADMIN: Ref = "venue:fund-admin";
const BLOCK_A: Hex = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function baseObject(): EconomicObject {
  return {
    id: OBJECT_ID,
    version: 1,
    schemaId: "noema:economic-object",
    schemaVersion: 1,
    classification: {
      primary: "FIXED_INCOME",
      secondary: ["GOVERNMENT"],
      confidence: 1,
      claimRef: "claim:integrity:classification"
    },
    identifiers: [],
    representations: [],
    relationships: [],
    parties: [],
    rights: [],
    obligations: [],
    restrictions: [],
    economics: {
      asOf: NOW - 100_000,
      values: { principalAmount: "1000000" },
      claimRefs: ["claim:integrity:classification"]
    },
    claims: [],
    evidence: [],
    attestations: [],
    exceptions: [],
    provenance: { edges: [] },
    verification: {
      status: "UNRESOLVED",
      verifierVersion: "noema-verifier-v1",
      checks: []
    },
    status: "RESOLVED",
    createdAt: NOW - 100_000,
    updatedAt: NOW - 50_000
  };
}

function provenance(overrides: Partial<ChainObservationProvenance> = {}): ChainObservationProvenance {
  return {
    chainId: "eip155:196",
    chainKind: "EVM",
    height: "12345",
    stateId: BLOCK_A,
    account: "0x2222222222222222222222222222222222222222",
    locator: "eth_call:totalSupply()",
    value: "0x01",
    finality: "FINALIZED",
    observedAt: NOW - 5_000,
    fetchedAt: NOW - 5_000,
    confirmationPolicy: "noema:finality:v1:xlayer-testnet",
    ...overrides
  };
}

function observation(overrides: Partial<ChainObservation> = {}): ChainObservation {
  return {
    schemaId: "noema:chain-observation",
    schemaVersion: 1,
    observationId: "observation:integrity:1",
    sourceId: "rpc:xlayer:testnet",
    provenance: provenance(),
    contentHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    metadata: {},
    ...overrides
  };
}

function attestation(overrides: Partial<VenueEconomicAttestationEnvelope> = {}): VenueEconomicAttestationEnvelope {
  return {
    schemaId: "noema:venue-attestation",
    schemaVersion: 1,
    attestationId: "attestation:integrity:1",
    venueId: VENUE_TA,
    attestor: ATTESTOR,
    authorityScope: {
      role: "TRANSFER_AGENT",
      propositions: ["SHARE_REGISTER_OWNERSHIP", "SHARE_REGISTER_BALANCE"]
    },
    binding: { subjectRef: OBJECT_ID },
    evidenceRefs: ["evidence:integrity:1"],
    sourceRefs: [],
    provenance: {
      chainId: "eip155:196",
      blockNumber: "100",
      blockHash: BLOCK_A,
      finality: "FINALIZED",
      observedAt: NOW - 5_000,
      method: "attest"
    },
    nonce: 1,
    issuedAt: NOW - 5_000,
    signatureScheme: "EIP-712",
    signatureDomainVersion: "1",
    signature: "0x" + "a".repeat(130),
    status: "ACTIVE",
    reasonCodes: [],
    ...overrides
  };
}

function claim(overrides: Partial<VenueClaimProposal> = {}): VenueClaimProposal {
  return {
    proposition: "SHARE_REGISTER_BALANCE",
    subject: OBJECT_ID,
    value: "1000",
    observedAt: NOW - 5_000,
    evidenceRefs: ["evidence:integrity:1"],
    ...overrides
  };
}

function delivery(overrides: Partial<VenueDelivery> = {}): VenueDelivery {
  return {
    deliveryId: "delivery:integrity:1",
    venueId: VENUE_TA,
    attestation: attestation(),
    observations: [observation()],
    claims: [claim()],
    receivedAt: NOW - 1_000,
    ...overrides
  };
}

function evidenceFixture(): Evidence {
  return {
    id: "evidence:integrity:1",
    schemaId: "noema:evidence",
    schemaVersion: 1,
    type: "ATTESTATION",
    source: "source:integrity:1",
    contentHash: "0x" + "b".repeat(64),
    observedAt: NOW - 5_000,
    fetchedAt: NOW - 5_000,
    authority: "AUTHORIZED_ATTESTOR",
    freshness: "FRESH",
    metadata: {}
  };
}

function policy(overrides: Partial<SynchronizerPolicy> = {}): SynchronizerPolicy {
  return {
    venueCapabilities: {
      [VENUE_TA]: "TRANSFER_AGENT",
      [VENUE_ADMIN]: "FUND_ADMINISTRATOR"
    },
    trustedAttestors: new Set([ATTESTOR]),
    nowMs: NOW,
    evidenceIndex: { "evidence:integrity:1": evidenceFixture() },
    ...overrides
  };
}

function historyOf(object: EconomicObject) {
  return [{ object: structuredClone(object), changeId: "initial", material: true }];
}

describe("integrity: synchronizer reconciliation", () => {
  it("same logical input set yields the same canonical result regardless of delivery order", () => {
    const object = baseObject();
    const deliveries = [
      delivery(),
      delivery({
        deliveryId: "delivery:integrity:2",
        attestation: attestation({ attestationId: "attestation:integrity:2", nonce: 2 }),
        claims: [claim({ proposition: "SHARE_REGISTER_OWNERSHIP", value: "owner:alice" })],
        receivedAt: NOW - 500
      })
    ];

    const forward = reconcileVenueDeliveries({
      object,
      history: historyOf(object),
      deliveries,
      policy: policy()
    });
    const reversed = reconcileVenueDeliveries({
      object,
      history: historyOf(object),
      deliveries: [...deliveries].reverse(),
      policy: policy()
    });

    expect(forward.synchronizationRoot).toBe(reversed.synchronizationRoot);
    expect(forward.candidate.status).toBe("RESOLVED");
    expect(forward.applied.map((entry) => entry.claimId).sort()).toEqual(
      reversed.applied.map((entry) => entry.claimId).sort()
    );
  });

  it("duplicate events are idempotent and cannot create extra object versions", () => {
    const object = baseObject();
    const single = synchronizeEconomicObject({
      object,
      history: historyOf(object),
      deliveries: [delivery()],
      policy: policy()
    });
    const duplicated = synchronizeEconomicObject({
      object,
      history: historyOf(object),
      deliveries: [delivery(), delivery(), delivery()],
      policy: policy()
    });

    expect(duplicated.reconciliation.duplicatesDropped).toBe(2);
    expect(duplicated.created).toBe(single.created);
    expect(duplicated.history).toHaveLength(single.history.length);
    expect(duplicated.reconciliation.synchronizationRoot).toBe(
      single.reconciliation.synchronizationRoot
    );
  });

  it("late evidence affects current interpretation while preserving historical versions", () => {
    const object = baseObject();
    const first = synchronizeEconomicObject({
      object,
      history: historyOf(object),
      deliveries: [delivery()],
      policy: policy()
    });

    const late = synchronizeEconomicObject({
      object: first.current.object,
      history: first.history,
      deliveries: [
        delivery({
          deliveryId: "delivery:integrity:late",
          attestation: attestation({
            attestationId: "attestation:integrity:late",
            nonce: 3,
            provenance: {
              ...attestation().provenance,
              observedAt: NOW - 200_000
            }
          }),
          claims: [
            claim({
              proposition: "SHARE_REGISTER_OWNERSHIP",
              value: "owner:bob",
              observedAt: NOW - 200_000
            })
          ],
          receivedAt: NOW
        })
      ],
      policy: policy({ lateEvidenceThresholdMs: 10_000 })
    });

    expect(late.created).toBe(true);
    const ownership = late.current.object.claims.find(
      (entry) => entry.property === "SHARE_REGISTER_OWNERSHIP"
    );
    expect(ownership?.value).toBe("owner:bob");
    expect(late.current.object.version).toBe(3);
    expect(first.history[0]!.object.version).toBe(1);
    expect(late.reconciliation.temporalSkew.some((skew) => skew.skewMs >= 199_000)).toBe(true);
  });

  it("conflicting authoritative propositions remain explicit conflict state", () => {
    const result = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries: [
        delivery(),
        delivery({
          deliveryId: "delivery:integrity:2",
          attestation: attestation({
            attestationId: "attestation:integrity:2",
            nonce: 2,
            binding: { subjectRef: OBJECT_ID, objectVersion: 1 }
          }),
          claims: [claim({ value: "999" })]
        })
      ],
      policy: policy()
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.unresolved).toBe(true);
    expect(result.conflicts[0]!.values).toEqual(["1000", "999"]);
    expect(result.candidate.status).toBe("CONFLICTING");
    expect(
      result.candidate.exceptions.some((exception) => exception.type === "EVIDENCE_CONFLICT")
    ).toBe(true);
  });

  it("a venue update only mutates propositions within its accepted authority scope", () => {
    const result = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries: [
        delivery({
          claims: [claim({ proposition: "NAV" })]
        })
      ],
      policy: policy()
    });

    expect(result.admitted[0]!.status).toBe("REJECTED");
    expect(result.admitted[0]!.reasonCodes).toContain("PROPOSITION_OUT_OF_SCOPE:NAV");
    expect(result.candidate.claims).toEqual([]);
    expect(result.applied).toEqual([]);
  });

  it("one logical material change produces exactly one new object version", () => {
    const object = baseObject();
    const result = synchronizeEconomicObject({
      object,
      history: historyOf(object),
      deliveries: [delivery()],
      policy: policy()
    });

    expect(result.created).toBe(true);
    expect(result.history).toHaveLength(2);
    expect(result.current.object.version).toBe(2);
    expect(result.current.material).toBe(true);
  });

  it("immaterial no-op observations do not create spurious versions", () => {
    const object = baseObject();
    const first = synchronizeEconomicObject({
      object,
      history: historyOf(object),
      deliveries: [delivery()],
      policy: policy()
    });
    const noop = synchronizeEconomicObject({
      object: first.current.object,
      history: first.history,
      deliveries: [delivery()],
      policy: policy()
    });

    expect(noop.created).toBe(false);
    expect(noop.history).toHaveLength(2);
  });

  it("temporal skew is inspectable in provenance and verification output", () => {
    const result = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries: [
        delivery({ receivedAt: NOW }),
        delivery({
          deliveryId: "delivery:integrity:2",
          attestation: attestation({ attestationId: "attestation:integrity:2", nonce: 2 }),
          claims: [
            claim({
              proposition: "SHARE_REGISTER_OWNERSHIP",
              observedAt: NOW - 60_000
            })
          ],
          receivedAt: NOW
        })
      ],
      policy: policy()
    });

    expect(result.temporalSkew.length).toBe(2);
    expect(result.temporalSkew.every((skew) => skew.skewMs >= 0)).toBe(true);
    expect(result.temporalSkew.some((skew) => skew.skewMs >= 59_000)).toBe(true);
    expect(result.applied.some((entry) => entry.skewMs >= 59_000)).toBe(true);
  });

  it("replaying the same admitted observations reproduces identical roots and version lineage", () => {
    const object = baseObject();
    const run = () => {
      const history = historyOf(object);
      const deliveries = [
        delivery(),
        delivery({
          deliveryId: "delivery:integrity:2",
          attestation: attestation({ attestationId: "attestation:integrity:2", nonce: 2 }),
          claims: [claim({ proposition: "SHARE_REGISTER_OWNERSHIP", value: "owner:alice" })],
          receivedAt: NOW - 100
        })
      ];
      return synchronizeEconomicObject({
        object,
        history,
        deliveries,
        policy: policy()
      });
    };

    const first = run();
    const second = run();
    const third = run();

    expect(first.reconciliation.synchronizationRoot).toBe(
      second.reconciliation.synchronizationRoot
    );
    expect(second.reconciliation.synchronizationRoot).toBe(
      third.reconciliation.synchronizationRoot
    );
    expect(first.history.map((record) => record.object.version)).toEqual(
      second.history.map((record) => record.object.version)
    );
  });

  it("property-based: permuted order and injected duplicates reproduce the canonical result", () => {
    function permutations<T>(items: T[]): T[][] {
      if (items.length <= 1) return [items];
      const result: T[][] = [];
      for (let index = 0; index < items.length; index += 1) {
        const rest = [...items.slice(0, index), ...items.slice(index + 1)];
        for (const perm of permutations(rest)) {
          result.push([items[index]!, ...perm]);
        }
      }
      return result;
    }

    const deliveries = [
      delivery(),
      delivery({
        deliveryId: "delivery:integrity:2",
        attestation: attestation({ attestationId: "attestation:integrity:2", nonce: 2 }),
        claims: [claim({ proposition: "SHARE_REGISTER_OWNERSHIP", value: "owner:alice" })],
        receivedAt: NOW - 100
      }),
      delivery({
        deliveryId: "delivery:integrity:3",
        venueId: VENUE_ADMIN,
        attestation: attestation({
          attestationId: "attestation:integrity:3",
          venueId: VENUE_ADMIN,
          nonce: 3,
          authorityScope: {
            role: "FUND_ADMINISTRATOR",
            propositions: ["NAV", "TOTAL_AUM"]
          },
          binding: { subjectRef: OBJECT_ID, objectVersion: 1 }
        }),
        claims: [claim({ proposition: "NAV", value: "10.5" })],
        receivedAt: NOW - 200
      })
    ];

    const baseline = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries,
      policy: policy()
    });

    for (const ordering of permutations(deliveries)) {
      const permuted = reconcileVenueDeliveries({
        object: baseObject(),
        history: historyOf(baseObject()),
        deliveries: ordering,
        policy: policy()
      });
      expect(permuted.synchronizationRoot).toBe(baseline.synchronizationRoot);
      expect(permuted.conflicts).toEqual(baseline.conflicts);
    }

    const withDuplicates = [...deliveries, delivery(), delivery(), delivery()];
    for (const ordering of permutations(withDuplicates)) {
      const permuted = reconcileVenueDeliveries({
        object: baseObject(),
        history: historyOf(baseObject()),
        deliveries: ordering,
        policy: policy()
      });
      expect(permuted.synchronizationRoot).toBe(baseline.synchronizationRoot);
      expect(permuted.duplicatesDropped).toBe(3);
    }

    expect(deriveVenueDeliveryIdentityKey(delivery())).toBe(
      deriveVenueDeliveryIdentityKey(delivery({ receivedAt: NOW + 30_000 }))
    );
  });
});