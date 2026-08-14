# Noema

## Complete Product, System, Protocol, AI, UX, and Implementation Design Specification

**Version:** 1.0  
**Status:** Proposed Canonical Design  
**Date:** August 2026  
**Product:** Noema  
**Category:** Verifiable Economic Intelligence Infrastructure for Agent-Native RWA Finance  
**Initial deployment environment:** X Layer  
**Primary integration surfaces:** REST, TypeScript SDK, MCP, Webhooks, Watches  
**Downstream composition:** Truss, Corridor, execution adapters, Gaia

---

# 0. Executive Definition

Noema is a **verifiable economic intelligence layer for real-world assets**.

It converts fragmented representations, identifiers, issuer information, market observations, legal documents, attestations, oracle data, restrictions, and provenance into **Evidence-Bounded Economic Objects** that autonomous agents and agentic frameworks can understand, compare, continuously verify, evaluate against mandates, and pass into financing or execution systems.

Noema solves a problem that sits between RWA data availability and financial action.

Existing systems can expose:

- token contracts;
- prices;
- NAV;
- yield;
- issuer information;
- financial identifiers;
- reserve observations;
- attestations;
- compliance policies;
- documentation;
- cross-chain representations.

An autonomous agent still needs to determine:

> What economic object do these fragments actually describe?

> Which representations correspond to the same economic claim?

> Which are merely related?

> What rights does this representation convey?

> Which claims are verified, attested, inferred, stale, conflicting, or unknown?

> Has anything materially changed?

> Does this asset satisfy the agent's mandate?

> Is there enough evidence to justify using the asset in a financing or execution workflow?

Noema produces that answer as structured state rather than opaque AI prose.

Its core primitive is the:

# Evidence-Bounded Economic Object

Its central output is:

# Auditable Economic Interpretation

Its foundational product promise is:

> **Noema gives autonomous agents a verifiable, continuously updated understanding of real-world assets: what they economically represent, what evidence supports that understanding, what changed, and what the agent is justified in doing with them.**

---

# 1. Product Truth

## 1.1 Problem

RWA infrastructure is increasingly machine-accessible but remains semantically fragmented.

An agent can often retrieve data about an RWA without having a reliable method for determining its complete economic meaning.

This creates several classes of risk.

### Representation ambiguity

Two token contracts may represent:

- the same claim;
- different share classes;
- a bridged version;
- a wrapper;
- a synthetic exposure;
- unrelated instruments with similar exposure.

### Evidence ambiguity

A field may originate from:

- an issuer;
- an oracle;
- an indexer;
- a smart contract;
- a legal document;
- an inference.

These sources do not have equivalent authority.

### Temporal ambiguity

A statement can be:

- correct but stale;
- previously valid but revoked;
- superseded;
- valid only for a specific share class or network representation.

### Rights ambiguity

Token ownership may or may not imply:

- redemption;
- income rights;
- governance;
- ownership;
- legal claim;
- collateral rights;
- transferability.

### Policy ambiguity

An asset may appear economically attractive while remaining unusable because:

- the holder is ineligible;
- the representation is restricted;
- the NAV is stale;
- the jurisdiction is disallowed;
- the evidence is insufficient;
- the agent's mandate prohibits it.

Noema exists to make these distinctions explicit and machine-actionable.

---

# 2. Target Users

## 2.1 Primary user

The primary user is:

> **A developer or operator of an autonomous system that manages, evaluates, allocates, finances, or executes against capital.**

Examples include:

- treasury agents;
- portfolio agents;
- underwriting agents;
- credit agents;
- RWA agents;
- trading agents;
- autonomous fund managers;
- institutional agent frameworks.

These users need a machine interface answering:

```text
Can this agent safely reason over this asset?
```

rather than merely:

```text
What is the price of this token?
```

## 2.2 Secondary users

### RWA issuers

Issuers can expose their assets to agentic systems through structured Noema-compatible evidence.

Benefit:

> Make the asset understandable and discoverable by autonomous financial systems.

### RWA platforms and protocols

Noema can provide:

- semantic normalization;
- representation mapping;
- evidence resolution;
- agent suitability outputs;
- change monitoring.

### Wallets and financial applications

Wallets can use Noema to answer:

> What does this asset actually represent?

### Institutions

Potential institutional users include:

- corporate treasuries;
- asset managers;
- funds;
- fintech companies;
- banks;
- financial infrastructure operators.

Their primary benefit is continuous verification and mandate-aware monitoring.

---

# 3. Core Product Principles

## 3.1 Economic objects, not tokens

The central entity in Noema is an economic object.

A token is one possible representation.

## 3.2 Evidence before inference

AI may interpret evidence.

AI may not silently replace evidence.

## 3.3 Explicit epistemic state

Noema must distinguish:

```text
KNOWN
OBSERVED
SOURCED
ATTESTED
VERIFIED
INFERRED
CONFLICTING
STALE
REVOKED
UNKNOWN
```

## 3.4 Similarity does not imply equivalence

Two assets sharing the same underlying exposure must never automatically be treated as interchangeable.

## 3.5 Economic identity is separate from execution representation

The economic object can exist independently of:

- chain;
- VM;
- token standard;
- custody environment.

## 3.6 Continuous verification

Economic objects change.

Noema must detect and propagate material changes.

## 3.7 Fail closed for capital-affecting ambiguity

If an action depends on a claim that cannot be established, Noema should return:

```text
CONDITIONAL
BLOCK
INSUFFICIENT_EVIDENCE
```

rather than guess.

## 3.8 Modular architecture

Noema does not become:

- Truss;
- Corridor;
- Gaia;
- an oracle;
- a bridge;
- an exchange;
- a lending market;
- a compliance protocol.

---

# 4. Shared Economic Kernel

Noema, Truss, Corridor, and Gaia should share a small semantic kernel.

The kernel is not owned by any product.

Core types:

```text
Object
Reference
Party
Claim
Evidence
Attestation
Policy
Mandate
Condition
Commitment
Event
Exception
Receipt
Version
State
```

The design rule is:

> **Unify cross-module nouns. Preserve module-specific verbs.**

Thus:

```text
Noema
resolves / interprets / verifies

Truss
structures / evaluates

Corridor
authorizes / coordinates / executes

Gaia
recovers / compensates / escalates
```

---

# 5. System Architecture

