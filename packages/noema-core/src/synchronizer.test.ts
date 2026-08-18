import { describe, expect, it } from "vitest";
import type { EconomicObject, Evidence, Hex, Ref, UnixMillis } from "@noema/economic-kernel";
import {
  admitVenueDelivery,
  deriveSynchronizationRoot,
  deriveVenueDeliveryIdentityKey,
  reconcileVenueDeliveries,
  synchronizeEconomicObject,
  type ReconcileResult,
  type SynchronizeResult,
  type SynchronizerPolicy,
  type VenueClaimProposal,
  type VenueDelivery
} from "./synchronizer.js";
import type { VenueEconomicAttestationEnvelope } from "./attestation.js";
import type { ChainObservation, ChainObservationProvenance } from "./observation.js";
import type { EconomicObjectVersionRecord } from "./versioning.js";

const NOW: UnixMillis = 1_700_000_000_000;
const OBJECT_ID: Ref = "object:fixture:treasury";
const ATTESTOR: Ref = "0x0652d43faab944e65d01e351ed2626c4265677fc";
const VENUE_TA: Ref = "venue:transfer-agent";
const VENUE_ADMIN: Ref = "venue:fund-admin";
const VENUE_CUSTODIAN: Ref = "venue:custodian";

const BLOCK_A: Hex = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BLOCK_B: Hex = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

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
      claimRef: "claim:fixture:classification"
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
      claimRefs: ["claim:fixture:classification"]
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

function provenance(
  overrides: Partial<ChainObservationProvenance> = {}
): ChainObservationProvenance {
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
    observationId: "observation:fixture:1",
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
    attestationId: "attestation:fixture:1",
    venueId: VENUE_TA,
    attestor: ATTESTOR,
    authorityScope: {
      role: "TRANSFER_AGENT",
      propositions: ["SHARE_REGISTER_OWNERSHIP", "SHARE_REGISTER_BALANCE"]
    },
    binding: { subjectRef: OBJECT_ID },
    evidenceRefs: ["evidence:fixture:1"],
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

function claim(
  overrides: Partial<VenueClaimProposal> = {}
): VenueClaimProposal {
  return {
    proposition: "SHARE_REGISTER_BALANCE",
    subject: OBJECT_ID,
    value: "1000",
    observedAt: NOW - 5_000,
    evidenceRefs: ["evidence:fixture:1"],
    ...overrides
  };
}

function delivery(overrides: Partial<VenueDelivery> = {}): VenueDelivery {
  return {
    deliveryId: "delivery:fixture:1",
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
    id: "evidence:fixture:1",
    schemaId: "noema:evidence",
    schemaVersion: 1,
    type: "ATTESTATION",
    source: "source:fixture:1",
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
      [VENUE_ADMIN]: "FUND_ADMINISTRATOR",
      [VENUE_CUSTODIAN]: "CUSTODIAN"
    },
    trustedAttestors: new Set([ATTESTOR]),
    nowMs: NOW,
    evidenceIndex: { "evidence:fixture:1": evidenceFixture() },
    ...overrides
  };
}

function historyOf(object: EconomicObject): EconomicObjectVersionRecord[] {
  return [
    {
      object: structuredClone(object),
      changeId: "initial",
      material: true
    }
  ];
}

function sortDeliveries(deliveries: VenueDelivery[]): VenueDelivery[] {
  return [...deliveries].sort((left, right) =>
    deriveVenueDeliveryIdentityKey(left).localeCompare(
      deriveVenueDeliveryIdentityKey(right)
    )
  );
}

