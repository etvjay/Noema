import { describe, expect, it } from "vitest";
import type { EconomicObject } from "@noema/economic-kernel";
import {
  buildOpenApiContract,
  cachePolicyForExactVersion,
  cachePolicyForLatest,
  createDeterministicCursor,
  exactObjectVersionRef,
  latestObjectRef,
  latestSelectionMetadata,
  openApiPaths,
  paginateDeterministically,
  parseDeterministicCursor,
  parseObjectId,
  parseObjectVersionRef,
  resolveLatestObject,
  resourceDefinition,
  restError,
  REST_CONTRACT_VERSION,
  REST_RESOURCES,
  type DeterministicCursor
} from "@noema/noema-core/rest";

const NOW = 1_700_000_002_000;
const REPO_STATE = "repository:state:123";

function version(v: number, overrides: Partial<EconomicObject> = {}): EconomicObject {
  return {
    id: "object:rest",
    schemaId: "noema:economic-object",
    schemaVersion: 1,
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
    updatedAt: NOW,
    ...overrides
  };
}

describe("REST resource contract", () => {
  it("is versioned and exposes a machine-readable OpenAPI contract", () => {
    const api = buildOpenApiContract();
    expect(api.openapi).toBe("3.1.0");
    expect(api.info.version).toBe(REST_CONTRACT_VERSION);
    expect(api.info.title).toContain("Noema REST Resource Contract");
    expect(Object.keys(api.paths).length).toBe(REST_RESOURCES.length);
    for (const resource of REST_RESOURCES) {
      expect(openApiPaths().some((p) => p.path.includes(resource.path))).toBe(true);
    }
  });

  it("documents authorization model: public economic proof, private watches", () => {
    const watches = resourceDefinition("watches");
    const paths = openApiPaths();
    expect(paths.find((p) => p.path.includes("/watches"))?.auth).toBe("bearer");
    expect(paths.find((p) => p.path.includes("/objects/{objectId}/latest"))?.auth).toBe("public");
    expect(paths.find((p) => p.path.includes("/health"))?.auth).toBe("public");
    expect(watches.immutableExactRef).toBe(false);
  });

  it("exact-version refs are immutable and replayable", () => {
    const ref = exactObjectVersionRef("object:rest", 3);
    const parsed = parseObjectVersionRef(ref);
    expect(parsed).toEqual({ ok: true, objectId: "object:rest", version: 3 });

    const latest = latestObjectRef("object:rest");
    expect(latest).toBe("objects/object:rest/latest");

    const policy = cachePolicyForExactVersion(3);
    expect(policy.policy).toBe("immutable");
    expect(policy.cacheControl).toContain("immutable");
  });

  it("latest selects the highest canonical repository version, never a raw fetch", () => {
    const result = resolveLatestObject({
      objectId: "object:rest",
      versions: [version(1), version(3), version(2)],
      repositoryStateRef: REPO_STATE,
      nowMs: NOW
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.object.version).toBe(3);
    expect(result.result.selection.selectedVersion).toBe(3);
    expect(result.result.selection.repositoryStateRef).toBe(REPO_STATE);
    expect(result.result.selection.candidateVersions).toEqual([1, 2, 3]);
    expect(result.result.selection.reason).toContain("Highest canonical object version");
  });

  it("latest includes enough metadata to prove which canonical version was selected", () => {
    const meta = latestSelectionMetadata({
      objectId: "object:rest",
      selectedVersion: 3,
      repositoryStateRef: REPO_STATE
    });
    expect(meta.exactRef).toBe("objects/object:rest/versions/3");
    expect(meta.latestRef).toBe("objects/object:rest/latest");
    expect(meta.repositoryStateRef).toBe(REPO_STATE);

    const result = resolveLatestObject({
      objectId: "object:rest",
      versions: [version(1), version(3)],
      repositoryStateRef: REPO_STATE,
      nowMs: NOW
    });
    expect(result.ok && result.result.selection.selectedAtMs).toBe(NOW);
  });

  it("never silently coerces malformed IDs and returns typed errors", () => {
    const badRef = parseObjectVersionRef("objects//versions/2");
    expect(badRef.ok).toBe(false);
    if (badRef.ok) return;
    expect(badRef.error.status).toBe("ERROR");
    expect(badRef.error.code).toBe("MALFORMED_ID");

    const nonNumeric = parseObjectVersionRef("objects/object:rest/versions/abc");
    expect(nonNumeric.ok).toBe(false);
    if (nonNumeric.ok) return;
    expect(nonNumeric.error.code).toBe("MALFORMED_ID");

    const malformed = parseObjectVersionRef("object:rest/v3");
    expect(malformed.ok).toBe(false);
    if (malformed.ok) return;
    expect(malformed.error.code).toBe("INVALID_REF");

    const emptyId = parseObjectId("");
    expect(emptyId.ok).toBe(false);
    if (emptyId.ok) return;
    expect(emptyId.error.code).toBe("MALFORMED_ID");

    const error = restError({ code: "NOT_FOUND", message: "missing", objectId: "object:rest" });
    expect(error.status).toBe("ERROR");
    expect(error.code).toBe("NOT_FOUND");
    expect("success" in error).toBe(false);
  });

  it("paginates version history deterministically with opaque cursors", () => {
    const items = [version(1), version(2), version(3), version(4), version(5)];
    const cursor: DeterministicCursor = { afterVersion: Number.MAX_SAFE_INTEGER, pageSize: 2, order: "desc" };
    const page1 = paginateDeterministically({ items, cursor });
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;
    expect(page1.page.items.map((item) => item.version)).toEqual([5, 4]);
    expect(page1.page.hasMore).toBe(true);

    const token = page1.page.nextCursor!;
    const parsed = parseDeterministicCursor(token);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.cursor.afterVersion).toBe(4);
    expect(parsed.cursor.pageSize).toBe(2);

    const page2 = paginateDeterministically({ items, cursor: parsed.cursor });
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;
    expect(page2.page.items.map((item) => item.version)).toEqual([3, 2]);
  });

  it("deterministic cursor round-trips and rejects tampered cursors", () => {
    const made = createDeterministicCursor({ afterVersion: 7, pageSize: 10 });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const parsed = parseDeterministicCursor(made.cursor);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.cursor).toEqual({ afterVersion: 7, pageSize: 10, order: "desc" });

    const tampered = parseDeterministicCursor("v1:bm90LWEtY3Vyc29y");
    expect(tampered.ok).toBe(false);
    if (tampered.ok) return;
    expect(tampered.error.code).toBe("INVALID_PAGE");

    const notV1 = parseDeterministicCursor("v2:whatever");
    expect(notV1.ok).toBe(false);

    const badPage = createDeterministicCursor({ afterVersion: 0, pageSize: 1000 });
    expect(badPage.ok).toBe(false);
  });

  it("caching semantics cannot mislabel a stale object as latest", () => {
    const latestPolicy = cachePolicyForLatest({
      repositoryStateRef: REPO_STATE,
      selectedVersion: 3
    });
    expect(latestPolicy.policy).toBe("no-cache");
    expect(latestPolicy.cacheControl).toContain("no-cache, must-revalidate");
    expect(latestPolicy.etag).toContain("latest");

    const stalePolicy = cachePolicyForLatest({
      repositoryStateRef: "repository:state:older",
      selectedVersion: 2
    });
    expect(stalePolicy.etag).not.toBe(latestPolicy.etag);
  });

  it("latest is unavailable when no canonical versions exist", () => {
    const result = resolveLatestObject({
      objectId: "object:rest",
      versions: [],
      repositoryStateRef: REPO_STATE,
      nowMs: NOW
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("LATEST_UNAVAILABLE");
  });

  it("rejects version records for a different object", () => {
    const result = resolveLatestObject({
      objectId: "object:rest",
      versions: [version(1, { id: "object:other" })],
      repositoryStateRef: REPO_STATE,
      nowMs: NOW
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL");
  });
});