```text
                         USER / EXTERNAL AGENT
                                  │
                            objective / mandate
                                  │
                                  ▼
                       ┌────────────────────┐
                       │   NOEMA GATEWAY    │
                       │ REST / SDK / MCP   │
                       └──────────┬─────────┘
                                  │
                                  ▼
                       ┌────────────────────┐
                       │  NOEMA ORCHESTRATOR│
                       └──────────┬─────────┘
                                  │
               ┌──────────────────┼──────────────────┐
               ▼                  ▼                  ▼
        DISCOVERY ENGINE   RESOLUTION ENGINE   WATCH ENGINE
               │                  │                  │
               └──────────────────┼──────────────────┘
                                  ▼
                        ┌─────────────────┐
                        │ SOURCE ADAPTERS │
                        └────────┬────────┘
                                 │
                ┌────────────────┼─────────────────┐
                ▼                ▼                 ▼
             CHAINS          ISSUERS            DATA
             ORACLES         DOCUMENTS          INDEXERS
                │                │                 │
                └────────────────┼─────────────────┘
                                 ▼
                      ┌──────────────────────┐
                      │ CLAIM / EVIDENCE     │
                      │ GRAPH                │
                      └─────────┬────────────┘
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
        DETERMINISTIC                     NOEMA AI
        VERIFICATION                      REASONING
                 │                             │
                 └──────────────┬──────────────┘
                                ▼
                    EVIDENCE-BOUNDED
                     ECONOMIC OBJECT
                                │
                ┌───────────────┼────────────────┐
                ▼               ▼                ▼
             VERIFY          EVALUATE           WATCH
                │               │                │
                ▼               ▼                ▼
          Verification     DecisionReceipt     Events
            Receipt             │                │
                                │                ▼
                                │          Webhook / MCP /
                                │          Email / Discord
                                ▼
                    FinanceabilityEnvelope
                                │
                     ┌──────────┴─────────┐
                     ▼                    ▼
                   TRUSS              CORRIDOR
                     │                    │
                     └──────────┬─────────┘
                                ▼
                       EXECUTION ADAPTERS
                                │
                         X Layer / venues
                                │
                                ▼
                           SETTLEMENT
                                │
                          failure / drift
                                ▼
                              GAIA
```

---

# 6. Component Architecture

## 6.1 API Gateway

Responsibilities:

- authentication;
- rate limiting;
- tenant resolution;
- API versioning;
- request validation;
- request tracing.

Interfaces:

```text
REST
SDK
MCP
Webhooks
WebSocket later
```

---

# 7. Discovery Engine

Purpose:

> Discover candidate representations and source material relevant to an economic object or mandate.

Inputs:

```ts
type DiscoveryInput =
  | AssetReference
  | NaturalLanguageQuery
  | Mandate
  | IssuerReference
  | Portfolio;
```

Outputs:

```ts
interface DiscoveryResult {
  representations: RepresentationCandidate[];
  identifiers: IdentifierCandidate[];
  sources: SourceReference[];
  documents: DocumentReference[];
  observations: Observation[];
}
```

Discovery itself does not declare equivalence.

---

# 8. Adapter System

Noema should be adapter-first.

Core adapter interfaces:

```ts
interface SourceAdapter {}

interface IdentifierAdapter {}

interface OracleAdapter {}

interface EvidenceAdapter {}

interface ComplianceAdapter {}

interface RepresentationAdapter {}

interface MarketAdapter {}

interface ProofAdapter {}

interface ExecutionAdapter {}
```

Each adapter declares capabilities.

Example:

```ts
interface AdapterManifest {
  id: string;
  version: string;

  capabilities: string[];

  networks?: string[];

  schemas: string[];

  authorityClass:
    | "PRIMARY"
    | "ATTESTOR"
    | "OBSERVATIONAL"
    | "DERIVED";

  freshnessPolicy?: FreshnessPolicy;
}
```

---

# 9. Evidence-Bounded Economic Object

This is Noema's canonical domain object.

```ts
interface EconomicObject {
  id: string;

  version: number;

  classification: EconomicClassification;

  identifiers: ExternalIdentifier[];

  representations: Representation[];

  relationships: EconomicRelationship[];

  parties: EconomicParty[];

  rights: EconomicRight[];

  obligations: EconomicObligation[];

  restrictions: Restriction[];

  economics: EconomicState;

  claims: Claim[];

  evidence: EvidenceRef[];

  attestations: AttestationRef[];

  exceptions: ResolutionException[];

  provenance: ProvenanceGraph;

  verification: VerificationSummary;

  status: EconomicObjectState;

  createdAt: number;
  updatedAt: number;
}
```

---

# 10. Economic Classification

Classification should be extensible.

Initial classes:

```text
TOKENIZED_TREASURY
MONEY_MARKET_FUND
TOKENIZED_BOND
PRIVATE_CREDIT
RECEIVABLE
REAL_ESTATE_FUND
COMMODITY_CLAIM
FUND_SHARE
EQUITY_REPRESENTATION
STRUCTURED_PRODUCT
OTHER
```

Classification itself can have evidence.

```ts
interface EconomicClassification {
  primary: string;
  secondary?: string[];

  confidence: number;

  claimRef: string;
}
```

---

# 11. Identifier Model

```ts
interface ExternalIdentifier {
  scheme:
    | "CAIP19"
    | "DTI"
    | "ISIN"
    | "CUSIP"
    | "CONTRACT"
    | "ISSUER"
    | "CUSTOM";

  value: string;

  namespace?: string;

  source: Ref;

  status: ClaimState;
}
```

Noema should not require its own global identifier to replace established standards.

Its internal `objectId` identifies the Noema projection.

---

# 12. Representation Model

```ts
interface Representation {
  id: string;

  environment:
    | "EVM"
    | "SOLANA"
    | "CANTON"
    | "OFFCHAIN"
    | "OTHER";

  network?: string;

  contract?: string;

  tokenStandard?: string;

  identifiers: ExternalIdentifier[];

  relationshipToObject: RelationshipRef;

  status:
    | "ACTIVE"
    | "SUSPENDED"
    | "REVOKED"
    | "UNKNOWN";

  evidence: Ref[];
}
```

---

# 13. Economic Relationship Model

Initial predicates:

```text
REPRESENTS
BRIDGED_REPRESENTATION_OF
WRAPPED_REPRESENTATION_OF
SHARE_CLASS_OF
CLAIM_ON
ISSUED_BY
BACKED_BY
CUSTODIED_BY
REDEEMABLE_FOR
DERIVATIVE_OF
COLLATERALIZED_BY
GUARANTEED_BY
FUNCTIONALLY_FUNGIBLE_WITH
ECONOMICALLY_EQUIVALENT_TO
SIMILAR_EXPOSURE_TO
SUPERSEDES
```

Relationship schema:

```ts
interface EconomicRelationship {
  id: string;

  subject: Ref;

  predicate: RelationshipType;

  object: Ref;

  state: ClaimState;

  evidence: Ref[];

  attestations: Ref[];

  inferredBy?: AgentRef;

  confidence?: number;

  observedAt?: number;

  validFrom?: number;

  validUntil?: number;
}
```

---

# 14. Claim Model

Everything action-relevant should be a claim.

```ts
interface Claim<T = unknown> {
  id: string;

  subject: Ref;

  property: string;

  value: T;

  unit?: string;

  state: ClaimState;

  sourceRefs: Ref[];

  evidenceRefs: Ref[];

  attestationRefs: Ref[];

  confidence?: number;

  observedAt?: number;

  validFrom?: number;

  expiresAt?: number;

  supersedes?: Ref;

  createdAt: number;
}
```

---

# 15. Claim States

