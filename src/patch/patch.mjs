#!/usr/bin/env node
// changes.json + repo -> patch.diff (LLM, with git apply --check and one repair round)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const a = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '');
  if (k === 'mock') a.mock = true; else a[k] = process.argv[++i];
}
if (!a.repo || !a.out || (!a.changes && !a.mock)) { console.error('usage: patch.mjs --repo DIR --changes changes.json --out patch.diff [--feedback log.txt] [--mock]'); process.exit(2); }
const repo = resolve(a.repo), out = resolve(a.out);
const here = new URL('.', import.meta.url).pathname;

if (a.mock) {
  copyFileSync(`${here}../../demo-repos/reference-patches/${a.lang || /^(node|python|go)/.exec(basename(repo).replace(/^.*\//, ""))?.[1] || basename(repo)}.diff`, out);
  console.error(`mock: copied reference patch for ${basename(repo)}`); process.exit(0);
}

// ---- model config: PATCH_BASE_URL / PATCH_API_KEY / PATCH_MODEL; default = signed-in Wally cloud
function endpoint() {
  let base = process.env.PATCH_BASE_URL, key = process.env.PATCH_API_KEY;
  if (!base || !key) {
    try {
      const c = JSON.parse(readFileSync(process.env.HOME + '/.config/wally/credentials.json', 'utf8'));
      base ||= c.console_url + '/v1'; key ||= c.access_token;
    } catch { throw new Error('no model configured: set PATCH_BASE_URL, PATCH_API_KEY (and PATCH_MODEL), or run `wally account login`'); }
  }
  return { base: base.replace(/\/$/, ''), key, model: process.env.PATCH_MODEL || 'deepseek-v4.1-flash' };
}
async function call(model, messages, ms) {
  const { base, key } = endpoint();
  const res = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(ms),
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 4000, ...JSON.parse(process.env.PATCH_EXTRA ?? (think ? '{}' : '{"thinking":{"type":"disabled"}}')) }) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`model http ${res.status}: ${txt.slice(0, 200).replaceAll(key, '<key>')}`);
  const j = JSON.parse(txt);
  console.error(`model=${model} prompt_tokens=${j.usage?.prompt_tokens} completion_tokens=${j.usage?.completion_tokens}`);
  return j.choices[0].message.content;
}
// Hosted models can stall under load (one run waited 3 minutes). Hedge: if the primary has not answered after PATCH_HEDGE_MS,
// send a second request (same model by default, or PATCH_FALLBACK) and take whichever answers first. Each call is cut off after PATCH_TIMEOUT_MS.
// Speed: the first attempt runs without hidden reasoning (about 6 s instead of 10 to 70 s). Retries and the repair round
// turn reasoning back on, because the fast mode more often writes a diff with a bad hunk header. PATCH_EXTRA overrides.
let think = true; // reasoning on: slower but reliable (9 of 9 first-attempt passes); PATCH_EXTRA='{"thinking":{"type":"disabled"}}' is the fast mode
async function chat(messages) {
  const primary = endpoint().model;
  const fallbacks = (process.env.PATCH_FALLBACK ?? 'glm-5.3-flash').split(',').map((m) => m.trim()).filter(Boolean); // default: glm-5.3-flash. deepseek with reasoning stalled past 90 s on openai-images-py while glm answered in 17 s
  const ms = +process.env.PATCH_TIMEOUT_MS || 90000, hedge = +process.env.PATCH_HEDGE_MS || 25000;
  let timer;
  const tries = [call(primary, messages, ms)];
  if (fallbacks[0]) tries.push(new Promise((res, rej) => { timer = setTimeout(() => call(fallbacks[0], messages, ms).then(res, rej), hedge); }));
  try { return await Promise.any(tries); }
  catch (e) { throw new Error('model unavailable: ' + (e.errors ?? [e]).map((x) => x.message).join(' | ')); }
  finally { clearTimeout(timer); }
}

