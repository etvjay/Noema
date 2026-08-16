#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const packagesRoot = path.join(ROOT, "packages");
const repositoryCatalogPath = path.join(ROOT, "docs/modules/README.md");
const violations = [];
const checked = [];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function expectedUsageKey(exportKey) {
  if (exportKey === ".") return "core";
  return exportKey.slice(2).replaceAll("/", "__");
}

function canonicalImport(pkgName, exportKey) {
  return exportKey === "." ? pkgName : `${pkgName}/${exportKey.slice(2)}`;
}

const repositoryCatalog = fs.existsSync(repositoryCatalogPath)
  ? fs.readFileSync(repositoryCatalogPath, "utf8")
  : null;

for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const packageDir = path.join(packagesRoot, entry.name);
  const packageJsonPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) continue;

  const pkg = readJson(packageJsonPath);
  const exportsField = pkg.exports;
  if (exportsField === undefined || exportsField === null || typeof exportsField !== "object") continue;

  const usageIndexPath = path.join(packageDir, "usage", "README.md");
  const hasUsageIndex = fs.existsSync(usageIndexPath);
  const usageIndex = hasUsageIndex ? fs.readFileSync(usageIndexPath, "utf8") : null;

  for (const exportKey of Object.keys(exportsField).sort()) {
    if (exportKey !== "." && !exportKey.startsWith("./")) continue;

    // Existing subpath exports always require documentation. A root export becomes
    // part of this contract once the package declares a usage index.
    if (exportKey === "." && !hasUsageIndex) continue;

    const usageKey = expectedUsageKey(exportKey);
    const usageReadme = path.join(packageDir, "usage", usageKey, "README.md");
    const importPath = canonicalImport(pkg.name ?? entry.name, exportKey);
    checked.push({ packageName: pkg.name ?? entry.name, exportKey, importPath, usageReadme });

    if (!fs.existsSync(usageReadme)) {
      violations.push(
        `${pkg.name ?? entry.name} export ${exportKey} is missing ${path.relative(ROOT, usageReadme)}`
      );
      continue;
    }

    const usage = fs.readFileSync(usageReadme, "utf8");
    if (!usage.includes(importPath)) {
      violations.push(`${path.relative(ROOT, usageReadme)} does not name canonical import ${importPath}`);
    }
    if (!/## (Purpose|Public responsibilities)/.test(usage)) {
      violations.push(`${path.relative(ROOT, usageReadme)} lacks a Purpose/Public responsibilities section`);
    }
    if (!usage.includes("## Proof")) {
      violations.push(`${path.relative(ROOT, usageReadme)} lacks a Proof section`);
    }
    if (usageIndex !== null && !usageIndex.includes(importPath)) {
      violations.push(`${path.relative(ROOT, usageIndexPath)} does not catalog ${importPath}`);
    }

    // noema-core is currently part of the repository-wide frontend/reuse catalog.
    if ((pkg.name ?? entry.name) === "@noema/noema-core") {
      if (repositoryCatalog === null) {
        violations.push("docs/modules/README.md is missing");
      } else if (!repositoryCatalog.includes(importPath)) {
        violations.push(`docs/modules/README.md does not catalog ${importPath}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Reusable module usage contract FAILED.\n");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error(
    "\nEvery reusable package export covered by this contract must ship with adjacent usage documentation. " +
      "Document import path, purpose, canonical inputs/outputs, frontend-safe usage, authority boundaries, examples, failure states, and proof before exposing the module."
  );
  process.exit(2);
}

console.log(`Reusable module usage contract passed: ${checked.length} documented exports.`);