```ts
enum ClaimState {
  UNKNOWN = "UNKNOWN",
  OBSERVED = "OBSERVED",
  SOURCED = "SOURCED",
  ATTESTED = "ATTESTED",
  VERIFIED = "VERIFIED",
  INFERRED = "INFERRED",
  CONFLICTING = "CONFLICTING",
  STALE = "STALE",
  REVOKED = "REVOKED"
}
```

These states should not be collapsed.

---

# 16. Evidence Model

```ts
interface Evidence {
  id: string;

  type:
    | "DOCUMENT"
    | "ORACLE"
    | "ONCHAIN_STATE"
    | "ATTESTATION"
    | "API_RESPONSE"
    | "FILING"
    | "PROOF"
    | "OTHER";

  source: Ref;

  contentHash: string;

  locator?: string;

  observedAt: number;

  fetchedAt: number;

  authority: EvidenceAuthority;

  freshness?: FreshnessState;

  metadata: Record<string, unknown>;
}
```

Raw evidence may live outside the chain.

Noema anchors commitments.

---

# 17. Attestation Model

Attestation:

> A named entity asserts a typed claim under a declared schema and validity window.

```ts
interface Attestation {
  id: string;

  subject: Ref;

  claimRef: Ref;

  schema: string;

  attestor: Ref;

  evidenceRoot?: string;

  signature: string;

  issuedAt: number;

  expiresAt?: number;

  revokedAt?: number;

  state:
    | "ACTIVE"
    | "EXPIRED"
    | "REVOKED";
}
```

Attestation does not automatically mean truth.

It means the attestor made the assertion.

---

# 18. Provenance Graph

Provenance should be queryable.

```text
Source
  ↓
Evidence
  ↓
Observation
  ↓
Claim
  ↓
Relationship
  ↓
EconomicObject
  ↓
Decision
```

Every decision must support reverse traversal.

Example:

```text
DecisionReceipt
   ↓
reasonCode
   ↓
claim
   ↓
evidence
   ↓
source
```

---

# 19. Deterministic Verification Engine

Responsibilities:

```text
signature verification
schema validation
hash verification
timestamp validation
freshness evaluation
revocation evaluation
contract reads
identifier parsing
proof verification
source availability
policy predicates
```

The deterministic verifier produces machine-readable checks.

```ts
interface VerificationCheck {
  id: string;

  type: string;

  subject: Ref;

  result:
    | "PASS"
    | "FAIL"
    | "UNRESOLVED";

  evidence: Ref[];

  ruleVersion: string;

  timestamp: number;
}
```

---

# 20. Verification Receipt

```ts
interface VerificationReceipt {
  id: string;

  objectId: string;

  objectVersion: number;

  verifierVersion: string;

  evidenceRoot: string;

  checks: VerificationCheck[];

  overall:
    | "VERIFIED"
    | "CONDITIONALLY_VERIFIED"
    | "UNVERIFIED"
    | "FAILED";

  createdAt: number;
}
```

An external verifier should be able to reproduce this result.

---

# 21. Noema AI

Noema AI is the reasoning subsystem inside Noema.

It is not the product itself.

Its job is:

> Convert ambiguous heterogeneous economic information into structured interpretations bounded by evidence.

---

# 22. Noema AI Capabilities

Conceptual capabilities:

### Resolver

Answers:

```text
What economic object is this?
```

### Claim Extractor

Transforms unstructured documents into proposed claims.

### Relationship Interpreter

Determines candidate relationships among representations.

### Rights Interpreter

Determines:

- redemption;
- ownership;
- distributions;
- transfer rights;
- restrictions.

### Conflict Analyst

Detects:

- contradictory claims;
- inconsistent definitions;
- incompatible evidence.

### Mandate Evaluator

Determines suitability relative to a policy.

### Financeability Analyst

Determines whether enough verified economic information exists to enter a financing workflow.

---

# 23. AI Tool Boundary

The model should use typed tools.

Example tool surface:

```text
fetch_source
read_contract
resolve_identifier
get_claims
get_evidence
verify_signature
check_attestation
query_relationships
register_inference
evaluate_policy
raise_exception
```

The AI should not directly mutate canonical state.

It proposes.

A deterministic reducer validates and commits accepted state.

---

# 24. AI Output Contract

AI output must be structured.

Example:

```json
{
  "proposedClaims": [],
  "proposedRelationships": [],
  "inferences": [],
  "conflicts": [],
  "unresolved": [],
  "explanation": "",
  "confidence": 0.87
}
```

Then the canonicalization engine determines what can be promoted.

---

# 25. Resolution Pipeline

```text
INPUT
  ↓
discover sources
  ↓
resolve identifiers
  ↓
extract candidate claims
  ↓
verify deterministic claims
  ↓
AI relationship interpretation
  ↓
cross-source reconciliation
  ↓
detect exceptions
  ↓
construct EconomicObject
  ↓
calculate verification state
  ↓
commit version
```

---

# 26. Economic Object States

```ts
enum EconomicObjectState {
  RESOLVED,
  PARTIALLY_RESOLVED,
  CONFLICTING,
  STALE,
  INSUFFICIENT_EVIDENCE,
  REVOKED,
  UNSUPPORTED
}
```

---

# 27. Resolution Exceptions

Noema needs explicit economic non-happy-path handling.

Initial exception types:

```text
EVIDENCE_STALE
EVIDENCE_CONFLICT
EVIDENCE_MISSING
IDENTITY_AMBIGUOUS
RELATIONSHIP_AMBIGUOUS
ATTESTATION_REVOKED
SOURCE_FAILURE
VERIFICATION_FAILED
POLICY_AMBIGUOUS
UNSUPPORTED_REPRESENTATION
```

Schema:

```ts
interface ResolutionException {
  id: string;

  objectId: string;

  type: string;

  severity:
    | "INFO"
    | "WARNING"
    | "BLOCKING";

  affectedClaims: Ref[];

  evidence: Ref[];

  detectedAt: number;

  status:
    | "OPEN"
    | "RESOLVED"
    | "SUPERSEDED"
    | "WAIVED";

  resolutionOptions?: ResolutionAction[];
}
```

---

# 28. Exception Semantics

Exceptions must alter downstream behavior.

Example:

```text
NAV attestation revoked
       ↓
ATTESTATION_REVOKED
       ↓
valuation claim = REVOKED
       ↓
EconomicObject = CONDITIONAL
       ↓
financeability = BLOCKED
       ↓
Corridor execution = DENIED
```

---

# 29. Mandate Model

```ts
interface Mandate {
  id: string;

  version: number;

  principal: Ref;

  objective: string;

  capital?: Money;

  allowedAssetClasses?: string[];

  prohibitedAssetClasses?: string[];

  minYield?: number;

  maxRedemptionPeriod?: Duration;

  maxEvidenceAge?: Duration;

  jurisdictions?: string[];

  requiredClaims?: ClaimRequirement[];

  requiredEvidence?: EvidenceRequirement[];

  restrictions?: PolicyRule[];

  expiresAt?: number;
}
```

---

# 30. Policy Evaluation

Noema should support deterministic and AI-assisted policy evaluation.

Example:

