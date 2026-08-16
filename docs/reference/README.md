# Reference documents

These are the build-authoritative documents supplied for the Noema bootstrap.

- noema_complete_design_spec_v1.md is the canonical product and system design.
- noema_developer_handoff_v1.md is the implementation sequencing and evidence
  handoff, subordinate to the product truth.

When these documents conflict with implementation convenience, preserve the
product invariants and record an ADR for a deliberate change.

## Schema conformance, versioning, and migration

- `../../HASHING_SPEC.md` — canonical hashing domains, hashing v1/v2
  separation, version-directed object/evidence projections, and Merkle behavior.
- `schema-compatibility-matrix.md` — per-artifact schemaId/version, additive vs
  breaking change policy, deprecation and migration requirements, and hashing/
  replay implications. The production migration table explicitly states that
  production artifacts remain at schema version 1 with no production migrations.
- `../adr/0010-schema-versioning.md` — final architecture decision: in-band
  schema identity, nested inheritance, evidence versioning, hashing v1/v2,
  v1 replay, v2 projection, first-class MigrationReceipt, forward-only explicit
  migration, fail-closed unknown versions, no implicit read-time migration,
  canonical-equality idempotence, EIP-712 attestation version bump, and the
  test-only migration strategy.