describe("venue delivery admission", () => {
  it("admits a delivery within authority scope", () => {
    const admission = admitVenueDelivery(delivery(), policy());
    expect(admission.status).toBe("ADMITTED");
    expect(admission.reasonCodes).toEqual([]);
  });

  it("rejects an unknown venue", () => {
    const admission = admitVenueDelivery(
      delivery({ venueId: "venue:unknown" }),
      policy()
    );
    expect(admission.status).toBe("REJECTED");
    expect(admission.reasonCodes).toContain("VENUE_NOT_REGISTERED");
  });

  it("rejects an untrusted attestor", () => {
    const admission = admitVenueDelivery(
      delivery({ attestation: attestation({ attestor: "0x0000000000000000000000000000000000000000" }) }),
      policy()
    );
    expect(admission.status).toBe("REJECTED");
    expect(admission.reasonCodes).toContain("ATTESTOR_UNTRUSTED");
  });

  it("rejects a revoked attestation", () => {
    const admission = admitVenueDelivery(
      delivery({
        attestation: attestation({ status: "REVOKED", revokedAt: NOW - 100 })
      }),
      policy()
    );
    expect(admission.status).toBe("REJECTED");
    expect(admission.reasonCodes).toContain("ATTESTATION_REVOKED");
  });

  it("rejects a claim outside the venue's authority scope", () => {
    const admission = admitVenueDelivery(
      delivery({
        claims: [claim({ proposition: "NAV" })]
      }),
      policy()
    );
    expect(admission.status).toBe("REJECTED");
    expect(admission.reasonCodes).toContain("PROPOSITION_OUT_OF_SCOPE:NAV");
  });

  it("rejects when finalized observations are required but observations are pending", () => {
    const pendingObservation = observation({
      provenance: provenance({ finality: "PENDING" })
    });
    const admission = admitVenueDelivery(
      delivery({ observations: [pendingObservation] }),
      policy({ requireFinalizedObservations: true })
    );
    expect(admission.status).toBe("REJECTED");
    expect(admission.reasonCodes).toContain("OBSERVATION_NOT_FINAL:observation:fixture:1");
  });

  it("rejects a delivery referencing missing evidence", () => {
    const admission = admitVenueDelivery(
      delivery({
        claims: [claim({ evidenceRefs: ["evidence:missing:1"] })]
      }),
      policy()
    );
    expect(admission.status).toBe("REJECTED");
    expect(admission.reasonCodes).toContain("EVIDENCE_MISSING:evidence:missing:1");
  });
});

describe("venue delivery identity", () => {
  it("derives a stable identity independent of receivedAt", () => {
    const early = delivery();
    const late = delivery({ receivedAt: NOW + 60_000 });
    expect(deriveVenueDeliveryIdentityKey(early)).toBe(
      deriveVenueDeliveryIdentityKey(late)
    );
  });

  it("distinguishes deliveries with different claim values", () => {
    const one = delivery();
    const two = delivery({ claims: [claim({ value: "1001" })] });
    expect(deriveVenueDeliveryIdentityKey(one)).not.toBe(
      deriveVenueDeliveryIdentityKey(two)
    );
  });
});

describe("deterministic reconciliation", () => {
  it("produces the same candidate regardless of delivery order", () => {
    const deliveries = [
      delivery(),
      delivery({
        deliveryId: "delivery:fixture:2",
        attestation: attestation({ attestationId: "attestation:fixture:2", nonce: 2 }),
        claims: [claim({ proposition: "SHARE_REGISTER_OWNERSHIP", value: "owner:alice" })]
      })
    ];

    const forward = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries: [...deliveries],
      policy: policy()
    });
    const reversed = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries: [...deliveries].reverse(),
      policy: policy()
    });

    expect(forward.synchronizationRoot).toBe(reversed.synchronizationRoot);
    expect(forward.applied.map((entry) => entry.claimId).sort()).toEqual(
      reversed.applied.map((entry) => entry.claimId).sort()
    );
    expect(forward.conflicts).toEqual(reversed.conflicts);
    expect(forward.duplicatesDropped).toBe(reversed.duplicatesDropped);
  });

  it("is idempotent against duplicate deliveries", () => {
    const single = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries: [delivery()],
      policy: policy()
    });
    const duplicated = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries: [delivery(), delivery()],
      policy: policy()
    });

    expect(duplicated.duplicatesDropped).toBe(1);
    expect(duplicated.synchronizationRoot).toBe(single.synchronizationRoot);
  });

  it("applies only claims within the venue's accepted authority scope", () => {
    const outOfScope = delivery({
      claims: [claim({ proposition: "NAV" })]
    });
    const result = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries: [outOfScope],
      policy: policy()
    });

    expect(result.admitted[0]!.status).toBe("REJECTED");
    expect(result.candidate.claims).toEqual([]);
    expect(result.applied).toEqual([]);
  });

  it("keeps conflicting authoritative propositions explicit", () => {
    const result = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries: [
        delivery(),
        delivery({
          deliveryId: "delivery:fixture:2",
          attestation: attestation({
            attestationId: "attestation:fixture:2",
            nonce: 2,
            binding: { subjectRef: OBJECT_ID, objectVersion: 0 }
          }),
          claims: [claim({ value: "999" })]
        })
      ],
      policy: policy()
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.values).toEqual(["1000", "999"]);
    expect(result.conflicts[0]!.unresolved).toBe(true);
    expect(result.candidate.status).toBe("CONFLICTING");
    expect(result.candidate.exceptions.some((exception) => exception.type === "EVIDENCE_CONFLICT")).toBe(true);
  });

  it("does not treat superseded claims as conflicts", () => {
    const original = delivery({
      claims: [
        claim({
          value: "1000",
          sourceRef: "claim:fixture:balance"
        })
      ]
    });
    const superseding = delivery({
      deliveryId: "delivery:fixture:2",
      attestation: attestation({
        attestationId: "attestation:fixture:2",
        nonce: 2,
        binding: { subjectRef: OBJECT_ID, objectVersion: 1 }
      }),
      claims: [
        claim({
          value: "1001",
          sourceRef: "claim:fixture:balance:v2",
          supersedes: "claim:fixture:balance"
        })
      ]
    });

    const result = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries: [original, superseding],
      policy: policy()
    });

    expect(result.conflicts).toHaveLength(0);
    const applied = result.applied.find((entry) => entry.state === "ATTESTED");
    expect(applied?.value).toBe("1001");
    const superseded = result.applied.find((entry) => entry.state === "STALE");
    expect(superseded?.value).toBe("1000");
  });

  it("records temporal skew in provenance-visible output", () => {
    const result = reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries: [
        delivery({ receivedAt: NOW }),
        delivery({
          deliveryId: "delivery:fixture:2",
          attestation: attestation({ attestationId: "attestation:fixture:2", nonce: 2 }),
          claims: [claim({ proposition: "SHARE_REGISTER_OWNERSHIP", observedAt: NOW - 30_000 })],
          receivedAt: NOW
        })
      ],
      policy: policy()
    });

    expect(result.temporalSkew.length).toBeGreaterThan(0);
    expect(
      result.temporalSkew.some((skew) => skew.skewMs >= 29_000)
    ).toBe(true);
  });
});

