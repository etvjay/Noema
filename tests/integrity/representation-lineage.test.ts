import { describe, expect, it } from "vitest";
import type { Evidence, ExternalIdentifier } from "@noema/economic-kernel";
import {
  classifyRepresentationRelationship,
  deriveRepresentationIdentityKey,
  representationEvidenceRequirements,
  traceRepresentationLineage,
  validateRepresentationEvidence,
  type RepresentationIdentity
} from "@noema/noema-core/representation";

function identifier(scheme: ExternalIdentifier["scheme"], value: string): ExternalIdentifier {
  return { scheme, value, source: "source:integrity", status: "SOURCED" };
}

function evidence(authority: Evidence["authority"], id: string): Evidence {
  return {
    id,
    schemaId: "noema:evidence",
    schemaVersion: 1,
    type: "API_RESPONSE",
    source: `source:${id}`,
    contentHash: `0x${id.replace(/[^0-9a-f]/g, "").padEnd(64, "0")}`,
    observedAt: 1_700_000_000_000,
    fetchedAt: 1_700_000_000_100,
    authority,
    freshness: "FRESH",
    metadata: {}
  };
}

function identity(overrides: Partial<RepresentationIdentity> = {}): RepresentationIdentity {
  return {
    schemaId: "noema:representation-identity",
    schemaVersion: 1,
    representationId: "representation:integrity:1",
    economicObjectRef: "object:integrity",
    locator: {
      environment: "EVM",
      chainId: "eip155:1",
      network: "ethereum",
      contract: "0x0000000000000000000000000000000000000001",
      tokenStandard: "ERC-1400"
    },
    shareClass: "CLASS-A",
    generation: 1,
    lineage: [],
    identifiers: [identifier("CONTRACT", "0x0000000000000000000000000000000000000001")],
    evidenceRefs: ["evidence:integrity:1"],
    attestationRefs: [],
    status: "ACTIVE",
    ...overrides
  };
}

