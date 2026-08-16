# Noema Schema Compatibility Matrix

Adjacent documentation for schema conformance, versioning, and migration
policy. Canonical behavior is enforced by `packages/schemas` and the integrity
gates `schema-versioning` and `schema-migration` in `qa/noema-integrity.json`.
Semantic authority is Product Truth; architecture is recorded in
[ADR 0010](../adr/0010-schema-versioning.md) and
[HASHING_SPEC.md](../../HASHING_SPEC.md).

## Canonical artifact registry

Every canonical artifact records in-band `schemaId` + `schemaVersion` and is
registered in `noemaSchemaRegistry` at schema version 1.

| Artifact | `schemaId` | Current production schema version | Compatibility policy | Additive change | Breaking change | Deprecation policy | Migration requirement | Hashing / replay implications |
|---|---|---|---|---|---|---|---|---|
| EconomicObject | `noema:economic-object` | 1 | Strict `.strict()` object schema; nested artifacts inherit versioning | New optional top-level field with a default, backward-compatible nested artifact version | Required field removal/rename, enum widening that changes semantics, nested artifact shape change, projection change | Old version stays readable at its own version; only an explicit registered migration advances it | Production v2 requires an explicit `MigrationRegistry` chain + `MigrationReceipt` | v1 replays `noema:economic-object:v1`; v2 binds `schemaId`/`schemaVersion` under `noema:economic-object:v2` |
| Evidence | `noema:evidence` | 1 | Strict schema; independently versioned artifact, never an anonymous sub-record | New optional field | `type`/`authority` enum change, removal of `contentHash`, `observedAt`, `fetchedAt`, `source`, or `metadata` | Evidence is versioned independently of the object it supports | A new evidence shape is a new schema version; migration advances stored evidence artifacts | v2 evidence leaf binds in-band identity; v1 leaf strips it; reversioned evidence changes the v2 leaf and root |
| SourceSnapshot | `noema:source-snapshot` | 1 | Strict schema; provenance origin artifact | New optional metadata/header field | Removal of `contentHash`, `uri`, `sourceId`, `bodyStorageRef`, or `fetchedAt` | Snapshots are immutable observation records; no silent rewrite | A new snapshot shape is a new schema version; migration only on stored artifacts | Content/observation provenance enters evidence leaves via `contentHash`/`source` references |
| Attestation | `noema:attestation` | 1 | Strict schema; EIP-712 typed envelope versioned in lockstep | New optional field not signed by the adopted envelope | Signed-field change (e.g., adding `schemaId`/`schemaVersion` to the message) | Old envelope (`domain.version === "1"`) replays legacy signatures only | A signed-envelope change is an attestation schema change with explicit migration | v2 typed envelope signs `schemaId`/`schemaVersion`; legacy v1 envelope replayed for v1 signatures |
| VerificationReceipt | `noema:verification-receipt` | 1 | Strict schema; binds `hashingVersion`, roots, checks | New optional check field | `verifierVersion`, `hashingVersion`, root-field, or `overallStatus` semantic change | Old receipts remain readable and replayable at their recorded `hashingVersion` | A new receipt shape is a new schema version | Root fields must match `computeRoots(object, hashingVersion)`; receipt is derived, never a source of truth |
| DecisionReceipt | `noema:decision-receipt` | 1 | Strict schema; deterministic mandate evaluation | New optional policy check | Decision-enum or reason-code semantics change, mandate/verification ref change | Old decisions remain readable; re-evaluation produces a new receipt | A new decision shape is a new schema version | References `verificationReceiptRef` and `evidenceRoot`; decision never silently overwrites history |
| MigrationReceipt | `noema:migration-receipt` | 1 | Strict audit receipt; no `createdAt` | New optional trace field | Removal of `inputHash`/`outputHash`/`subjectSchemaId`/`fromVersion`/`toVersion`/`migrationId` | Receipts are append-only audit records | Always produced by `MigrationRegistry`, never hand-authored for canonical effect | `inputHash`/`outputHash` are canonical hashes of exact pre/post serialized artifacts |

## Production migration table

Production artifacts remain at schema version 1. There are no production
migrations: `noemaMigrationRegistry` (bound to `noemaSchemaRegistry`)
intentionally contains zero registered migrations.

| From | To | Exists today | Requirement when introduced |
|---|---|---|---|
| Any production artifact v1 | Any production artifact v2 | **No** — no production v2 exists | An explicit, uniquely identified `MigrationRegistry` chain, per-step exact-target validation, and a `MigrationReceipt` for every migrated artifact |
| Any test schema (e.g., `noema:test:ledger`) v1 → v2 → v3 | test vN+1 | Yes — in isolated test-only registries only | Same migration invariants; test schemas are never registered in `noemaSchemaRegistry` |

Do not infer a production v2 from the existence of migration machinery or
test-only migrations.

## Adjacent versioned surfaces

- **SemanticEvent / WatchSubscription / DeliveryCorrelation (#45):** versioned
  by `noema-semantic-event-v1`, `noema-semantic-event-sha256-v1`,
  `noema-watch-subscription-v1`, `noema-delivery-correlation-v1` with a
  fail-closed `migrateSemanticEventVersion` helper. These identities are
  distinct from the artifact registry above.
- **AI proposal/run contracts:** versioned separately under `@noema/schemas/ai`;
  always proposal-only and never promoted to VERIFIED by model output.
- **Mandate:** validated by `mandateSchema`; mandate evaluation derives
  decisions from typed fields/enums/references, not generic blobs.

## Change policy summary

1. Any change to a canonical artifact's shape or semantics is a schema change.
2. Additive changes MAY be a new minor surface only if fully backward
   compatible; otherwise a new schema version.
3. Breaking changes require a new schema version, an explicit registered
   migration chain, and a `MigrationReceipt`; historical versions are never
   silently overwritten.
4. Unknown future versions fail closed at the registry, version store, hashing
   v2, and migration boundaries.
5. No read path migrates implicitly; migration is always an explicit audited
   operation.