```text
Mandate:
yield >= 4%
NAV age <= 2h
redemption <= T+2
issuer verified
qualified-investor eligibility required
```

Asset:

```text
yield            PASS
NAV freshness    PASS
redemption       PASS
issuer           PASS
eligibility      UNRESOLVED
```

Result:

```text
CONDITIONAL
```

---

# 31. Decision Receipt

```ts
interface DecisionReceipt {
  id: string;

  objectId: string;
  objectVersion: number;

  mandateId: string;
  mandateVersion: number;

  decision:
    | "ALLOW"
    | "BLOCK"
    | "CONDITIONAL";

  reasonCodes: string[];

  supportingClaims: Ref[];

  exceptions: Ref[];

  evidenceRoot: string;

  verificationReceipt: Ref;

  createdAt: number;
}
```

This is Noema's primary machine-actionable output.

---

# 32. Financeability Envelope

Noema does not create loans.

It outputs a structured assessment.

```ts
interface FinanceabilityEnvelope {
  objectId: string;

  objectVersion: number;

  valuationBasis: EvidenceBoundValue;

  liquidity: LiquidityState;

  redemption: RedemptionState;

  transferability: Evaluation;

  ownershipEvidence?: Ref;

  collateralEligibility: Evaluation;

  evidenceRequirements: EvidenceRequirement[];

  unresolvedRisks: Ref[];

  exceptions: Ref[];

  generatedAt: number;
}
```

---

# 33. Truss Integration

Truss consumes:

```text
EconomicObject
+
FinanceabilityEnvelope
```

Truss outputs:

```text
FinancingStructure
```

Truss owns:

```text
principal
facility
advance rate
collateral relationships
cashflows
claims
commitments
obligations
interest
maturity
conditions
```

Boundary:

> Noema determines what is economically understood and financeable.

> Truss determines what financing structure should exist.

---

# 34. FinancingStructure

Conceptual:

```ts
interface FinancingStructure {
  id: string;

  version: number;

  borrower: Ref;

  lenders: Ref[];

  collateral: CollateralPosition[];

  principal: Money;

  duration: Duration;

  interestModel: InterestModel;

  conditions: Condition[];

  claims: Ref[];

  commitments: Commitment[];

  status:
    | "PROPOSED"
    | "VALID"
    | "ACTIVE"
    | "MATURED"
    | "INVALID";
}
```

---

# 35. Corridor Integration

Corridor consumes:

```text
DecisionReceipt
```

directly for:

```text
BUY
SELL
REDEEM
ALLOCATE
REBALANCE
```

or:

```text
FinancingStructure
```

for structured financing.

Corridor owns:

```text
authority
mandates
delegation
limits
counterparty constraints
commitments
execution conditions
settlement state
```

---

# 36. Corridor Decision

Example:

```text
Noema:
Asset = ALLOW

Truss:
Structure = VALID

Corridor:
DENY

Reason:
Agent spending authority capped at $500k.
Requested collateral action = $750k.
```

This demonstrates why suitability and authority remain separate.

---

# 37. Executable Mandate

```ts
interface ExecutableMandate {
  id: string;

  principal: Ref;

  executor: Ref;

  action: ActionType;

  subject: Ref;

  limits: PolicyRule[];

  conditions: Condition[];

  evidenceRequirements: Ref[];

  expiresAt: number;

  authorizationProof: Ref;
}
```

---

# 38. Gaia Integration

Gaia handles execution failures and recovery.

Noema handles epistemic failure.

Truss handles structural invalidity.

Corridor handles authority/execution failure.

Gaia handles:

```text
retry
pause
replace
refund
compensate
unwind
recover
escalate
```

---

# 39. Exception Propagation

```text
Source changes
     ↓
Noema ResolutionException
     ↓
Truss StructureException
     ↓
Corridor ExecutionException
     ↓
Gaia RecoveryCase
```

Example:

```text
NAV attestation revoked
       ↓
Noema:
asset = CONDITIONAL
       ↓
Truss:
collateral = INELIGIBLE
       ↓
Corridor:
execution = BLOCKED
       ↓
Gaia:
recovery case OPEN
```

---

# 40. Watch System

Noema must support continuous economic intelligence.

```ts
interface Watch {
  id: string;

  owner: Ref;

  target:
    | Ref
    | PortfolioRef
    | MandateRef;

  conditions: WatchCondition[];

  channels: DeliveryChannel[];

  enabled: boolean;

  createdAt: number;
}
```

---

# 41. Watch Conditions

Examples:

```text
NAV age > 2h
yield < 4%
attestation revoked
claim became conflicting
issuer changed
redemption changed
new representation discovered
relationship changed
asset became ineligible
financeability changed
```

---

# 42. Semantic Events

Avoid generic:

```text
record.updated
```

Use:

```text
claim.updated
claim.became_stale
claim.conflict_detected
attestation.created
attestation.revoked
evidence.invalidated
representation.discovered
relationship.changed
rights.changed
restriction.changed
redemption.changed
mandate.eligibility_changed
financeability.changed
object.superseded
```

---

# 43. Event Schema

```ts
interface NoemaEvent<T = unknown> {
  id: string;

  type: string;

  subject: Ref;

  previousVersion?: number;

  currentVersion?: number;

  cause?: Ref;

  payload: T;

  evidence: Ref[];

  createdAt: number;
}
```

---

# 44. Notification Architecture

```text
                   NOEMA EVENT BUS
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
         Webhook          MCP          Human
            │                            │
            ▼                    ┌───────┼───────┐
        external                Email Discord Telegram
        systems
```

Additional future channels:

```text
Slack
mobile push
WebSocket
SMS
custom queues
```

---

# 45. Webhook System

Example:

```http
POST /v1/webhooks
```

Payload delivery:

```json
{
  "event": "mandate.eligibility_changed",
  "asset": "noema:291",
  "previous": "ELIGIBLE",
  "current": "INELIGIBLE",
  "reason": "REDEMPTION_CHANGED",
  "objectVersion": 15,
  "evidenceRoot": "0x..."
}
```

Required production features:

```text
signatures
retry
dead-letter queue
idempotency key
delivery logs
secret rotation
endpoint verification
```

---

# 46. REST API

Initial endpoints:

```text
POST /v1/assets/resolve

GET  /v1/assets/:id

GET  /v1/assets/:id/claims

GET  /v1/assets/:id/evidence

GET  /v1/assets/:id/attestations

GET  /v1/assets/:id/relationships

GET  /v1/assets/:id/representations

POST /v1/assets/:id/verify

POST /v1/search

POST /v1/compare

POST /v1/evaluate

POST /v1/financeability

POST /v1/watches

GET  /v1/watches

DELETE /v1/watches/:id

POST /v1/webhooks
```

---

# 47. Search API

```ts
interface SearchRequest {
  query?: string;

  mandate?: Mandate;

  filters?: {
    assetClass?: string[];
    network?: string[];
    minYield?: number;
    maxRedemption?: string;
    verificationStatus?: string[];
  };
}
```

Search results should contain both:

```text
economic result
verification quality
```

---

# 48. Compare API

```http
POST /v1/compare
```

