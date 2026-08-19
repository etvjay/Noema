#!/usr/bin/env node
// noema CLI entry point. Registers the repository TypeScript loader, then
// delegates to the TypeScript implementation in src/index.ts.
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register(new URL("../loader.mjs", import.meta.url));

const { main } = await import(fileURLToPath(new URL("../src/index.ts", import.meta.url)));

process.exit(await main(process.argv.slice(2)));