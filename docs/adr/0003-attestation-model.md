# ADR 0003: Attestation model

## Context

An attestation records an assertion by a named party; it does not prove
universal truth.

## Decision

Keep attestation state separate from claim state and deterministic
verification. Revocation and expiry remain first-class.

## Consequences

A revoked or expired attestation can change downstream policy state without
pretending that the issuer's assertion never existed.

## Reopen condition

Reopen when a deployed issuer or attestor protocol requires a compatible
typed-signature envelope.
