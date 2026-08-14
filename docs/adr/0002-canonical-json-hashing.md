# ADR 0002: Canonical JSON hashing

## Context

Roots must be reproducible across runtimes.

## Decision

Use RFC 8785 JCS followed by UTF-8 Keccak-256, with the domains defined in
HASHING_SPEC.md.

## Consequences

Canonical roots can be replayed and anchored on EVM networks. Operational
timestamps are excluded from the object projection.

## Reopen condition

Reopen if a cross-runtime test demonstrates incompatible JCS output or if an
explicit interoperability requirement demands another wire format.