Example output:

```text
                   Asset A   Asset B   Asset C

Yield              4.6%      4.9%      5.1%
NAV age            20m       50m       31h
Redemption         T+1       T+2       T+1
Issuer verified    yes       yes       yes
Rights verified    yes       partial   yes
Evidence conflicts no        no        yes
Mandate            ALLOW     CONDITIONAL BLOCK
```

---

# 49. TypeScript SDK

Package:

```text
@noema/sdk
```

Example:

```ts
import { Noema } from "@noema/sdk";

const noema = new Noema({
  apiKey: process.env.NOEMA_API_KEY
});

const asset = await noema.assets.resolve({
  chain: "xlayer",
  address: "0x..."
});

const verification = await noema.assets.verify(asset.id);

const decision = await noema.mandates.evaluate({
  asset: asset.id,
  mandate
});
```

---

# 50. SDK Watch

```ts
const watch = await noema.watches.create({
  target: asset.id,
  conditions: [
    {
      type: "ATTESTATION_REVOKED"
    },
    {
      type: "NAV_STALE",
      maxAge: "2h"
    }
  ],
  channels: ["webhook"]
});
```

---

# 51. MCP Server

Core tools:

```text
noema.resolve_asset
noema.search_assets
noema.verify_asset
noema.inspect_claim
noema.inspect_evidence
noema.get_relationships
noema.get_representations
noema.compare_assets
noema.evaluate_mandate
noema.financeability
noema.create_watch
```

Resources:

```text
noema://assets/{id}

noema://assets/{id}/evidence

noema://assets/{id}/claims

noema://assets/{id}/relationships

noema://mandates/{id}

noema://watches/{id}
```

---

# 52. Human UX

The main surface should not look like a generic RWA dashboard.

Primary interaction:

```text
Ask Noema about an asset or mandate.
```

Example:

> Find tokenized Treasury exposure yielding above 4%, with T+2 or faster redemption and current NAV evidence.

---

# 53. Main Application Pages

### `/`

Agent workspace.

### `/discover`

Search and filter economic objects.

### `/asset/:id`

Economic Object Inspector.

### `/compare`

Compare objects.

### `/mandates`

Create and inspect policies.

### `/watches`

Continuous intelligence subscriptions.

### `/evidence/:id`

Evidence explorer.

### `/activity`

Events, decisions, attestations, revocations.

### `/developers`

API, SDK, MCP, webhook documentation.

---

# 54. Economic Object Inspector

The asset page should prioritize meaning, not token stats.

```text
NOEMA OBJECT #291

Tokenized Treasury Fund

Verification
CONDITIONALLY VERIFIED

Economic Identity
Fund Share Class A

Representations
Ethereum
X Layer

Issuer
Verified

NAV
$1.0273
Age: 43m
Verified

Yield
4.62%

Redemption
T+1
Attested

Rights
Redemption
Income distribution

Restrictions
Qualified investors only

Exceptions
Investor eligibility unresolved

[Evidence]
[Relationships]
[Representations]
[Evaluate]
[Financeability]
[Watch]
```

---

# 55. Evidence Explorer

Users should be able to inspect:

```text
Claim
  ↓
Evidence
  ↓
Attestor
  ↓
Source
```

Example:

```text
NAV = 1.0273

STATE
VERIFIED

SOURCE
Fund Administrator

ATTESTATION
signature valid

OBSERVED
43 minutes ago

ONCHAIN COMMITMENT
X Layer block ...
```

---

# 56. Relationship Explorer

Visual graph:

```text
                    Fund X
                      │
              ┌───────┴────────┐
              │                │
       SHARE_CLASS_OF    SHARE_CLASS_OF
              │                │
         Share A           Share B
              │
    REPRESENTED_BY
      ┌───────┴───────┐
      ▼               ▼
Ethereum Token    X Layer Token
```

This should be one of the most important visual surfaces.

---

# 57. Mandate Builder

User creates:

```text
Objective
Treasury Allocation

Capital
$250,000

Yield
>= 4%

Redemption
<= T+2

NAV age
<= 2 hours

Issuer
verified

Allowed
tokenized Treasury
money-market fund

Require
eligibility verified
```

The same policy should serialize to a machine-readable mandate.

---

# 58. Decision UX

Do not expose only a green/red recommendation.

Show:

```text
ALLOW

because:

✓ NAV current
✓ issuer verified
✓ yield satisfies mandate
✓ redemption satisfies mandate

with:

Evidence Root
Object Version
Policy Version
```

Or:

```text
CONDITIONAL

blocking:

Investor eligibility unresolved
```

---

# 59. Watch UX

Example:

```text
WATCH ASSET #291

Alert me if:

[x] NAV becomes stale
[x] attestation revoked
[x] redemption changes
[x] eligibility changes
[x] new representation discovered

Deliver via:

[x] Discord
[x] Webhook
[ ] Email
```

---

# 60. X Layer Architecture

X Layer should provide:

```text
verification anchoring
attestation state
object version commitments
evidence commitments
revocation
representation commitments
event/finality
optional execution
```

It should not be the only source of economic meaning.

---

# 61. Onchain Contracts

For the MVP, favor one consolidated registry rather than unnecessary contract proliferation.

Recommended:

```text
NoemaRegistry.sol
```

Potential later split:

```text
NoemaObjectRegistry
NoemaEvidenceRegistry
NoemaAttestationRegistry
NoemaRepresentationRegistry
```

---

# 62. NoemaRegistry State

```solidity
struct ObjectCommitment {
    bytes32 objectId;
    bytes32 objectRoot;
    bytes32 evidenceRoot;
    uint64 version;
    uint64 updatedAt;
    bool active;
}
```

---

# 63. NoemaRegistry Functions

```solidity
registerObject(
    bytes32 objectId,
    bytes32 objectRoot,
    bytes32 evidenceRoot
)

updateObject(
    bytes32 objectId,
    uint64 expectedVersion,
    bytes32 newObjectRoot,
    bytes32 newEvidenceRoot
)

attestClaim(
    bytes32 objectId,
    bytes32 claimId,
    bytes32 attestationHash
)

revokeAttestation(
    bytes32 objectId,
    bytes32 claimId,
    bytes32 attestationHash
)

registerRepresentation(
    bytes32 objectId,
    bytes32 representationId,
    bytes32 relationshipHash
)
```

---

# 64. Events

```solidity
event ObjectRegistered(
    bytes32 indexed objectId,
    uint64 version,
    bytes32 objectRoot,
    bytes32 evidenceRoot
);

event ObjectUpdated(
    bytes32 indexed objectId,
    uint64 previousVersion,
    uint64 newVersion,
    bytes32 objectRoot,
    bytes32 evidenceRoot
);

event ClaimAttested(
    bytes32 indexed objectId,
    bytes32 indexed claimId,
    bytes32 attestationHash
);

event AttestationRevoked(
    bytes32 indexed objectId,
    bytes32 indexed claimId,
    bytes32 attestationHash
);

event RepresentationRegistered(
    bytes32 indexed objectId,
    bytes32 indexed representationId,
    bytes32 relationshipHash
);
```

