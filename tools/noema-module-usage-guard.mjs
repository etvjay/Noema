#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageDir = path.join(root, "packages/noema-core");
const packageJsonPath = path.join(packageDir, "package.json");
const packageUsageIndexPath = path.join(packageDir, "usage/README.md");
const repositoryCatalogPath = path.join(root, "docs/modules/README.md");

function fail(message) {
  console.error(`MODULE_USAGE_GUARD_FAIL: ${message}`);
  process.exitCode = 2;
}

function readText(file) {
  if (!fs.existsSync(file)) {
    fail(`missing required file ${path.relative(root, file)}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

const packageJson = JSON.parse(readText(packageJsonPath));
const exportsMap = packageJson.exports ?? {};
const packageUsageIndex = readText(packageUsageIndexPath);
const repositoryCatalog = readText(repositoryCatalogPath);

const rows = Object.keys(exportsMap).map((exportKey) => {
  const moduleName = exportKey === "." ? "core" : exportKey.replace(/^\.\//, "");
  const importPath = exportKey === "." ? packageJson.name : `${packageJson.name}/${moduleName}`;
  const usageRelative = `packages/noema-core/usage/${moduleName}/README.md`;
  return { exportKey, moduleName, importPath, usageRelative };
});

for (const row of rows) {
  const usagePath = path.join(root, row.usageRelative);
  const usage = readText(usagePath);

  if (usage.trim().length === 0) {
    fail(`${row.importPath} has an empty usage contract at ${row.usageRelative}`);
    continue;
  }
  if (!usage.includes(row.importPath)) {
    fail(`${row.usageRelative} does not name canonical import ${row.importPath}`);
  }
  if (!packageUsageIndex.includes(row.importPath)) {
    fail(`package usage index does not list ${row.importPath}`);
  }
  if (!packageUsageIndex.includes(`usage/${row.moduleName}/README.md`)) {
    fail(`package usage index does not point to usage/${row.moduleName}/README.md`);
  }
  if (!repositoryCatalog.includes(row.importPath)) {
    fail(`repository module catalog does not list ${row.importPath}`);
  }
  if (!repositoryCatalog.includes(row.usageRelative)) {
    fail(`repository module catalog does not point to ${row.usageRelative}`);
  }
}

if (process.exitCode === 2) {
  process.exit(2);
}

console.log(
  `Reusable module usage guard passed: ${rows.length} public @noema/noema-core entrypoints documented.`
);
