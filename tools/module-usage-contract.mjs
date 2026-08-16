#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const packagesRoot = path.join(ROOT, "packages");
const violations = [];
const checked = [];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const packageDir = path.join(packagesRoot, entry.name);
  const packageJsonPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) continue;

  const pkg = readJson(packageJsonPath);
  const exportsField = pkg.exports;
  if (exportsField === undefined || exportsField === null || typeof exportsField !== "object") continue;

  for (const exportKey of Object.keys(exportsField).sort()) {
    if (exportKey === ".") continue;
    if (!exportKey.startsWith("./")) continue;

    const usageKey = exportKey.slice(2).replaceAll("/", "__");
    const usageReadme = path.join(packageDir, "usage", usageKey, "README.md");
    checked.push({ packageName: pkg.name ?? entry.name, exportKey, usageReadme });

    if (!fs.existsSync(usageReadme)) {
      violations.push(
        `${pkg.name ?? entry.name} export ${exportKey} is missing ${path.relative(ROOT, usageReadme)}`
      );
    }
  }
}

if (violations.length > 0) {
  console.error("Reusable module usage contract FAILED.\n");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error(
    "\nEvery package subpath export must ship with usage/<export>/README.md in the same package. " +
      "Document import path, purpose, canonical inputs/outputs, frontend-safe usage, authority boundaries, examples, failure states, and tests before exposing the module."
  );
  process.exit(2);
}

console.log(`Reusable module usage contract passed: ${checked.length} documented subpath exports.`);
