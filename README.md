# Noema

Noema is verifiable economic intelligence for agent-native RWA finance. It
turns fragmented representations, claims, and evidence into versioned
Evidence-Bounded Economic Objects that agents can inspect, verify, evaluate,
and monitor.

The first repository milestone is intentionally narrow:

1. freeze the shared economic kernel;
2. validate the core schemas;
3. preserve three semantic cases;
4. produce reproducible RFC 8785 object and evidence roots;
5. run deterministic evidence verification.

The repository does not yet claim a live source adapter, AI integration, X
Layer deployment, MCP server, or outbound notification. Those remain E0 until
their evidence artifacts exist.

## Local commands

~~~text
pnpm install
pnpm typecheck
pnpm test
pnpm test:semantic
pnpm contracts:test
~~~

Node is pinned by .nvmrc. The contract toolchain is pinned in
contracts/foundry.toml; the observed local tool versions are recorded in
toolchain.lock.md.

## Architecture boundary

~~~text
sources -> evidence -> claims -> verification -> economic object
                                      |
                                      +-> mandate / financeability downstream
                                      +-> X Layer commitment downstream
                                      +-> watch / notification downstream
~~~

Noema understands. Truss structures. Corridor authorizes and coordinates. Gaia
recovers. The shared nouns live in the economic kernel; module-specific verbs
remain separate.
