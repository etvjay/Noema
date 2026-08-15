import { describe, expect, it } from "vitest";
import { makeEconomicObject } from "../../../tests/helpers.js";
import {
  reduceEconomicObject,
  XLAYER_TESTNET_CHAIN_ID,
  XLAYER_MAINNET_CHAIN_ID,
  XLAYER_LEGACY_UNSAFE_CHAIN_ID,
  isValidXLayerChainId
} from "./index.js";

describe("economic object reducer", () => {
  it("normalizes versioned state without hiding exceptions", () => {
    const source = makeEconomicObject({
      claims: [
        {
          ...makeEconomicObject().claims[0]!,
          id: "claim:z"
        },
        {
          ...makeEconomicObject().claims[0]!,
          id: "claim:a",
          state: "STALE"
        }
      ],
      exceptions: [
        {
          id: "exception:stale",
          objectId: "object:fixture",
          type: "EVIDENCE_STALE",
          severity: "BLOCKING",
          affectedClaims: ["claim:a"],
          evidence: ["evidence:fixture:primary"],
          detectedAt: 1_700_000_001_000,
          status: "OPEN"
        }
      ]
    });
    const { status: ignoredStatus, ...input } = source;
    void ignoredStatus;
    const result = reduceEconomicObject(input);
    expect(result.status).toBe("STALE");
    expect(result.claims.map((item) => item.id)).toEqual(["claim:a", "claim:z"]);
    expect(result.exceptions).toHaveLength(1);
  });

  it("validates canonical X Layer network chain IDs and rejects unsafe legacy 195", () => {
    expect(XLAYER_TESTNET_CHAIN_ID).toBe(1952);
    expect(XLAYER_MAINNET_CHAIN_ID).toBe(196);
    expect(XLAYER_LEGACY_UNSAFE_CHAIN_ID).toBe(195);
    expect(isValidXLayerChainId(1952)).toBe(true);
    expect(isValidXLayerChainId(196)).toBe(true);
    expect(isValidXLayerChainId(195)).toBe(false);
    expect(isValidXLayerChainId(1)).toBe(false);
  });
});
