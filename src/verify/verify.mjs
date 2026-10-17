#!/usr/bin/env node
// Verify a patch in a sandbox (local temp dir or Freestyle VM) and update runs/<run>/<repo>/result.json.
// Freestyle access goes through the freestyle CLI (zero deps); FREESTYLE_API_KEY is read from .env.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FS = ['npx', '-y', 'freestyle@latest'];
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const now = () => new Date().toISOString();

function loadEnv() {
  try {
    for (const l of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

// async process runner: resolves {code, out} (stdout+stderr merged)
function run(cmd, args, { cwd } = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd, env: process.env });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', (e) => res({ code: 127, out: String(e) }));
    p.on('close', (code) => res({ code, out }));
  });
}
const fs = (...a) => run(FS[0], [...FS.slice(1), ...a]);
const fsJson = async (...a) => {
  const r = await fs('--output', 'json', ...a);
  try { return JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { throw new Error(`freestyle ${a.slice(0, 2).join(' ')} failed: ${r.out.slice(-300)}`); }
};
const tail = (s, n = 15) => s.replace(/\s+$/, '').split('\n').slice(-n).join('\n');
const ms = async (f) => { const t = Date.now(); const v = await f(); return [v, Date.now() - t]; };

function langOf(repoDir) {
  if (existsSync(join(repoDir, 'go.mod'))) return 'go';
  if (existsSync(join(repoDir, 'package.json'))) return 'node';
  return 'python';
}
const setupCmd = {
  node: 'npm install --no-audit --no-fund',
  python: '[ -f requirements.txt ] && pip3 install -r requirements.txt || true',
  go: 'go mod download',
};

function readJson(p, d) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } }
const writeJson = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n');

