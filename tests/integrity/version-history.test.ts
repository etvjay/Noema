import { describe, expect, it } from "vitest";
import type {
  Claim,
  EconomicObject,
  Evidence,
  ResolutionException
} from "@noema/economic-kernel";
import {
  createNextVersion,
  isMaterialChange,
  AppendOnlyVersionStore
} from "@noema/noema-core";
import { computeRoots, objectRoot } from "@noema/canonicalization";
import { makeEconomicObject } from "../helpers.js";

describe("append-only version history and material change integrity", () => {
  it("creates vN+1 with explicit SUPERSEDES provenance on material change and keeps vN immutable", () => {
    const store = new AppendOnlyVersionStore();

    const v1 = makeEconomicObject({
      id: "object:rwa:ondo-ousg",
      version: 1
    });
    store.save(v1);

    const v1OriginalRoot = objectRoot(v1);

    // Inject a material change: updated evidence content hash and NAV value
    const updatedEvidence: Evidence = {
      ...v1.evidence[0]!,
      contentHash: "0x8888888888888888888888888888888888888888888888888888888888888888",
      observedAt: 1_700_050_000_000
    };

    const updatedClaim: Claim = {
      ...v1.claims[0]!,
      value: "106.15",
      observedAt: 1_700_050_000_000
    };

    const isMaterial = isMaterialChange(v1, [updatedEvidence], [updatedClaim]);
    expect(isMaterial).toBe(true);

    const v2 = createNextVersion(v1, {
      evidence: [updatedEvidence],
      claims: [updatedClaim]
    }, { nowMs: 1_700_050_000_000 });

    expect(v2.version).toBe(2);
    expect(v2.id).toBe(v1.id);
    expect(objectRoot(v2)).not.toBe(v1OriginalRoot);

    // Check SUPERSEDES provenance edge
    const supersedesEdge = v2.provenance.edges.find((e) => e.relation === "SUPERSEDES");
    expect(supersedesEdge).toBeDefined();
    expect(supersedesEdge?.from).toBe(`${v1.id}:v1`);
    expect(supersedesEdge?.to).toBe(`${v1.id}:v2`);

    store.save(v2);

    // Assert v1 is still byte-for-byte identical and retrievable
    const retrievedV1 = store.get(v1.id, 1)!;
    expect(retrievedV1).toBeDefined();
    expect(objectRoot(retrievedV1)).toBe(v1OriginalRoot);
    expect(retrievedV1.version).toBe(1);

    const retrievedV2 = store.get(v1.id, 2)!;
    expect(retrievedV2).toBeDefined();
    expect(retrievedV2.version).toBe(2);
  });

  it("prohibits non-material source refreshes from silently rewriting canonical history", () => {
    const v1 = makeEconomicObject({
      id: "object:stable",
      version: 1
    });

    // Identical evidence and claims re-observed
    const identicalEvidence: Evidence = {
      ...v1.evidence[0]!
    };
    const identicalClaim: Claim = {
      ...v1.claims[0]!
    };

    const isMaterial = isMaterialChange(v1, [identicalEvidence], [identicalClaim]);
    expect(isMaterial).toBe(false);
  });

  it("throws on attempt to overwrite historical versions in AppendOnlyVersionStore", () => {
    const store = new AppendOnlyVersionStore();
    const v1 = makeEconomicObject({ id: "object:immutable", version: 1 });
    store.save(v1);

    // Attempt to save a mutated v1 with same ID and version but different content
    const mutatedV1 = {
      ...v1,
      classification: {
        ...v1.classification,
        primary: "MUTATED_CLASS"
      }
    };

    expect(() => store.save(mutatedV1)).toThrow(/Immutability violation/);
  });

  it("replays the same change sequence to produce identical deterministic version chains", () => {
    const buildChain = () => {
      const v1 = makeEconomicObject({ id: "object:deterministic-chain", version: 1 });
      const staleEvidence: Evidence = {
        ...v1.evidence[0]!,
        freshness: "STALE"
      };
      const v2 = createNextVersion(v1, { evidence: [staleEvidence] }, { nowMs: 1_700_000_100_000 });
      return { v1, v2 };
    };

    const chain1 = buildChain();
    const chain2 = buildChain();

    expect(objectRoot(chain1.v1)).toBe(objectRoot(chain2.v1));
    expect(objectRoot(chain1.v2)).toBe(objectRoot(chain2.v2));
    expect(chain1.v2.provenance.edges).toEqual(chain2.v2.provenance.edges);
  });
});
