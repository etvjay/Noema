import { createRequire } from "node:module";
import { version as nodeVersion } from "node:process";
import { noemaSchemaRegistry, SCHEMA_IDS } from "@noema/schemas";
import { CURRENT_HASHING_VERSION } from "@noema/canonicalization";
import { SYNCHRONIZER_VERSION } from "@noema/noema-core/synchronizer";
import { VENUE_ATTESTATION_ENVELOPE_VERSION } from "@noema/noema-core/attestation";
import { output, EXIT, type CommandOutput } from "../exit.js";

const require = createRequire(import.meta.url);

function schemaReport(): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const [name, schemaId] of Object.entries(SCHEMA_IDS)) {
    entries[name] = {
      schemaId,
      supportedVersions: noemaSchemaRegistry.supportedVersions(schemaId)
    };
  }
  return entries;
}

function moduleVersions(): Record<string, string | undefined> {
  const candidates: Array<[string, string]> = [
    ["viem", "viem/package.json"],
    ["zod", "zod/package.json"],
    ["typescript", "typescript/package.json"]
  ];
  const result: Record<string, string | undefined> = {};
  for (const [name, pkg] of candidates) {
    try {
      result[name] = require(`${pkg}`).version;
    } catch {
      result[name] = undefined;
    }
  }
  return result;
}

function environmentReport(): Record<string, unknown> {
  const xlayer = {
    rpc: process.env["XLAYER_TESTNET_RPC"] ?? process.env["NOEMA_XLAYER_RPC"] ?? null,
    registryAddress: process.env["NOEMA_XLAYER_REGISTRY_ADDRESS"] ?? null,
    publisherKeyConfigured: Boolean(process.env["NOEMA_XLAYER_PUBLISHER_PRIVATE_KEY"]),
    builderCodeConfigured: Boolean(process.env["NOEMA_XLAYER_BUILDER_CODE"])
  };
  const attestation = {
    attesterKeyConfigured: Boolean(process.env["NOEMA_ATTESTER_KEY"])
  };
  return { xlayer, attestation };
}

export async function doctor(): Promise<CommandOutput> {
  return output(EXIT.VALID, "noema doctor completed", {
    node: {
      version: nodeVersion,
      runtime: "node >= 24 with native TypeScript type-stripping"
    },
    modules: {
      hashingVersion: CURRENT_HASHING_VERSION,
      synchronizerVersion: SYNCHRONIZER_VERSION,
      attestationEnvelopeVersion: VENUE_ATTESTATION_ENVELOPE_VERSION
    },
    schemas: schemaReport(),
    thirdParty: moduleVersions(),
    environment: environmentReport(),
    note: "doctor reports compatibility and prerequisites without claiming live proof; external RPC/chain checks require the live probes."
  });
}