async function localSandbox({ repoDir, patchPath, testCmd, env }) {
  const dir = mkdtempSync(join(tmpdir(), 'patchbay-'));
  try {
    let r = await run('git', ['clone', '-q', resolve(repoDir), join(dir, 'repo')]);
    if (r.code) return { pass: false, log: r.out };
    const cwd = join(dir, 'repo');
    r = await run('git', ['apply', resolve(patchPath)], { cwd });
    if (r.code) return { pass: false, log: 'git apply failed:\n' + r.out };
    r = await run('sh', ['-c', `env ${env.map(q).join(' ')} PATH="$PATH:/opt/homebrew/bin" ${testCmd}`], { cwd });
    return { pass: r.code === 0, log: r.out };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const REMOTE = '/home/ubuntu/repo';
const wrap = (c) => `export PATH="$PATH:/usr/local/go/bin" HOME=/home/ubuntu; cd ${REMOTE} && ${c}`;

async function freestyleSandbox({ repoDir, patchPath, testCmd, env, attempt, sb }) {
  const t = {};
  const ex = (vm, cmd, root) => fs('vm', 'exec', vm, '--timeout-ms', '300000', ...(root ? ['--linux-user', 'root'] : []), '--', 'sh', '-c', cmd);
  let vm;
  if (attempt > 1 && sb.snapshot_id) {
    // retry: fork a fresh VM from the saved snapshot (repo + deps already in place)
    const [v, d] = await ms(() => fsJson('vm', 'create', '--no-ssh', '--snapshot-id', sb.snapshot_id, '--metadata', 'patchbay=' + sb.run));
    vm = v.id; t.fork_ms = d;
    sb.vms.push(vm); writeJson(sb.file, sb);
  } else {
    const [v, d] = await ms(() => fsJson('vm', 'create', '--no-ssh', '--metadata', 'patchbay=' + sb.run));
    vm = v.id; t.create_ms = d;
    sb.vms.push(vm); writeJson(sb.file, sb);
    const tmp = mkdtempSync(join(tmpdir(), 'patchbay-up-'));
    const tarball = join(tmp, 'repo.tar');
    // git archive: tracked files only, no .git, no tokens/credentials
    await run('git', ['archive', '--format=tar', '-o', tarball, 'HEAD'], { cwd: resolve(repoDir) });
    const [, up] = await ms(async () => {
      await fs('vm', 'scp', tarball, `${vm}:/tmp/repo.tar`);
      await ex(vm, `rm -rf ${REMOTE} && mkdir -p ${REMOTE} && tar -xf /tmp/repo.tar -C ${REMOTE} && chown -R ubuntu:ubuntu ${REMOTE}`, true);
    });
    t.upload_ms = up;
    rmSync(tmp, { recursive: true, force: true });
    const lang = langOf(repoDir);
    const [r, inst] = await ms(async () => {
      if (lang === 'go') {
        const g = await ex(vm, 'test -x /usr/local/go/bin/go || { curl -fsSL https://go.dev/dl/go1.24.4.linux-$(dpkg --print-architecture).tar.gz | tar -C /usr/local -xz; }', true);
        if (g.code) return g;
      }
      return ex(vm, wrap(setupCmd[lang]));
    });
    t.install_ms = inst;
    if (r.code) return { pass: false, log: 'setup failed:\n' + r.out, vm, t };
    const [s, sn] = await ms(() => fsJson('snapshot', 'create', vm));
    sb.snapshot_id = s.snapshotId || s.id; t.snapshot_ms = sn;
    sb.snapshots.push(sb.snapshot_id); writeJson(sb.file, sb);
  }
  const up = await fs('vm', 'scp', resolve(patchPath), `${vm}:/tmp/patch.diff`);
  if (up.code) return { pass: false, log: 'patch upload failed:\n' + up.out, vm, t };
  const ap = await ex(vm, wrap('git apply /tmp/patch.diff'));
  if (ap.code) return { pass: false, log: 'git apply failed:\n' + ap.out, vm, t };
  const [r, td] = await ms(() => ex(vm, wrap(`env ${env.map(q).join(' ')} ${testCmd}`)));
  t.test_ms = td;
  return { pass: r.code === 0, log: r.out, vm, t };
}

export async function verify({ repoDir, patchPath, runId, provider = 'unknown', sandbox = 'local', attempt, model = 'unknown', testCmd = './test.sh', env = [], changesPath, runsDir = join(ROOT, 'runs') }) {
  loadEnv();
  const name = basename(resolve(repoDir));
  const dir = join(runsDir, runId, name);
  mkdirSync(dir, { recursive: true });
  const rf = join(dir, 'result.json');
  const res = readJson(rf, null) || { run_id: runId, provider, repo: name, status: 'queued', vm_id: null, sandbox, attempts: [], pr_url: null, started_at: now(), finished_at: null };
  const repos = readJson(join(ROOT, 'src/ship/repos.json'), {});
  res.repo = repos[name] || res.repo;
  const n = attempt || res.attempts.length + 1;
  Object.assign(res, { status: 'verifying', sandbox, finished_at: null });
  writeJson(rf, res);
  if (changesPath) copyFileSync(changesPath, join(dir, 'changes.json'));
  const sbFile = join(dir, 'sandbox.json');
  const sb = readJson(sbFile, { run: runId, vms: [], snapshots: [], snapshot_id: null });
  sb.file = sbFile;

  const startedAt = now();
  let out;
  try {
    out = sandbox === 'freestyle'
      ? await freestyleSandbox({ repoDir, patchPath, testCmd, env, attempt: n, sb })
      : await localSandbox({ repoDir, patchPath, testCmd, env });
  } catch (e) { out = { pass: false, log: 'sandbox error: ' + e.message }; }

  const rec = { n, model, tests: out.pass ? 'pass' : 'fail', log_tail: tail(out.log || '') };
  res.attempts = res.attempts.filter((a) => a.n !== n).concat(rec).sort((a, b) => a.n - b.n);
  res.status = out.pass ? 'passed' : 'failed';
  res.finished_at = now();
  if (out.vm) res.vm_id = out.vm;
  writeJson(rf, res);
  if (sandbox === 'freestyle') {
    const { file, ...keep } = sb;
    keep.attempts = { ...(sb.attempts || {}), [n]: { vm: out.vm, timings_ms: out.t, started_at: startedAt } };
    writeJson(sbFile, keep);
  }
  return { ...rec, vm_id: out.vm || null, snapshot_id: sb.snapshot_id, timings_ms: out.t || {}, started_at: startedAt, result_file: rf };
}

export async function cleanup(runId, runsDir = join(ROOT, 'runs')) {
  loadEnv();
  const base = join(runsDir, runId);
  if (!existsSync(base)) return;
  const { readdirSync } = await import('node:fs');
  for (const d of readdirSync(base)) {
    const f = join(base, d, 'sandbox.json');
    const sb = readJson(f, null);
    if (!sb) continue;
    for (const v of sb.vms || []) console.log('delete vm', v, (await fs('vm', 'delete', v)).out.trim());
    for (const s of sb.snapshots || []) console.log('delete snapshot', s, (await fs('snapshot', 'delete', s)).out.trim());
    sb.vms = []; sb.snapshots = []; sb.snapshot_id = null; writeJson(f, sb);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), o = { env: [] };
  const flags = new Set(['cleanup', 'attempts-from-snapshot']);
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    if (flags.has(k)) o[k] = true; else if (k === 'env') o.env.push(a[++i]); else o[k] = a[++i];
  }
  if (o.cleanup) { await cleanup(o.run); process.exit(0); }
  const r = await verify({ repoDir: o['repo-dir'], patchPath: o.patch, runId: o.run, provider: o.provider, sandbox: o.sandbox || 'local', attempt: o.attempt && +o.attempt, model: o.model, testCmd: o['test-cmd'], env: o.env, changesPath: o.changes });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.tests === 'pass' ? 0 : 1);
}
