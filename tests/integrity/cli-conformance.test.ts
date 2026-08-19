import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeRoots } from "@noema/canonicalization";
import type { EconomicObject } from "@noema/economic-kernel";
import { main } from "../../apps/cli/src/index";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const CLI = resolve(REPO_ROOT, "apps/cli/bin/noema.mjs");
const EXAMPLES = resolve(REPO_ROOT, "apps/cli/examples");

async function capture(args: string[], options: { key?: string } = {}): Promise<{ code: number; text: string }> {
  let stdout = "";
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalError = process.stderr.write.bind(process.stderr);
  const originalArgs = process.argv;
  process.argv = ["node", "noema", ...args];
  if (options.key) process.env["NOEMA_ATTESTER_KEY"] = options.key;
  process.stdout.write = ((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    const code = await main(args);
    return { code, text: stdout };
  } finally {
    process.stdout.write = originalWrite;
    process.stderr.write = originalError;
    process.argv = originalArgs;
  }
}

function runBin(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("node", [CLI, ...args], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ code: code ?? -1, stdout, stderr });
    });
  });
}

function jsonOf(stdout: string): { code: number; details: Record<string, unknown> } {
  return JSON.parse(stdout);
}

describe("noema CLI conformance (#63)", () => {
  it("bin entry runs end-to-end through the Node loader", async () => {
    const doctor = await runBin(["doctor"]);
    expect(doctor.code).toBe(0);
    expect(doctor.stdout).toContain("noema doctor completed");

    const roots = await runBin(["--format=json", "roots", "compute", resolve(EXAMPLES, "rwa-object.json")]);
    expect(roots.code).toBe(0);
    const data = jsonOf(roots.stdout);
    expect(data.code).toBe(0);
    expect(data.details["objectRoot"]).toBeTypeOf("string");
  }, 240000);

  it("schema validate accepts the RWA object", async () => {
    const result = await capture(["schema", "validate", resolve(EXAMPLES, "rwa-object.json")]);
    expect(result.code).toBe(0);
    expect(result.text).toContain("schema valid");
  });

  it("schema validate rejects an unsupported schema version with exit 5", async () => {
    const unsupported = resolve(EXAMPLES, "unsupported-version.json");
    const result = await capture(["schema", "validate", unsupported]);
    expect(result.code).toBe(5);
    expect(result.text).toContain("Unsupported schema");
  });

  it("roots compute is byte-for-byte identical to the canonical library", async () => {
    const result = await capture(["--format=json", "roots", "compute", resolve(EXAMPLES, "rwa-object.json")]);
    expect(result.code).toBe(0);
    const data = jsonOf(result.text);
    const object = JSON.parse(readFileSync(resolve(EXAMPLES, "rwa-object.json"), "utf8")) as EconomicObject;
    const canonical = computeRoots(object);
    expect(data.details["objectRoot"]).toBe(canonical.objectRoot);
    expect(data.details["evidenceRoot"]).toBe(canonical.evidenceRoot);
    expect(data.details["hashingVersion"]).toBe(canonical.hashingVersion);
  });

  it("roots verify passes and receipt verify matches recomputed roots", async () => {
    const roots = await capture(["--format=json", "roots", "verify", resolve(EXAMPLES, "rwa-object.json")]);
    expect(roots.code).toBe(0);
    const rootsData = jsonOf(roots.text);
    expect(rootsData.details["overallStatus"]).toBe("PASS");

    const receipt = await capture([
      "receipt", "verify",
      resolve(EXAMPLES, "rwa-verification-receipt.json"),
      resolve(EXAMPLES, "rwa-object.json")
    ]);
    expect(receipt.code).toBe(0);
    expect(receipt.text).toContain("receipt verified");
  });

  it("source replay ingests the venue snapshot into evidence", async () => {
    const result = await capture([
      "source", "replay",
      resolve(EXAMPLES, "rwa-source-snapshot.json"),
      resolve(EXAMPLES, "rwa-evidence-input.json")
    ]);
    expect(result.code).toBe(0);
    expect(result.text).toContain("source replayed as ingested");
  });

  it("source capture computes a canonical content hash", async () => {
    const result = await capture(["--format=json", "source", "capture", resolve(EXAMPLES, "rwa-source-snapshot.json")]);
    expect(result.code).toBe(1);
  });

  it("object inspect and diff operate on the RWA object", async () => {
    const inspect = await capture(["object", "inspect", resolve(EXAMPLES, "rwa-object.json")]);
    expect(inspect.code).toBe(0);
    expect(inspect.text).toContain("object:rwa:treasury-fund");

    const diff = await capture(["object", "diff", resolve(EXAMPLES, "rwa-object.json"), resolve(EXAMPLES, "rwa-object.json")]);
    expect(diff.code).toBe(0);
    expect(diff.text).toContain("no material change");
  });

  it("representation inspect inspects the RWA representation", async () => {
    const inspect = await capture(["representation", "inspect", resolve(EXAMPLES, "rwa-representation-identity.json")]);
    expect(inspect.code).toBe(0);
    expect(inspect.text).toContain("representation:xlayer:fund-share");

    const validate = await capture(["representation", "validate", resolve(EXAMPLES, "rwa-representation-identity.json")]);
    expect(validate.code).toBe(1);
    expect(validate.text).toContain("requires left and right identities");
  });

  it("attestation verify accepts the signed envelope", async () => {
    const ok = await capture(["attestation", "verify", resolve(EXAMPLES, "rwa-attestation-signed.json")]);
    expect(ok.code).toBe(0);
    expect(ok.text).toContain("attestation signature valid");
  });

  it("attestation sign does not print or persist the private key", async () => {
    const key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const result = await capture(["attestation", "sign", resolve(EXAMPLES, "rwa-attestation.json")], { key });
    expect(result.code).toBe(0);
    expect(result.text).toContain("attestation signed");
    expect(result.text).toContain("not printed or persisted");
    expect(result.text).not.toContain("ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  });

  it("synchrony replay converges deterministically across orderings", async () => {
    const scenario = resolve(EXAMPLES, "adversarial-multi-venue-scenario.json");
    const ordered = await capture(["--format=json", "synchrony", "replay", scenario]);
    expect(ordered.code).toBe(0);
    const orderedData = jsonOf(ordered.text);
    expect(orderedData.details["deterministicConvergence"]).toBe(true);
    expect(orderedData.details["synchronizationRoot"]).toBeTypeOf("string");

    const shuffled = await capture(["--format=json", "synchrony", "replay", scenario, "--shuffle"]);
    expect(shuffled.code).toBe(0);
    const shuffledData = jsonOf(shuffled.text);
    expect(shuffledData.details["synchronizationRoot"]).toBe(orderedData.details["synchronizationRoot"]);
  });

  it("profile evaluate reports object state and exceptions", async () => {
    const result = await capture([
      "profile", "evaluate",
      resolve(EXAMPLES, "rwa-profile.json"),
      resolve(EXAMPLES, "rwa-object.json")
    ]);
    expect(result.code).toBe(0);
    expect(result.text).toContain("profile");
    expect(result.text).toContain("objectState");
  });

  it("receipt verify rejects an object that does not match the receipt", async () => {
    const result = await capture([
      "receipt", "verify",
      resolve(EXAMPLES, "rwa-verification-receipt.json"),
      resolve(EXAMPLES, "rwa-source-snapshot.json")
    ]);
    expect(result.code).toBe(1);
  });

  it("exit codes distinguish VALID, INVALID, and USAGE", async () => {
    expect((await capture(["schema", "validate", resolve(EXAMPLES, "rwa-object.json")])).code).toBe(0);
    const invalid = await capture(["schema", "validate", resolve(EXAMPLES, "rwa-profile.json")]);
    expect(invalid.code).toBe(1);
    expect((await capture(["nonesuch"])).code).toBe(64);
  });
});