// ---- locate
const changes = JSON.parse(readFileSync(a.changes, 'utf8'));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const files = git('ls-files').split('\n').filter((f) => /\.(js|mjs|ts|py|go|java|rb|php|cs)$/.test(f));
const terms = new Set();
for (const c of changes.changes) {
  for (const t of [c.name, c.before, c.after, c.path, c.path.replace(/\{[^}]*\}/g, '')]) if (t && t.length > 2) terms.add(t.replace(/\/$/, ''));
  for (const m of (c.before || '').matchAll(/\/[\w/.-]+/g)) terms.add(m[0]);  // paths inside before/after
  const prop = /for (\w+) on/.exec(c.summary)?.[1]; if (prop && c.location === 'enum_value') terms.add(prop);
  if (c.location === 'enum_value') terms.add('status');
}
const tl = [...terms].map((t) => t.replace(/^\/v\d+/, (m) => m)).filter(Boolean);
// also match path tails like /legacy/tokens (strip trailing param)
const ctx = [];
for (const f of files) {
  const src = readFileSync(resolve(repo, f), 'utf8');
  const lines = src.split('\n');
  const hit = lines.map((l, i) => (tl.some((t) => l.includes(t)) ? i : -1)).filter((i) => i >= 0);
  if (!hit.length) continue;
  const body = src.length <= 12000 ? src : hit.flatMap((i) => lines.slice(Math.max(0, i - 15), i + 16)).join('\n') + '\n[... excerpt ...]';
  ctx.push(`=== FILE: ${f} ===\n${lines.length && src.length <= 12000 ? lines.map((l, i) => l).join('\n') : body}`);
}
console.error(`located ${ctx.length} files`);

// ---- prompt
const system = `You are a code migration tool. Output ONE unified diff (git format, paths relative to repo root, a/ and b/ prefixes) that applies the API changes to the repo, and nothing else (no prose). Make minimal edits, only what the changes require. Never rename, add or remove parameters of the repo's own functions or change their signatures or return values: callers and tests depend on them. Change only what is sent to or read from the API (request bodies, paths, response handling), mapping the repo's existing parameter names onto the new API fields. Keep hunk headers and line counts correct and include 3 lines of context. Do not touch test files unless one calls the old API directly; the goal is code that passes the existing tests when the provider runs the new API version.`;
const feedback = a.feedback ? `\n\nA previous attempt FAILED the tests. Failing output:\n${readFileSync(a.feedback, 'utf8').slice(-4000)}\nProduce a different, corrected diff.` : '';
const user = `API changes (JSON):\n${JSON.stringify(changes.changes, null, 1)}\n\nRepo files:\n${ctx.join('\n\n')}${feedback}`;

const extract = (t) => {
  const m = /```(?:diff|patch)?\n([\s\S]*?)```/.exec(t);
  const s = (m ? m[1] : t).replace(/^[\s\S]*?(?=^diff --git|^--- )/m, '');
  return s.replace(/\s*$/, '\n');
};
const check = (d) => {
  const tmp = mkdtempSync(tmpdir() + '/pb-'), f = tmp + '/p.diff'; writeFileSync(f, d);
  try { git('apply', '--check', f); return null; } catch (e) { return String(e.stderr || e.message).slice(0, 800); } finally { rmSync(tmp, { recursive: true }); }
};

const msgs = [{ role: 'system', content: system }, { role: 'user', content: user }];
let reply = await chat(msgs), diff = extract(reply), err = check(diff);
if (err) {
  console.error('git apply --check failed, repairing: ' + err.split('\n')[0]);
  msgs.push({ role: 'assistant', content: reply }, { role: 'user', content: `git apply --check failed:\n${err}\nReturn the corrected full unified diff only.` });
  think = true; reply = await chat(msgs); diff = extract(reply); err = check(diff);
}
writeFileSync(out, diff);
if (err) { console.error('FAILED: diff still does not apply: ' + err.split('\n')[0]); process.exit(1); }
console.error(`wrote ${out}`);
process.exit(0); // the hedged loser request may still be pending; do not wait for its timeout
