import type {
  Evidence,
  EvidenceAuthority,
  ExternalIdentifier,
  Ref,
  RelationshipType,
  ResolutionException,
  SchemaId,
  SchemaVersion,
  UnixMillis
} from "@noema/economic-kernel";
import type { SemanticRepresentationLink } from "./semantic.js";

export const REPRESENTATION_IDENTITY_VERSION = "noema-representation-identity-v1";

export type RepresentationEnvironment = "EVM" | "SOLANA" | "CANTON" | "OFFCHAIN" | "OTHER";

export type RepresentationOperationalStatus =
  | "ACTIVE"
  | "SUSPENDED"
  | "DEPRECATED"
  | "REVOKED"
  | "UNKNOWN";

export type RepresentationLineageKind =
  | "BRIDGED_REPRESENTATION_OF"
  | "WRAPPED_REPRESENTATION_OF"
  | "SUPERSEDES";

export interface RepresentationLocator {
  environment: RepresentationEnvironment;
  chainId?: string;
  network?: string;
  contract?: string;
  bookEntryRef?: string;
  tokenStandard?: string;
}

export interface RepresentationLineageEdge {
  kind: RepresentationLineageKind;
  ref: Ref;
  evidenceRefs: Ref[];
}

export interface RepresentationIdentity {
  schemaId: SchemaId;
  schemaVersion: SchemaVersion;
  representationId: Ref;
  economicObjectRef: Ref;
  locator: RepresentationLocator;
  shareClass?: string;
  tranche?: string;
  generation: number;
  originRepresentation?: Ref;
  lineage: RepresentationLineageEdge[];
  validFrom?: UnixMillis;
  validUntil?: UnixMillis;
  supersedes?: Ref;
  issuerRef?: Ref;
  administratorRef?: Ref;
  transferAgentRef?: Ref;
  identifiers: ExternalIdentifier[];
  evidenceRefs: Ref[];
  attestationRefs: Ref[];
  status: RepresentationOperationalStatus;
}

export type RepresentationEquivalence =
  | { kind: "SAME_REPRESENTATION"; reasonCodes: string[] }
  | { kind: "SAME_ECONOMIC_CLAIM"; reasonCodes: string[] }
  | { kind: "SHARE_CLASS_OF"; reasonCodes: string[] }
  | { kind: "BRIDGED_REPRESENTATION_OF"; reasonCodes: string[] }
  | { kind: "WRAPPED_REPRESENTATION_OF"; reasonCodes: string[] }
  | { kind: "DERIVATIVE_OF"; reasonCodes: string[] }
  | { kind: "FUNCTIONALLY_FUNGIBLE_WITH"; reasonCodes: string[] }
  | { kind: "ECONOMICALLY_EQUIVALENT_TO"; reasonCodes: string[] }
  | { kind: "SIMILAR_EXPOSURE_TO"; reasonCodes: string[] }
  | { kind: "UNRELATED"; reasonCodes: string[] }
  | { kind: "AMBIGUOUS"; reasonCodes: string[] };

export interface EvidenceRequirement {
  predicate: RelationshipType;
  forbiddenBasis: string[];
  requiredEvidence: Array<{
    dimension: string;
    authority: EvidenceAuthority[];
    description: string;
  }>;
  requiredLineage?: RepresentationLineageKind;
}