---

# 65. Object Hashing

Canonical JSON representation must use deterministic serialization.

Conceptually:

```text
EconomicObject
      ↓
canonical serialization
      ↓
hash
      ↓
objectRoot
```

Evidence references similarly produce:

```text
evidence leaves
      ↓
Merkle tree
      ↓
evidenceRoot
```

---

# 66. Why Not Store Everything Onchain

Because:

```text
legal documents can be large
source data changes frequently
AI interpretations evolve
data may be confidential
storage is expensive
```

Store commitments and essential shared state.

Keep rich content in indexed storage.

---

# 67. Storage Architecture

Recommended MVP:

```text
Postgres
+
JSONB
+
object storage
```

Potential graph abstraction can initially be represented relationally.

Production evolution may add:

```text
graph DB
search index
vector index
event warehouse
```

Do not introduce them until necessary.

---

# 68. Suggested Database Tables

```text
economic_objects
object_versions
identifiers
representations
relationships
claims
evidence
attestations
provenance_edges
resolution_exceptions
mandates
decision_receipts
verification_receipts
financeability_envelopes
watches
events
webhook_deliveries
sources
adapters
```

---

# 69. Versioning

Never mutate historical canonical state silently.

```text
Object 291 v12
       ↓
Object 291 v13
       ↓
Object 291 v14
```

Each version references:

```text
objectRoot
evidenceRoot
resolution policy
AI interpreter version
verifier version
timestamp
```

---

# 70. Object Supersession

A change may be:

```text
VALUE_UPDATE
EVIDENCE_UPDATE
RELATIONSHIP_UPDATE
RESTRICTION_UPDATE
REPRESENTATION_UPDATE
REVOCATION
CLASSIFICATION_UPDATE
```

Old versions remain queryable.

---

# 71. Source Freshness

Each source adapter declares freshness semantics.

Example:

```ts
interface FreshnessPolicy {
  expectedUpdateInterval?: number;
  staleAfter: number;
  hardExpireAfter?: number;
}
```

Freshness is evaluated per claim, not globally.

---

# 72. Event Processing

Architecture:

```text
source poll / webhook / chain event
        ↓
observation created
        ↓
affected claims identified
        ↓
reverification
        ↓
economic object rebuild
        ↓
new version
        ↓
mandates reevaluated
        ↓
semantic events emitted
        ↓
watches triggered
```

---

# 73. Jobs / Workers

MVP workers:

```text
source ingestion worker
verification worker
AI resolution worker
object reducer
watch evaluator
webhook delivery worker
X Layer indexer
```

---

# 74. AI Job Isolation

AI calls should be asynchronous where appropriate.

Never hold canonical API requests open unnecessarily.

State:

```text
QUEUED
RUNNING
COMPLETED
FAILED
REQUIRES_REVIEW
```

---

# 75. Human Review

Some cases require human review.

Examples:

```text
high-value ambiguous equivalence
conflicting legal interpretation
issuer identity conflict
manual attestation acceptance
unsupported instrument type
```

Review should generate a signed/referenced decision.

Do not silently overwrite AI output.

---

# 76. Trust Model

Noema does not claim universal truth.

Trust sources include:

```text
issuer
fund administrator
oracle
custodian
regulatory filing
smart contract
attestor
human reviewer
Noema inference
```

These should have explicit authority categories.

---

# 77. Evidence Authority

```ts
type EvidenceAuthority =
  | "PRIMARY_SOURCE"
  | "AUTHORIZED_ATTESTOR"
  | "INDEPENDENT_OBSERVER"
  | "MARKET_DATA"
  | "DERIVED"
  | "AI_INFERENCE";
```

This becomes important during conflict resolution.

---

# 78. Conflict Resolution Policy

Conflict resolution should consider:

```text
source authority
specificity
freshness
scope
instrument/share class
jurisdiction
representation
direct vs derived
```

Noema AI can explain conflicts.

Only declared resolution policy should determine canonical promotion.

---

# 79. Security Model

Threats include:

```text
malicious issuer data
compromised source APIs
stale replayed evidence
attestation forgery
representation spoofing
prompt injection in documents
AI hallucination
source impersonation
API abuse
webhook spoofing
contract privilege abuse
```

---

# 80. Prompt Injection Defense

Issuer documents are untrusted data.

The AI pipeline must treat document text as evidence, not instructions.

Document parser output should be normalized before model use.

Model system rules must prohibit execution of embedded instructions.

---

# 81. Attestation Security

Verify:

```text
attestor identity
signature
schema
subject
claim scope
validity window
revocation
```

Never equate:

```text
valid signature
```

with:

```text
true claim
```

---

# 82. Contract Security

MVP contracts should minimize privileged functionality.

Required:

```text
role separation
pause
upgrade strategy declared
replay protection
version checks
event completeness
access-controlled attestation where needed
```

Avoid unnecessarily upgradeable complexity if the hackathon contract can remain simple.

---

# 83. Authorization

Noema itself should primarily be read-oriented.

Write permissions:

```text
source ingestion
attestation creation
review approval
registry publishing
watch creation
```

Execution authority belongs to Corridor.

---

# 84. Privacy

Private evidence should not be publicly uploaded by default.

Support:

```text
encrypted evidence storage
hash commitment
selective disclosure
private attestation
ZK proof adapter later
```

---

# 85. ZK Integration

Optional.

Potential proof use cases:

```text
prove eligibility without identity disclosure
prove reserves above threshold
prove portfolio exposure below mandate
prove jurisdictional rule satisfied
```

ZK does not replace source provenance.

---

# 86. Observability

Every pipeline operation should carry:

```text
traceId
requestId
objectId
objectVersion
sourceId
adapterId
agentRunId
verificationReceiptId
```

---

# 87. Metrics

Core operational metrics:

```text
resolution latency
verification latency
source freshness
source failure rate
AI extraction failure rate
claim conflict rate
object update frequency
watch trigger latency
webhook delivery success
chain anchoring latency
```

---

# 88. Product Metrics

More important than raw API calls:

```text
assets successfully resolved
claims independently verified
ambiguous equivalence prevented
mandate evaluations performed
unsafe actions blocked
material changes detected
developer integrations
active watches
```

---

# 89. Build X MVP

The MVP should demonstrate one vertical deeply.

## User objective

> Allocate $250,000 into tokenized Treasury assets yielding above 4%, redeemable within T+2, with current NAV evidence and verified issuer provenance.

---

# 90. MVP Data Set

Use approximately:

```text
3–5 RWA objects
```

Deliberately include:

### Asset A

Genuine cross-representation equivalence.

### Asset B

Similar economic exposure but different rights.

### Asset C

Strong headline economics but stale/conflicting evidence.

Optional:

### Asset D

Restricted holder eligibility.

---

# 91. MVP Source Types

Minimum:

```text
onchain token data
issuer/source document
market/indexer observation
attestation
```

Do not pretend every source is live if it is mocked.

Clearly label:

```text
LIVE
CACHED
DEMO_FIXTURE
SIMULATED
```

