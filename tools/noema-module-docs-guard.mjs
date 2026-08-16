#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageDir = path.join(root, "packages/noema-core");
const packageJsonPath = path.join(packageDir, "package.json");
const packageUsageIndex = path.join(packageDir, "usage/README.md");
const repositoryCatalog = path.join(root, "docs/modules/README.md");

function fail(messages) {
  for (const message of messages) console.error(`MODULE_DOCS_FAIL ${message}`);
  process.exit(2);
}

if (!fs.existsSync(packageJsonPath)) fail(["missing packages/noema-core/package.json"]);
if (!fs.existsSync(packageUsageIndex)) fail(["missing packages/noema-core/usage/README.md"]);
if (!fs.existsSync(repositoryCatalog)) fail(["missing docs/modules/README.md"]);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const exportsMap = pkg.exports ?? {};
const usageIndex = fs.readFileSync(packageUsageIndex, "utf8");
const catalog = fs.readFileSync(repositoryCatalog, "utf8");
const errors = [];

for (const exportKey of Object.keys(exportsMap)) {
  const moduleName = exportKey === "." ? "core" : exportKey.replace(/^\.\//, "");
  const importPath = exportKey === "." ? pkg.name : `${pkg.name}/${moduleName}`;
  const usageRelative = `packages/noema-core/usage/${moduleName}/README.md`;
  const usagePath = path.join(root, usageRelative);

  if (!fs.existsSync(usagePath)) {
    errors.push(`${importPath} is exported but ${usageRelative} is missing`);
    continue;
  }

  const usage = fs.readFileSync(usagePath, "utf8");
  if (!usage.includes(importPath)) {
    errors.push(`${usageRelative} does not name canonical import ${importPath}`);
  }
  if (!usage.includes("## Purpose") && !usage.includes("## Public responsibilities")) {
    errors.push(`${usageRelative} lacks a purpose/responsibility section`);
  }
  if (!usage.includes("## Proof")) {
    errors.push(`${usageRelative} lacks a proof/test section`);
  }
  if (!usageIndex.includes(importPath)) {
    errors.push(`packages/noema-core/usage/README.md does not catalog ${importPath}`);
  }
  if (!catalog.includes(importPath)) {
    errors.push(`docs/modules/README.md does not catalog ${importPath}`);
  }
}

if (errors.length > 0) fail(errors);

console.log(
  `Module documentation guard passed: ${Object.keys(exportsMap).length} @noema/noema-core public exports are documented and cataloged.`
);