export const REPRESENTATION_EVIDENCE_REQUIREMENTS: EvidenceRequirement[] = [
  {
    predicate: "REPRESENTS",
    forbiddenBasis: ["ticker", "symbol", "name", "contractSymbol"],
    requiredEvidence: [
      {
        dimension: "identityBinding",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR", "ONCHAIN_STATE"],
        description: "evidence binding the representation locator to the economic object"
      }
    ]
  },
  {
    predicate: "SHARE_CLASS_OF",
    forbiddenBasis: ["underlyingExposureMatch", "ticker", "name"],
    requiredEvidence: [
      {
        dimension: "shareClassIdentity",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR"],
        description: "evidence identifying the distinct share class or tranche"
      },
      {
        dimension: "sameEconomicObject",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR"],
        description: "evidence binding both representations to the same economic object"
      }
    ]
  },
  {
    predicate: "BRIDGED_REPRESENTATION_OF",
    forbiddenBasis: ["sameExposure", "sameTicker"],
    requiredEvidence: [
      {
        dimension: "bridgeLineage",
        authority: ["PRIMARY_SOURCE", "ONCHAIN_STATE", "AUTHORIZED_ATTESTOR"],
        description: "evidence of explicit bridge/lineage between origin and derived representation"
      }
    ],
    requiredLineage: "BRIDGED_REPRESENTATION_OF"
  },
  {
    predicate: "WRAPPED_REPRESENTATION_OF",
    forbiddenBasis: ["sameExposure", "sameTicker"],
    requiredEvidence: [
      {
        dimension: "wrapperLineage",
        authority: ["PRIMARY_SOURCE", "ONCHAIN_STATE", "AUTHORIZED_ATTESTOR"],
        description: "evidence of explicit wrapper/lineage between origin and derived representation"
      }
    ],
    requiredLineage: "WRAPPED_REPRESENTATION_OF"
  },
  {
    predicate: "DERIVATIVE_OF",
    forbiddenBasis: ["sameExposure"],
    requiredEvidence: [
      {
        dimension: "derivativeLineage",
        authority: ["PRIMARY_SOURCE", "ONCHAIN_STATE", "AUTHORIZED_ATTESTOR"],
        description: "evidence that one economic position derives from another"
      }
    ]
  },
  {
    predicate: "FUNCTIONALLY_FUNGIBLE_WITH",
    forbiddenBasis: ["ticker", "symbol", "name"],
    requiredEvidence: [
      {
        dimension: "redemption",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR", "REFERENCE_DATA"],
        description: "evidence of equivalent redemption/convertibility mechanics"
      },
      {
        dimension: "rights",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR"],
        description: "evidence of equivalent rights"
      },
      {
        dimension: "restrictions",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR"],
        description: "evidence of equivalent restrictions"
      }
    ]
  },
  {
    predicate: "ECONOMICALLY_EQUIVALENT_TO",
    forbiddenBasis: ["ticker", "symbol", "name", "similarExposure"],
    requiredEvidence: [
      {
        dimension: "economicClaim",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR"],
        description: "evidence of the same underlying economic claim"
      },
      {
        dimension: "issuer",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR"],
        description: "evidence of the same issuer"
      },
      {
        dimension: "shareClass",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR"],
        description: "evidence of the same share class or tranche"
      },
      {
        dimension: "rights",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR"],
        description: "evidence of equivalent rights"
      },
      {
        dimension: "restrictions",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR"],
        description: "evidence of equivalent restrictions"
      },
      {
        dimension: "backing",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR"],
        description: "evidence of equivalent backing/custody"
      },
      {
        dimension: "redemption",
        authority: ["PRIMARY_SOURCE", "AUTHORIZED_ATTESTOR"],
        description: "evidence of equivalent redemption mechanics"
      }
    ]
  }
];

export function representationEvidenceRequirements(
  predicate: RelationshipType
): EvidenceRequirement | undefined {
  return REPRESENTATION_EVIDENCE_REQUIREMENTS.find(
    (requirement) => requirement.predicate === predicate
  );
}