---

# 92. MVP Flow

```text
User submits mandate
       ↓
Noema discovers assets
       ↓
AI resolves economic meaning
       ↓
claims + evidence constructed
       ↓
verification engine checks claims
       ↓
EconomicObjects created
       ↓
Noema compares candidates
       ↓
mandate evaluated
       ↓
ALLOW / CONDITIONAL / BLOCK
       ↓
DecisionReceipt
       ↓
object/evidence roots anchored X Layer
       ↓
Watch created
       ↓
attestation revoked
       ↓
object changes
       ↓
mandate result changes
       ↓
notification emitted
```

This proves the core product.

---

# 93. MVP X Layer Requirements

Required:

```text
NoemaRegistry deployed
object commitment written
evidence commitment written
attestation written
revocation demonstrated
events indexed
```

Optional:

```text
Corridor execution gate
Agentic Wallet execution
```

---

# 94. MVP Developer Surfaces

Required:

```text
REST API
TypeScript SDK
MCP
Webhook
```

Human notification:

```text
Discord
```

Email can follow.

---

# 95. MVP UI

Minimum pages:

```text
Agent Workspace
Asset Inspector
Evidence Inspector
Compare
Mandate Result
Watches / Activity
Developer
```

---

# 96. Demo Story

The strongest demo is not a feature tour.

It is a causal story.

### Scene 1 — Intent

User:

> Find eligible tokenized Treasury exposure.

### Scene 2 — Discovery

Noema finds several representations.

### Scene 3 — Resolution

Noema shows that some are equivalent, some merely similar.

### Scene 4 — Evidence

Noema proves why.

### Scene 5 — Decision

One asset passes.

Another fails because of rights.

Another fails because of stale evidence.

### Scene 6 — X Layer

The selected economic object and evidence root are independently anchored.

### Scene 7 — Continuous verification

An attestation is revoked.

### Scene 8 — Consequence

Noema updates the object.

Mandate changes:

```text
ALLOW → CONDITIONAL
```

### Scene 9 — Notification

Webhook/MCP/Discord event fires.

### Scene 10 — Action boundary

Corridor blocks execution.

That is the complete story.

---

# 97. Truss Demo Extension

Optional final button:

```text
[Structure Financing]
```

Noema emits:

```text
FinanceabilityEnvelope
```

Truss produces:

```text
$100k asset
75% advance rate
$75k proposed facility
```

Do not build a full lending protocol for the hackathon.

---

# 98. Corridor Demo Extension

Optional:

```text
DecisionReceipt
       ↓
Corridor mandate
       ↓
AUTHORIZED / DENIED
```

Use this to prove that:

```text
economic eligibility
≠
execution authority
```

---

# 99. Gaia Demo Extension

Not necessary for Build X.

Long-term:

```text
execution started
       ↓
Noema state changes
       ↓
Truss invalidated
       ↓
Corridor detects execution risk
       ↓
Gaia recovery
```

---

# 100. Suggested Repository Structure

```text
noema/
│
├── apps/
│   ├── web/
│   ├── api/
│   ├── mcp/
│   └── workers/
│
├── packages/
│   ├── economic-kernel/
│   ├── noema-core/
│   ├── verification/
│   ├── ai/
│   ├── adapters/
│   ├── events/
│   ├── sdk/
│   └── contracts/
│
├── adapters/
│   ├── xlayer/
│   ├── issuer/
│   ├── market/
│   ├── oracle/
│   └── demo/
│
├── contracts/
│   └── NoemaRegistry.sol
│
├── schemas/
│   ├── economic-object.schema.json
│   ├── claim.schema.json
│   ├── evidence.schema.json
│   ├── attestation.schema.json
│   ├── mandate.schema.json
│   └── receipt.schema.json
│
├── fixtures/
│
├── tests/
│
└── docs/
```

---

# 101. Backend Stack

Recommended MVP:

```text
FastAPI or TypeScript API
Postgres
Redis optional
background workers
object storage
EVM client
LLM provider
```

Do not introduce microservices unnecessarily.

A modular monolith is appropriate for the MVP.

---

# 102. Frontend Stack

Recommended:

```text
Next.js
TypeScript
React
server components where useful
wallet integration
graph visualization library
```

The UI should feel like an economic intelligence workstation, not a token screener.

---

# 103. Testing Strategy

## Unit tests

Test:

```text
claim state transitions
freshness
revocation
relationship classification reducer
mandate rules
receipt creation
hash generation
```

## Contract tests

Test:

```text
object registration
version increments
stale version rejection
attestation
revocation
representation registration
events
permissions
```

## Integration tests

Test:

```text
source → claim
claim → verification
verification → object
object → mandate
object update → watch
watch → webhook
registry event → indexer
```

---

# 104. Critical Semantic Tests

These matter more than generic code coverage.

### Test A

Two bridged representations with valid issuer evidence.

Expected:

```text
ECONOMICALLY_EQUIVALENT
```

### Test B

Same underlying fund, different share classes.

Expected:

```text
RELATED
NOT EQUIVALENT
```

### Test C

Similar Treasury exposure, unrelated issuer.

Expected:

```text
SIMILAR_EXPOSURE_TO
```

### Test D

NAV exceeds mandate freshness.

Expected:

```text
STALE
BLOCK
```

### Test E

Attestation revoked.

Expected:

```text
claim = REVOKED
object version increments
mandate reevaluated
watch event emitted
```

---

# 105. AI Evaluation Tests

Create a fixed benchmark of difficult documents and relationships.

Measure:

```text
claim extraction accuracy
relationship classification accuracy
false equivalence rate
conflict detection
unsupported inference rate
policy reasoning accuracy
```

The most important failure metric:

> **False positive authorization caused by semantic interpretation.**

Optimize aggressively against that.

---

# 106. Security Tests

Test:

```text
malicious PDF instructions
fake issuer domain
signature replay
expired attestation
revoked attestation
incorrect object root
relationship spoofing
webhook replay
API tenant isolation
```

---

# 107. Demo vs Production Boundaries

## Necessary for the idea

```text
EconomicObject
claims
evidence
AI interpretation
verification
mandate evaluation
```

## Necessary for convincing demo

```text
realistic assets
X Layer registry
attestation/revocation
Watch
SDK
MCP
one notification channel
```

## Production requirements

```text
multi-source redundancy
institutional identity
strong tenant isolation
comprehensive audit
high availability
source SLA tracking
formal schema governance
privacy controls
human review
disaster recovery
```

## Can wait

```text
advanced ZK
Exchange OS integration
full Truss
full Corridor
full Gaia
many chains
mobile application
complex graph infrastructure
```

---

# 108. Product Invariants

These should require explicit product review before changing.

1. Noema models economic objects, not merely tokens.
2. Every action-relevant conclusion remains traceable to evidence or declared inference.
3. AI inference cannot silently become verified fact.
4. Similar exposure never automatically implies equivalence.
5. Technical representation and economic identity remain distinct.
6. Existing standards and identifiers should be composed rather than unnecessarily replaced.
7. Stale, conflicting, revoked, missing, or ambiguous evidence must remain visible.
8. Noema may assess financeability but does not own financing structure.
9. Noema does not own execution authority.
10. Execution failures belong downstream.
11. Historical canonical versions are not silently overwritten.
12. Verification results remain reproducible relative to explicit versions and policies.
13. Noema does not claim universal economic truth.

