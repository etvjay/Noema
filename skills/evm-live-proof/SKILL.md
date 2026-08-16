# EVM Live Proof Skill

## Purpose

Use this skill whenever a product claims that an EVM contract, transaction, state transition, event, or integration works on a real EVM network.

The skill converts an implementation claim into reproducible evidence:

`preflight -> canonical input -> deploy/locate -> transact -> receipt -> event -> readback -> history/invariants -> explorer/source verification -> evidence bundle -> replay`

It is deliberately chain-agnostic. Ethereum, L2s, sidechains, appchains, testnets, and EVM-compatible networks use the same core proof cycle. Chain-specific explorer APIs, attribution standards, predeploys, RPC quirks, gas tokens, finality policies, and verification services are adapters, never the core method.

## When to use

Use for:

- first deployment to an EVM network;
- contract upgrades or migrations;
- registry/commitment contracts;
- payment/settlement transactions;
- oracle or attestation writes;
- smart-account/bundler/paymaster flows;
- bridge or cross-domain message initiation/receipt;
- transaction attribution or builder-code experiments;
- any release gate that says a chain integration is live.

Do not claim live integration from unit tests, mocks, forks, local Anvil/Hardhat, static bytecode inspection, documentation, or explorer screenshots alone.

## Core evidence hierarchy

Prefer evidence in this order:

1. observed finalized transaction/receipt/state on the target network;
2. deployed bytecode and direct RPC state readback;
3. emitted logs/events tied to the receipt;
4. reproducible deployment/build artifacts;
5. explorer/source verification result;
6. implementation source;
7. protocol/client specification;
8. documentation;
9. announcements/marketing.

A lower layer cannot substitute for a missing higher layer when the claim concerns runtime behavior.

## Required inputs

Declare before execution:

- `CHAIN_ID`
- `RPC_URL`
- target network name/environment
- signer role and signer address
- signer secret source (never print secret)
- expected contract artifact + compiler/settings
- expected deployment mode: new deploy / existing address / deterministic deploy
- transaction intent
- canonical input object or calldata inputs
- expected event signature(s)
- expected post-state readback
- finality policy
- explorer/source verification adapter, if available
- optional attribution adapter, if supported
- evidence output directory

Secrets MUST come from a secret manager, CI secret, HSM, hardware wallet, or protected local environment. Never require a private key to be pasted into chat, committed, echoed, or uploaded as an artifact.

## Phase 0 — Chain preflight

Fail closed before spending gas.

Verify:

1. RPC responds.
2. `eth_chainId` exactly equals the configured chain ID.
3. signer address can be derived without printing the private key.
4. signer has non-zero balance and sufficient estimated balance for the operation.
5. required predeploys/contracts have non-empty bytecode when relevant.
6. latest block advances or is otherwise healthy.
7. compiler/toolchain versions are captured.

If chain ID differs, STOP. Never silently redirect to another network.

## Phase 1 — Freeze canonical intent

Before sending a transaction, serialize the intended operation into a machine-readable fixture.

Capture at minimum:

- fixture kind/version;
- semantic operation name;
- target contract/function;
- canonical IDs/roots/amounts/recipients/parameters;
- hashing/canonicalization version when applicable;
- expected state version;
- expected event kind;
- generated timestamp only if it is not part of the canonical hash.

If roots/hashes are application-owned, compute them before transaction construction. Transaction tooling MUST NOT reinterpret or recompute business semantics.

Store the fixture separately from runtime output.

## Phase 2 — Deploy or locate contract

For new deployments:

1. build from a locked/reproducible toolchain;
2. capture source commit SHA;
3. capture compiler version and optimizer/settings;
4. deploy;
5. capture deployment tx hash;
6. fetch deployment receipt;
7. require status success;
8. capture block number/hash;
9. capture deployed address;
10. fetch deployed runtime bytecode;
11. require non-empty bytecode;
12. compute and store bytecode hash.

For existing deployments:

- record address provenance;
- fetch runtime bytecode directly from RPC;
- compare against the expected artifact/hash when possible.

Never trust an address merely because it appears in configuration.

## Phase 3 — Submit the semantic transaction

Construct the transaction from the frozen fixture.

Before signing, record:

