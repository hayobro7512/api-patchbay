#!/usr/bin/env node
// Watches the provider's published spec URL. When it changes, runs the pipeline on old -> new.
// usage: node src/live.mjs [--url http://localhost:8800/spec.yaml] [--interval 1000] [-- <extra run.mjs args>]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const own = sep < 0 ? argv : argv.slice(0, sep);
const extra = sep < 0 ? [] : argv.slice(sep + 1);
const opt = (k, d) => { const i = own.indexOf(`--${k}`); return i < 0 ? d : own[i + 1]; };
const url = opt('url', 'http://localhost:8800/spec.yaml');
const interval = +opt('interval', 1000);
const specs = join(ROOT, 'runs/specs/live');
mkdirSync(specs, { recursive: true });

const log = (...m) => console.log(`[${new Date().toLocaleTimeString()}] live:`, ...m);
const fetchSpec = async () => (await fetch(url)).text();
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);

let base = null, baseFile = null, busy = false;
const runPipeline = (oldFile, newFile) => new Promise((done) => {
  const args = [join(ROOT, 'src/run.mjs'), '--old', oldFile, '--new', newFile, ...extra];
  log('spec changed, running pipeline:', 'node', args.slice(1).join(' '));
  const p = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin` } });
  p.on('exit', done);
});

log('watching', url, 'every', interval, 'ms');
setInterval(async () => {
  if (busy) return;
  let text;
  try { text = await fetchSpec(); } catch { return; } // provider not up yet
  const h = hash(text);
  if (!base) { base = h; baseFile = join(specs, `${h}.yaml`); writeFileSync(baseFile, text); log('baseline', h); return; }
  if (h === base) return;
  busy = true;
  const f = join(specs, `${h}.yaml`);
  writeFileSync(f, text);
  await runPipeline(baseFile, f);
  base = h; baseFile = f; busy = false;
}, interval);