function sortedNormalized(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

const DIMENSION_REASON_CODES: Record<string, string> = {
  economicClaim: "ECONOMIC_CLAIM_DIFFERENT",
  issuer: "ISSUER_DIFFERENT",
  shareClass: "SHARE_CLASS_DIFFERENT",
  rights: "RIGHTS_DIFFERENT",
  restrictions: "RESTRICTIONS_DIFFERENT",
  backing: "BACKING_DIFFERENT",
  redemption: "REDEMPTION_DIFFERENT"
};

export function deriveRepresentationIdentityKey(
  identity: RepresentationIdentity
): string {
  const locator = identity.locator;
  return JSON.stringify({
    economicObjectRef: identity.economicObjectRef,
    environment: locator.environment,
    chainId: locator.chainId ?? null,
    network: locator.network ?? null,
    contract: locator.contract ?? null,
    bookEntryRef: locator.bookEntryRef ?? null,
    tokenStandard: locator.tokenStandard ?? null,
    shareClass: identity.shareClass ?? null,
    tranche: identity.tranche ?? null
  });
}

export function hasLineageEvidence(
  identity: RepresentationIdentity,
  kind: RepresentationLineageKind,
  toRef: Ref
): { present: boolean; evidenceRefs: Ref[] } {
  const edges = identity.lineage.filter((edge) => edge.kind === kind && edge.ref === toRef);
  if (edges.length === 0) {
    return { present: false, evidenceRefs: [] };
  }
  return { present: true, evidenceRefs: sortedNormalized(edges.flatMap((edge) => edge.evidenceRefs)) };
}

function hasSupportedLink(
  leftId: string,
  rightId: string,
  kind: RepresentationLineageKind | "REPRESENTS",
  links: readonly SemanticRepresentationLink[]
): boolean {
  return links.some(
    (link) =>
      (link.from === leftId && link.to === rightId ||
        link.from === rightId && link.to === leftId) &&
      link.type === kind
  );
}

export interface ClassifyRepresentationInput {
  left: RepresentationIdentity;
  right: RepresentationIdentity;
  links?: readonly SemanticRepresentationLink[];
  dimensionEquality?: Partial<
    Record<
      "economicClaim" | "issuer" | "shareClass" | "rights" | "restrictions" | "backing" | "redemption",
      boolean
    >
  >;
}

export function classifyRepresentationRelationship(
  input: ClassifyRepresentationInput
): RepresentationEquivalence {
  const { left, right } = input;
  const reasonCodes: string[] = [];

  if (left.representationId === right.representationId) {
    return { kind: "SAME_REPRESENTATION", reasonCodes: ["SAME_REPRESENTATION_ID"] };
  }

  const sameIdentityKey =
    deriveRepresentationIdentityKey(left) === deriveRepresentationIdentityKey(right);

  const bridged = hasLineageEvidence(right, "BRIDGED_REPRESENTATION_OF", left.representationId);
  const wrapped = hasLineageEvidence(right, "WRAPPED_REPRESENTATION_OF", left.representationId);
  const bridgedLink = hasSupportedLink(
    left.representationId,
    right.representationId,
    "BRIDGED_REPRESENTATION_OF",
    input.links ?? []
  );
  const wrappedLink = hasSupportedLink(
    left.representationId,
    right.representationId,
    "WRAPPED_REPRESENTATION_OF",
    input.links ?? []
  );

  if (bridged.present || bridgedLink) {
    reasonCodes.push(
      ...(bridged.evidenceRefs.length > 0
        ? ["BRIDGE_LINEAGE_EVIDENCED"]
        : ["BRIDGE_LINEAGE_MISSING_EVIDENCE"])
    );
    return {
      kind: bridged.evidenceRefs.length > 0 ? "BRIDGED_REPRESENTATION_OF" : "AMBIGUOUS",
      reasonCodes
    };
  }

  if (wrapped.present || wrappedLink) {
    reasonCodes.push(
      ...(wrapped.evidenceRefs.length > 0
        ? ["WRAPPER_LINEAGE_EVIDENCED"]
        : ["WRAPPER_LINEAGE_MISSING_EVIDENCE"])
    );
    return {
      kind: wrapped.evidenceRefs.length > 0 ? "WRAPPED_REPRESENTATION_OF" : "AMBIGUOUS",
      reasonCodes
    };
  }

  if (sameIdentityKey) {
    reasonCodes.push("IDENTITY_KEY_EQUAL");
    return {
      kind: left.status === right.status ? "SAME_REPRESENTATION" : "SAME_ECONOMIC_CLAIM",
      reasonCodes
    };
  }

  const sameObject = left.economicObjectRef === right.economicObjectRef;

  if (!sameObject) {
    const dimensions = input.dimensionEquality ?? {};
    const knownDimensions = Object.entries(dimensions).filter(
      ([, equal]) => equal !== undefined
    ) as Array<[string, boolean]>;

    const allKnownEqual = knownDimensions.length > 0 && knownDimensions.every(([, equal]) => equal);
    const anyKnownMismatch = knownDimensions.some(([, equal]) => equal === false);

    if (knownDimensions.length === 0) {
      return {
        kind: "AMBIGUOUS",
        reasonCodes: ["INSUFFICIENT_DIMENSIONS", "NO_SUPPORTED_REPRESENTATION_LINK"]
      };
    }

    if (allKnownEqual && hasRepresentLink(input, left, right)) {
      return {
        kind: "ECONOMICALLY_EQUIVALENT_TO",
        reasonCodes: ["QUALIFYING_EQUIVALENCE_EVIDENCE", "SUPPORTED_REPRESENTATION_LINK"]
      };
    }

    if (anyKnownMismatch) {
      return {
        kind: "SIMILAR_EXPOSURE_TO",
        reasonCodes: [
          "SIMILAR_EXPOSURE_NOT_EQUIVALENT",
          ...knownDimensions
            .filter(([, equal]) => !equal)
            .map(([dimension]) => DIMENSION_REASON_CODES[dimension] ?? `${dimension.toUpperCase()}_DIFFERENT`)
        ]
      };
    }

    return {
      kind: "AMBIGUOUS",
      reasonCodes: ["RELATIONSHIP_UNRESOLVED", "SUPPORTED_REPRESENTATION_LINK_MISSING"]
    };
  }

  const leftShareClass = left.shareClass ?? right.shareClass;
  const rightShareClass = right.shareClass ?? left.shareClass;

  if (leftShareClass !== undefined && rightShareClass !== undefined) {
    if (left.shareClass !== right.shareClass) {
      return {
        kind: "SHARE_CLASS_OF",
        reasonCodes: ["DIFFERENT_SHARE_CLASS_SAME_OBJECT"]
      };
    }
  }

  const leftTranche = left.tranche ?? right.tranche;
  const rightTranche = right.tranche ?? left.tranche;

  if (leftTranche !== undefined && rightTranche !== undefined) {
    if (left.tranche !== right.tranche) {
      return {
        kind: "SHARE_CLASS_OF",
        reasonCodes: ["DIFFERENT_TRANCHE_SAME_OBJECT"]
      };
    }
  }

  const leftChain = left.locator.chainId ?? left.locator.network ?? left.locator.environment;
  const rightChain = right.locator.chainId ?? right.locator.network ?? right.locator.environment;

  if (leftChain !== rightChain || !sameIdentityKey) {
    reasonCodes.push("SAME_OBJECT_DIFFERENT_LOCATOR");
    return {
      kind: "SAME_ECONOMIC_CLAIM",
      reasonCodes
    };
  }

  return { kind: "SAME_REPRESENTATION", reasonCodes: ["IDENTITY_KEY_EQUAL"] };
}

function hasRepresentLink(
  input: ClassifyRepresentationInput,
  left: RepresentationIdentity,
  right: RepresentationIdentity
): boolean {
  return hasSupportedLink(left.representationId, right.representationId, "REPRESENTS", input.links ?? []);
}

export interface LineageTraceEdge {
  from: Ref;
  to: Ref;
  kind: RepresentationLineageKind;
  evidenceRefs: Ref[];
}

export interface LineageTrace {
  nodes: Ref[];
  edges: LineageTraceEdge[];
  cycles: Ref[][];
  ambiguous: Ref[];
  exceptions: ResolutionException[];
}

function detectCycles(
  adjacency: Map<string, string[]>,
  nodes: string[]
): string[][] {
  const cycles: string[][] = [];

  function walk(current: string, path: string[]): void {
    if (path.includes(current)) {
      const start = path.indexOf(current);
      cycles.push(path.slice(start));
      return;
    }
    for (const next of adjacency.get(current) ?? []) {
      walk(next, [...path, current]);
    }
  }

  for (const node of nodes) {
    walk(node, []);
  }
  return cycles;
}

export function traceRepresentationLineage(
  identities: readonly RepresentationIdentity[]
): LineageTrace {
  const byId = new Map(identities.map((identity) => [identity.representationId, identity]));
  const nodes: Ref[] = [];
  const edges: LineageTraceEdge[] = [];
  const ambiguous: Ref[] = [];

  const adjacency = new Map<string, string[]>();

  for (const identity of identities) {
    if (!nodes.includes(identity.representationId)) nodes.push(identity.representationId);
    const supersedes = identity.supersedes;
    if (supersedes !== undefined) {
      adjacency.set(identity.representationId, [
        ...(adjacency.get(identity.representationId) ?? []),
        supersedes
      ]);
      if (!nodes.includes(supersedes)) nodes.push(supersedes);
      edges.push({
        from: identity.representationId,
        to: supersedes,
        kind: "SUPERSEDES",
        evidenceRefs: []
      });
    }
    if (identity.originRepresentation !== undefined) {
      adjacency.set(identity.representationId, [
        ...(adjacency.get(identity.representationId) ?? []),
        identity.originRepresentation
      ]);
      if (!nodes.includes(identity.originRepresentation)) nodes.push(identity.originRepresentation);
    }
    for (const edge of identity.lineage) {
      edges.push({
        from: identity.representationId,
        to: edge.ref,
        kind: edge.kind,
        evidenceRefs: edge.evidenceRefs
      });
    }
  }

  for (const identity of identities) {
    const refs = [
      identity.supersedes,
      identity.originRepresentation,
      ...identity.lineage.map((edge) => edge.ref)
    ];
    const hasExternalRef = refs.some((ref) => ref !== undefined && !byId.has(ref));
    if (hasExternalRef) {
      ambiguous.push(identity.representationId);
    }
  }

  const cycles = detectCycles(adjacency, nodes);
  for (const cycle of cycles) {
    for (const node of cycle) {
      if (!ambiguous.includes(node)) ambiguous.push(node);
    }
  }

  const exceptions: ResolutionException[] = [];

  for (const node of [...new Set(ambiguous)]) {
    exceptions.push({
      id: `exception:representation:ambiguous:${node}`,
      objectId: byId.get(node)?.economicObjectRef ?? "unknown",
      type: "IDENTITY_AMBIGUOUS",
      severity: "WARNING",
      affectedClaims: [],
      evidence: [],
      detectedAt: 0,
      status: "OPEN",
      resolutionOptions: [
        "provide explicit lineage evidence or representation-level attestation"
      ]
    });
  }

  const unbackedKinds = new Set<RepresentationLineageKind>();
  for (const edge of edges) {
    if (edge.evidenceRefs.length === 0) unbackedKinds.add(edge.kind);
  }
  for (const identity of identities) {
    for (const kind of unbackedKinds) {
      exceptions.push({
        id: `exception:representation:lineage:${identity.representationId}:${kind}`,
        objectId: identity.economicObjectRef,
        type: "RELATIONSHIP_AMBIGUOUS",
        severity: "WARNING",
        affectedClaims: [],
        evidence: [],
        detectedAt: 0,
        status: "OPEN",
        resolutionOptions: [
          `provide evidence for ${kind} lineage from ${identity.representationId}`
        ]
      });
    }
  }

  return { nodes, edges, cycles, ambiguous: [...new Set(ambiguous)], exceptions };
}

export function matchesForbiddenBasis(
  requirement: EvidenceRequirement,
  candidates: readonly string[]
): string[] {
  return sortedNormalized(
    candidates.filter((candidate) => requirement.forbiddenBasis.includes(candidate))
  );
}

export function validateRepresentationEvidence(
  predicate: RelationshipType,
  evidence: readonly Evidence[],
  claimedBasis: readonly string[],
  dimensionCoverage: Record<string, boolean>
): {
  valid: boolean;
  reasonCodes: string[];
} {
  const requirement = representationEvidenceRequirements(predicate);
  if (requirement === undefined) {
    return { valid: false, reasonCodes: ["UNSUPPORTED_REPRESENTATION_PREDICATE"] };
  }

  const forbidden = matchesForbiddenBasis(requirement, claimedBasis);
  if (forbidden.length > 0) {
    return {
      valid: false,
      reasonCodes: forbidden.map((basis) => `FORBIDDEN_BASIS:${basis}`)
    };
  }

  const missingDimensions = requirement.requiredEvidence
    .filter(({ dimension }) => dimensionCoverage[dimension] !== true)
    .map(({ dimension }) => `MISSING_DIMENSION:${dimension}`);

  if (missingDimensions.length > 0) {
    return { valid: false, reasonCodes: missingDimensions };
  }

  if (evidence.length === 0) {
    return { valid: false, reasonCodes: ["NO_EVIDENCE"] };
  }

  const requiredAuthorities = requirement.requiredEvidence.map(({ authority }) => authority);
  const hasAuthorityEvidence = evidence.some((item) =>
    requiredAuthorities.some((authorities) => authorities.includes(item.authority))
  );
  if (!hasAuthorityEvidence) {
    return { valid: false, reasonCodes: ["EVIDENCE_AUTHORITY_INSUFFICIENT"] };
  }

  return { valid: true, reasonCodes: ["EVIDENCE_SUFFICIENT"] };
}