describe("representation integrity: identity, lineage, and equivalence boundaries", () => {
  it("same ticker cannot establish representation identity", () => {
    const a = identity({ representationId: "representation:integrity:issuer-a" });
    const b = identity({
      representationId: "representation:integrity:issuer-b",
      locator: {
        environment: "EVM",
        chainId: "eip155:1",
        network: "ethereum",
        contract: "0x0000000000000000000000000000000000000009"
      }
    });

    expect(deriveRepresentationIdentityKey(a)).not.toBe(deriveRepresentationIdentityKey(b));
    const result = classifyRepresentationRelationship({ left: a, right: b });
    expect(result.kind).not.toBe("SAME_REPRESENTATION");
    expect(result.kind).not.toBe("ECONOMICALLY_EQUIVALENT_TO");
  });

  it("same economic object across two chains is represented without implying bridge mechanics", () => {
    const eth = identity({ representationId: "representation:integrity:eth" });
    const xlayer = identity({
      representationId: "representation:integrity:xlayer",
      locator: {
        environment: "EVM",
        chainId: "eip155:196",
        network: "xlayer",
        contract: "0x0000000000000000000000000000000000000002"
      }
    });

    const result = classifyRepresentationRelationship({ left: eth, right: xlayer });
    expect(result.kind).toBe("SAME_ECONOMIC_CLAIM");
    expect(result.reasonCodes).toContain("SAME_OBJECT_DIFFERENT_LOCATOR");
    expect(result.reasonCodes).not.toContain("BRIDGE_LINEAGE_EVIDENCED");
  });

  it("bridge/wrapper relationships require explicit lineage evidence", () => {
    const origin = identity({ representationId: "representation:integrity:origin" });
    const bridged = identity({
      representationId: "representation:integrity:bridged",
      lineage: [
        {
          kind: "BRIDGED_REPRESENTATION_OF",
          ref: origin.representationId,
          evidenceRefs: ["evidence:integrity:bridge"]
        }
      ]
    });

    const backed = classifyRepresentationRelationship({ left: origin, right: bridged });
    expect(backed.kind).toBe("BRIDGED_REPRESENTATION_OF");

    const unbacked = identity({
      representationId: "representation:integrity:bridged-unbacked",
      lineage: [
        {
          kind: "WRAPPED_REPRESENTATION_OF",
          ref: origin.representationId,
          evidenceRefs: []
        }
      ]
    });
    const ambiguous = classifyRepresentationRelationship({ left: origin, right: unbacked });
    expect(ambiguous.kind).toBe("AMBIGUOUS");
  });

  it("different share classes cannot collapse into one representation because exposure matches", () => {
    const classA = identity({ representationId: "representation:integrity:a", shareClass: "CLASS-A" });
    const classB = identity({ representationId: "representation:integrity:b", shareClass: "CLASS-B" });

    const result = classifyRepresentationRelationship({
      left: classA,
      right: classB,
      dimensionEquality: {
        economicClaim: true,
        issuer: true,
        shareClass: true,
        rights: true,
        restrictions: true,
        backing: true,
        redemption: true
      }
    });
    expect(result.kind).toBe("SHARE_CLASS_OF");
  });

  it("representation history is immutable; supersession creates lineage rather than mutation", () => {
    const v1 = identity({ representationId: "representation:integrity:v1", generation: 1 });
    const v2 = identity({
      representationId: "representation:integrity:v2",
      generation: 2,
      supersedes: v1.representationId
    });

    const trace = traceRepresentationLineage([v1, v2]);
    expect(trace.edges.some((e) => e.from === v2.representationId && e.to === v1.representationId)).toBe(true);
    expect(trace.cycles).toEqual([]);
    expect(trace.ambiguous).toEqual([]);
    expect(v1.supersedes).toBeUndefined();
  });

  it("ambiguous lineage emits canonical exceptions and review states", () => {
    const dangling = identity({
      representationId: "representation:integrity:dangling",
      supersedes: "representation:integrity:missing"
    });

    const trace = traceRepresentationLineage([dangling]);
    expect(trace.ambiguous).toContain(dangling.representationId);
    expect(trace.exceptions.some((e) => e.type === "IDENTITY_AMBIGUOUS")).toBe(true);

    const cyclicA = identity({ representationId: "representation:integrity:cyc-a", supersedes: "representation:integrity:cyc-b" });
    const cyclicB = identity({ representationId: "representation:integrity:cyc-b", supersedes: "representation:integrity:cyc-a" });
    const cyclicTrace = traceRepresentationLineage([cyclicA, cyclicB]);
    expect(cyclicTrace.cycles.length).toBeGreaterThan(0);
  });

  it("similar-exposure-only never becomes equivalence", () => {
    const a = identity({ representationId: "representation:integrity:a", economicObjectRef: "object:a" });
    const b = identity({ representationId: "representation:integrity:b", economicObjectRef: "object:b" });

    const result = classifyRepresentationRelationship({
      left: a,
      right: b,
      dimensionEquality: {
        economicClaim: true,
        issuer: true,
        shareClass: false,
        rights: true,
        restrictions: true,
        backing: true,
        redemption: true
      }
    });
    expect(result.kind).toBe("SIMILAR_EXPOSURE_TO");
  });

  it("deterministic evidence requirements are enforced for equivalence", () => {
    const requirement = representationEvidenceRequirements("ECONOMICALLY_EQUIVALENT_TO");
    expect(requirement).toBeDefined();
    expect(requirement!.forbiddenBasis).toEqual(
      expect.arrayContaining(["ticker", "symbol", "name", "similarExposure"])
    );

    const valid = validateRepresentationEvidence(
      "ECONOMICALLY_EQUIVALENT_TO",
      [evidence("PRIMARY_SOURCE", "evidence:integrity:eq")],
      [],
      {
        economicClaim: true,
        issuer: true,
        shareClass: true,
        rights: true,
        restrictions: true,
        backing: true,
        redemption: true
      }
    );
    expect(valid.valid).toBe(true);

    const tickerOnly = validateRepresentationEvidence(
      "ECONOMICALLY_EQUIVALENT_TO",
      [evidence("PRIMARY_SOURCE", "evidence:integrity:eq")],
      ["ticker"],
      {
        economicClaim: true,
        issuer: true,
        shareClass: true,
        rights: true,
        restrictions: true,
        backing: true,
        redemption: true
      }
    );
    expect(tickerOnly.valid).toBe(false);
    expect(tickerOnly.reasonCodes).toContain("FORBIDDEN_BASIS:ticker");
  });

  it("noema-ai proposals remain proposals until deterministic promotion accepts them", () => {
    const a = identity({ representationId: "representation:integrity:a", economicObjectRef: "object:a" });
    const b = identity({ representationId: "representation:integrity:b", economicObjectRef: "object:b" });

    const proposed = classifyRepresentationRelationship({
      left: a,
      right: b,
      links: [{ from: a.representationId, to: b.representationId, type: "BRIDGED_REPRESENTATION_OF" }]
    });
    expect(proposed.kind).toBe("AMBIGUOUS");
    expect(proposed.reasonCodes).toContain("BRIDGE_LINEAGE_MISSING_EVIDENCE");

    const accepted = classifyRepresentationRelationship({
      left: a,
      right: b,
      links: [{ from: a.representationId, to: b.representationId, type: "REPRESENTS" }],
      dimensionEquality: {
        economicClaim: true,
        issuer: true,
        shareClass: true,
        rights: true,
        restrictions: true,
        backing: true,
        redemption: true
      }
    });
    expect(accepted.kind).toBe("ECONOMICALLY_EQUIVALENT_TO");
  });
});