- destination;
- value;
- base calldata;
- expected function selector;
- expected semantic inputs;
- optional attribution suffix/metadata separately from base calldata.

Submit exactly once unless retry semantics are explicitly designed and idempotent.

Capture transaction hash immediately.

## Phase 4 — Receipt proof

Fetch the receipt from the target RPC and require:

- receipt exists;
- status indicates success;
- `to` matches the intended contract for calls;
- contract address matches expected address for deployment;
- block number/hash are present;
- sender is the intended signer/relayer;
- transaction input can be retrieved and inspected when relevant.

Capture gas used/effective gas price when useful, but gas metrics are not semantic correctness proof.

## Phase 5 — Event proof

For each required event:

1. compute the expected topic0 from the canonical event signature;
2. locate the log in the proven receipt;
3. require emitting address == intended contract;
4. require indexed identifiers match fixture values;
5. ABI-decode event data;
6. compare semantic values to the frozen fixture;
7. record log index and topics/data.

An explorer-rendered event is convenience UI, not primary proof. Use the raw receipt/log.

## Phase 6 — Direct state readback

After the receipt, perform direct RPC reads against the contract.

Read the exact storage-facing/public view(s) that prove the state transition. Compare every action-relevant field with:

- fixture input;
- event output;
- expected version/state machine transition.

A transaction success without state readback is incomplete when state mutation is the claim.

## Phase 7 — Historical/append-only proof

For versioned or commitment systems, proving only the latest value is insufficient.

Run at least:

1. create/register version `v1`;
2. capture `v1` roots/values;
3. update/append version `v2`;
4. prove latest state == `v2`;
5. query historical state for `v1`;
6. prove `v1` still equals its original values;
7. query historical state for `v2`;
8. prove it equals the new values;
9. test stale/incorrect expected-version update rejection.

If historical values exist only in logs and the product claims contract-level immutable history, treat that as a design gap, not a pass.

## Phase 8 — Transaction attribution / suffix invariance

Attribution is optional and chain/tool dependent.

When an attribution scheme appends metadata/suffix bytes to calldata:

1. preserve the canonical base calldata independently;
2. generate attributed calldata through the documented adapter;
3. prove the attributed input begins with the exact canonical base calldata;
4. prove only the documented suffix/metadata differs;
5. submit an attributed transaction only if the target contract safely tolerates trailing calldata;
6. verify receipt/event/state semantics are identical to the unattributed semantic operation;
7. store attribution scheme/version and suffix separately.

Never let attribution metadata enter application hashing/canonical roots unless Product Truth explicitly defines it as semantic input.

If the chain, wallet, relay, or explorer does not support the attribution standard, mark attribution `UNSUPPORTED` or `NOT_PROVEN`; do not weaken the transaction proof.

## Phase 9 — Explorer/source verification

Explorer verification is an independent inspectability gate, not runtime proof.

Where the target chain provides source verification:

1. use the exact source/compiler/settings from the deployed build;
2. submit verification against the deployed address and correct chain/network ID;
3. capture verification request/result identifier;
4. require verified/success status;
5. preserve explorer URL or canonical identifier in the evidence bundle.

If verification requires unavailable API credentials, record `BLOCKED` with the missing credential/capability. Do not claim source verification from matching local bytecode alone.

## Phase 10 — Finality / confirmation policy

Define confirmation policy per chain adapter.

At minimum capture:

- committed block number/hash;
- latest observed block;
- confirmations/depth at observation time;
- chain-specific finalized/safe block where RPC supports it.

Do not call a transaction finalized solely because it received a receipt when the chain's semantics distinguish inclusion from finality.

## Phase 11 — Evidence bundle

Preserve machine-readable evidence under a stable directory, for example:

```text
artifacts/evm-live-proof/<network>/<run-id>/
  manifest.json
  input-fixture.json
  deployment.json
  deployment-receipt.json
  transaction.json
  transaction-receipt.json
  events.json
  readback.json
  history.json
  attribution.json
  source-verification.json
  toolchain.json
  result.json
```

`result.json` must contain one terminal status:

- `PASS`
- `FAIL`
- `BLOCKED`
- `NOT_IMPLEMENTED`

A PASS must list the exact claims proven and references to the raw evidence files.

## Phase 12 — CI/replay contract

The proof should be reproducible from CI without local hidden state.

