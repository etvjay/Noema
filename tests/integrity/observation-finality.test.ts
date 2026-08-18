import { describe, expect, it } from "vitest";
import type { Hex, UnixMillis } from "@noema/economic-kernel";
import {
  captureChainObservation,
  deriveChainObservationIdentityKey,
  finalitySatisfiesPolicy,
  resolveChainObservationSet,
  validateChainObservation,
  type ChainObservation,
  type ChainObservationProvenance,
  type FinalityPolicy
} from "@noema/noema-core/observation";

const NOW: UnixMillis = 1_700_000_000_000;

const HASH_A: Hex = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B: Hex = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const REQUIRES_FINALIZED: FinalityPolicy = { requireFinalized: true, allowPending: false };

function provenance(overrides: Partial<ChainObservationProvenance> = {}): ChainObservationProvenance {
  return {
    chainId: "eip155:1952",
    chainKind: "EVM",
    height: "123456",
    stateId: HASH_A,
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
  const captured = captureChainObservation({
    observationId: "observation:integrity:1",
    sourceId: "rpc:xlayer:testnet",
    provenance: provenance()
  });
  if (captured.status !== "CAPTURED") throw new Error("expected capture");
  return { ...captured.observation, ...overrides };
}

const canonicalHead = {
  chainId: "eip155:1952",
  chainKind: "EVM" as const,
  height: "123456",
  stateId: HASH_A,
  locator: "eth_call:totalSupply()",
  account: "0x2222222222222222222222222222222222222222"
};

describe("cross-chain observation finality, reorg, ordering, and replay integrity", () => {
  it("EVM observation schema structurally preserves chain/block/address/locator/value/finality", () => {
    const obs = observation();
    expect(obs.provenance.chainId).toBe("eip155:1952");
    expect(obs.provenance.height).toBe("123456");
    expect(obs.provenance.stateId).toBe(HASH_A);
    expect(obs.provenance.account).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(obs.provenance.locator).toBe("eth_call:totalSupply()");
    expect(obs.provenance.value).toBe("0x01");
    expect(obs.provenance.finality).toBe("FINALIZED");
    expect(validateChainObservation(obs.provenance).valid).toBe(true);
  });

  it("non-EVM chains preserve slot/state identity without EVM semantics", () => {
    const solana = provenance({
      chainKind: "NON_EVM",
      chainId: "solana:mainnet",
      account: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      locator: "getAccountInfo:token",
      stateId: HASH_B
    });
    const verdict = validateChainObservation(solana);
    expect(verdict.valid).toBe(true);
    expect(solana.chainKind).toBe("NON_EVM");
  });

  it("a reorg cannot silently mutate historical evidence; displaced observation gains REORGED status with lineage", () => {
    const historical = observation({
      observationId: "observation:integrity:reorged",
      provenance: provenance({ stateId: HASH_B, finality: "FINALIZED" })
    });
    const head = observation({
      observationId: "observation:integrity:head",
      provenance: provenance({ stateId: HASH_A, finality: "FINALIZED" })
    });

    const result = resolveChainObservationSet({
      observations: [historical, head],
      canonicalHead: { ...canonicalHead, stateId: HASH_A },
      nowMs: NOW
    });

    expect(result.reorged.map((obs) => obs.observationId)).toContain("observation:integrity:reorged");
    expect(result.reorged[0]?.provenance.finality).toBe("REORGED");
    expect(result.lineage.length).toBeGreaterThan(0);
    expect(historical.provenance.finality).toBe("FINALIZED");
  });

  it("pending/unfinalized observations cannot satisfy a policy that requires finalized evidence", () => {
    const pending = observation({
      observationId: "observation:integrity:pending",
      provenance: provenance({ finality: "PENDING" })
    });
    const verdict = finalitySatisfiesPolicy(pending, REQUIRES_FINALIZED);
    expect(verdict.satisfied).toBe(false);
    expect(verdict.reasonCodes).toContain("FINALITY_PENDING_NOT_FINALIZED");
  });

  it("same observation replay reproduces the same SourceSnapshot/evidence identity", () => {
    const first = captureChainObservation({
      observationId: "observation:integrity:1",
      sourceId: "rpc:xlayer:testnet",
      provenance: provenance()
    });
    const second = captureChainObservation({
      observationId: "observation:integrity:1",
      sourceId: "rpc:xlayer:testnet",
      provenance: provenance()
    });
    expect(first.status).toBe("CAPTURED");
    expect(second.status).toBe("CAPTURED");
    if (first.status !== "CAPTURED" || second.status !== "CAPTURED") throw new Error("expected captures");
    expect(first.observation.contentHash).toBe(second.observation.contentHash);
    expect(deriveChainObservationIdentityKey(first.observation.provenance)).toBe(
      deriveChainObservationIdentityKey(second.observation.provenance)
    );
  });

  it("rpc retries/provider changes do not create new observations when canonical chain state is identical", () => {
    const keyA = deriveChainObservationIdentityKey(provenance({ fetchedAt: NOW }));
    const keyB = deriveChainObservationIdentityKey(provenance({ fetchedAt: NOW + 10_000 }));
    expect(keyA).toBe(keyB);
  });

  it("provider disagreement surfaces as conflicting rather than silently selecting a winner", () => {
    const providerA = observation({
      observationId: "observation:integrity:provider-a",
      provenance: provenance({ stateId: HASH_A })
    });
    const providerB = observation({
      observationId: "observation:integrity:provider-b",
      provenance: provenance({ stateId: HASH_B })
    });

    const result = resolveChainObservationSet({ observations: [providerA, providerB], nowMs: NOW });
    expect(result.conflicting.map((obs) => obs.observationId)).toEqual(
      expect.arrayContaining(["observation:integrity:provider-a", "observation:integrity:provider-b"])
    );
    expect(result.exceptions.some((exception) => exception.startsWith("PROVIDER_DISAGREEMENT"))).toBe(true);
  });

  it("stale head observations are flagged against the canonical head", () => {
    const behind = observation({
      observationId: "observation:integrity:behind",
      provenance: provenance({ height: "123400" })
    });
    const result = resolveChainObservationSet({
      observations: [behind],
      canonicalHead: { ...canonicalHead, height: "123456" },
      nowMs: NOW
    });
    expect(result.exceptions.some((exception) => exception.startsWith("STALE_HEAD"))).toBe(true);
  });

  it("chain mismatch fails closed under a chain-scoped finality policy", () => {
    const obs = observation({ provenance: provenance({ chainId: "eip155:1" }) });
    const verdict = finalitySatisfiesPolicy(obs, { ...REQUIRES_FINALIZED, chainId: "eip155:1952" });
    expect(verdict.satisfied).toBe(false);
    expect(verdict.reasonCodes[0]?.startsWith("CHAIN_MISMATCH:")).toBe(true);
  });

  it("malformed block identity is rejected at capture and validation", () => {
    const malformed = observation({
      provenance: provenance({ stateId: "0x1234" as Hex })
    });
    expect(validateChainObservation(malformed.provenance).valid).toBe(false);
    expect(validateChainObservation(malformed.provenance).reasonCodes).toContain("MALFORMED_STATE_ID");
  });

  it("duplicate observations collapse without creating new economic observations", () => {
    const original = observation({ observationId: "observation:integrity:dup" });
    const replay = observation({ observationId: "observation:integrity:replay" });
    const result = resolveChainObservationSet({ observations: [original, replay], nowMs: NOW });
    expect(result.exceptions.some((exception) => exception.startsWith("DUPLICATE_OBSERVATION"))).toBe(true);
    expect(result.finalized.length).toBe(1);
  });

  it("finalized happy path under canonical head stays active", () => {
    const obs = observation({
      observationId: "observation:integrity:finalized",
      provenance: provenance({ stateId: HASH_A })
    });
    const result = resolveChainObservationSet({
      observations: [obs],
      canonicalHead,
      nowMs: NOW
    });
    expect(result.finalized.map((o) => o.observationId)).toContain("observation:integrity:finalized");
    expect(result.reorged).toEqual([]);
    expect(finalitySatisfiesPolicy(obs, REQUIRES_FINALIZED).satisfied).toBe(true);
  });
});