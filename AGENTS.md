# Noema agent rules

## Authority

Read PRODUCT_TRUTH.md, HASHING_SPEC.md, and the reference documents under
docs/reference/ before changing domain behavior. Product invariants outrank
implementation convenience.

Evidence classes:

- E2: verified against current first-party documentation or an observable
  deployment/receipt.
- E1: a selected implementation design that is plausible but not yet proven in
  this repository.
- E0: an implementation claim that is not complete until tests, receipts, or
  operational evidence exist.

## Non-negotiables

- Model economic objects, not just tokens.
- Preserve evidence, provenance, uncertainty, conflicts, staleness, and
  revocation.
- AI may propose semantic interpretations; deterministic code decides verified
  state.
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

The first milestone is the economic kernel, schemas, three semantic fixtures,
canonical hashing, and deterministic verification. Do not start with UI,
execution, Truss, Corridor, or Gaia.

## Change discipline

- Keep public domain types in packages/economic-kernel.
- Keep runtime validation in packages/schemas.
- Keep canonical serialization and roots in packages/canonicalization.
- Keep verification pure and deterministic in packages/verification.
- Keep reducers in packages/noema-core.
- Add an ADR for a cross-package semantic change.
- Never put credentials in source, fixtures, commits, or test output.
