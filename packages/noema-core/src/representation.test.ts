import { describe, expect, it } from "vitest";
import type { Evidence, ExternalIdentifier } from "@noema/economic-kernel";
import {
  classifyRepresentationRelationship,
  deriveRepresentationIdentityKey,
  hasLineageEvidence,
  matchesForbiddenBasis,
  representationEvidenceRequirements,
  traceRepresentationLineage,
  validateRepresentationEvidence,
  type RepresentationIdentity,
  type RepresentationLineageEdge
} from "./representation.js";

function identifier(scheme: ExternalIdentifier["scheme"], value: string): ExternalIdentifier {
  return { scheme, value, source: "source:fixture", status: "SOURCED" };
}

function evidence(id: string, authority: Evidence["authority"]): Evidence {
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
    representationId: "representation:fixture:1",
    economicObjectRef: "object:fixture",
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
    evidenceRefs: ["evidence:fixture:1"],
    attestationRefs: [],
    status: "ACTIVE",
    ...overrides
  };
}

describe("representation identity", () => {
  it("derives identity from structural locator, never from names or symbols", () => {
    const left = identity({ representationId: "representation:a" });
    const right = identity({
      representationId: "representation:b",
      identifiers: [identifier("CONTRACT", "0x0000000000000000000000000000000000000001")]
    });

    expect(deriveRepresentationIdentityKey(left)).toBe(deriveRepresentationIdentityKey(right));
    expect(deriveRepresentationIdentityKey(left)).not.toContain("symbol");
    expect(deriveRepresentationIdentityKey(left)).not.toContain("ticker");
  });

  it("distinguishes representations by share class even when exposure matches", () => {
    const classA = identity({ representationId: "representation:class-a", shareClass: "CLASS-A" });
    const classB = identity({ representationId: "representation:class-b", shareClass: "CLASS-B" });

    const result = classifyRepresentationRelationship({ left: classA, right: classB });
    expect(result.kind).toBe("SHARE_CLASS_OF");
    expect(result.reasonCodes).toContain("DIFFERENT_SHARE_CLASS_SAME_OBJECT");
  });

  it("distinguishes representations by tranche even when share class matches", () => {
    const tranche1 = identity({ representationId: "representation:t1", tranche: "T1" });
    const tranche2 = identity({ representationId: "representation:t2", tranche: "T2" });

    const result = classifyRepresentationRelationship({ left: tranche1, right: tranche2 });
    expect(result.kind).toBe("SHARE_CLASS_OF");
    expect(result.reasonCodes).toContain("DIFFERENT_TRANCHE_SAME_OBJECT");
  });

  it("classifies same object across two chains as the same economic claim without implying bridge mechanics", () => {
    const eth = identity({
      representationId: "representation:eth",
      locator: {
        environment: "EVM",
        chainId: "eip155:1",
        network: "ethereum",
        contract: "0x0000000000000000000000000000000000000001"
      }
    });
    const xlayer = identity({
      representationId: "representation:xlayer",
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
});

describe("bridge and wrapper lineage", () => {
  it("requires explicit lineage evidence to classify a bridge relationship", () => {
    const origin = identity({ representationId: "representation:origin" });
    const bridged = identity({
      representationId: "representation:bridged",
      lineage: [
        {
          kind: "BRIDGED_REPRESENTATION_OF",
          ref: origin.representationId,
          evidenceRefs: ["evidence:bridge:proof"]
        }
      ]
    });

    const result = classifyRepresentationRelationship({ left: origin, right: bridged });
    expect(result.kind).toBe("BRIDGED_REPRESENTATION_OF");
    expect(result.reasonCodes).toContain("BRIDGE_LINEAGE_EVIDENCED");
  });

  it("emits ambiguous lineage when bridge/wrapper edge lacks evidence", () => {
    const origin = identity({ representationId: "representation:origin" });
    const bridged = identity({
      representationId: "representation:bridged",
      lineage: [
        {
          kind: "BRIDGED_REPRESENTATION_OF",
          ref: origin.representationId,
          evidenceRefs: []
        }
      ]
    });

    const result = classifyRepresentationRelationship({ left: origin, right: bridged });
    expect(result.kind).toBe("AMBIGUOUS");
    expect(result.reasonCodes).toContain("BRIDGE_LINEAGE_MISSING_EVIDENCE");
  });

  it("classifies wrapper lineage with evidence", () => {
    const origin = identity({ representationId: "representation:origin" });
    const wrapped = identity({
      representationId: "representation:wrapped",
      lineage: [
        {
          kind: "WRAPPED_REPRESENTATION_OF",
          ref: origin.representationId,
          evidenceRefs: ["evidence:wrapper:proof"]
        }
      ]
    });

    const result = classifyRepresentationRelationship({ left: origin, right: wrapped });
    expect(result.kind).toBe("WRAPPED_REPRESENTATION_OF");
  });

  it("treats an unbacked AI-proposed bridge link as ambiguous", () => {
    const origin = identity({ representationId: "representation:origin" });
    const candidate = identity({
      representationId: "representation:candidate",
      economicObjectRef: "object:other"
    });

    const result = classifyRepresentationRelationship({
      left: origin,
      right: candidate,
      links: [
        { from: "representation:origin", to: "representation:candidate", type: "BRIDGED_REPRESENTATION_OF" }
      ]
    });
    expect(result.kind).toBe("AMBIGUOUS");
    expect(result.reasonCodes).toContain("BRIDGE_LINEAGE_MISSING_EVIDENCE");
  });
});

describe("equivalence boundaries", () => {
  it("returns AMBIGUOUS with insufficient dimensions for unrelated objects", () => {
    const left = identity({ representationId: "representation:a", economicObjectRef: "object:a" });
    const right = identity({ representationId: "representation:b", economicObjectRef: "object:b" });

    const result = classifyRepresentationRelationship({ left, right });
    expect(result.kind).toBe("AMBIGUOUS");
    expect(result.reasonCodes).toContain("INSUFFICIENT_DIMENSIONS");
  });

  it("classifies similar exposure when only some dimensions match", () => {
    const left = identity({ representationId: "representation:a", economicObjectRef: "object:a" });
    const right = identity({ representationId: "representation:b", economicObjectRef: "object:b" });

    const result = classifyRepresentationRelationship({
      left,
      right,
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
    expect(result.reasonCodes).toContain("SHARE_CLASS_DIFFERENT");
  });

  it("classifies economic equivalence only when all material dimensions are equal and a supported link exists", () => {
    const left = identity({ representationId: "representation:a", economicObjectRef: "object:a" });
    const right = identity({ representationId: "representation:b", economicObjectRef: "object:b" });

    const result = classifyRepresentationRelationship({
      left,
      right,
      links: [{ from: left.representationId, to: right.representationId, type: "REPRESENTS" }],
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
    expect(result.kind).toBe("ECONOMICALLY_EQUIVALENT_TO");
  });

  it("does not collapse distinct share classes into equivalence merely because exposure matches", () => {
    const left = identity({ representationId: "representation:a", shareClass: "CLASS-A" });
    const right = identity({ representationId: "representation:b", shareClass: "CLASS-B" });

    const result = classifyRepresentationRelationship({
      left,
      right,
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

  it("classifies the same representation id as identical", () => {
    const left = identity({ representationId: "representation:same" });
    const right = identity({ representationId: "representation:same" });

    const result = classifyRepresentationRelationship({ left, right });
    expect(result.kind).toBe("SAME_REPRESENTATION");
  });
});

describe("lineage tracing", () => {
  it("traces supersession lineage without mutation and detects external refs", () => {
    const v1 = identity({ representationId: "representation:v1", generation: 1 });
    const v2 = identity({
      representationId: "representation:v2",
      generation: 2,
      supersedes: v1.representationId
    });
    const v3 = identity({
      representationId: "representation:v3",
      generation: 3,
      supersedes: v2.representationId
    });

    const trace = traceRepresentationLineage([v1, v2, v3]);
    expect(trace.nodes).toEqual(
      expect.arrayContaining(["representation:v1", "representation:v2", "representation:v3"])
    );
    expect(trace.cycles).toEqual([]);
    expect(trace.ambiguous).toEqual([]);
  });

  it("detects a dangling lineage reference and emits an identity ambiguity exception", () => {
    const v2 = identity({
      representationId: "representation:v2",
      supersedes: "representation:missing-v1"
    });

    const trace = traceRepresentationLineage([v2]);
    expect(trace.ambiguous).toContain("representation:v2");
    expect(trace.exceptions.some((e) => e.type === "IDENTITY_AMBIGUOUS")).toBe(true);
  });

  it("detects a lineage cycle", () => {
    const a = identity({ representationId: "representation:a", supersedes: "representation:b" });
    const b = identity({ representationId: "representation:b", supersedes: "representation:a" });

    const trace = traceRepresentationLineage([a, b]);
    expect(trace.cycles.length).toBeGreaterThan(0);
    expect(trace.ambiguous).toEqual(expect.arrayContaining(["representation:a", "representation:b"]));
  });

  it("emits a relationship ambiguity exception for unbacked lineage edges", () => {
    const v1 = identity({ representationId: "representation:v1" });
    const v2 = identity({
      representationId: "representation:v2",
      lineage: [{ kind: "BRIDGED_REPRESENTATION_OF", ref: v1.representationId, evidenceRefs: [] }]
    });

    const trace = traceRepresentationLineage([v1, v2]);
    expect(trace.exceptions.some((e) => e.type === "RELATIONSHIP_AMBIGUOUS")).toBe(true);
  });

  it("keeps representation history immutable through supersession rather than mutation", () => {
    const v1 = identity({ representationId: "representation:v1", generation: 1 });
    const v2 = identity({
      representationId: "representation:v2",
      generation: 2,
      supersedes: v1.representationId
    });

    const traceBefore = traceRepresentationLineage([v1, v2]);
    v1.generation = 99;
    const traceAfter = traceRepresentationLineage([v1, v2]);

    expect(traceBefore.nodes).toEqual(traceAfter.nodes);
    expect(traceBefore.ambiguous).toEqual(traceAfter.ambiguous);
    expect(deriveRepresentationIdentityKey(v1)).not.toContain("99");
  });

  it("creates lineage edges for supersession instead of mutating the prior representation", () => {
    const v1 = identity({ representationId: "representation:v1", generation: 1 });
    const v2 = identity({
      representationId: "representation:v2",
      generation: 2,
      supersedes: v1.representationId
    });

    const trace = traceRepresentationLineage([v1, v2]);
    expect(trace.edges.some((e) => e.from === "representation:v2" && e.to === "representation:v1")).toBe(true);
    expect(v1.supersedes).toBeUndefined();
    expect(v2.supersedes).toBe("representation:v1");
  });
});

describe("evidence requirements", () => {
  it("declares deterministic evidence requirements per predicate", () => {
    for (const predicate of [
      "REPRESENTS",
      "SHARE_CLASS_OF",
      "BRIDGED_REPRESENTATION_OF",
      "WRAPPED_REPRESENTATION_OF",
      "DERIVATIVE_OF",
      "FUNCTIONALLY_FUNGIBLE_WITH",
      "ECONOMICALLY_EQUIVALENT_TO"
    ] as const) {
      const requirement = representationEvidenceRequirements(predicate);
      expect(requirement).toBeDefined();
      expect(requirement!.requiredEvidence.length).toBeGreaterThan(0);
    }
  });

  it("rejects ticker/symbol/name as identity basis", () => {
    const requirement = representationEvidenceRequirements("REPRESENTS")!;
    const forbidden = matchesForbiddenBasis(requirement, ["ticker", "name", "contractSymbol"]);
    expect(forbidden).toEqual(expect.arrayContaining(["ticker", "name", "contractSymbol"]));

    const result = validateRepresentationEvidence(
      "REPRESENTS",
      [evidence("evidence:a", "ONCHAIN_STATE")],
      ["ticker"],
      { identityBinding: true }
    );
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain("FORBIDDEN_BASIS:ticker");
  });

  it("requires dimension coverage and sufficient evidence authority", () => {
    const valid = validateRepresentationEvidence(
      "ECONOMICALLY_EQUIVALENT_TO",
      [evidence("evidence:a", "PRIMARY_SOURCE")],
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
    expect(valid.reasonCodes).toContain("EVIDENCE_SUFFICIENT");

    const missing = validateRepresentationEvidence(
      "ECONOMICALLY_EQUIVALENT_TO",
      [evidence("evidence:a", "PRIMARY_SOURCE")],
      [],
      { economicClaim: true }
    );
    expect(missing.valid).toBe(false);
    expect(missing.reasonCodes).toContain("MISSING_DIMENSION:issuer");
  });

  it("rejects evidence with insufficient authority", () => {
    const result = validateRepresentationEvidence(
      "REPRESENTS",
      [evidence("evidence:a", "DEMO_FIXTURE")],
      [],
      { identityBinding: true }
    );
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain("EVIDENCE_AUTHORITY_INSUFFICIENT");
  });

  it("rejects unsupported predicates", () => {
    const result = validateRepresentationEvidence(
      "CLAIM_ON",
      [evidence("evidence:a", "PRIMARY_SOURCE")],
      [],
      { identityBinding: true }
    );
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain("UNSUPPORTED_REPRESENTATION_PREDICATE");
  });
});

describe("lineage evidence helper", () => {
  it("reports presence and sorted evidence refs for a given lineage kind", () => {
    const lineage: RepresentationLineageEdge[] = [
      { kind: "BRIDGED_REPRESENTATION_OF", ref: "representation:origin", evidenceRefs: ["evidence:b", "evidence:a"] }
    ];
    const rep = identity({ lineage });

    const result = hasLineageEvidence(rep, "BRIDGED_REPRESENTATION_OF", "representation:origin");
    expect(result.present).toBe(true);
    expect(result.evidenceRefs).toEqual(["evidence:a", "evidence:b"]);

    const missing = hasLineageEvidence(rep, "WRAPPED_REPRESENTATION_OF", "representation:origin");
    expect(missing.present).toBe(false);
  });
});