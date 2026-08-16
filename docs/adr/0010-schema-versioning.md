# ADR 0010: Schema conformance, versioning, and migration policy

## Context

Before live multi-venue data becomes canonical, every action-critical
representation, attestation, source, event, and economic-object artifact must be
explicitly versioned, strictly validated, and safely migratable. Without an
in-band schema identity, replay is ambiguous, unknown future shapes silently
coerce, and a hypothetical schema change could silently rewrite historical
roots.

## Decision

### 1. Artifact-level in-band `schemaId` / `schemaVersion`

Every canonical serialized artifact records `schemaId` and `schemaVersion` as
first-class typed fields at the artifact root: the seven registered production
artifacts are `noema:economic-object`, `noema:evidence`, `noema:source-snapshot`,
`noema:attestation`, `noema:verification-receipt`, `noema:decision-receipt`, and
`noema:migration-receipt`, each at schema version 1. The `SchemaRegistry` is the
single fail-closed decode boundary: an artifact is accepted only when its
in-band identity resolves to a registered schema and the strict schema validates
its shape.

### 2. Nested inheritance rule

Versioned artifacts that embed other versioned artifacts (for example an
`EconomicObject` embedding `Evidence` and `Attestation` arrays) inherit their
identity rules. A nested artifact whose `schemaId`/`schemaVersion` is
unsupported or whose stamped identity does not match its declared schema fails
the parent decode. The object projection is `.strict()`: unknown fields and
tampered nested identity are rejected, not coerced.

### 3. Independently serialized Evidence versioning

`Evidence` is an independently versioned artifact, not an anonymous sub-record
of the object. Its in-band identity is registered in the same
`noemaSchemaRegistry` and is bound separately by hashing v2 evidence leaves. An
unstamped or reversioned evidence leaf changes the v2 evidence root but is
replayed identically under hashing v1.

### 4. Explicit hashing v1/v2 separation

Canonical root computation is version-directed:

- `noema-hashing-v1` (legacy, replay-only) binds the `noema:economic-object:v1`
  and `noema:evidence-leaf:v1` domains and never projects in-band schema
  identity.
- `noema-hashing-v2` (current) binds the `noema:economic-object:v2` and
  `noema:evidence-leaf:v2` domains and projects the in-band
  `schemaId`/`schemaVersion` of every versioned artifact.

The Merkle domain `noema:evidence-merkle:v1` is stable across hashing versions;
Merkle node payloads are version-directed through an explicit `hashingVersion`
field so a v1 tree and a v2 tree are never conflated.

### 5. Historical v1 replay

Hashing v1 exists solely to replay roots that were committed before schema
versioning was introduced. When replaying v1, the object-level and every nested
`schemaId`/`schemaVersion` field are stripped from the projection so legacy
commitments replay byte-for-byte, including for legacy-shaped artifacts that
never carried schema fields. A v1-replayed root is never promoted into a v2
commitment.

### 6. Current v2 projection behavior

Every new commitment uses hashing v2. If an artifact lacks in-band
`schemaId`/`schemaVersion`, v2 root computation fails closed rather than
silently omitting the identity fields. `createdAt`, `updatedAt`,
`verification.objectRoot`, and `verification.evidenceRoot` remain excluded from
the projection because they are operational or derived.

### 7. First-class `MigrationReceipt`

A migration emits `noema:migration-receipt` v1, an independently validated audit
artifact carrying `subjectSchemaId`, `fromVersion`, `toVersion`, `migrationId`,
`inputHash`, and `outputHash`. It carries no `createdAt`, so wall-clock time can
never enter migration output. It is registered in `noemaSchemaRegistry` and is
as strict and fail-closed as any other canonical artifact.

### 8. Forward-only explicit migration

Migration is explicit and forward-only. A migration is executed only through the
`MigrationRegistry` along a chain that the operator registers with a unique
`migrationId`. Every intermediate result is validated against its exact
registered target schema (`schemaId` + `toVersion`), so a migration can never
return a different registered schema or a wrong-version artifact. The chain
loop is bounded (`MIGRATION_HOP_BOUND`) and cycle-forming registrations are
rejected.

### 9. Fail-closed unknown versions

Unknown `schemaId`, unsupported `schemaVersion`, unknown source versions, and
future versions fail closed with `UnsupportedSchemaError`/`SchemaValidationError`
rather than coercing or downgrading. This applies at the registry, the version
store boundary (`appendEconomicObjectChange`), hashing v2, and every migration
entry point.

### 10. No implicit read-time migration

Decode and read paths never migrate. A stored v1 artifact is always read as
stored; advancing it to a higher version is an explicit, audited
`MigrationRegistry` operation that produces a new artifact plus a
`MigrationReceipt` and never rewrites the historical source artifact or its
recorded hash/root.

### 11. Canonical-equality idempotence

Migration and versioning are idempotent under canonical equality, not JavaScript
reference equality: repeated executions produce artifacts, receipts, steps, and
hashes that are deeply and canonically equal, while the historical input and its
committed root never change.

### 12. EIP-712 attestation version bump

The attestation EIP-712 typed envelope was version-bumped in lockstep with
schema identity. `NOEMA_ATTESTATION_TYPES_V2` adds `schemaId` and `schemaVersion`
to the signed message; a domain carrying `version: "1"` selects the legacy
`NOEMA_ATTESTATION_TYPES_V1` envelope for signature replay. Attestation
verification reads the typed `state`, `revokedAt`, `expiresAt`, and signature
against the adopted domain/schema; it never infers authority from metadata.

### 13. Test-only migration v1→v2 strategy

Test-only schemas such as `noema:test:ledger` v1→v2→v3 live in isolated
registries and are never registered in the production default registry. This
proves the migration machinery with real adversarial cases (downgrade,
ambiguous registration, cycle, chain gap, malformed and cross-schema
intermediate output) without pretending a production v2 exists.

## Consequences

Action-relevant conclusions remain traceable to typed fields, enums, and
references; generic metadata/JSON blobs stay opaque and never manufacture
verified state. Unknown or malformed future shapes fail closed instead of being
coerced. Historical canonical versions and roots are replayable and never
silently overwritten. Migration is auditable via `MigrationReceipt` and
deterministic under canonical equality.

## Boundaries with other issues

- **#45 (SemanticEvent/Subscription):** the event/schema versioning contract is
  independently versioned (`noema-semantic-event-v1`, `noema-semantic-event-sha256-v1`)
  with its own fail-closed migration helper; this ADR governs the artifact
  registry and hashing domain shared by canonical artifacts, and #45's schema
  identities remain distinct.
- **#54 (machine surfaces):** REST/SDK/MCP surfaces consume the canonical
  versioned schema projections and preserve uncertainty/errors; they do not
  introduce parallel schema or version semantics.
- **#57–#64 (downstream promotion):** these issues consume the frozen,
  versioned, migration-safe artifact contract defined here. No downstream issue
  may rely on implicit read-time migration or an unregistered schema version.

## Reopen condition

Reopen only if a demonstrated live-venue requirement proves the versioning
contract cannot represent a canonical case, or if a production v2 schema is
accepted; a production v2 still requires an explicit registered migration chain
and this ADR's invariants remain binding.