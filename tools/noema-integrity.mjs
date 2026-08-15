#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const foundryBin = path.join(os.homedir(), '.foundry', 'bin');
if (fsSync.existsSync(foundryBin) && !process.env.PATH?.includes(foundryBin)) {
  process.env.PATH = `${foundryBin}:${process.env.PATH || ''}`;
}
const CONTRACT_PATH = path.resolve('qa/noema-integrity.json');
const OUT_ROOT = process.env.NOEMA_QA_OUT || 'artifacts/qa/integrity';
const args = process.argv.slice(2);
const flags = parseFlags(args);

function parseFlags(values) {
  const out = {};
  for (let i = 0; i < values.length; i += 1) {
    const token = values[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) out[token.slice(2, eq)] = token.slice(eq + 1);
    else {
      const key = token.slice(2);
      const next = values[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i += 1; }
      else out[key] = true;
    }
  }
  return out;
}

function run(command, argv = []) {
  const result = spawnSync(command, argv, { cwd: process.cwd(), encoding: 'utf8', env: process.env });
  const unavailable = result.error?.code === 'ENOENT';
  return {
    unavailable,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function existsAll(paths = []) {
  return paths.every((p) => fsSync.existsSync(path.resolve(p)));
}

function excerpt(value, max = 1800) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

async function productTruthCheck(contract) {
  const source = await fs.readFile(contract.productTruth, 'utf8');
  const required = [
    'Evidence-Bounded Economic Object',
    'AI inference cannot silently become VERIFIED',
    'Similar economic exposure does not imply economic equivalence',
    'Historical canonical versions are never silently overwritten',
    'Noema does not claim universal truth',
    'resolve -> evidence -> verify -> interpret -> evaluate -> commit -> watch ->',
  ];
  const missing = required.filter((needle) => !source.includes(needle));
  return {
    status: missing.length ? 'FAIL' : 'PASS',
    details: missing.length ? { missing } : { checkedMarkers: required.length },
  };
}

async function runGate(gate, contract) {
  if (gate.kind === 'product-truth') return productTruthCheck(contract);

  if (gate.requires && !existsAll(gate.requires)) {
    return { status: 'NOT_IMPLEMENTED', details: { missing: gate.requires.filter((p) => !fsSync.existsSync(path.resolve(p))) } };
  }

  if (gate.kind === 'command') {
    const result = run(gate.command, gate.args || []);
    if (result.unavailable) return { status: 'BLOCKED', details: { reason: `${gate.command} is unavailable` } };
    return {
      status: result.status === 0 ? 'PASS' : 'FAIL',
      details: {
        command: [gate.command, ...(gate.args || [])].join(' '),
        exitCode: result.status,
        stdout: excerpt(result.stdout),
        stderr: excerpt(result.stderr),
      },
    };
  }

  return { status: 'BLOCKED', details: { reason: `Unsupported gate kind: ${gate.kind || 'none'}` } };
}

function runProbe(probe) {
  const result = run(process.execPath, ['tools/noema-qa.mjs', probe, '--json']);
  if (result.unavailable) return { status: 'BLOCKED', details: { reason: 'Node runtime unavailable' } };
  if (result.status !== 0) {
    return { status: 'FAIL', details: { exitCode: result.status, stdout: excerpt(result.stdout), stderr: excerpt(result.stderr) } };
  }
  let parsed = null;
  try { parsed = JSON.parse(result.stdout.split(/\r?\n/).filter(Boolean)[0]); } catch {}
  return { status: 'PASS', details: parsed || { stdout: excerpt(result.stdout) } };
}

async function runLiveGate(gate) {
  if (gate.requires && !existsAll(gate.requires)) {
    return { status: 'NOT_IMPLEMENTED', details: { missing: gate.requires.filter((p) => !fsSync.existsSync(path.resolve(p))) } };
  }
  if (gate.probe) return runProbe(gate.probe);
  return runGate(gate, {});
}

async function main() {
  const contract = JSON.parse(await fs.readFile(CONTRACT_PATH, 'utf8'));
  const startedAt = new Date().toISOString();
  const results = [];
  const mode = flags.live ? 'live' : 'core';

  for (const gate of contract.coreGates) {
    const outcome = await runGate(gate, contract);
    results.push({ ...gate, ...outcome });
    printGate(gate.id, outcome.status);
  }

  if (flags.live) {
    for (const gate of contract.liveGates || []) {
      const outcome = await runLiveGate(gate);
      results.push({ ...gate, ...outcome, live: true });
      printGate(gate.id, outcome.status);
    }
  }

  for (const claim of contract.ecosystemClaims || []) {
    const claimed = String(process.env[claim.envClaim] || '').toLowerCase() === 'true';
    if (!claimed) continue;
    if (claim.requires && !existsAll(claim.requires)) {
      const outcome = { status: 'NOT_IMPLEMENTED', details: { claimed: true, missing: claim.requires.filter((p) => !fsSync.existsSync(path.resolve(p))) } };
      results.push({ ...claim, ...outcome, optionalClaim: true });
      printGate(claim.id, outcome.status);
      continue;
    }
    const outcome = runProbe(claim.probe);
    results.push({ ...claim, ...outcome, optionalClaim: true });
    printGate(claim.id, outcome.status);
  }

  const counts = Object.fromEntries(['PASS','FAIL','NOT_IMPLEMENTED','BLOCKED'].map((s) => [s, results.filter((r) => r.status === s).length]));
  const overall = results.every((r) => r.status === 'PASS') ? 'PASS' : 'INCOMPLETE';
  const git = run('git', ['rev-parse', 'HEAD']);
  const receipt = {
    kind: 'noema-integrity',
    contractVersion: contract.version,
    mode,
    startedAt,
    completedAt: new Date().toISOString(),
    gitCommit: git.status === 0 ? git.stdout : null,
    overall,
    counts,
    goldenPath: contract.goldenPath,
    results,
    omittedLiveGates: flags.live ? [] : (contract.liveGates || []).map((gate) => gate.id),
    law: 'Unrequested live gates are omitted, not treated as passing. --live makes them mandatory. Claimed optional integrations become mandatory claim gates.',
  };

  await fs.mkdir(OUT_ROOT, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const file = path.join(OUT_ROOT, `${stamp}.json`);
  await fs.writeFile(file, `${JSON.stringify(receipt, null, 2)}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summaryLines = [
      `# Noema Full-System Integrity Summary (${mode})`,
      '',
      `**Overall Status**: \`${overall}\``,
      `**Contract Version**: \`${contract.version}\``,
      `**Git Commit**: \`${git.status === 0 ? git.stdout : 'unknown'}\``,
      '',
      '| Metric | Count |',
      '| --- | --- |',
      `| PASS | ${counts.PASS} |`,
      `| FAIL | ${counts.FAIL} |`,
      `| NOT_IMPLEMENTED | ${counts.NOT_IMPLEMENTED} |`,
      `| BLOCKED | ${counts.BLOCKED} |`,
      '',
      '### Gate Results',
      '| Gate ID | Phase | Status |',
      '| --- | --- | --- |',
      ...results.map((r) => `| \`${r.id}\` | \`${r.phase || 'other'}\` | **${r.status}** |`),
      '',
    ];
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summaryLines.join('\n') + '\n');
  }
  console.log(`\nNoema integrity (${mode}): ${overall}`);
  console.log(`PASS ${counts.PASS} | FAIL ${counts.FAIL} | NOT_IMPLEMENTED ${counts.NOT_IMPLEMENTED} | BLOCKED ${counts.BLOCKED}`);
  if (!flags.live && (contract.liveGates || []).length) console.log(`live gates omitted: ${(contract.liveGates || []).map((gate) => gate.id).join(', ')} (run with --live)`);
  console.log(`receipt: ${file}`);

  if (flags.json) console.log(JSON.stringify(receipt));
  if (overall !== 'PASS') process.exitCode = 2;
}

function printGate(id, status) {
  if (!flags.json) console.log(`${status.padEnd(15)} ${id}`);
}

main().catch(async (error) => {
  console.error(`[noema-integrity] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});