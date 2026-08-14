# Observed toolchain

Recorded at bootstrap on 2026-08-14.

| Tool | Version | Status |
| --- | --- | --- |
| Node.js | 24.19.0 | observed locally |
| pnpm | 11.19.0 | observed locally |
| forge | unavailable | contract gate must run in CI or a Foundry-enabled environment |
| cast | unavailable | contract gate must run in CI or a Foundry-enabled environment |
| anvil | unavailable | contract gate must run in CI or a Foundry-enabled environment |

The Solidity compiler version is pinned to 0.8.36 in
contracts/foundry.toml. Do not call the contract milestone green until Forge
has produced a build and test artifact.