---

# 109. Negative Invariants

Noema must not drift into:

```text
generic RWA dashboard
generic RWA indexer
oracle network
tokenization platform
global identifier replacement
bridge
yield bot
lending market
compliance engine
exchange
generic AI chatbot
```

---

# 110. Product Moat

Potential defensibility comes from the combination of:

```text
economic relationship graph
claim-level evidence model
resolution policy
versioned verification
continuous semantic monitoring
agent mandate evaluation
developer integrations
historical economic state
```

Not merely from:

```text
an LLM
an API
a smart contract
```

---

# 111. Network Effects

Noema becomes stronger as:

```text
more issuers publish evidence
more economic objects are resolved
more representation relationships are mapped
more agents integrate
more mandate patterns exist
more attestations become reusable
```

The system can develop an increasingly rich machine-readable economic graph.

---

# 112. Issuer Integration

Long-term issuers should be able to publish:

```text
Noema Manifest
```

Example:

```json
{
  "issuer": "issuer:xyz",
  "assets": [],
  "evidenceEndpoints": [],
  "attestationSchemas": [],
  "representations": [],
  "contact": "..."
}
```

Potential discovery:

```text
/.well-known/noema
```

This is optional future protocolization.

---

# 113. Economic Graph Expansion

Although the initial product is RWA-focused, the core economic object abstraction can eventually model:

```text
asset
claim
obligation
position
facility
commitment
cashflow
```

Do not expand there during the MVP.

Truss owns most relationship-heavy financing semantics.

---

# 114. Scaling Model

Noema scales across three dimensions.

### Semantic scale

More economic object types.

### Network scale

More representations and execution environments.

### Institutional scale

More policies, mandates, issuers, and agent integrations.

Truss and Corridor scale Noema **up the economic stack**, not its database throughput.

---

# 115. Long-Term Stack

```text
                 AUTONOMOUS CAPITAL SYSTEMS
                            │
                            ▼
                         CORRIDOR
                   Authority / Execution
                            │
                            ▼
                          TRUSS
                   Financial Structure
                            │
                            ▼
                          NOEMA
                  Economic Comprehension
                            │
                            ▼
                         SOURCES
```

Gaia surrounds the execution path as recovery infrastructure.

---

# 116. Long-Term Institutional Scenario

Institution:

> We hold $20m across Ethereum, X Layer, Canton, and traditional custody. Raise $8m for 45 days without selling Treasury exposure. Preserve liquidity requirements and use only approved counterparties.

Noema:

```text
resolve entire portfolio
map representations
verify evidence
identify rights
determine financeability
```

Truss:

```text
construct financing structures
```

Corridor:

```text
authorize agents
coordinate counterparties
enforce capital limits
```

Execution:

```text
venues / wallets / settlement
```

Gaia:

```text
recover if execution diverges
```

---

# 117. Ultimate Product Category

Noema should not ultimately be framed as:

```text
RWA analytics
```

Its stronger category is:

# Verifiable Economic Intelligence

More specifically:

> **Economic comprehension infrastructure for autonomous capital.**

---

# 118. Primary One-Liner

> **Noema gives autonomous agents a verifiable, continuously updated understanding of real-world assets—what they economically represent, what evidence supports them, what changed, and what the agent can safely do with them.**

---

# 119. Developer One-Liner

> **Noema turns fragmented RWA representations, claims, and evidence into machine-readable economic objects that agents can verify, evaluate, monitor, and finance.**

---

# 120. Technical Primitive

> **Evidence-Bounded Economic Object**

---

# 121. Strategic Positioning

The architectural progression is:

```text
Data
  ↓
Evidence
  ↓
Meaning
  ↓
Decision
  ↓
Structure
  ↓
Authority
  ↓
Execution
  ↓
Recovery
```

Mapped to the stack:

```text
Sources
  ↓
Noema
  ↓
Truss
  ↓
Corridor
  ↓
Execution
  ↓
Gaia
```

---

# 122. Build Order

The shortest defensible implementation path is:

```text
1. Economic kernel

2. EconomicObject schema

3. Claim + Evidence models

4. Source adapters

5. Verification engine

6. Noema AI structured resolver

7. Mandate evaluator

8. DecisionReceipt

9. NoemaRegistry on X Layer

10. X Layer event indexer

11. Watch engine

12. REST API

13. TypeScript SDK

14. MCP

15. Discord/Webhook alert

16. Economic Object Inspector UI

17. three semantic demo cases

18. optional FinanceabilityEnvelope

19. optional Corridor gate
```

Everything else waits until this vertical works.

---

# 123. Acceptance Criteria

Noema MVP is successful when an evaluator can independently observe:

### Economic resolution

The system distinguishes economic equivalence from similarity.

### Evidence traceability

Every decisive claim can be traced to evidence.

### Verification

Another system can verify the relevant commitment/state.

### AI necessity

The AI performs semantic interpretation that deterministic indexing alone does not provide.

### Failure honesty

The system returns conditional/blocking states rather than inventing certainty.

### Continuous intelligence

A material evidence change updates the object and triggers reevaluation.

### X Layer necessity

X Layer provides shared commitments, attestations, revocations, version history, and events.

### Agent accessibility

An external agent can use Noema through MCP or SDK.

### Composability

Noema can hand a DecisionReceipt to Corridor and a FinanceabilityEnvelope to Truss.

---

# 124. Final Architecture Statement

Noema should be built around a simple but strict idea:

> **An autonomous agent should never be asked to act on an economic object it cannot meaningfully identify, evidence, interpret, and verify.**

Noema therefore sits between fragmented economic information and financial action.

It consumes the existing financial world:

```text
tokens
documents
oracles
indexers
identifiers
attestations
compliance
markets
```

and resolves them into:

```text
Evidence-Bounded Economic Objects
```

Those objects allow agents to answer:

```text
What is this?

What rights does it convey?

How is it related to other representations?

What evidence supports these claims?

Which evidence is stale or revoked?

What remains uncertain?

Does it satisfy my mandate?

Can it enter a financing workflow?

What changed since the last decision?
```

Noema does not own every subsequent financial action.

Instead:

> **Noema understands.**

> **Truss structures.**

> **Corridor authorizes and coordinates.**

> **Gaia recovers.**

All four can share one economic kernel without becoming one monolithic product.

That separation allows Noema to remain a clean, independently useful primitive while also becoming the economic comprehension foundation for a much larger agent-native financial system.

The immediate implementation target is intentionally smaller than the long-term architecture:

> **Resolve real RWAs → prove the evidence → reason over them → evaluate a mandate → anchor the result on X Layer → detect when reality changes → notify agents → block unsafe action.**

If that vertical works end-to-end, Noema has demonstrated its core thesis.

Everything beyond it is expansion rather than rescue.
