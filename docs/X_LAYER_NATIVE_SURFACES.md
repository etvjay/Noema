# X Layer Native Surfaces for Noema

Status: Research Foundry implementation record. Supplied first-party contract material plus current OKX documentation checks. This is not deployment proof.

## Network constants

- X Layer mainnet chain ID: `196`
- X Layer testnet chain ID: `1952`
- Native gas token: `OKB`

### Documentation contradiction

A Hardhat verification example supplied from OKX material contains `chainId: 195` while the current network information and other current OKX documentation use testnet chain ID `1952`.

Noema rule: `1952` is canonical for testnet configuration. Add tests that reject `195`.

## Onchain OS MCP

Current documented HTTP endpoint:

`https://web3.okx.com/api/v1/onchainos-mcp`

Current OKX docs describe a unified Onchain OS MCP surface covering Market and Trade, authenticated with `OK-ACCESS-KEY`. Payment Skills/MCP are separately documented.

Noema boundary:

- OKX MCP is an external tool/evidence provider.
- Noema MCP remains Noema's semantic interface for EconomicObjects, evidence, verification, mandate decisions, receipts, and watches.
- OKX MCP output cannot directly write `VERIFIED`, equivalence, or mandate state.
- Exact live tool inventory and schemas must be captured from an authenticated session before claiming support.

## X Layer L2 predeploys relevant to Noema

| Name | Address | Noema role |
| --- | --- | --- |
| L2CrossDomainMessenger | `0x4200000000000000000000000000000000000007` | Optional future L1/L2 messaging; not MVP dependency |
| L2ToL1MessagePasser | `0x4200000000000000000000000000000000000016` | Optional future withdrawal/message proof surface |
| L1Block | `0x4200000000000000000000000000000000000015` | Optional L1-reference provenance context |
| GasPriceOracle | `0x420000000000000000000000000000000000000F` | Fee estimation only; never economic evidence |
| SequencerFeeVault | `0x4200000000000000000000000000000000000011` | Network infrastructure; no MVP dependency |
| BaseFeeVault | `0x4200000000000000000000000000000000000019` | Network infrastructure; no MVP dependency |
| L1FeeVault | `0x420000000000000000000000000000000000001a` | Network infrastructure; no MVP dependency |
| SchemaRegistry | `0x4200000000000000000000000000000000000020` | Candidate schema registry for Noema-native attestations |
| EAS | `0x4200000000000000000000000000000000000021` | Candidate carrier for verifier/source/revocation attestations |
| ProxyAdmin | `0x4200000000000000000000000000000000000018` | Network infrastructure; no MVP dependency |

## EAS integration decision

Native EAS is strategically useful, but only as a composable attestation transport.

Candidate Noema attestations:

- verifier assertion bound to `EconomicObject.id`, `version`, `objectRoot`, `evidenceRoot`, and `VerificationReceipt.id`;
- source-authority assertion bound to evidence/source identifiers;
- revocation assertion referencing the attestation/evidence being revoked;
- optional DecisionReceipt reference for external inspectability.

EAS MUST NOT become a second canonical economic model. It cannot replace:

- EconomicObject identity/versioning;
- canonical relationship semantics;
- deterministic canonicalization and hashing;
- NoemaRegistry root commitments;
- VerificationReceipt or DecisionReceipt.

Before adoption, verify the EAS and SchemaRegistry predeploy code/behavior on X Layer testnet and execute one attestation + revocation roundtrip.

## Ethereum L1 OP Stack contracts

The supplied first-party contract table identifies current X Layer L1 infrastructure including SystemConfig, L1CrossDomainMessenger, OptimismPortal, DisputeGameFactory, PermissionedDisputeGame, AnchorStateRegistry, DelayedWETH, MIPS, PreimageOracle, SuperchainConfig, ProtocolVersions, and AddressManager.

Product Foundry decision: these are network infrastructure, not direct Noema MVP dependencies. Do not integrate them merely for integration count. They become relevant only if Noema adds explicit L1/L2 proof or message semantics.

## Contract verification

Current OKX material documents Foundry verification through OKLink using `forge verify-contract` with the OKLink verifier endpoint, followed by `--watch` or `forge verify-check`.

Noema release proof should preserve:

- deployed address;
- chain ID;
- deployment transaction hash and receipt;
- block number/hash;
- compiler/version/settings;
- source commit SHA;
- deployed bytecode hash;
- emitted deployment/registry events where applicable;
- OKLink verification result/GUID or equivalent proof.

## Token references

The supplied first-party X Layer contract material lists current mainnet addresses including:

- WOKB: `0xe538905cf8410324e03A5A23C1c177a474D59b2b`
- WETH: `0x5A77f1443D16ee5761d310e38b62f77f726bC71c`
- USDT: `0x1E4a5963aBFD975d8c9021ce480b42188849D41d`
- USDT0: `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`
- USDC: `0x74b7F16337b8972027F6196A17a631aC6dE26d22`
- USDC.e: `0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035`
- WBTC: `0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1`
- DAI: `0xC5015b9d9161Dca7e18e32f6f25C4aD850731Fd4`
- xBTC: `0xb7C00000bcDEeF966b20B3D884B98E64d2b06b4f`
- USDG: `0x4ae46a509F6b1D9056937BA4500cb143933D2dc8`

These addresses are chain representation identifiers only. Noema must not infer economic equivalence from symbol/address category alone. USDC and USDC.e are a particularly useful negative fixture for representation-versus-economic-identity tests.

## Testnet funding

Current supplied OKX material states the official X Layer faucet provides up to `0.2 OKB` testnet tokens per user per day.

Use faucet funding only as deployment infrastructure; capture funded deployer address and balances in deployment receipts without exposing private keys.
