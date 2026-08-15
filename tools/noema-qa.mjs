#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const VERSION = '0.2.0';
const ROOT = process.cwd();
const DEFAULT_RPC = process.env.XLAYER_TESTNET_RPC || 'https://testrpc.xlayer.tech/terigon';
const DEFAULT_MCP = process.env.OKX_ONCHAINOS_MCP_URL || 'https://web3.okx.com/api/v1/onchainos-mcp';
const EXPECTED_TESTNET_CHAIN_ID = 1952n;
const PREDEPLOYS = {
  L1Block: '0x4200000000000000000000000000000000000015',
  GasPriceOracle: '0x420000000000000000000000000000000000000F',
  SchemaRegistry: '0x4200000000000000000000000000000000000020',
  EAS: '0x4200000000000000000000000000000000000021',
};

const args = process.argv.slice(2);
const command = args[0] || 'help';
const flags = parseFlags(args.slice(1));

function parseFlags(values) {
  const out = {};
  for (let i = 0; i < values.length; i += 1) {
    const token = values[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      out[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = values[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else out[key] = true;
  }
  return out;
}

function nowIso() { return new Date().toISOString(); }

function sh(command, argv = [], options = {}) {
  const result = spawnSync(command, argv, { encoding: 'utf8', cwd: ROOT, ...options });
  return {
    available: result.error?.code !== 'ENOENT',
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function summarizeCommand(result) {
  return {
    available: result.available,
    status: result.status,
    stdoutTail: result.stdout.slice(-2000),
    stderrTail: result.stderr.slice(-2000),
  };
}

async function rpc(url, method, params = []) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(Number(flags.timeout || 15000)),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}: ${text.slice(0, 300)}`);
  if (body.error) throw new Error(`${method} RPC error: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function writeReceipt(kind, receipt) {
  const root = flags.out || process.env.NOEMA_QA_OUT || 'artifacts/qa';
  const stamp = nowIso().replaceAll(':', '-');
  const dir = path.join(root, kind);
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${stamp}.json`);
  await fsp.writeFile(file, `${JSON.stringify(receipt, null, 2)}\n`);
  return file;
}

function print(receipt, file) {
  if (flags.json) console.log(JSON.stringify(receipt));
  else {
    console.log(JSON.stringify(receipt, null, 2));
    console.log(`\nreceipt: ${file}`);
  }
}

async function readPackageVersion(name) {
  try {
    const raw = await fsp.readFile('package.json', 'utf8');
    const pkg = JSON.parse(raw);
    return pkg.dependencies?.[name] || pkg.devDependencies?.[name] || null;
  } catch { return null; }
}

async function runDoctor() {
  const receipt = {
    kind: 'doctor', version: VERSION, observedAt: nowIso(),
    node: process.version,
    pnpm: sh('pnpm', ['--version']),
    forge: sh('forge', ['--version']),
    cast: sh('cast', ['--version']),
    git: sh('git', ['rev-parse', '--short', 'HEAD']),
    viemVersion: await readPackageVersion('viem'),
    oxVersion: await readPackageVersion('ox'),
    env: {
      hasXLayerRpcOverride: Boolean(process.env.XLAYER_TESTNET_RPC),
      hasOkxApiKey: Boolean(process.env.OKX_API_KEY),
      hasOkxAccessKey: Boolean(process.env.OK_ACCESS_KEY || process.env.OKX_ACCESS_KEY),
      hasPrivateKey: Boolean(process.env.PRIVATE_KEY || process.env.XLAYER_PRIVATE_KEY),
    },
  };
  const file = await writeReceipt('doctor', receipt); print(receipt, file); return receipt;
}

async function runXLayer({ nested = false } = {}) {
  const url = flags.rpc || DEFAULT_RPC;
  const chainHex = await rpc(url, 'eth_chainId');
  const chainId = BigInt(chainHex);
  const blockHex = await rpc(url, 'eth_blockNumber');
  const predeploys = {};
  for (const [name, address] of Object.entries(PREDEPLOYS)) {
    const code = await rpc(url, 'eth_getCode', [address, 'latest']);
    predeploys[name] = { address, hasCode: code !== '0x', codeBytes: Math.max(0, (code.length - 2) / 2) };
  }
  const receipt = {
    kind: 'xlayer', version: VERSION, observedAt: nowIso(), rpc: url,
    chainId: Number(chainId), expectedChainId: Number(EXPECTED_TESTNET_CHAIN_ID),
    chainIdPass: chainId === EXPECTED_TESTNET_CHAIN_ID,
    latestBlock: Number(BigInt(blockHex)),
    clientVersion: await rpc(url, 'web3_clientVersion').catch((e) => `unavailable: ${e.message}`),
    predeploys,
  };
  if (!nested) { const file = await writeReceipt('xlayer', receipt); print(receipt, file); }
  if (!receipt.chainIdPass) process.exitCode = 2;
  return receipt;
}

function mcpHeaders() {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  if (flags.header) {
    const idx = String(flags.header).indexOf(':');
    if (idx < 1) throw new Error('--header must be NAME:VALUE');
    headers[String(flags.header).slice(0, idx).trim()] = String(flags.header).slice(idx + 1).trim();
  } else {
    const key = process.env.OK_ACCESS_KEY || process.env.OKX_ACCESS_KEY;
    if (key) headers['OK-ACCESS-KEY'] = key;
  }
  return headers;
}

function parseMcpEnvelope(text) {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value.startsWith('data:')) continue;
    const data = value.slice(5).trim();
    if (!data) continue;
    try {
      const parsed = JSON.parse(data);
      if (parsed.result || parsed.error) return parsed;
    } catch {}
  }
  throw new Error('No JSON-RPC result/error found in MCP response');
}

async function mcpPost(url, body, headers) {
  const response = await fetch(url, {
    method: 'POST', headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(flags.timeout || 20000)),
  });
  const text = await response.text();
  return { response, text, envelope: text ? parseMcpEnvelope(text) : null };
}

async function runMcp({ nested = false } = {}) {
  const url = flags.url || DEFAULT_MCP;
  const headers = mcpHeaders();
  const init = await mcpPost(url, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: flags.protocol || '2025-06-18', capabilities: {}, clientInfo: { name: 'noema-qa', version: VERSION } },
  }, headers);
  const sessionId = init.response.headers.get('mcp-session-id');
  const followHeaders = { ...headers };
  if (sessionId) followHeaders['Mcp-Session-Id'] = sessionId;
  if (!init.response.ok) {
    const receipt = { kind: 'mcp', version: VERSION, observedAt: nowIso(), url, initializeStatus: init.response.status, tools: [] };
    if (!nested) { const file = await writeReceipt('mcp', receipt); print(receipt, file); }
    return receipt;
  }
  await fetch(url, {
    method: 'POST', headers: followHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    signal: AbortSignal.timeout(Number(flags.timeout || 20000)),
  }).catch(() => null);
  const listed = await mcpPost(url, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, followHeaders);
  const tools = listed.envelope?.result?.tools || [];
  const receipt = {
    kind: 'mcp', version: VERSION, observedAt: nowIso(), url,
    initialize: { status: init.response.status, result: init.envelope?.result || null },
    session: { present: Boolean(sessionId) },
    toolsList: { status: listed.response.status, count: tools.length, tools },
  };
  if (!nested) { const file = await writeReceipt('mcp', receipt); print(receipt, file); }
  return receipt;
}

async function runEas({ nested = false } = {}) {
  const url = flags.rpc || DEFAULT_RPC;
  const results = {};
  for (const name of ['SchemaRegistry', 'EAS']) {
    const address = PREDEPLOYS[name];
    const code = await rpc(url, 'eth_getCode', [address, 'latest']);
    results[name] = { address, hasCode: code !== '0x', codeBytes: Math.max(0, (code.length - 2) / 2) };
  }
  const receipt = { kind: 'eas', version: VERSION, observedAt: nowIso(), rpc: url, mode: 'read-only-predeploy-probe', results };
  if (!nested) { const file = await writeReceipt('eas', receipt); print(receipt, file); }
  return receipt;
}

async function loadIntegrityManifest() {
  return JSON.parse(await fsp.readFile(path.join(ROOT, 'qa/noema-integrity.json'), 'utf8'));
}

async function productTruthCheck(manifest) {
  const productTruthPath = path.join(ROOT, manifest.productTruth);
  if (!fs.existsSync(productTruthPath)) return { status: 'FAIL', details: `Missing ${manifest.productTruth}` };
  const text = await fsp.readFile(productTruthPath, 'utf8');
  const required = [
    'Evidence-Bounded Economic Object',
    'AI inference cannot silently become VERIFIED',
    'Similar economic exposure does not imply economic equivalence',
    'Historical canonical versions are never silently overwritten',
    'Noema does not claim universal truth',
    'resolve -> evidence -> verify -> interpret -> evaluate -> commit -> watch ->',
  ];
  const missing = required.filter((needle) => !text.includes(needle));
  return missing.length ? { status: 'FAIL', details: { missing } } : { status: 'PASS', details: { requiredMarkers: required.length } };
}

function missingRequirements(requires = []) {
  return requires.filter((item) => !fs.existsSync(path.join(ROOT, item)));
}

function mapCommandStatus(result) {
  if (!result.available) return 'BLOCKED';
  return result.status === 0 ? 'PASS' : 'FAIL';
}

async function evaluateGate(gate) {
  if (gate.kind === 'product-truth') {
    const checked = await productTruthCheck(await loadIntegrityManifest());
    return { ...gate, ...checked };
  }
  const missing = missingRequirements(gate.requires || []);
  if (missing.length) return { ...gate, status: 'NOT_IMPLEMENTED', details: { missing } };
  if (gate.kind === 'command') {
    const result = sh(gate.command, gate.args || []);
    return { ...gate, status: mapCommandStatus(result), details: summarizeCommand(result) };
  }
  return { ...gate, status: 'BLOCKED', details: 'Unsupported gate kind' };
}

async function evaluateProbeGate(gate) {
  const missing = missingRequirements(gate.requires || []);
  if (missing.length) return { ...gate, status: 'NOT_IMPLEMENTED', details: { missing } };
  try {
    let receipt;
    if (gate.probe === 'xlayer') receipt = await runXLayer({ nested: true });
    else if (gate.probe === 'mcp') receipt = await runMcp({ nested: true });
    else if (gate.probe === 'eas') receipt = await runEas({ nested: true });
    else return { ...gate, status: 'BLOCKED', details: `Unknown probe ${gate.probe}` };
    let pass = true;
    if (gate.probe === 'xlayer') pass = receipt.chainIdPass;
    if (gate.probe === 'mcp') pass = Boolean(receipt.toolsList?.status >= 200 && receipt.toolsList?.status < 300);
    if (gate.probe === 'eas') pass = Boolean(receipt.results?.SchemaRegistry?.hasCode && receipt.results?.EAS?.hasCode);
    return { ...gate, status: pass ? 'PASS' : 'FAIL', details: receipt };
  } catch (error) {
    return { ...gate, status: 'BLOCKED', details: error instanceof Error ? error.message : String(error) };
  }
}

async function runIntegrity() {
  const manifest = await loadIntegrityManifest();
  const mode = String(flags.mode || 'core');
  const gates = [];
  for (const gate of manifest.coreGates) gates.push(await evaluateGate(gate));
  if (mode === 'live' || mode === 'release') {
    for (const gate of manifest.liveGates || []) {
      gates.push(gate.probe ? await evaluateProbeGate(gate) : await evaluateGate(gate));
    }
  }
  for (const gate of manifest.ecosystemClaims || []) {
    if (process.env[gate.envClaim] !== '1' && process.env[gate.envClaim] !== 'true') continue;
    gates.push(gate.probe ? await evaluateProbeGate(gate) : await evaluateGate(gate));
  }
  const counts = { PASS: 0, FAIL: 0, NOT_IMPLEMENTED: 0, BLOCKED: 0 };
  for (const gate of gates) counts[gate.status] = (counts[gate.status] || 0) + 1;
  const healthy = counts.FAIL === 0 && counts.NOT_IMPLEMENTED === 0 && counts.BLOCKED === 0;
  const receipt = {
    kind: 'integrity', version: VERSION, observedAt: nowIso(), mode,
    product: 'Noema', manifestVersion: manifest.version,
    healthy, counts, gates,
    law: 'PASS means implemented and proven by the configured gate. NOT_IMPLEMENTED and BLOCKED are never green.',
  };
  const file = await writeReceipt('integrity', receipt);
  print(receipt, file);
  if (!healthy) process.exitCode = 2;
  return receipt;
}

async function runSuite() {
  return runIntegrity();
}

function help() {
  console.log(`Noema Integrity QA ${VERSION}\n\nUsage:\n  pnpm qa -- <command> [flags]\n\nAuthoritative commands:\n  integrity           Full Noema integrity contract (default core mode)\n  integrity --mode live     Include live X Layer/runtime gates\n  integrity --mode release  Release-oriented integrity gate\n  suite               Alias for integrity\n\nSubsystem probes:\n  doctor              Toolchain/environment readiness\n  xlayer              X Layer RPC + required predeploy sanity\n  mcp                 Remote MCP initialize + tools/list research probe\n  eas                 Read-only EAS/SchemaRegistry predeploy probe\n\nIntegrity states:\n  PASS             implemented and gate passed\n  FAIL             asserted/implemented but failed\n  NOT_IMPLEMENTED  required Noema integrity surface does not yet exist\n  BLOCKED          environment/live dependency prevents validation\n\nImportant:\n  Integrations are only subsystems. A green X Layer/MCP/EAS probe cannot make Noema healthy.\n  The authoritative contract is qa/noema-integrity.json and ultimately PRODUCT_TRUTH.md.\n`);
}

try {
  if (command === 'doctor') await runDoctor();
  else if (command === 'xlayer') await runXLayer();
  else if (command === 'mcp') await runMcp();
  else if (command === 'eas') await runEas();
  else if (command === 'integrity' || command === 'suite') await runIntegrity();
  else help();
} catch (error) {
  const failure = { kind: command, version: VERSION, observedAt: nowIso(), error: error instanceof Error ? error.message : String(error) };
  const file = await writeReceipt('failures', failure).catch(() => null);
  console.error(JSON.stringify(failure, null, 2));
  if (file) console.error(`receipt: ${file}`);
  process.exitCode = 2;
}
