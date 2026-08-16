import { describe, expect, it } from "vitest";
import type { EconomicObject } from "@noema/economic-kernel";
import {
  buildOpenApiContract,
  cachePolicyForExactVersion,
  cachePolicyForLatest,
  createDeterministicCursor,
  exactObjectVersionRef,
  openApiPaths,
  paginateDeterministically,
  parseDeterministicCursor,
  parseObjectVersionRef,
  resolveLatestObject,
  REST_CONTRACT_VERSION,
  type DeterministicCursor
} from "@noema/noema-core/rest";

const NOW = 1_700_000_003_000;
const REPO_STATE = "repository:state:integrity-49";

function version(v: number): EconomicObject {
  return {
    id: "object:rest:integrity",
    version: v,
    classification: { primary: "TOKENIZED_TREASURY", secondary: [], confidence: 1, claimRef: "claim:rest" },
    identifiers: [],
    representations: [],
    relationships: [],
    parties: [],
    rights: [],
    obligations: [],
    restrictions: [],
    economics: { asOf: NOW, values: {}, claimRefs: [] },
    claims: [],
    evidence: [],
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
    updatedAt: NOW
  };
}

describe("REST contract conformance (gate #49)", () => {
  it("machine-readable OpenAPI contract is versioned and complete", () => {
    const api = buildOpenApiContract();
    expect(api.openapi).toBe("3.1.0");
    expect(api.info.version).toBe(REST_CONTRACT_VERSION);
    expect(api.paths[`/noema/objects/{objectId}/latest`]).toBeDefined();
    expect(api.paths[`/noema/objects/{objectId}/versions/{version}`]).toBeDefined();
    expect(api.paths["/noema/semantic-events"]).toBeDefined();
    expect(api.paths["/noema/xlayer/commitments"]).toBeDefined();
    expect(api.paths["/noema/watches"]).toBeDefined();
    expect(openApiPaths().every((route) => route.auth === "public" || route.auth === "bearer")).toBe(true);
  });

  it("latest is the highest canonical repository version with proof metadata", () => {
    const result = resolveLatestObject({
      objectId: "object:rest:integrity",
      versions: [version(1), version(4), version(2), version(3)],
      repositoryStateRef: REPO_STATE,
      nowMs: NOW
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.object.version).toBe(4);
    expect(result.result.selection.candidateVersions).toEqual([1, 2, 3, 4]);
    expect(result.result.selection.repositoryStateRef).toBe(REPO_STATE);
    expect(result.result.selection.selectedAtMs).toBe(NOW);
    expect(result.result.selection.reason).toContain("Highest canonical object version");
  });

  it("exact version refs are immutable, replayable, and never silently coerced", () => {
    const ref = exactObjectVersionRef("object:rest:integrity", 4);
    const parsed = parseObjectVersionRef(ref);
    expect(parsed).toEqual({ ok: true, objectId: "object:rest:integrity", version: 4 });

    const bad = parseObjectVersionRef("objects/object:rest:integrity/versions/not-a-number");
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.status).toBe("ERROR");
    expect(bad.error.code).toBe("MALFORMED_ID");
  });

  it("pagination is deterministic and replayable across permutations of delivery order", () => {
    const versions = [version(1), version(2), version(3), version(4), version(5), version(6)];
    const shuffled = [...versions].sort(() => Math.random() - 0.5);
    const cursor: DeterministicCursor = { afterVersion: 0, pageSize: 3, order: "asc" };

    let collected: number[] = [];
    let current: DeterministicCursor = cursor;
    for (let i = 0; i < 10; i++) {
      const page = paginateDeterministically({ items: shuffled, cursor: current });
      expect(page.ok).toBe(true);
      if (!page.ok) break;
      collected = collected.concat(page.page.items.map((item) => item.version));
      if (page.page.nextCursor === null) break;
      const cursorParsed = parseDeterministicCursor(page.page.nextCursor);
      if (!cursorParsed.ok) break;
      current = cursorParsed.cursor;
    }
    expect(collected).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("caching never mislabels a stale object as latest", () => {
    const latest3 = cachePolicyForLatest({ repositoryStateRef: REPO_STATE, selectedVersion: 3 });
    const stale2 = cachePolicyForLatest({ repositoryStateRef: REPO_STATE, selectedVersion: 2 });
    expect(latest3.policy).toBe("no-cache");
    expect(latest3.cacheControl).toContain("must-revalidate");
    expect(stale2.etag).not.toBe(latest3.etag);

    const exact = cachePolicyForExactVersion(3);
    expect(exact.policy).toBe("immutable");
    expect(exact.cacheControl).toContain("immutable");
  });
});