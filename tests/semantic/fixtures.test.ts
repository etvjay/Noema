import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function loadFixture(name: string): Record<string, unknown> {
  const path = fileURLToPath(
    new URL("../../fixtures/semantic-cases/" + name, import.meta.url)
  );
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("semantic fixtures", () => {
  it("keeps equivalence stricter than a name match", () => {
    const fixture = loadFixture("equivalence.json");
    expect(fixture.fixtureStatus).toBe("DEMO_FIXTURE");
    expect(fixture.relationshipExpectation).toBe("ECONOMICALLY_EQUIVALENT_TO");
  });

  it("preserves similar but non-equivalent exposure", () => {
    const fixture = loadFixture("similar-non-equivalent.json");
    expect(fixture.relationshipExpectation).toBe("SIMILAR_EXPOSURE_TO");
    expect(fixture.equivalenceExpectation).toBe("NOT_EQUIVALENT");
  });

  it("preserves stale evidence as a blocking condition", () => {
    const fixture = loadFixture("evidence-failure.json");
    expect(fixture.expectedObjectState).toBe("STALE");
    expect(fixture.expectedMandateDecision).toBe("BLOCK");
  });
});
