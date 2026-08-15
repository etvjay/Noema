import { describe, expect, it } from "vitest";
import { makeEconomicObject } from "../../../tests/helpers.js";
import {
  claimSchema,
  economicObjectProjectionSchema,
  evidenceSchema
} from "./index.js";

describe("runtime schemas", () => {
  it("accepts the frozen claim, evidence, and economic-object projection shapes", () => {
    const object = makeEconomicObject();
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...projection } = object;

    expect(claimSchema.safeParse(object.claims[0]).success).toBe(true);
    expect(evidenceSchema.safeParse(object.evidence[0]).success).toBe(true);
    expect(economicObjectProjectionSchema.safeParse(projection).success).toBe(true);
  });

  it("rejects an evidence object with an invalid content hash", () => {
    const object = makeEconomicObject();
    const result = evidenceSchema.safeParse({
      ...object.evidence[0],
      contentHash: "not-a-hash"
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown nested relationship predicate", () => {
    const object = makeEconomicObject();
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...projection } = object;
    const result = economicObjectProjectionSchema.safeParse({
      ...projection,
      relationships: [
        {
          ...object.relationships[0],
          predicate: "SAME_TICKER_AS"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown economic-object status", () => {
    const object = makeEconomicObject();
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...projection } = object;
    const result = economicObjectProjectionSchema.safeParse({
      ...projection,
      status: "TRUST_ME"
    });

    expect(result.success).toBe(false);
  });
});
