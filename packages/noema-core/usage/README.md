# @noema/noema-core Usage Index

This directory documents every public export from `packages/noema-core/package.json`.

Before consuming a module, read its usage contract here. Source files alone are not a public API guarantee.

## Public entrypoints

- `@noema/noema-core` → `usage/core/README.md`
- `@noema/noema-core/evidence` → `usage/evidence/README.md`
- `@noema/noema-core/semantic` → `usage/semantic/README.md`
- `@noema/noema-core/mandate` → `usage/mandate/README.md`
- `@noema/noema-core/explain` → `usage/explain/README.md`
- `@noema/noema-core/versioning` → `usage/versioning/README.md`
- `@noema/noema-core/watch` → `usage/watch/README.md`
- `@noema/noema-core/surfaces` → `usage/surfaces/README.md`
- `@noema/noema-core/ui` → `usage/ui/README.md`
- `@noema/noema-core/commitment` → `usage/commitment/README.md`
- `@noema/noema-core/notification` → `usage/notification/README.md`
- `@noema/noema-core/telegram` → `usage/telegram/README.md`
- `@noema/noema-core/telegram-inbound` → `usage/telegram-inbound/README.md`
- `@noema/noema-core/rest` → `usage/rest/README.md`
- `@noema/noema-core/sdk` → `usage/sdk/README.md`
- `@noema/noema-core/mcp` → `usage/mcp/README.md`
- `@noema/noema-core/webhook` → `usage/webhook/README.md`

## Frontend consumption order

For frontend work, start with:

1. `ui` for presentation-ready canonical state;
2. `surfaces` for machine-readable canonical snapshots;
3. only reach into lower-level modules from backend/server-side orchestration when a documented need exists.

Never recreate semantic resolution, verification, mandate policy, canonical versioning, or registry authority in frontend code.
