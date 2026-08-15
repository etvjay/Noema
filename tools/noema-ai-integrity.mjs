#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const CONTRACT_PATH = path.resolve('qa/noema-ai-integrity.json');
const OUT_ROOT = process.env.NOEMA_AI_QA_OUT || 'artifacts/qa/ai-integrity';

function run(command, argv = []) {
  const result = spawnSync(command, argv, { cwd: process.cwd(), encoding: 'utf8', env: process.env });
  return {
    unavailable: result.error?.code === 'ENOENT',
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function excerpt(value, max = 1800) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function missing(paths = []) {
  return paths.filter((p) => !fsSync.existsSync(path.resolve(p)));
}

async function main() {
  const contract = JSON.parse(await fs.readFile(CONTRACT_PATH, 'utf8'));
  const results = [];
  const startedAt = new Date().toISOString();

  for (const gate of contract.gates) {
    const absent = missing(gate.requires);
    if (absent.length) {
      const result = { ...gate, status: 'NOT_IMPLEMENTED', details: { missing: absent } };
      results.push(result);
      console.log(`${result.status.padEnd(15)} ${gate.id}`);
      continue;
    }

    const execution = run(gate.command, gate.args || []);
    let status = 'FAIL';
    if (execution.unavailable) status = 'BLOCKED';
    else if (execution.status === 0) status = 'PASS';

    const result = {
      ...gate,
      status,
      details: {
        command: [gate.command, ...(gate.args || [])].join(' '),
        exitCode: execution.status,
        stdout: excerpt(execution.stdout),
        stderr: excerpt(execution.stderr),
      },
    };
    results.push(result);
    console.log(`${status.padEnd(15)} ${gate.id}`);
  }

  const counts = Object.fromEntries(
    ['PASS', 'FAIL', 'NOT_IMPLEMENTED', 'BLOCKED'].map((status) => [
      status,
      results.filter((item) => item.status === status).length,
    ])
  );
  const overall = results.every((item) => item.status === 'PASS') ? 'PASS' : 'INCOMPLETE';
  const git = run('git', ['rev-parse', 'HEAD']);
  const receipt = {
    kind: 'noema-ai-integrity',
    contractVersion: contract.version,
    startedAt,
    completedAt: new Date().toISOString(),
    gitCommit: git.status === 0 ? git.stdout : null,
    overall,
    counts,
    results,
    law: 'Noema AI is proposal-only. Missing AI proof is NOT_IMPLEMENTED, not PASS. Model output cannot become canonical state without deterministic promotion and accepted evaluation evidence.',
  };

  await fs.mkdir(OUT_ROOT, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const file = path.join(OUT_ROOT, `${stamp}.json`);
  await fs.writeFile(file, `${JSON.stringify(receipt, null, 2)}\n`);

  console.log(`\nNoema AI integrity: ${overall}`);
  console.log(`PASS ${counts.PASS} | FAIL ${counts.FAIL} | NOT_IMPLEMENTED ${counts.NOT_IMPLEMENTED} | BLOCKED ${counts.BLOCKED}`);
  console.log(`receipt: ${file}`);

  if (overall !== 'PASS') process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[noema-ai-integrity] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
