#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const VERSION = '0.1.0';
const REPO_ROOT = process.cwd();
const STATE_ROOT = path.join(REPO_ROOT, 'experiments', 'state');

const argv = process.argv.slice(2);
const command = argv[0] || 'help';
const positionals = [];
const flags = parseArgs(argv.slice(1), positionals);

function parseArgs(tokens, positionals) {
  const out = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const eq = token.indexOf('=');
    if (eq >= 0) {
      const key = token.slice(2, eq);
      const value = token.slice(eq + 1);
      if (out[key] === undefined) out[key] = value;
      else out[key] = Array.isArray(out[key]) ? [...out[key], value] : [out[key], value];
      continue;
    }
    const key = token.slice(2);
    const next = tokens[i + 1];
    if (next && !next.startsWith('--')) {
      if (out[key] === undefined) out[key] = next;
      else out[key] = Array.isArray(out[key]) ? [...out[key], next] : [out[key], next];
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function findExperimentFoundryHome() {
  const candidates = [
    process.env.EXPERIMENT_FOUNDRY_HOME,
    path.join(REPO_ROOT, '.tools', 'experiment-foundry'),
    path.join(REPO_ROOT, 'vendor', 'experiment-foundry'),
    path.resolve(REPO_ROOT, '..', 'experiment-foundry'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'ensemble.yaml')) && fs.existsSync(path.join(candidate, 'experiment_foundry'))) {
      return path.resolve(candidate);
    }
  }
  return null;
}

let EF_HOME = findExperimentFoundryHome();

async function bootstrap() {
  const bundle = flags.bundle ? path.resolve(REPO_ROOT, String(flags.bundle)) : null;
  if (!bundle || !fs.existsSync(bundle)) throw new Error('bootstrap requires --bundle <path-to-Experiment-Foundry zip>');
  const targetParent = path.join(REPO_ROOT, '.tools');
  await fsp.mkdir(targetParent, { recursive: true });
  const py = process.env.EXPERIMENT_FOUNDRY_PYTHON || ['python', 'python3'].find((candidate) => {
    const check = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    return !check.error && check.status === 0;
  });
  if (!py) throw new Error('Python is required to extract the Experiment Foundry bundle.');
  const script = `
import io, pathlib, shutil, sys, zipfile, hashlib
bundle = pathlib.Path(sys.argv[1]).resolve()
target = pathlib.Path(sys.argv[2]).resolve()
final = target / "experiment-foundry"
if final.exists():
    shutil.rmtree(final)
with zipfile.ZipFile(bundle) as outer:
    names = set(outer.namelist())
    nested = "experiment-foundry-install-bundle/Experiment-Foundry-0.1.0.zip"
    if nested in names:
        data = outer.read(nested)
        print("Experiment Foundry release sha256:", hashlib.sha256(data).hexdigest())
        with zipfile.ZipFile(io.BytesIO(data)) as inner:
            inner.extractall(target)
    else:
        outer.extractall(target)
if not (final / "ensemble.yaml").exists():
    raise SystemExit("Experiment Foundry root not found after extraction")
print(final)
`;
  const result = spawnSync(py, ['-c', script, bundle, targetParent], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Experiment Foundry extraction failed: ${(result.stderr || result.stdout || '').trim()}`);
  process.stdout.write(result.stdout || '');
  EF_HOME = findExperimentFoundryHome();
  if (!EF_HOME) throw new Error('Experiment Foundry was extracted but could not be discovered.');
  runEf(['validate']);
  runEf(['regression']);
  console.log(`Experiment Foundry ready: ${EF_HOME}`);
}

function pythonBin() {
  const candidates = [
    process.env.EXPERIMENT_FOUNDRY_PYTHON,
    EF_HOME ? path.join(EF_HOME, '.venv', 'bin', 'python') : null,
    'python',
    'python3',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const check = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (!check.error && check.status === 0) return candidate;
  }
  return null;
}

function requireFoundry() {
  if (!EF_HOME) {
    throw new Error('Experiment Foundry not found. Set EXPERIMENT_FOUNDRY_HOME or run bootstrap with the supplied bundle.');
  }
  const py = pythonBin();
  if (!py) throw new Error('Python runtime not found for Experiment Foundry.');
  return py;
}

function runEf(args, { capture = false } = {}) {
  const py = requireFoundry();
  const result = spawnSync(py, ['-m', 'experiment_foundry', ...args], {
    cwd: EF_HOME,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    env: { ...process.env, PYTHONPATH: EF_HOME },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr || result.stdout || '');
    const error = new Error(`Experiment Foundry command failed with status ${result.status}: ${args.join(' ')}`);
    error.status = result.status;
    throw error;
  }
  return capture ? result.stdout : '';
}

function projectId() {
  const id = positionals[0] || flags.project;
  if (!id) throw new Error('Project id required.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Unsafe project id: ${id}`);
  return id;
}

