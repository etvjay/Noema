# @noema/schemas Usage Index

This directory documents public reusable exports from `packages/schemas/package.json`.

Before consuming a schema module, read its adjacent usage contract. Export presence plus usage documentation defines the supported reusable boundary.

## Public entrypoints

- `@noema/schemas` → `usage/core/README.md`
- `@noema/schemas/ai` → `usage/ai/README.md`
- `@noema/schemas/ai-tools` → `usage/ai-tools/README.md`

## Consumption rule

Runtime schemas validate data shape; they do not grant evidence authority, semantic truth, verification state, mandate outcome, tool authorization beyond the explicit schema vocabulary, or execution authority.

Frontend code should normally consume higher-level `@noema/noema-core/ui` or `@noema/noema-core/surfaces` projections. Use raw schemas only when validating a documented transport, stored payload, or inspectability boundary.
