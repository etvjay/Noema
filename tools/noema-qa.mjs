#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const VERSION = '0.1.0';
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
    } else {
      out[key] = true;
    }
  }
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

function sh(command, argv = []) {
  const result = spawnSync(command, argv, { encoding: 'utf8' });
  return {
    available: result.error?.code !== 'ENOENT',
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
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

function hexToBigInt(value) {
  return BigInt(value);
}

async function writeReceipt(kind, receipt) {
  const root = flags.out || process.env.NOEMA_QA_OUT || 'artifacts/qa';
  const stamp = nowIso().replaceAll(':', '-');
  const dir = path.join(root, kind);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${stamp}.json`);
  await fs.writeFile(file, `${JSON.stringify(receipt, null, 2)}\n`);
  return file;
}

async function runDoctor() {
  const node = process.version;
  const pnpm = sh('pnpm', ['--version']);
  const forge = sh('forge', ['--version']);
  const cast = sh('cast', ['--version']);
  const git = sh('git', ['rev-parse', '--short', 'HEAD']);
  const viemVersion = await readPackageVersion('viem');
  const oxVersion = await readPackageVersion('ox');
  const receipt = {
    kind: 'doctor', version: VERSION, observedAt: nowIso(),
    node, pnpm, forge, cast, git, viemVersion, oxVersion,
    env: {
      hasXLayerRpcOverride: Boolean(process.env.XLAYER_TESTNET_RPC),
      hasOkxApiKey: Boolean(process.env.OKX_API_KEY),
      hasOkxAccessKey: Boolean(process.env.OK_ACCESS_KEY || process.env.OKX_ACCESS_KEY),
      hasPrivateKey: Boolean(process.env.PRIVATE_KEY || process.env.XLAYER_PRIVATE_KEY),
    },
  };
  const file = await writeReceipt('doctor', receipt);
  print(receipt, file);
}

async function readPackageVersion(name) {
  try {
    const raw = await fs.readFile('package.json', 'utf8');
    const pkg = JSON.parse(raw);
    return pkg.dependencies?.[name] || pkg.devDependencies?.[name] || null;
  } catch { return null; }
}

async function runXLayer() {
  const url = flags.rpc || DEFAULT_RPC;
  const chainHex = await rpc(url, 'eth_chainId');
  const chainId = hexToBigInt(chainHex);
  const blockHex = await rpc(url, 'eth_blockNumber');
  const latestBlock = Number(hexToBigInt(blockHex));
  const clientVersion = await rpc(url, 'web3_clientVersion').catch((error) => `unavailable: ${error.message}`);
  const predeploys = {};
  for (const [name, address] of Object.entries(PREDEPLOYS)) {
    const code = await rpc(url, 'eth_getCode', [address, 'latest']);
    predeploys[name] = { address, hasCode: code !== '0x', codeBytes: Math.max(0, (code.length - 2) / 2), codeHashInput: code };
  }
  const receipt = {
    kind: 'xlayer', version: VERSION, observedAt: nowIso(), rpc: url,
    chainId: Number(chainId), expectedChainId: Number(EXPECTED_TESTNET_CHAIN_ID),
    chainIdPass: chainId === EXPECTED_TESTNET_CHAIN_ID,
    latestBlock, clientVersion, predeploys,
  };
  if (!receipt.chainIdPass) receipt.failure = `Expected X Layer testnet chainId 1952, observed ${chainId}`;
  const file = await writeReceipt('xlayer', receipt);
  print(receipt, file);
  if (!receipt.chainIdPass) process.exitCode = 2;
}

function mcpHeaders() {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  const explicit = flags.header;
  if (explicit) {
    const idx = String(explicit).indexOf(':');
    if (idx < 1) throw new Error('--header must be NAME:VALUE');
    headers[String(explicit).slice(0, idx).trim()] = String(explicit).slice(idx + 1).trim();
  }
  const key = process.env.OK_ACCESS_KEY || process.env.OKX_ACCESS_KEY;
  if (key && !explicit) headers['OK-ACCESS-KEY'] = key;
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

async function runMcp() {
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
    const receipt = { kind: 'mcp', version: VERSION, observedAt: nowIso(), url, stage: 'initialize', status: init.response.status, sessionId: Boolean(sessionId), response: init.envelope || init.text.slice(0, 1000) };
    const file = await writeReceipt('mcp', receipt); print(receipt, file); process.exitCode = 2; return;
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
  const file = await writeReceipt('mcp', receipt); print(receipt, file);
  if (!listed.response.ok || listed.envelope?.error) process.exitCode = 2;
}

async function runEas() {
  const url = flags.rpc || DEFAULT_RPC;
  const results = {};
  for (const name of ['SchemaRegistry', 'EAS']) {
    const address = PREDEPLOYS[name];
    const code = await rpc(url, 'eth_getCode', [address, 'latest']);
    results[name] = { address, hasCode: code !== '0x', codeBytes: Math.max(0, (code.length - 2) / 2) };
  }
  const receipt = { kind: 'eas', version: VERSION, observedAt: nowIso(), rpc: url, mode: 'read-only-predeploy-probe', results };
  const file = await writeReceipt('eas', receipt); print(receipt, file);
  if (!results.SchemaRegistry.hasCode || !results.EAS.hasCode) process.exitCode = 2;
}

async function runSuite() {
  const stages = ['doctor', 'xlayer', 'eas', 'mcp'];
  const receipt = { kind: 'suite', version: VERSION, observedAt: nowIso(), stages, note: 'Run individual commands for detailed receipts.' };
  const file = await writeReceipt('suite', receipt);
  console.log(`suite receipt: ${file}`);
  for (const stage of stages) {
    console.log(`\n== ${stage} ==`);
    const result = spawnSync(process.execPath, [process.argv[1], stage, ...forwardSuiteFlags()], { stdio: 'inherit', env: process.env });
    if (result.status !== 0) process.exitCode = result.status || 2;
  }
}

function forwardSuiteFlags() {
  const out = [];
  for (const [key, value] of Object.entries(flags)) {
    if (key === 'write') continue;
    out.push(value === true ? `--${key}` : `--${key}=${value}`);
  }
  return out;
}

function print(receipt, file) {
  if (flags.json) console.log(JSON.stringify(receipt));
  else {
    console.log(JSON.stringify(receipt, null, 2));
    console.log(`\nreceipt: ${file}`);
  }
}

function help() {
  console.log(`Noema QA ${VERSION}\n\nUsage:\n  node tools/noema-qa.mjs <command> [flags]\n\nCommands:\n  doctor    Check Node/pnpm/Foundry/cast/git and secret presence\n  xlayer    Assert X Layer testnet chainId and probe important predeploy bytecode\n  mcp       Perform live MCP initialize + tools/list against the supplied OKX endpoint\n  eas       Probe X Layer SchemaRegistry/EAS predeploy bytecode\n  suite     Run doctor + xlayer + eas + mcp\n\nFlags:\n  --rpc <url>       Override X Layer RPC\n  --url <url>       Override MCP endpoint\n  --header N:V      Explicit MCP auth/header (never written to receipts)\n  --protocol <ver>  MCP protocol version to propose (default 2025-06-18)\n  --timeout <ms>    Request timeout\n  --out <dir>       Receipt root (default artifacts/qa)\n  --json            Compact JSON output\n\nEnvironment:\n  XLAYER_TESTNET_RPC\n  OKX_ONCHAINOS_MCP_URL\n  OK_ACCESS_KEY / OKX_ACCESS_KEY\n  PRIVATE_KEY / XLAYER_PRIVATE_KEY (presence checked only; never printed)\n\nSafety:\n  v0.1.0 is read-only on external systems. State-changing EAS, registry-deploy,\n  OKLink verify, and Builder Code experiments are intentionally gated for the\n  next iteration after their exact contracts/scripts are frozen.\n`);
}

try {
  if (command === 'doctor') await runDoctor();
  else if (command === 'xlayer') await runXLayer();
  else if (command === 'mcp') await runMcp();
  else if (command === 'eas') await runEas();
  else if (command === 'suite') await runSuite();
  else help();
} catch (error) {
  const failure = { kind: command, version: VERSION, observedAt: nowIso(), error: error instanceof Error ? error.message : String(error) };
  const file = await writeReceipt('failures', failure).catch(() => null);
  console.error(JSON.stringify(failure, null, 2));
  if (file) console.error(`receipt: ${file}`);
  process.exitCode = 2;
}