Recommended CI shape:

1. checkout exact commit;
2. install from lockfile;
3. install pinned contract toolchain;
4. preflight secret/network/balance;
5. generate frozen canonical fixture;
6. deploy/locate contract;
7. submit transaction;
8. run receipt/event/readback verifier;
9. run version/history verifier when applicable;
10. run attribution invariance test when applicable;
11. run source verification adapter when credentials/capability exist;
12. upload evidence bundle even on failure (`if: always()` semantics);
13. never upload secrets.

For expensive/public networks, separate deterministic integration CI from opt-in live CI. Local/fork CI proves mechanics; live CI proves the external network claim. Keep these labels distinct.

## Generic verifier assertions

A reusable verifier SHOULD assert:

```text
chainId == expectedChainId
code(target) != 0x
receipt != null
receipt.status == 1
receipt.to == expectedTarget
requiredEvent.address == expectedTarget
requiredEvent.topic0 == keccak(eventSignature)
requiredEvent.indexedIds == fixtureIds
requiredEvent.decodedValues == fixtureValues
readback == fixtureExpectedState
committedBlock <= latestBlock
```

For append-only state:

```text
latest.version == v2
history[v1] == originalV1
history[v2] == expectedV2
staleUpdate(v1 after v2) reverts
```

## Failure taxonomy

Use explicit failure categories:

- `CHAIN_ID_MISMATCH`
- `RPC_UNAVAILABLE`
- `SIGNER_MISSING`
- `INSUFFICIENT_FUNDS`
- `DEPLOYMENT_FAILED`
- `BYTECODE_MISMATCH`
- `TRANSACTION_REVERTED`
- `RECEIPT_MISSING`
- `EVENT_MISSING`
- `EVENT_MISMATCH`
- `READBACK_MISMATCH`
- `HISTORY_MUTATED`
- `FINALITY_NOT_REACHED`
- `ATTRIBUTION_MUTATED_SEMANTICS`
- `SOURCE_VERIFICATION_FAILED`
- `SOURCE_VERIFICATION_BLOCKED`
- `UNSUPPORTED_CHAIN_CAPABILITY`

Never collapse these into a generic integration error when producing evidence.

## Security rules

- Never print private keys, mnemonics, API secrets, session tokens, or raw secret-manager values.
- Prefer disposable testnet signers for automated live proofs.
- Use least-privilege signer roles.
- Preflight balance before broadcasting.
- Do not automatically retry a semantic write unless duplicate execution is proven harmless.
- Separate application truth/hashes from transport metadata such as attribution suffixes.
- Treat arbitrary RPC/explorer responses as untrusted input and validate structure.
- Do not mark a workflow green by skipping a required live assertion.

## Chain adapter interface

A chain-specific adapter may define:

```text
networkName
chainId
rpcUrls
nativeGasSymbol
explorer
sourceVerificationMethod
finalityPolicy
knownPredeploys
attributionSupport
transactionTypeSupport
feePolicy
faucet/test-funding guidance
```

Adapters MUST NOT redefine the core evidence cycle.

Examples of adapters:

- Ethereum Sepolia/Mainnet
- Base Sepolia/Mainnet
- Arbitrum Sepolia/One
- Optimism Sepolia/Mainnet
- Polygon PoS/Amoy
- X Layer testnet/mainnet
- any EVM-compatible appchain with standard JSON-RPC semantics

## Handoff template

Every completed live integration handoff should state:

```text
Network:
Chain ID:
Source commit:
Signer address:
Contract address:
Deployment tx:
Semantic tx(s):
Block(s):
Canonical fixture version:
Event proof:
Readback proof:
Historical proof:
Attribution proof:
Source verification:
Finality observation:
Evidence artifact ID/path:
Evidence digest:
Terminal result:
Known limitations:
```

## Definition of done

A generic EVM integration may be called live only when:

- target chain identity is proven;
- real transaction(s) succeeded;
- required events match canonical inputs;
- direct onchain readback matches expected state;
- version/history invariants are proven when applicable;
- source verification is completed when claimed;
- attribution invariance is proven when claimed;
- raw evidence is preserved and replayable;
- no secret material is present in logs/artifacts;
- limitations distinguish product semantics from transport/network mechanics.
