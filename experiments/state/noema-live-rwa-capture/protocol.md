# Phase 2 Live RWA Capture Protocol (noema-live-rwa-capture-protocol-v1)

Protocol and replay contract for the Phase 2 live RWA evidence capture (#35). Captures
real first-party and on-chain evidence for the three shortlisted tokenized US
Treasury/Treasury-fund candidates: BENJI (FOBXX), OUSG, TBILL.

## Protocol

1. Capture one latest-block `eth_getBlockByNumber` on Ethereum mainnet (chainId 1) to
   pin block identity (number + hash) for the run.
2. For each candidate, call the canonical ERC-20 selectors `name()`, `symbol()`,
   `decimals()`, `totalSupply()` at its verified Ethereum address via `eth_call` at the
   pinned block, and produce one `SourceSnapshot` per observation through
   `captureEvmObservation`.
3. Capture first-party HTTP sources through `captureHttpSource` with an injected Node
   `fetch` fetcher (SEC-compatible User-Agent) and `dns.lookup` host resolution:
   - BENJI: SEC EDGAR N-MFP3 `primary_doc.xml` + N-MFP filing index (CIK 0001786958).
   - OUSG: Ondo docs `overview` + `trust-and-transparency`.
   - TBILL: OpenEden docs `introduction` + `smart-contract-addresses`.
4. Persist every snapshot's immutable body (HTTP response bytes, or the canonical EVM
   observation JSON) content-addressed under `bodies/`.
5. Derive `Evidence` from every snapshot strictly through `ingestSourceSnapshot`
   (shared ingestion normalizer). No adapter assigns VERIFIED, equivalence, mandate, or
   economic-object state.
6. Source failures (HTTP auth/WAF 403, RPC failure, timeout, malformed response) are
   recorded explicitly in `failures.json` and never fabricated into evidence.

## Replay / determinism

- `tools/rwa-live-capture.mjs` regenerates the artifacts. Replaying against persisted
  bodies must reproduce identical content hashes.
- `tests/integrity/rwa-live-capture.test.ts` asserts: 3 candidates with EVM + HTTP
  sources each; one body per snapshot with matching content hash; evidence derived only
  through the normalizer; no semantic assignment; explicit failures never leak; EVM
  block identity preserved; EVM observation replay is snapshot-stable.

## Evidence level

E3 (observed runtime) for the three captured candidates as of the run timestamp in
`summary.json`. Documentation-level source rows remain in `RESEARCH_LEDGER.md`.