# RWA Economic Validation Profiles Usage

**Import:** `@noema/noema-core/profile`
**Source:** `packages/noema-core/src/profile.ts`; schema in `packages/schemas/src/index.ts` (`noema:validation-profile` v1).

## Purpose

Defines versioned evidence-sufficiency profiles for classes of RWA economic objects (fund shares, private-fund interests, debt instruments, wrapped/bridged representations, book-entry mirrors) without turning Noema into a universal legitimacy/compliance oracle. A profile declares which economic dimensions are required vs optional to reach a given Noema resolution state — issuer/vehicle identity, share class, ownership rights, redemption, eligibility, transfer restrictions, valuation/NAV, backing, custody, representation lineage, source authority, freshness — plus the evidence requirements behind each dimension.

A profile describes evidence sufficiency only. It never declares an asset "legitimate" or suitable for investment, and it never evaluates mandates.

## Primary exports

- `evaluateValidationProfile(profile, object, ctx)` → `ProfileEvaluationResult`
- `selectApplicableProfiles(profiles, object)` → `ValidationProfile[]`
- `evaluateProfileSet(profiles, object, ctx)` → `ProfileSetEvaluation`
- `PROFILE_ENGINE_VERSION`, `PROFILE_REASON_CODES`, `ACCEPTABLE_CLAIM_STATES`
- Types: `ValidationProfile`, `ValidationDimension`, `ValidationDimensionRequirement` (from `@noema/schemas`), `ProfileEvaluationResult`, `ProfileDimensionResult`, `ProfileSetEvaluation`, `ProfileEvaluationContext`

## Minimal example

```ts
import { evaluateProfileSet } from "@noema/noema-core/profile";
import { noemaSchemaRegistry } from "@noema/schemas";

const profiles = noemaSchemaRegistry.decode<ValidationProfile[]>(profilesArtifact);
const result = evaluateProfileSet(profiles, economicObject, { nowMs: Date.now() });
// result.overall, result.applicable[].resolution,
// result.applicable[].reasonCodes, result.applicable[].requiredClaims
```

## Resolution semantics

Deterministic, evidence-bounded:

- Asset-class mismatch → `UNSUPPORTED` with `PROFILE_UNSUPPORTED_ASSET_CLASS:<object class>`.
- Required dimension with conflicting/revoked claims → `CONFLICTING` (`PROFILE_DIMENSION_CONFLICTING:<dimension>`).
- Required dimension with stale claims → `STALE` (`PROFILE_DIMENSION_STALE:<dimension>`).
- Required dimension missing a claim or required evidence → `INSUFFICIENT_EVIDENCE` (`PROFILE_DIMENSION_MISSING:<dimension>` / `PROFILE_EVIDENCE_MISSING:<dimension>`).
- All required satisfied and all optional dimensions present → `RESOLVED`.
- All required satisfied but an optional dimension absent → `PARTIALLY_RESOLVED`.

Missing required dimensions produce unresolved results and reason codes — never invented facts. Claim states `OBSERVED | SOURCED | ATTESTED | VERIFIED` count as present; conflicting/revoked/stale claims remain visible in reason codes.

## Economic resolution vs mandate suitability

Profile evaluation never reads a mandate and never declares suitability. A profile may resolve `RESOLVED` while a treasury mandate BLOCKs the same object (e.g., asset class prohibited, redemption period too long). This separation is explicit: `ProfileEvaluationResult.distinguishesMandateSuitability` is always `true`.

## Same asset class, materially different profiles

The same broad asset class can contain materially different profiles. Example: `TOKENIZED_TREASURY` hosts `WRAPPED_REPRESENTATION` (requires `representationLineage`) and `DEBT_INSTRUMENT` (requires `obligationTerms`, not `representationLineage`). `evaluateProfileSet` reports both; a single object is never forced into one profile, and candidates never resolve identically across materially different profiles.

## Frontend-safe usage

**Yes**, read-only and serializable plain data. Do not construct or mutate profiles from frontend code.

## Authority / non-responsibilities

The engine consumes a profile artifact (runtime-validated by `noemaSchemaRegistry`) and a canonical `EconomicObject`. It does not fetch evidence, verify signatures, promote claims, evaluate mandates, or select canonical truth. Profile mappings for real candidates (BENJI/OUSG/TBILL) are structural; real candidate evidence wiring happens in #35 live capture.

## Failure / uncertainty

- Unsupported class → `UNSUPPORTED`, never coerced.
- Missing/stale/conflicting/ambiguous evidence fails closed into `INSUFFICIENT_EVIDENCE`, `STALE`, `CONFLICTING`, or `PARTIALLY_RESOLVED`.
- Reason codes are stable strings of the form `PROFILE_DIMENSION_<STATE>:<dimension>`.

## Compatibility

Schema id `noema:validation-profile`, version 1. Profiles are versioned artifacts; changing a profile bumps its `profileVersion`. #57 declares dependency on #56 (schema conformance/migration freeze) which is out of scope for this module.

## Proof

- `tests/integrity/validation-profiles.test.ts` (12 tests: schema roundtrip, positive, missing-evidence, conflicting, stale, stale-evidence, unsupported, resolution-vs-mandate, same-class-different-profiles, candidate mapping, traceable reason codes)
- QA dependency: `validation-profiles`