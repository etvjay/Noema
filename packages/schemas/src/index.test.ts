import { describe, expect, it } from "vitest";
import { makeEconomicObject } from "../../../tests/helpers.js";
import { claimSchema, evidenceSchema } from "./index.js";

describe("runtime schemas", () => {
  it("accepts the frozen claim and evidence shapes", () => {
    const object = makeEconomicObject();
    expect(claimSchema.safeParse(object.claims[0]).success).toBe(true);
    expect(evidenceSchema.safeParse(object.evidence[0]).success).toBe(true);
  });

  it("rejects an evidence object with an invalid content hash", () => {
    const object = makeEconomicObject();
    const result = evidenceSchema.safeParse({
      ...object.evidence[0],
      contentHash: "not-a-hash"
    });
    expect(result.success).toBe(false);
  });
});
