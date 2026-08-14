# ADR 0006: Source authority policy

## Context

Issuer, onchain, oracle, reference, market, derived, and AI evidence do not
have interchangeable authority.

## Decision

Store authority classes on evidence and resolve claims using scope,
specificity, freshness, revocation, and conflicts. Do not reduce authority to a
single global trust score.

## Consequences

The provenance graph preserves why a source influenced a claim.

## Reopen condition

Reopen only when a concrete source protocol supplies a stronger typed policy
model.
