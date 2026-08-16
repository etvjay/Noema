import { describe, expect, it } from "vitest";
import { hashUtf8 } from "@noema/canonicalization";
import {
  appendEconomicObjectChange,
  initializeVersionHistory,
  isMaterialEconomicObjectChange
} from "@noema/noema-core/versioning";
import { makeEconomicObject } from "../helpers.js";

function replayMaterialSequence() {
  const base = makeEconomicObject();
  let history = initializeVersionHistory(base, "initial");
  const evidence = base.evidence[0]!;
  const claim = base.claims[0]!;

  const stale = makeEconomicObject({
    evidence: [{ ...evidence, freshness: "STALE" }],
    claims: [{ ...claim, state: "STALE" }],
    status: "STALE"
  });
  history = appendEconomicObjectChange(history, stale, "change:stale").history;

  const revoked = makeEconomicObject({
    evidence: [{ ...evidence, freshness: "FRESH" }],
    claims: [{ ...claim, state: "REVOKED" }],
    status: "REVOKED"
  });
  history = appendEconomicObjectChange(history, revoked, "change:revoked").history;

  const conflicting = makeEconomicObject({
    evidence: [{ ...evidence, contentHash: hashUtf8("conflicting source") }],
    claims: [{ ...claim, state: "CONFLICTING" }],
    status: "CONFLICTING"
  });
  history = appendEconomicObjectChange(history, conflicting, "change:conflict").history;

  const corrected = makeEconomicObject({
    evidence: [{ ...evidence, contentHash: hashUtf8("corrected source"), freshness: "FRESH" }],
    claims: [{ ...claim, state: "SOURCED" }],
    status: "RESOLVED"
  });
  history = appendEconomicObjectChange(history, corrected, "change:corrected").history;

  return history;
}

describe("Noema append-only version history", () => {
  it("does not create a new canonical version for a fetch-time-only source refresh", () => {
    const base = makeEconomicObject();
    const evidence = base.evidence[0]!;
    const refresh = makeEconomicObject({
      updatedAt: base.updatedAt + 50_000,
      evidence: [{ ...evidence, fetchedAt: evidence.fetchedAt + 50_000 }]
    });

    expect(isMaterialEconomicObjectChange(base, refresh)).toBe(false);
    const history = initializeVersionHistory(base);
    const result = appendEconomicObjectChange(history, refresh, "refresh:non-material");

    expect(result.created).toBe(false);
    expect(result.history).toHaveLength(1);
    expect(result.current.object.version).toBe(1);
    expect(result.current.object).toEqual(base);
  });

  it("creates vN+1 for a material evidence mutation and preserves vN byte-for-byte", () => {
    const base = makeEconomicObject();
    const originalJson = JSON.stringify(base);
    const evidence = base.evidence[0]!;
    const changed = makeEconomicObject({
      evidence: [{ ...evidence, contentHash: hashUtf8("material evidence mutation") }]
    });

    expect(isMaterialEconomicObjectChange(base, changed)).toBe(true);
    const result = appendEconomicObjectChange(
      initializeVersionHistory(base, "initial"),
      changed,
      "change:material"
    );

    expect(result.created).toBe(true);
    expect(result.history).toHaveLength(2);
    expect(result.history[0]!.object.version).toBe(1);
    expect(JSON.stringify(result.history[0]!.object)).toBe(originalJson);
    expect(result.current.object.version).toBe(2);
    expect(result.current.supersedesVersion).toBe(1);
    expect(result.current.changeId).toBe("change:material");
  });

  it("keeps stale, revoked, conflicting, and corrected transitions explicit in the chain", () => {
    const history = replayMaterialSequence();

    expect(history.map((record) => record.object.version)).toEqual([1, 2, 3, 4, 5]);
    expect(history.map((record) => record.object.status)).toEqual([
      "RESOLVED",
      "STALE",
      "REVOKED",
      "CONFLICTING",
      "RESOLVED"
    ]);
    expect(history.slice(1).map((record) => record.supersedesVersion)).toEqual([1, 2, 3, 4]);
    expect(history.map((record) => record.changeId)).toEqual([
      "initial",
      "change:stale",
      "change:revoked",
      "change:conflict",
      "change:corrected"
    ]);
  });

  it("replays the same material change sequence to the same version chain", () => {
    const first = replayMaterialSequence();
    const second = replayMaterialSequence();

    expect(second).toEqual(first);
  });
});
