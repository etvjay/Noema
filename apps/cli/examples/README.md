# CLI examples

Executable fixtures demonstrating one real-RWA artifact path and one
adversarial multi-venue scenario. Every example is produced by the canonical
library (via `reduceEconomicObject` + `computeRoots`) or a live EIP-712 sign,
so the roots are byte-for-byte reproducible.

## Real-RWA artifact path

| File | Purpose |
| --- | --- |
| `rwa-object.json` | Tokenized treasury fund `EconomicObject` (v1) with ISIN, ERC20 representation, claims, and evidence |
| `rwa-source-snapshot.json` | `SourceSnapshot` for the venue NAV source |
| `rwa-evidence-input.json` | Evidence ingestion input for `source replay` |
| `rwa-verification-receipt.json` | `VerificationReceipt` whose roots match `rwa-object.json` |
| `rwa-representation-identity.json` | `RepresentationIdentity` for the ERC20 share |
| `rwa-profile.json` | `SemanticRepresentationProfile` for the fund |
| `rwa-attestation.json` | Unsigned venue attestation envelope (sign with `attestation sign`) |
| `rwa-attestation-signed.json` | The same envelope EIP-712 signed; `attestation verify` accepts it |

Run the path:

```bash
node apps/cli/bin/noema.mjs schema validate apps/cli/examples/rwa-source-snapshot.json
node apps/cli/bin/noema.mjs roots compute apps/cli/examples/rwa-object.json
node apps/cli/bin/noema.mjs receipt verify apps/cli/examples/rwa-verification-receipt.json apps/cli/examples/rwa-object.json
node apps/cli/bin/noema.mjs representation inspect apps/cli/examples/rwa-representation-identity.json
node apps/cli/bin/noema.mjs profile evaluate apps/cli/examples/rwa-profile.json apps/cli/examples/rwa-object.json
```

## Adversarial multi-venue scenario

`adversarial-multi-venue-scenario.json` carries two venue deliveries that
arrive out of order with conflicting-but-scoped NAV/price propositions. The
synchronizer must converge deterministically and preserve conflicts:

```bash
node apps/cli/bin/noema.mjs synchrony replay apps/cli/examples/adversarial-multi-venue-scenario.json
node apps/cli/bin/noema.mjs synchrony replay apps/cli/examples/adversarial-multi-venue-scenario.json --shuffle
```

Both orderings must produce the same `synchronizationRoot` and the same
admission/conflict set (`deterministicConvergence: yes`).

## Note on attestation signing

`rwa-attestation-signed.json` was signed with the canonical EIP-712 venue
attestation typed data using the well-known test private key
`0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
(signer `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`). Do not use that key
outside fixtures.