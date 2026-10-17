#!/usr/bin/env node
// Orchestrator: detect -> (patch -> verify, retry with test log) per repo in parallel -> ship.
// usage: node src/run.mjs [--sandbox freestyle|local] [--patch live|mock] [--repos node,python,go]
//                         [--attempts 3] [--ship] [--merge auto --base autodemo --max-lines 200] [--provider NAME] [--keep] [--old spec-v1.yaml] [--new spec-v2.yaml]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify, cleanup } from './verify/verify.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const flags = new Set(['ship', 'keep', 'contract']);
const o = { sandbox: 'freestyle', patch: 'live', repos: 'node,python,go', attempts: '3', old: 'provider/spec-v1.yaml', new: 'provider/spec-v2.yaml' };
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i++) { const k = a[i].replace(/^--/, ''); o[k] = flags.has(k) ? true : a[++i]; }

const provider = o.provider || 'acme-pay';
const runId = o.run || `run-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
const runDir = join(ROOT, 'runs', runId);
const model = o.patch === 'mock' ? 'reference-patch' : process.env.PATCH_MODEL || 'deepseek-v4.1-flash';
const env = { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin` };
const log = (...m) => console.log(`[${new Date().toLocaleTimeString()}]`, ...m);
const node = (script, args) => run(process.execPath, [join(ROOT, script), ...args], { cwd: ROOT, env, maxBuffer: 1 << 24 });

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const now = () => new Date().toISOString();
function setResult(lang, patch) {
  const f = join(runDir, lang, 'result.json');
  const r = existsSync(f) ? readJson(f) : { run_id: runId, provider, repo: lang, status: 'queued', vm_id: null, sandbox: o.sandbox, attempts: [], pr_url: null, started_at: now(), finished_at: null };
  writeFileSync(f, JSON.stringify(Object.assign(r, patch), null, 2));
  return r;
}

// 1. detect + publish the feed
mkdirSync(runDir, { recursive: true });
const changesPath = join(runDir, 'changes.json');
await node('src/detect/detect.mjs', ['--old', o.old, '--new', o.new, '--provider', provider, '--spec-url', o['spec-url'] || 'http://localhost:8800/spec.yaml', '--out', changesPath]);
mkdirSync(join(ROOT, 'runs/feed'), { recursive: true });
copyFileSync(changesPath, join(ROOT, `runs/feed/${provider}.json`));
const changes = readJson(changesPath);
log(`detected ${changes.changes.length} changes (${changes.from_version} -> ${changes.to_version}):`, changes.changes.map((c) => c.kind).join(', '));

const langs = o.repos.split(',');
for (const l of langs) { mkdirSync(join(runDir, l), { recursive: true }); copyFileSync(changesPath, join(runDir, l, 'changes.json')); setResult(l, {}); }

// 2. per repo: patch -> verify, retry with the failing log
const killVm = (vm) => run('npx', ['-y', 'freestyle@latest', 'vm', 'delete', vm], { env }).catch(() => {});

async function repoFlow(lang) {
  const repoDir = join(ROOT, 'demo-repos', lang);
  let feedback = null, prevVm = null;
  for (let n = 1; n <= +o.attempts; n++) {
    const patchFile = join(runDir, lang, `attempt-${n}.diff`);
    setResult(lang, { status: 'patching' });
    log(lang, `attempt ${n}: patching with ${model}`);
    const pargs = ['--repo', repoDir, '--changes', changesPath, '--out', patchFile];
    if (o.patch === 'mock' && n === 1) pargs.push('--mock');
    if (feedback) { const fb = join(runDir, lang, `feedback-${n}.txt`); writeFileSync(fb, feedback); pargs.push('--feedback', fb); }
    try { await node('src/patch/patch.mjs', pargs); }
    catch (e) {
      const r = setResult(lang, {});
      r.attempts = r.attempts.filter((x) => x.n !== n).concat({ n, model, tests: 'fail', log_tail: `patch step failed: ${(e.stderr || e.message).slice(-400)}` });
      setResult(lang, { attempts: r.attempts, status: n === +o.attempts ? 'failed' : 'patching' });
      feedback = `previous patch could not be produced or applied: ${(e.stderr || e.message).slice(-600)}`;
      continue;
    }
    if (prevVm && o.sandbox === 'freestyle') await killVm(prevVm); // stay under the Free plan VM cap
    log(lang, `attempt ${n}: verifying in ${o.sandbox}`);
    const r = await verify({ repoDir, patchPath: patchFile, runId, provider, sandbox: o.sandbox, attempt: n, model, env: ['ACME_API_VERSION=v2'], changesPath, contract: o.contract && resolve(ROOT, o.new) });
    log(lang, `attempt ${n}: tests ${r.tests}${r.vm_id ? ` (vm ${r.vm_id})` : ''}`);
    if (r.tests === 'pass') {
      if (o.ship) {
        log(lang, 'opening PR');
        await node('src/ship/ship.mjs', ['--lang', lang, '--patch', patchFile, '--run', runId, '--provider', provider, ...(o.merge ? ['--merge', o.merge] : []), ...(o.base ? ['--base', o.base] : []), ...(o['max-lines'] ? ['--max-lines', o['max-lines']] : [])]);
      }
      return;
    }
    feedback = r.log_tail; prevVm = r.vm_id;
  }
  setResult(lang, { status: 'failed', finished_at: now() });
}

await Promise.all(langs.map((l) => repoFlow(l).catch((e) => { log(l, 'error:', e.message); setResult(l, { status: 'failed', finished_at: now() }); })));

// 3. summary
console.log(`\nrun ${runId}`);
for (const l of langs) {
  const r = readJson(join(runDir, l, 'result.json'));
  console.log(`  ${l.padEnd(7)} ${r.status.padEnd(8)} attempts=${r.attempts.length} ${r.vm_id || ''} ${r.pr_url || ''}`);
}
if (o.sandbox === 'freestyle' && !o.keep) await cleanup(runId);
process.exit(langs.every((l) => ['passed', 'shipped'].includes(readJson(join(runDir, l, 'result.json')).status)) ? 0 : 1);
