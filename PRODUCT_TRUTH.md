# Noema Product Truth

## Definition

Noema is a verifiable economic intelligence layer for real-world assets. It
resolves fragmented representations, issuer information, documents,
attestations, observations, restrictions, and provenance into
Evidence-Bounded Economic Objects.

The object is not merely a normalized token record. It is a versioned,
machine-readable interpretation of what an economic representation means, which
claims support that interpretation, what remains uncertain, and what changed.

## Core primitive

Evidence-Bounded Economic Object

An object contains economic classification, identifiers, representations,
relationships, parties, rights, obligations, restrictions, economics, claims,
evidence, attestations, exceptions, provenance, verification state, and an
immutable version.

## Product invariants

1. Noema models economic objects, not merely tokens.
2. Every action-relevant conclusion is traceable to evidence or explicit
   inference.
3. AI inference cannot silently become VERIFIED.
4. Similar economic exposure does not imply economic equivalence.
5. Technical representation and economic identity remain distinct.
6. Existing identifiers and standards are composed, not needlessly replaced.
7. Stale, conflicting, revoked, missing, and ambiguous evidence stays visible.
8. Noema can assess financeability but does not own the financing structure.
9. Noema does not own execution authority.
10. Execution recovery belongs downstream.
11. Historical canonical versions are never silently overwritten.
12. Verification is reproducible relative to explicit evidence, rule, model, and
    policy versions.
13. Noema does not claim universal truth.

## Negative boundary

Noema is not a generic RWA dashboard, generic indexer, oracle network,
tokenization platform, identifier replacement, bridge, yield bot, lending
market, compliance engine, exchange, or opaque chatbot.

## Golden path

resolve -> evidence -> verify -> interpret -> evaluate -> commit -> watch ->
re-evaluate -> notify

The initial build proves only the foundation of this path. All unimplemented
integrations must remain explicitly marked E0.
