# Contributing to Noema

Read PRODUCT_TRUTH.md and HASHING_SPEC.md before changing domain behavior.
Product invariants outrank implementation convenience.

## Non-negotiables

- Model economic objects, not just tokens.
- Preserve evidence, provenance, uncertainty, conflicts, staleness, and
  revocation.
- Deterministic code decides verified state.
- Similar exposure never implies economic equivalence.
- Technical representations remain distinct from economic identity.
- Historical object versions are immutable.
- Noema assesses financeability but does not own financing or execution
  authority.
- Never claim a live integration, chain deployment, signature, or notification
  without its evidence artifact.

## Build order

Keep the golden path small and inspectable:

resolve -> evidence -> verify -> interpret -> evaluate -> commit -> watch ->
re-evaluate -> notify

The current milestone is the economic kernel, schemas, semantic fixtures,
canonical hashing, and deterministic verification. Defer UI, execution, Truss,
Corridor, and Gaia until that foundation is green.

## Change discipline

- Keep public domain types in packages/economic-kernel.
- Keep runtime validation in packages/schemas.
- Keep canonical serialization and roots in packages/canonicalization.
- Keep verification pure and deterministic in packages/verification.
- Keep reducers in packages/noema-core.
- Add an ADR for a cross-package semantic change.
- Never put credentials in source, fixtures, commits, or test output.
