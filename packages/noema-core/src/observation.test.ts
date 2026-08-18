import { describe, expect, it } from "vitest";
import type { Hex, UnixMillis } from "@noema/economic-kernel";
import {
  captureChainObservation,
  deriveChainObservationIdentityKey,
  deriveObservationSnapshotId,
  finalitySatisfiesPolicy,
  observationsAreDuplicate,
  resolveChainObservationSet,
  validateChainObservation,
  type ChainObservation,
  type ChainObservationProvenance,
  type FinalityPolicy
} from "./observation.js";

const NOW: UnixMillis = 1_700_000_000_000;

const BLOCK_A: Hex = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BLOCK_B: Hex = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BLOCK_C: Hex = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const BLOCK_D: Hex = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

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
    observedAt: NOW,
    fetchedAt: NOW,
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

const REQUIRES_FINALIZED: FinalityPolicy = { requireFinalized: true, allowPending: false };
const ALLOWS_PENDING: FinalityPolicy = { requireFinalized: false, allowPending: true };

describe("chain observation validation", () => {
  it("accepts a structurally complete EVM observation", () => {
    const verdict = validateChainObservation(provenance());
    expect(verdict.valid).toBe(true);
    expect(verdict.reasonCodes).toContain("OBSERVATION_VALID");
  });

  it("rejects malformed block identity and chain identity", () => {
    expect(validateChainObservation(provenance({ height: "abc" })).valid).toBe(false);
    expect(validateChainObservation(provenance({ height: "abc" })).reasonCodes).toContain("MALFORMED_HEIGHT");
    expect(validateChainObservation(provenance({ stateId: "0x1234" as Hex })).valid).toBe(false);
    expect(validateChainObservation(provenance({ chainId: "   " })).valid).toBe(false);
    expect(validateChainObservation(provenance({ chainId: "   " })).reasonCodes).toContain("CHAIN_ID_EMPTY");
  });

  it("rejects malformed EVM accounts, empty locators, and invalid finality", () => {
    const noAccount: ChainObservationProvenance = {
      chainId: "eip155:196",
      chainKind: "EVM",
      height: "12345",
      stateId: BLOCK_A,
      locator: "eth_call:totalSupply()",
      value: "0x01",
      finality: "FINALIZED",
      observedAt: NOW,
      fetchedAt: NOW,
      confirmationPolicy: "noema:finality:v1:xlayer-testnet"
    };
    expect(validateChainObservation(noAccount).valid).toBe(false);
    expect(validateChainObservation(noAccount).reasonCodes).toContain("MALFORMED_ACCOUNT");

    const emptyLocator = provenance({ locator: "  " });
    expect(validateChainObservation(emptyLocator).valid).toBe(false);
    expect(validateChainObservation(emptyLocator).reasonCodes).toContain("EMPTY_LOCATOR");

    const badFinality = provenance({ finality: "BOGUS" as unknown as ChainObservationProvenance["finality"] });
    expect(validateChainObservation(badFinality).valid).toBe(false);
    expect(validateChainObservation(badFinality).reasonCodes).toContain("MALFORMED_FINALITY");
  });

  it("supports non-EVM chains without EVM-address semantics", () => {
    const solana = provenance({
      chainKind: "NON_EVM",
      chainId: "solana:mainnet",
      account: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      locator: "getAccountInfo:token"
    });
    const verdict = validateChainObservation(solana);
    expect(verdict.valid).toBe(true);
  });
});

describe("capture and identity", () => {
  it("same observation replay reproduces the same content hash and snapshot identity", () => {
    const input = {
      observationId: "observation:fixture:1",
      sourceId: "rpc:xlayer:testnet",
      provenance: provenance()
    };
    const first = captureChainObservation(input);
    const second = captureChainObservation(input);
    expect(first.status).toBe("CAPTURED");
    expect(second.status).toBe("CAPTURED");
    if (first.status !== "CAPTURED" || second.status !== "CAPTURED") throw new Error("expected captures");
    expect(first.observation.contentHash).toBe(second.observation.contentHash);
    expect(deriveObservationSnapshotId(first.observation, "rpc:xlayer:testnet")).toBe(
      deriveObservationSnapshotId(second.observation, "rpc:xlayer:testnet")
    );
  });

  it("rpc/provider changes do not create new identities when canonical chain state is identical", () => {
    const a = deriveChainObservationIdentityKey(provenance({ fetchedAt: NOW }));
    const b = deriveChainObservationIdentityKey(provenance({ fetchedAt: NOW + 5000 }));
    expect(a).toBe(b);
  });

  it("observationsAreDuplicate detects replays of identical chain state", () => {
    const first = observation();
    const second = observation({ sourceId: "rpc:other-provider" });
    expect(observationsAreDuplicate(first, second)).toBe(true);

    const different = observation({
      provenance: provenance({ stateId: BLOCK_B })
    });
    expect(observationsAreDuplicate(first, different)).toBe(false);
  });

  it("capture failure surfaces on malformed identity", () => {
    const result = captureChainObservation({
      observationId: "observation:bad",
      sourceId: "rpc:xlayer:testnet",
      provenance: provenance({ height: "nope" })
    });
    expect(result.status).toBe("OBSERVATION_FAILURE");
  });
});