async function copyDir(src, dest) {
  await fsp.rm(dest, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.cp(src, dest, { recursive: true });
}

async function hydrate(id) {
  const canonical = path.join(STATE_ROOT, id);
  const runtime = path.join(EF_HOME, 'projects', id);
  if (!fs.existsSync(canonical)) throw new Error(`No canonical experiment state for ${id}. Run: pnpm experiment -- init ${id}`);
  await copyDir(canonical, runtime);
}

async function persist(id) {
  const runtime = path.join(EF_HOME, 'projects', id);
  const canonical = path.join(STATE_ROOT, id);
  if (!fs.existsSync(runtime)) throw new Error(`Experiment Foundry runtime state missing for ${id}`);
  await copyDir(runtime, canonical);
  console.log(`canonical experiment state: ${path.relative(REPO_ROOT, canonical)}`);
}

async function withProject(id, fn) {
  requireFoundry();
  await hydrate(id);
  const result = await fn();
  await persist(id);
  return result;
}

async function init() {
  requireFoundry();
  const id = projectId();
  const canonical = path.join(STATE_ROOT, id);
  if (fs.existsSync(canonical) && !flags.force) throw new Error(`Canonical state already exists for ${id}; use --force only if you intend to reinitialize it.`);
  const runtime = path.join(EF_HOME, 'projects', id);
  if (flags.force) await fsp.rm(runtime, { recursive: true, force: true });
  const name = String(flags.name || id);
  const profile = String(flags.profile || 'general-experiment');
  runEf(['init', id, '--name', name, '--profile', profile]);
  await persist(id);
}

async function workflow() {
  const id = projectId();
  const workflowName = positionals[1] || flags.workflow;
  const request = flags.request;
  if (!workflowName || !request) throw new Error('Usage: experiment workflow <project> <workflow> --request "..."');
  await withProject(id, async () => {
    runEf(['workflow', workflowName, '--project', id, '--request', String(request), '--context-profile', String(flags.context || 'deep')]);
  });
}

async function runMode() {
  const id = projectId();
  const request = flags.request || positionals.slice(1).join(' ');
  if (!request) throw new Error('Usage: experiment run <project> --request "..." [--skill ... --mode ...]');
  const args = ['run', String(request), '--project', id, '--context-profile', String(flags.context || 'deep')];
  if (flags.skill) args.push('--skill', String(flags.skill));
  if (flags.mode) args.push('--mode', String(flags.mode));
  await withProject(id, async () => runEf(args));
}

async function status() {
  const id = projectId();
  await withProject(id, async () => runEf(['project-status', id]));
}

async function next() {
  const id = projectId();
  await withProject(id, async () => runEf(['next', '--project', id]));
}

async function validate() {
  runEf(['validate']);
  runEf(['regression']);
}

function repeatedFlag(name) {
  const value = flags[name];
  if (value === undefined) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

async function observe() {
  const id = projectId();
  for (const key of ['id', 'metric', 'value']) if (flags[key] === undefined) throw new Error(`--${key} is required`);
  const args = ['register-observation', '--project', id, '--id', String(flags.id), '--metric', String(flags.metric), '--value', String(flags.value)];
  for (const key of ['unit', 'trial', 'protocol-version', 'source', 'notes']) {
    if (flags[key] !== undefined) args.push(`--${key}`, String(flags[key]));
  }
  await withProject(id, async () => runEf(args));
}

async function result() {
  const id = projectId();
  for (const key of ['id', 'metric', 'value', 'formula']) if (flags[key] === undefined) throw new Error(`--${key} is required`);
  const derived = repeatedFlag('derived-from');
  if (!derived.length) throw new Error('At least one --derived-from observation id is required');
  const args = ['register-result', '--project', id, '--id', String(flags.id), '--metric', String(flags.metric), '--value', String(flags.value), '--formula', String(flags.formula)];
  for (const item of derived) args.push('--derived-from', item);
  for (const key of ['unit', 'protocol-version', 'interpretation']) if (flags[key] !== undefined) args.push(`--${key}`, String(flags[key]));
  await withProject(id, async () => runEf(args));
}

async function sha256File(file) {
  const data = await fsp.readFile(file);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function observeReceipt() {
  const id = projectId();
  for (const key of ['receipt', 'id', 'metric', 'value']) if (flags[key] === undefined) throw new Error(`--${key} is required`);
  const receipt = path.resolve(REPO_ROOT, String(flags.receipt));
  if (!receipt.startsWith(path.resolve(REPO_ROOT) + path.sep)) throw new Error('Receipt must be inside the Noema repository.');
  if (!fs.existsSync(receipt)) throw new Error(`Receipt not found: ${receipt}`);
  const digest = await sha256File(receipt);
  const relative = path.relative(REPO_ROOT, receipt);
  const source = `noema-qa:${relative}:sha256:${digest}`;
  const notes = [flags.notes, `raw receipt ${relative}`, `sha256 ${digest}`].filter(Boolean).join('; ');
  const args = ['register-observation', '--project', id, '--id', String(flags.id), '--metric', String(flags.metric), '--value', String(flags.value), '--source', source, '--notes', notes];
  for (const key of ['unit', 'trial', 'protocol-version']) if (flags[key] !== undefined) args.push(`--${key}`, String(flags[key]));
  await withProject(id, async () => runEf(args));
}

async function qa() {
  const qaCommand = positionals[0] || 'suite';
  const args = ['tools/noema-qa.mjs', qaCommand];
  if (flags.rpc) args.push('--rpc', String(flags.rpc));
  if (flags.url) args.push('--url', String(flags.url));
  if (flags.timeout) args.push('--timeout', String(flags.timeout));
  const result = spawnSync(process.execPath, args, { cwd: REPO_ROOT, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`noema-qa ${qaCommand} failed with status ${result.status}`);
    error.status = result.status;
    throw error;
  }
}

async function iteration() {
  const id = projectId();
  console.log('== Experiment status ==');
  await withProject(id, async () => runEf(['project-status', id]));
  console.log('\n== Next governed step ==');
  await withProject(id, async () => runEf(['next', '--project', id]));
  console.log('\n== Live QA probes ==');
  const result = spawnSync(process.execPath, ['tools/noema-qa.mjs', String(flags.qa || 'suite')], { cwd: REPO_ROOT, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exitCode = result.status || 2;
  console.log('\nRaw QA receipts remain observations-in-waiting. Register only protocol-relevant measurements with observe-receipt after the protocol/metric contract is frozen.');
}

function help() {
  console.log(`Noema Experiment Bridge ${VERSION}\n\nPurpose:\n  Keep Experiment Foundry governance and Noema QA execution coupled while implementation proceeds.\n\nCommands:\n  bootstrap --bundle PATH\n      Extract the supplied Experiment Foundry install/release zip into .tools/experiment-foundry and validate it.\n\n  validate\n      Validate + regression-test the installed Experiment Foundry runtime.\n\n  init <project> [--name NAME] [--profile PROFILE]\n      Initialize a governed experiment and persist canonical state under experiments/state/<project>.\n\n  workflow <project> <workflow> --request "..." [--context deep]\n      Prepare a governed workflow packet (e.g. claim-to-experiment-truth, benchmark-cycle, fault-injection-cycle).\n\n  run <project> --request "..." [--skill ID --mode ID]\n      Prepare one routed Experiment Foundry operation.\n\n  status <project>\n  next <project>\n\n  qa [suite|doctor|xlayer|mcp|eas]\n      Run the fast Noema QA probes. These are raw observations, not automatic experimental conclusions.\n\n  iteration <project> [--qa suite]\n      Show experiment status + next governed action, then run the current QA probe loop.\n\n  observe <project> --id ID --metric M --value V [--unit U --trial T --source S --notes N]\n      Register an explicit raw observation.\n\n  observe-receipt <project> --receipt PATH --id ID --metric M --value V [--unit U --trial T]\n      Register a raw observation bound to the exact SHA-256 of a Noema QA receipt.\n\n  result <project> --id ID --metric M --value V --formula F --derived-from OBS [--derived-from OBS2]\n      Register a derived result with explicit raw-observation lineage.\n\nState model:\n  experiments/state/<project> is canonical and versioned with Noema. Before every operation it hydrates\n  Experiment Foundry's runtime project; after a successful operation it copies the state back.\n\nEvidence rule:\n  QA output -> raw receipt -> declared observation -> derived result -> validity review -> claim update.\n  Do not skip layers.\n`);
}

try {
  if (command === 'bootstrap') await bootstrap();
  else if (command === 'validate') await validate();
  else if (command === 'init') await init();
  else if (command === 'workflow') await workflow();
  else if (command === 'run') await runMode();
  else if (command === 'status') await status();
  else if (command === 'next') await next();
  else if (command === 'observe') await observe();
  else if (command === 'observe-receipt') await observeReceipt();
  else if (command === 'result') await result();
  else if (command === 'qa') await qa();
  else if (command === 'iteration') await iteration();
  else help();
} catch (error) {
  console.error(`[noema-experiment] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = error?.status || 2;
}
