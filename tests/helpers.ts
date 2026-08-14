import type {
  EconomicObject,
  Evidence,
  Claim
} from "@noema/economic-kernel";

const evidence: Evidence = {
  id: "evidence:fixture:primary",
  type: "API_RESPONSE",
  source: "source:fixture:primary",
  contentHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
  observedAt: 1_700_000_000_000,
  fetchedAt: 1_700_000_000_100,
  authority: "DEMO_FIXTURE",
  freshness: "FRESH",
  metadata: {
    fixtureStatus: "DEMO_FIXTURE"
  }
};

const claim: Claim = {
  id: "claim:fixture:identity",
  subject: "object:fixture",
  property: "economicIdentity",
  value: "fixture-economic-claim",
  state: "SOURCED",
  sourceRefs: ["source:fixture:primary"],
  evidenceRefs: [evidence.id],
  attestationRefs: [],
  createdAt: 1_700_000_000_000
};

export function makeEconomicObject(
  overrides: Partial<EconomicObject> = {}
): EconomicObject {
  return {
    id: "object:fixture",
    version: 1,
    classification: {
      primary: "TOKENIZED_TREASURY",
      secondary: [],
      confidence: 1,
      claimRef: claim.id
    },
    identifiers: [
      {
        scheme: "CUSTOM",
        value: "fixture-asset",
        source: evidence.source,
        status: "SOURCED"
      }
    ],
    representations: [
      {
        id: "representation:fixture:xlayer",
        environment: "EVM",
        network: "xlayer-testnet",
        contract: "0x0000000000000000000000000000000000000001",
        tokenStandard: "ERC-20",
        identifiers: [],
        relationshipToObject: "relationship:fixture:represents",
        status: "ACTIVE",
        evidence: [evidence.id]
      }
    ],
    relationships: [
      {
        id: "relationship:fixture:represents",
        subject: "representation:fixture:xlayer",
        predicate: "REPRESENTS",
        object: "object:fixture",
        state: "SOURCED",
        evidence: [evidence.id],
        attestations: []
      }
    ],
    parties: [],
    rights: [],
    obligations: [],
    restrictions: [],
    economics: {
      asOf: evidence.observedAt,
      values: {
        nav: "100.00",
        currency: "USD"
      },
      claimRefs: [claim.id]
    },
    claims: [claim],
    evidence: [evidence],
    attestations: [],
    exceptions: [],
    provenance: {
      edges: [
        {
          id: "edge:fixture:claim-evidence",
          from: claim.id,
          to: evidence.id,
          relation: "SUPPORTED_BY"
        }
      ]
    },
    verification: {
      status: "UNRESOLVED",
      verifierVersion: "pending",
      checks: []
    },
    status: "RESOLVED",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_100,
    ...overrides
  };
}
