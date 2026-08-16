#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";

const manifestPath = "qa/noema-integrity.json";
const current = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function gateIds(manifest) {
  return new Set([
    ...(manifest.coreGates ?? []).map((gate) => `core:${gate.id}`),
    ...(manifest.liveGates ?? []).map((gate) => `live:${gate.id}`),
    ...(manifest.ecosystemClaims ?? []).map((gate) => `claim:${gate.id}`)
  ]);
}

function previousRef() {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) return `origin/${baseRef}`;
  try {
    execFileSync("git", ["rev-parse", "HEAD^"], { stdio: "ignore" });
    return "HEAD^";
  } catch {
    return null;
  }
}

const ref = previousRef();
if (!ref) {
  console.log("No previous manifest ref is available; scope-shrink guard skipped.");
  process.exit(0);
}

let previousText;
try {
  previousText = execFileSync("git", ["show", `${ref}:${manifestPath}`], {
    encoding: "utf8"
  });
} catch {
  console.log(`No previous ${manifestPath} found at ${ref}; scope-shrink guard skipped.`);
  process.exit(0);
}

const previous = JSON.parse(previousText);
const previousIds = gateIds(previous);
const currentIds = gateIds(current);
const removed = [...previousIds].filter((id) => !currentIds.has(id)).sort();

if (removed.length > 0) {
  console.error("Integrity contract scope shrink detected. Existing gate IDs may not be silently removed:");
  for (const id of removed) console.error(`- ${id}`);
  process.exit(2);
}

console.log(`Integrity manifest guard passed: ${currentIds.size} gate IDs retained or expanded.`);