describe("versioned synchronization", () => {
  it("creates exactly one new version for one logical material change", () => {
    const object = baseObject();
    const result: SynchronizeResult = synchronizeEconomicObject({
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

  it("does not create a version for an immaterial no-op", () => {
    const object = baseObject();
    const first = synchronizeEconomicObject({
      object,
      history: historyOf(object),
      deliveries: [delivery()],
      policy: policy()
    });
    const replay = synchronizeEconomicObject({
      object: first.current.object,
      history: first.history,
      deliveries: [delivery()],
      policy: policy()
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.history).toHaveLength(2);
  });

  it("replays identical roots and version lineage", () => {
    const object = baseObject();
    const runs = [0, 1, 2].map(() => {
      const history = historyOf(object);
      const deliveries = [
        delivery(),
        delivery({
          deliveryId: "delivery:fixture:2",
          attestation: attestation({ attestationId: "attestation:fixture:2", nonce: 2 }),
          claims: [claim({ proposition: "SHARE_REGISTER_OWNERSHIP", value: "owner:alice" })]
        })
      ];
      return synchronizeEconomicObject({
        object,
        history,
        deliveries: sortDeliveries(deliveries),
        policy: policy()
      });
    });

    expect(runs[0]!.reconciliation.synchronizationRoot).toBe(
      runs[1]!.reconciliation.synchronizationRoot
    );
    expect(runs[1]!.reconciliation.synchronizationRoot).toBe(
      runs[2]!.reconciliation.synchronizationRoot
    );
    expect(runs[0]!.history.map((record) => record.object.version)).toEqual(
      runs[1]!.history.map((record) => record.object.version)
    );
  });

  it("supersedes the previous version lineage when a venue updates", () => {
    const object = baseObject();
    const first = synchronizeEconomicObject({
      object,
      history: historyOf(object),
      deliveries: [delivery()],
      policy: policy()
    });

    const updated = synchronizeEconomicObject({
      object: first.current.object,
      history: first.history,
      deliveries: [
        delivery({
          deliveryId: "delivery:fixture:2",
          attestation: attestation({
            attestationId: "attestation:fixture:2",
            nonce: 2,
            binding: { subjectRef: OBJECT_ID, objectVersion: 1 }
          }),
          claims: [claim({ value: "1002" })],
          receivedAt: NOW
        })
      ],
      policy: policy()
    });

    expect(updated.created).toBe(true);
    expect(updated.current.object.version).toBe(3);
    expect(updated.current.object.claims[0]!.value).toBe("1002");
    expect(updated.current.supersedesVersion).toBe(2);
  });
});

describe("late evidence handling", () => {
  it("applies late but canonically relevant evidence without erasing history", () => {
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
          deliveryId: "delivery:fixture:late",
          attestation: attestation({
            attestationId: "attestation:fixture:late",
            nonce: 3,
            provenance: {
              ...attestation().provenance,
              observedAt: NOW - 200_000,
              blockNumber: "90",
              blockHash: BLOCK_B
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
    expect(late.current.object.version).toBe(3);
    const lateClaim = late.current.object.claims.find(
      (entry) => entry.property === "SHARE_REGISTER_OWNERSHIP"
    );
    expect(lateClaim?.value).toBe("owner:bob");
    expect(lateClaim?.state).toBe("OBSERVED");
    expect(late.reconciliation.temporalSkew.some((skew) => skew.skewMs >= 199_000)).toBe(true);
    expect(first.history[0]!.object.version).toBe(1);
  });
});

describe("synchronization root determinism", () => {
  it("derives a root that reflects claim state", () => {
    const object = baseObject();
    const history = historyOf(object);
    const settled = reconcileVenueDeliveries({
      object,
      history,
      deliveries: [delivery()],
      policy: policy()
    });
    const conflicting = reconcileVenueDeliveries({
      object,
      history,
      deliveries: [
        delivery(),
        delivery({
          deliveryId: "delivery:fixture:2",
          attestation: attestation({ attestationId: "attestation:fixture:2", nonce: 2 }),
          claims: [claim({ value: "999" })]
        })
      ],
      policy: policy()
    });

    expect(settled.synchronizationRoot).not.toBe(conflicting.synchronizationRoot);
  });

  it("is stable across identical replays", () => {
    const object = baseObject();
    const history = historyOf(object);
    const first = reconcileVenueDeliveries({
      object,
      history,
      deliveries: [delivery()],
      policy: policy()
    });
    const second = reconcileVenueDeliveries({
      object,
      history,
      deliveries: [delivery()],
      policy: policy()
    });
    expect(first.synchronizationRoot).toBe(second.synchronizationRoot);
  });
});

describe("property-based permutation and duplicate injection", () => {
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

  function reconcileAll(deliveries: VenueDelivery[]): ReconcileResult {
    return reconcileVenueDeliveries({
      object: baseObject(),
      history: historyOf(baseObject()),
      deliveries,
      policy: policy()
    });
  }

  it("yields the identical canonical result for every delivery permutation", () => {
    const deliveries = [
      delivery(),
      delivery({
        deliveryId: "delivery:fixture:2",
        attestation: attestation({ attestationId: "attestation:fixture:2", nonce: 2 }),
        claims: [claim({ proposition: "SHARE_REGISTER_OWNERSHIP", value: "owner:alice" })]
      }),
      delivery({
        deliveryId: "delivery:fixture:3",
        venueId: VENUE_ADMIN,
        attestation: attestation({
          attestationId: "attestation:fixture:3",
          venueId: VENUE_ADMIN,
          nonce: 3,
          authorityScope: {
            role: "FUND_ADMINISTRATOR",
            propositions: ["NAV", "TOTAL_AUM"]
          },
          binding: { subjectRef: OBJECT_ID, objectVersion: 0 }
        }),
        claims: [claim({ proposition: "NAV", value: "10.5" })],
        receivedAt: NOW - 2_000
      })
    ];

    const baseline = reconcileAll(deliveries);
    const orderings = permutations(deliveries);
    expect(orderings.length).toBe(6);

    for (const ordering of orderings) {
      const result = reconcileAll(ordering);
      expect(result.synchronizationRoot).toBe(baseline.synchronizationRoot);
      expect(result.conflicts).toEqual(baseline.conflicts);
      expect(result.applied).toEqual(baseline.applied);
      expect(result.duplicatesDropped).toBe(baseline.duplicatesDropped);
      expect(result.candidate.claims.map((claim) => claim.id).sort()).toEqual(
        baseline.candidate.claims.map((claim) => claim.id).sort()
      );
    }
  });

  it("is invariant under duplicate injection for any permutation", () => {
    const deliveries = [
      delivery(),
      delivery({
        deliveryId: "delivery:fixture:2",
        attestation: attestation({ attestationId: "attestation:fixture:2", nonce: 2 }),
        claims: [claim({ proposition: "SHARE_REGISTER_OWNERSHIP", value: "owner:alice" })]
      })
    ];

    const baseline = reconcileAll(deliveries);
    const withDuplicates = [
      ...deliveries,
      delivery(),
      delivery()
    ];

    for (const ordering of permutations(withDuplicates)) {
      const result = reconcileAll(ordering);
      expect(result.synchronizationRoot).toBe(baseline.synchronizationRoot);
      expect(result.duplicatesDropped).toBe(2);
      expect(result.applied).toEqual(baseline.applied);
    }
  });

  it("keeps duplicate identity distinct from value changes", () => {
    const one = delivery();
    const different = delivery({ claims: [claim({ value: "1001" })] });
    expect(deriveVenueDeliveryIdentityKey(one)).not.toBe(
      deriveVenueDeliveryIdentityKey(different)
    );
    expect(deriveSynchronizationRoot(baseObject(), historyOf(baseObject()))).toBe(
      deriveSynchronizationRoot(baseObject(), historyOf(baseObject()))
    );
  });
});