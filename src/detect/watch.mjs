#!/usr/bin/env node
// Poll a spec URL; on change run detect and write runs/feed/<provider>.json
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { detect } from './detect.mjs';

const a = { interval: '2000', provider: 'acme-pay' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '');
  if (k === 'once') a.once = true; else a[k] = process.argv[++i];
}
if (!a.url) { console.error('usage: watch.mjs --url URL --provider P [--interval ms] [--once]'); process.exit(2); }
const root = a.root || process.env.RUNS_DIR || new URL('../../runs/', import.meta.url).pathname;
const specDir = `${root}/specs/${a.provider}`, feedDir = `${root}/feed`;
mkdirSync(specDir, { recursive: true }); mkdirSync(feedDir, { recursive: true });
const cur = `${specDir}/current.yaml`, prev = `${specDir}/previous.yaml`, hashF = `${specDir}/current.sha256`;

async function poll() {
  const res = await fetch(a.url);
  if (!res.ok) throw new Error('fetch ' + res.status);
  const body = await res.text();
  const h = createHash('sha256').update(body).digest('hex');
  if (existsSync(hashF) && readFileSync(hashF, 'utf8') === h) return;
  const first = !existsSync(cur);
  if (!first) renameSync(cur, prev);
  writeFileSync(cur, body); writeFileSync(hashF, h);
  if (first) return console.log(`baseline recorded (${h.slice(0, 8)})`);
  const doc = detect({ oldFile: prev, newFile: cur, provider: a.provider, specUrl: a.url });
  const out = `${feedDir}/${a.provider}.json`;
  writeFileSync(out + '.tmp', JSON.stringify(doc, null, 2) + '\n'); renameSync(out + '.tmp', out);
  console.log(`spec changed ${doc.from_version} -> ${doc.to_version}: ${doc.changes.length} changes -> ${out}`);
}

const tick = () => poll().catch((e) => console.error('poll error:', e.message));
if (a.once) await tick();
else { await tick(); setInterval(tick, Number(a.interval)); }
