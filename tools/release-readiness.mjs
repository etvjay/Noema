#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const matrixPath = path.join(root, 'qa', 'release-readiness.json')
const authorityPath = path.join(root, 'RELEASE_READINESS.md')

function fail(message) {
  console.error(`release-readiness: FAIL: ${message}`)
  process.exitCode = 1
}

if (!fs.existsSync(authorityPath)) fail('missing RELEASE_READINESS.md authority contract')
if (!fs.existsSync(matrixPath)) fail('missing qa/release-readiness.json matrix')

if (process.exitCode) process.exit(process.exitCode)

const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'))
const allowed = new Set(['IMPLEMENTED', 'DETERMINISTICALLY_PROVEN', 'LIVE_PROVEN', 'NOT_CLAIMED'])

if (matrix.authority !== 'RELEASE_READINESS.md') {
  fail(`matrix authority must be RELEASE_READINESS.md, got ${matrix.authority}`)
}

if (!Array.isArray(matrix.capabilities) || matrix.capabilities.length === 0) {
  fail('capabilities must be a non-empty array')
}

const ids = new Set()
for (const capability of matrix.capabilities ?? []) {
  if (!capability.id || typeof capability.id !== 'string') {
    fail('every capability requires a string id')
    continue
  }
  if (ids.has(capability.id)) fail(`duplicate capability id: ${capability.id}`)
  ids.add(capability.id)

  if (!allowed.has(capability.proofClass)) {
    fail(`${capability.id}: invalid proofClass ${capability.proofClass}`)
  }

  if (!capability.claim || typeof capability.claim !== 'string') {
    fail(`${capability.id}: claim is required`)
  }

  if (!Array.isArray(capability.evidence)) {
    fail(`${capability.id}: evidence must be an array`)
  } else if (capability.proofClass !== 'NOT_CLAIMED' && capability.evidence.length === 0) {
    fail(`${capability.id}: claimed capabilities require at least one evidence locator`)
  }

  if (capability.releaseUpgradeTarget && !allowed.has(capability.releaseUpgradeTarget)) {
    fail(`${capability.id}: invalid releaseUpgradeTarget ${capability.releaseUpgradeTarget}`)
  }

  if (capability.proofClass === 'LIVE_PROVEN' && capability.releaseUpgradeTarget) {
    fail(`${capability.id}: LIVE_PROVEN capability cannot still declare an upgrade target`)
  }
}

const terminal = matrix.terminalGate
if (!terminal || terminal.issue !== 43 || terminal.epic !== 32) {
  fail('terminalGate must bind Phase 2 terminal issue #43 to epic #32')
}
if (terminal?.requiredBeforeRelease !== true || terminal?.closeEpicOnlyAfterTerminalPass !== true) {
  fail('terminalGate must be mandatory and must prevent epic closure before terminal pass')
}

if (!process.exitCode) {
  const counts = Object.fromEntries([...allowed].map((status) => [status, 0]))
  for (const capability of matrix.capabilities) counts[capability.proofClass] += 1
  console.log('release-readiness: PASS')
  console.log(JSON.stringify({ version: matrix.version, capabilityCount: matrix.capabilities.length, counts, terminalGate: terminal }, null, 2))
}