describe("finality policy", () => {
  it("pending observations cannot satisfy a finalized policy", () => {
    const pending = observation({
      provenance: provenance({ finality: "PENDING" })
    });
    const verdict = finalitySatisfiesPolicy(pending, REQUIRES_FINALIZED);
    expect(verdict.satisfied).toBe(false);
    expect(verdict.reasonCodes).toContain("FINALITY_PENDING_NOT_FINALIZED");
  });

  it("finalized observations satisfy a finalized policy", () => {
    const verdict = finalitySatisfiesPolicy(observation(), REQUIRES_FINALIZED);
    expect(verdict.satisfied).toBe(true);
  });

  it("a pending policy may accept pending observations when allowed", () => {
    const pending = observation({
      provenance: provenance({ finality: "PENDING" })
    });
    expect(finalitySatisfiesPolicy(pending, ALLOWS_PENDING).satisfied).toBe(true);
    expect(finalitySatisfiesPolicy(pending, { requireFinalized: false, allowPending: false }).satisfied).toBe(false);
  });

  it("reorged, unavailable, and stalled observations never satisfy any policy", () => {
    for (const finality of ["REORGED", "UNAVAILABLE", "CHAIN_STALLED"] as const) {
      const obs = observation({ provenance: provenance({ finality }) });
      expect(finalitySatisfiesPolicy(obs, ALLOWS_PENDING).satisfied).toBe(false);
      expect(finalitySatisfiesPolicy(obs, REQUIRES_FINALIZED).satisfied).toBe(false);
    }
  });

  it("chain mismatch fails closed even when finality looks satisfied", () => {
    const verdict = finalitySatisfiesPolicy(observation(), {
      ...REQUIRES_FINALIZED,
      chainId: "eip155:1"
    });
    expect(verdict.satisfied).toBe(false);
    expect(verdict.reasonCodes[0]?.startsWith("CHAIN_MISMATCH:")).toBe(true);
  });
});

describe("reorg, ordering, and replay resolution", () => {
  it("a reorg cannot silently mutate historical evidence; displaced observation becomes REORGED with lineage", () => {
    const historical = observation({
      observationId: "observation:historical",
      provenance: provenance({ stateId: BLOCK_A })
    });
    const newHead = observation({
      observationId: "observation:head",
      provenance: provenance({ stateId: BLOCK_B })
    });

    const result = resolveChainObservationSet({
      observations: [historical, newHead],
      canonicalHead: {
        chainId: "eip155:196",
        chainKind: "EVM",
        height: "12345",
        stateId: BLOCK_B,
        locator: "eth_call:totalSupply()",
        account: "0x2222222222222222222222222222222222222222"
      },
      nowMs: NOW
    });

    expect(result.reorged.map((obs) => obs.observationId)).toContain("observation:historical");
    expect(result.reorged[0]?.provenance.finality).toBe("REORGED");
    expect(result.lineage.length).toBeGreaterThan(0);
    expect(historical.provenance.finality).toBe("FINALIZED");
  });

  it("finalized happy path keeps observations active", () => {
    const obs = observation({
      provenance: provenance({ stateId: BLOCK_B })
    });
    const result = resolveChainObservationSet({
      observations: [obs],
      canonicalHead: {
        chainId: "eip155:196",
        chainKind: "EVM",
        height: "12345",
        stateId: BLOCK_B,
        locator: "eth_call:totalSupply()",
        account: "0x2222222222222222222222222222222222222222"
      },
      nowMs: NOW
    });
    expect(result.finalized.map((o) => o.observationId)).toContain(obs.observationId);
    expect(result.reorged).toEqual([]);
  });

  it("provider disagreement surfaces as conflicting observations, never silent resolution", () => {
    const providerA = observation({
      observationId: "observation:provider-a",
      sourceId: "rpc:provider-a",
      provenance: provenance({ stateId: BLOCK_A })
    });
    const providerB = observation({
      observationId: "observation:provider-b",
      provenance: provenance({ stateId: BLOCK_B })
    });

    const result = resolveChainObservationSet({ observations: [providerA, providerB], nowMs: NOW });
    expect(result.conflicting.length).toBeGreaterThan(0);
    expect(result.exceptions.some((exception) => exception.startsWith("PROVIDER_DISAGREEMENT"))).toBe(true);
  });

  it("stale head observations are surfaced when canonical head is ahead", () => {
    const behind = observation({
      provenance: provenance({ height: "12340" })
    });
    const result = resolveChainObservationSet({
      observations: [behind],
      canonicalHead: {
        chainId: "eip155:196",
        chainKind: "EVM",
        height: "12345",
        stateId: BLOCK_B,
        locator: "eth_call:totalSupply()",
        account: "0x2222222222222222222222222222222222222222"
      },
      nowMs: NOW
    });
    expect(result.exceptions.some((exception) => exception.startsWith("STALE_HEAD"))).toBe(true);
  });

  it("duplicate observations are collapsed without creating new economic observations", () => {
    const duplicate = observation();
    const replay = observation({ sourceId: "rpc:retry" });
    const result = resolveChainObservationSet({ observations: [duplicate, replay], nowMs: NOW });
    expect(result.exceptions.some((exception) => exception.startsWith("DUPLICATE_OBSERVATION"))).toBe(true);
    expect(result.finalized.filter((obs) => obs.observationId === duplicate.observationId).length).toBe(1);
  });

  it("resolution is deterministic across reorderings of the input", () => {
    const a = observation({
      observationId: "observation:a",
      provenance: provenance({ stateId: BLOCK_A, height: "12344", fetchedAt: NOW })
    });
    const b = observation({
      observationId: "observation:b",
      provenance: provenance({ stateId: BLOCK_B, height: "12345", fetchedAt: NOW })
    });

    const first = resolveChainObservationSet({ observations: [a, b], nowMs: NOW });
    const second = resolveChainObservationSet({ observations: [b, a], nowMs: NOW });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("pending observations remain pending and never leak into finalized", () => {
    const pending = observation({
      observationId: "observation:pending",
      provenance: provenance({ finality: "PENDING" })
    });
    const result = resolveChainObservationSet({ observations: [pending], nowMs: NOW });
    expect(result.pending.map((o) => o.observationId)).toContain("observation:pending");
    expect(result.finalized).toEqual([]);
  });
});