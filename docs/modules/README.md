# Noema Reusable Module Catalog

This catalog is the authoritative navigation map for code that other packages, services, agents, SDK/API/MCP layers, or the frontend may consume.

It answers two questions before implementation begins:

1. Does a reusable module already exist?
2. If it exists, what is its canonical import path and ownership boundary?

Do not infer availability from source filenames alone. A module is public only when it is exported by its package manifest and documented here with a package-adjacent usage contract.

## @noema/noema-core

Source package: `packages/noema-core/`
Usage index: `packages/noema-core/usage/README.md`

| Module | Import path | Intended consumers | Responsibility | Usage contract |
|---|---|---|---|---|
| Core reducer + lineage | `@noema/noema-core` | backend/core orchestration, integrity tooling | deterministic EconomicObject reduction and evidence lineage | `packages/noema-core/usage/core/README.md` |
| Evidence ingestion | `@noema/noema-core/evidence` | source adapters, ingestion workers | normalize immutable SourceSnapshot observations into Evidence | `packages/noema-core/usage/evidence/README.md` |
| Semantic resolution | `@noema/noema-core/semantic` | canonical semantic pipeline, backend services | conservative evidence-bounded relationship resolution | `packages/noema-core/usage/semantic/README.md` |
| Mandate evaluation | `@noema/noema-core/mandate` | treasury/policy services, backend orchestration | deterministic ALLOW/CONDITIONAL/BLOCK DecisionReceipt generation | `packages/noema-core/usage/mandate/README.md` |
| Versioning | `@noema/noema-core/versioning` | canonical persistence/watch services | append-only material EconomicObject version history | `packages/noema-core/usage/versioning/README.md` |
| Watch | `@noema/noema-core/watch` | watch workers, notification orchestration | idempotent material-change re-evaluation and semantic events | `packages/noema-core/usage/watch/README.md` |
| Machine surfaces | `@noema/noema-core/surfaces` | REST, SDK, MCP, frontend data loaders | canonical read projection shared across machine interfaces | `packages/noema-core/usage/surfaces/README.md` |
| UI view model | `@noema/noema-core/ui` | frontend/UI only | presentation-safe canonical Noema view model | `packages/noema-core/usage/ui/README.md` |
| Registry commitment model | `@noema/noema-core/commitment` | backend registry service, E2E integrity tests | deterministic offchain mirror of NoemaRegistry commitment/version semantics | `packages/noema-core/usage/commitment/README.md` |

## @noema/schemas

Source package: `packages/schemas/`
Usage index: `packages/schemas/usage/README.md`

| Module | Import path | Intended consumers | Responsibility | Usage contract |
|---|---|---|---|---|
| Canonical runtime schemas | `@noema/schemas` | backend boundaries, adapters, persistence/transport validation | strict runtime validation of canonical Noema domain records | `packages/schemas/usage/core/README.md` |
| Noema AI proposal contract | `@noema/schemas/ai` | Noema AI runtime, deterministic proposal promotion, provenance tooling, inspectability surfaces | strict proposal-only schemas, evidence locators, deterministic proposal hashing, AI run provenance | `packages/schemas/usage/ai/README.md` |
| Noema AI typed tool contract | `@noema/schemas/ai-tools` | Noema AI runtime, tool adapters, transcript/audit surfaces | strict allowlisted read/proposal-only tool vocabulary, bounded results and transcript validation | `packages/schemas/usage/ai-tools/README.md` |

## Frontend rule

The frontend SHOULD prefer `@noema/noema-core/ui` for presentation and `@noema/noema-core/surfaces` for machine-readable canonical snapshots.

The frontend MAY use `@noema/schemas/ai` and `@noema/schemas/ai-tools` to validate documented stored/transported AI proposals, run receipts, or tool transcripts for inspectability, but schema validity never grants canonical or execution authority.

The frontend MUST NOT independently decide or recompute:

- economic equivalence;
- claim verification;
- evidence authority/freshness policy;
- mandate outcomes;
- canonical version creation;
- registry authority;
- AI proposal promotion;
- AI tool execution policy.

If the frontend needs a field that is missing from the documented UI/surface contract, extend the canonical projection and update the relevant usage document rather than deriving a parallel semantic rule in UI code.

## Maintenance rule

Every new public export must be added to this catalog and receive a package-adjacent usage folder in the same PR/commit series. Every material public-contract change must update the corresponding usage document.
