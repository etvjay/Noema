# Noema research ledger

This ledger records the first-party source basis for implementation decisions.
Links are not evidence of a completed integration; runtime receipts and tests
are required before an E0 capability becomes demonstrated.

| Area | Source | Class | Decision |
| --- | --- | --- | --- |
| X Layer networks | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information | E2 | Testnet chain ID 1952 and mainnet chain ID 196 are explicit configuration inputs. |
| X Layer architecture | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/about-xlayer | E2 | Treat X Layer as EVM-compatible (OP Stack + AggLayer); verify current toolchain before deployment. |
| X Layer websockets | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/websockets-endpoints/websocket-endpoints | E2 | Reorg-aware and idempotent log processing is required. |
| Onchain OS skills | https://github.com/okx/onchainos-skills | E2 | Official GitHub stable release pinned to v4.4.10 (2026-08-11). |
| Builder Codes | https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/builder-codes | E2 | ERC-8021 data suffix via Viem 2.45.0+ on transaction submission client. |
| Remote OKX MCP | https://web3.okx.com/api/v1/onchainos-mcp | E2 | Remote endpoint requires live session initialize + tools/list exchange before assigning runtime roles. |
| RFC 8785 | https://www.rfc-editor.org/info/rfc8785 | E2 | Use JCS for canonical JSON before hashing. |
| viem | https://viem.sh/ | E2 | Use a typed EVM client with explicit X Layer chain definitions. |
| Foundry | https://www.getfoundry.sh/ | E2 | Forge is the contract build/test/deploy toolchain. |
| OpenAI API | https://developers.openai.com/api/docs | E2 | AI is a proposal-only layer and cannot write verified state. |
| MCP | https://modelcontextprotocol.io/specification/2026-07-28 | E2 | Streamable HTTP and current SDK conformance are required before claiming MCP support. |

## Contradiction register

| Claim | Earlier assumption | Current evidence | Resolution |
| --- | --- | --- | --- |
| Testnet chain ID | Hardhat doc example had 195 | Current network page specifies 1952 | Canonical testnet is 1952; reject 195 |
| X Layer architecture | Legacy zkEVM | OP Stack + AggLayer EVM L2 | Standard EVM contract tooling and OP Stack RPC |
| Onchain OS version | Older web indexing | GitHub release v4.4.10 | Pinned to v4.4.10 |
| OKX MCP role | Direct truth engine | Remote tool provider | External provider only; proposal/evidence boundary |

## Evidence policy

Public URLs, source responses, contract receipts, hashes, signatures, and
deployment logs must be stored as inspectable artifacts when a capability is
claimed. A link in this file alone is not a deployment receipt.
