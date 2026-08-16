# Noema AI Semantic Relationship Interpretation Usage

## Purpose

Provides the bounded backend reasoning job for proposing economic relationships between two representations from structured economic dimensions and evidence. It is designed around Noema's core rule that labels, names, tickers, and similar exposure do not establish economic identity or equivalence.

**Status:** internal backend module; not a package export.  
**Source:** `packages/noema-ai/src/relationships.ts`

## Intended consumers

Noema AI orchestration and integrity tests. Frontend code must not invoke this interpreter directly.

## Inputs

- left/right representation profiles containing economic claim, issuer, share class, exposure, rights, restrictions, backing, redemption and evidence freshness;
- relevant proposed claims, rights, restrictions;
- explicit representation links;
- bounded SourceSnapshot/Evidence scope;
- an injected relationship model.

Optional names/tickers may be supplied for context but are deliberately non-authoritative.

## Outputs

- `ProposedRelationship[]` using canonical Noema predicates;
- `ProposedUnresolvedIssue[]` for unsupported dimensions or ambiguity.

Each relationship records supporting claim refs, exact evidence locators, compared dimensions, unresolved dimensions, confidence and optional explanation.

## Minimal example

```ts
const result = await classifyRelationships({
  left,
  right,
  links,
  claims,
  rights,
  restrictions,
  evidenceScope,
  model
});
```

## Frontend-safe usage

None. Frontend should render stored proposals or canonical relationships from `@noema/noema-core/ui` / `surfaces`; it must never infer economic equivalence from labels or presentation metadata.

## Authority boundary

The model is proposal-only. This boundary adds a deterministic safety check for any proposed `ECONOMICALLY_EQUIVALENT_TO` relationship: all material comparison dimensions must be present with no unresolved dimensions, and the canonical semantic resolver must independently satisfy equivalence requirements. A model cannot override that result with confidence.

The module still does not promote proposals into canonical EconomicObject relationships; deterministic promotion belongs to #30.

## Failure semantics

Malformed output, foreign evidence refs, unknown supporting claims, invalid relationship endpoints, incomplete equivalence dimensions and false-equivalence proposals fail closed. Unsupported relationship dimensions should produce unresolved issues rather than forced classifications.

## Compatibility

Changes to the material equivalence dimension set must remain aligned with `@noema/noema-core/semantic` and Product Truth. Promotion to a public export requires stable dependencies plus usage/index/catalog updates and CI proof.

## Proof

- `tests/integrity/ai-relationship-interpretation.test.ts`
- `tests/integrity/semantic-resolution.test.ts`
- AI QA gate: `ai-relationship-interpretation`
