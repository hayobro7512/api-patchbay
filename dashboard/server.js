// Zero-dep dashboard server (127.0.0.1 only). Scans runs/<run_id>/<repo>/result.json and serves
// the human page, the agent API (/api/latest, /agents.md) and a guarded POST /api/merge.
const http = require('http'), fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const PORT = +process.env.PORT || 8801;
const ROOT = __dirname;
const REAL = process.env.RUNS_DIR || path.join(ROOT, '..', 'runs');
const MOCK = path.join(ROOT, 'mock-runs');
const GH = process.env.GH_BIN || 'gh';
const FEED_BASE = 'http://localhost:8803/feed/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const readText = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const dirs = d => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return []; } };
const repoMap = () => readJSON(path.join(ROOT, '..', 'src', 'ship', 'repos.json')) || {};
const isReal = p => p === 'openai' || p === 'stripe';

// Mock timestamps are shifted so the newest mock run looks like it started 75s ago.
const MOCK_BASE = Date.parse('2026-10-17T15:00:30Z');
function shift(o, delta) {
  if (!o || typeof o !== 'object') return o;
  for (const k of ['started_at', 'finished_at', 'generated_at'])
    if (typeof o[k] === 'string') o[k] = new Date(Date.parse(o[k]) + delta).toISOString();
  return o;
}

// "Changed images.js (+2 -2 lines): model, safety_identifier" from attempt-N.diff; always returns an object.
function diffSummary(dir, r, changes) {
  const none = text => ({ files: [], added: 0, removed: 0, identifiers: [], text });
  const ns = (() => { try { return fs.readdirSync(dir).map(x => (x.match(/^attempt-(\d+)\.diff$/) || [])[1]).filter(Boolean).map(Number).sort((a, b) => a - b); } catch { return []; } })();
  if (!ns.length) return none(['passed', 'shipped'].includes(r.status) ? 'Patched and verified (diff file not available).' : 'No code change recorded yet.');
  const pass = (Array.isArray(r.attempts) ? r.attempts : []).filter(a => a && a.tests === 'pass').map(a => a.n);
  const n = ns.filter(x => pass.includes(x)).pop() || ns[ns.length - 1];
  const text = readText(path.join(dir, `attempt-${n}.diff`));
  const files = [...new Set([...text.matchAll(/^diff --git a\/(\S+)/gm)].map(m => m[1]))];
  const body = text.split('\n').filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  const added = body.filter(l => l[0] === '+').length, removed = body.length - added;
  const toks = new Set();
  for (const c of (changes && Array.isArray(changes.changes) ? changes.changes : []))
    for (const t of [c.name, c.after, c.before]) if (typeof t === 'string' && /^[\w.\-]{3,40}$/.test(t)) toks.add(t);
  const identifiers = [...toks].filter(t => body.some(l => l.includes(t)));
  if (!files.length) return none('Patch recorded but it touches no files.');
  const fl = files.length > 3 ? files.slice(0, 3).join(', ') + ` and ${files.length - 3} more` : files.join(', ');
  return { files, added, removed, identifiers, text: `Changed ${fl} (+${added} -${removed} lines)${identifiers.length ? ': ' + identifiers.join(', ') : ''}` };
}

function scan(base, mock) {
  const delta = mock ? Date.now() - 75000 - MOCK_BASE : 0;
  const runs = dirs(base).map(id => {
    const rd = path.join(base, id);
    const repos = [];
    for (const d of dirs(rd)) {
      const r = shift(readJSON(path.join(rd, d, 'result.json')), delta);
      if (r && typeof r === 'object' && r.repo && r.status) { r.attempts = Array.isArray(r.attempts) ? r.attempts : []; r._dir = d; repos.push(r); }
    }
    let changes = readJSON(path.join(rd, 'changes.json'));
    for (const d of dirs(rd)) if (!changes) changes = readJSON(path.join(rd, d, 'changes.json'));
    if (changes && !Array.isArray(changes.changes)) changes = null;
    shift(changes, delta);
    for (const r of repos) { r.diff_summary = diffSummary(path.join(rd, r._dir), r, changes); r.dir = r._dir; delete r._dir; }
    let t = NaN;
    const stamp = (changes && Date.parse(changes.generated_at)) || Math.max(0, ...repos.map(r => Date.parse(r.started_at) || 0));
    if (stamp) t = stamp; else { try { t = fs.statSync(rd).mtimeMs; } catch { t = 0; } }
    const provider = (changes && changes.provider) || (repos[0] && repos[0].provider) || 'unknown';
    return { run_id: id, provider, real_or_simulated: isReal(provider) ? 'real' : 'simulated', changes, repos, summary: summarize(changes, repos), rerun_command: rerun(provider, repos), t };
  }).filter(r => r.repos.length || r.changes);
  return runs.sort((a, b) => b.t - a.t || (a.run_id < b.run_id ? 1 : -1)).map(({ t, ...r }) => r);
}

function rerun(provider, repos) {
  const m = repoMap(), base = x => String(x).split('/').pop().toLowerCase();
  const keys = repos.map(r => Object.keys(m).find(k => base(m[k]) === base(r.repo)) || r.dir).filter(Boolean);
  const sb = (repos[0] && repos[0].sandbox) || 'freestyle';
  return `node src/run.mjs --provider ${provider}${keys.length ? ' --repos ' + keys.join(',') : ''} --sandbox ${sb}${repos.some(r => r.pr_url) ? ' --ship' : ''}`;
}

function summarize(changes, repos) {
  const n = changes ? changes.changes.length : 0, k = repos.length;
  const parts = [`${n} change${n === 1 ? '' : 's'}`, `${k} repo${k === 1 ? '' : 's'}`];
  const done = repos.filter(r => r.status === 'passed' || r.status === 'shipped'), failed = repos.filter(r => r.status === 'failed');
  const vm = repos.some(r => r.sandbox === 'freestyle') ? 'in a clean VM' : 'in a local sandbox';
  if (!k) parts.push('waiting for repos');
  else if (failed.length) parts.push(`tests failed in ${failed.length} repo${failed.length === 1 ? '' : 's'}`);
  else if (done.length === k) parts.push(`tests passed ${vm}`);
  else parts.push(`verifying (${done.length}/${k} passed)`);
  const prs = repos.filter(r => r.pr_url), merged = repos.filter(r => r.merged);
  if (k && merged.length === k) parts.push('merged');
  else if (prs.length) parts.push(prs.length === k ? (k === 1 ? 'PR ready' : `${k} PRs ready`) : `${prs.length}/${k} PRs ready`);
  else if (k) parts.push('PR pending');
  return parts.join(' -> ');
}

function latest(run, mock) {
  if (!run) return { provider: null, from_version: null, to_version: null, real_or_simulated: null, spec_url: null, feed_url: null, mock, run_id: null, summary: 'No runs yet.', changes: [], repos: [], next_actions: [] };
  const c = run.changes || {}, acts = [];
  const repos = run.repos.map(r => ({ repo: r.repo, status: r.status, merged: !!r.merged, pr_url: r.pr_url || null, vm_id: r.vm_id || null, sandbox: r.sandbox || null, attempts: r.attempts.length, diff_summary: r.diff_summary }));
  for (const r of repos) {
    if (!r.pr_url) continue;
    acts.push({ id: `open_pr:${r.repo}`, label: `Open pull request for ${r.repo}`, method: 'GET', url: r.pr_url });
    acts.push({ id: `review_diff:${r.repo}`, label: `Review diff for ${r.repo}`, method: 'GET', url: r.pr_url.replace(/\/+$/, '') + '/files' });
    if (r.status === 'shipped' && !r.merged) acts.push({ id: `merge:${r.repo}`, label: `Squash-merge the pull request for ${r.repo}`, method: 'POST', url: '/api/merge' + (mock ? '?mock=1' : ''), body: { pr_url: r.pr_url } });
  }
  if (run.provider) acts.push({ id: 'get_feed', label: 'Read the provider change feed', method: 'GET', url: FEED_BASE + run.provider + '.json' });
  return { run_id: run.run_id, mock, provider: run.provider, from_version: c.from_version || null, to_version: c.to_version || null, real_or_simulated: run.real_or_simulated, spec_url: c.spec_url || null, feed_url: FEED_BASE + run.provider + '.json', summary: run.summary, changes: c.changes || [], repos, next_actions: acts };
}

const snippet = () => readText(path.join(ROOT, '..', 'src', 'feed', 'AGENTS.snippet.md')).trim();

function agentsMd() {
  return `# Patchbay: guide for AI agents

Patchbay turns an API provider's spec change into a machine-readable change feed. Coding agents patch each repo,
verify the patch in a clean Freestyle VM, and open a pull request. Developer teams review and merge.

## Read the state
- \`GET /api/latest\` : newest run only. Stable JSON. Start here.
- \`GET /api/results\` : every run (\`{mock, runs[]}\`), each with \`changes\`, \`repos\`, \`summary\`.
- Change feed from the API provider: \`${FEED_BASE}<provider>.json\` (send If-None-Match with the last ETag; 304 = nothing new).
- Add \`?mock=1\` to any dashboard URL for demo data. Mock data is never a real run.

## /api/latest fields
\`provider, from_version, to_version, real_or_simulated ("real"|"simulated"), spec_url, feed_url, mock, run_id, summary,
changes[], repos[], next_actions[]\`.
- \`changes[]\`: \`id, kind (breaking|deprecated|added), method, path, location (endpoint|request_param|response_field|enum_value), name, summary, before, after, migration_hint\`.
- \`repos[]\`: \`repo, status, merged, pr_url, vm_id, sandbox (freestyle|local), attempts, diff_summary{files,added,removed,identifiers,text}\`.
- Per-repo result.json (see schemas/result.schema.json): \`run_id, provider, repo, status, vm_id, sandbox, attempts[{n,model,tests(pass|fail),log_tail}], pr_url, started_at, finished_at, merged\`.

## Status values
\`queued\` -> \`locating\` -> \`patching\` -> \`verifying\` -> \`passed\` (tests green in the VM, no PR yet) -> \`shipped\` (pull request opened).
\`failed\` means every attempt failed. \`merged: true\` means a developer team already merged the PR. "Tested in a clean Freestyle VM" holds only when \`sandbox\` is \`freestyle\` and tests passed.

## next_actions
Each action is \`{id, label, method, url, body?}\`. Do exactly what it says: GET urls are links to open; POST actions send \`body\` as JSON
with header \`Content-Type: application/json\` and an \`Origin\` equal to this dashboard's origin.
- \`open_pr:<repo>\`, \`review_diff:<repo>\` : links for developer teams.
- \`merge:<repo>\` : POST /api/merge {"pr_url": "..."}. Only listed when status is shipped and not merged. Merging is the developer team's decision; ask before calling it.
  The server only accepts PR URLs whose repo is in src/ship/repos.json and answers with JSON \`{ok, ...}\` or \`{ok:false, error}\`.
- \`get_feed\` : read the provider feed.

## DOM (if you must read the page)
\`<script type="application/json" id="patchbay-state">\` holds the same JSON as /api/latest. Repo cards are \`[data-repo][data-status][data-pr-url]\`;
buttons carry \`data-action\` (open-pr, review-diff, merge) and aria-labels.

## AGENTS.md snippet for a repo
Add this to the repo's AGENTS.md so any coding agent keeps the integration current:

${snippet() || '(snippet file missing)'}
`;
}

function pageState(u) {
  const mock = process.env.MOCK === '1' || u.searchParams.get('mock') === '1';
  return { mock, runs: scan(mock ? MOCK : REAL, mock) };
}

function send(res, code, obj, extra) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra });
  res.end(JSON.stringify(obj));
}

// ---- merge: allow-listed repos, JSON only, same-origin only ----
function handleMerge(req, res, u) {
  const host = req.headers.host || '';
  const okHost = new RegExp(`^(localhost|127\\.0\\.0\\.1)(:${PORT})?$`).test(host);
  if (!okHost) return send(res, 403, { ok: false, error: 'bad Host header' });
  if (req.headers.origin !== 'http://' + host) return send(res, 403, { ok: false, error: 'cross-origin request refused (Origin must match Host)' });
  if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, { ok: false, error: 'Content-Type must be application/json' });
  let buf = '';
  req.on('data', c => { buf += c; if (buf.length > 10000) req.destroy(); });
  req.on('end', () => {
    let b; try { b = JSON.parse(buf); } catch { return send(res, 400, { ok: false, error: 'body must be JSON like {"pr_url":"https://github.com/owner/repo/pull/1"}' }); }
    const m = b && typeof b.pr_url === 'string' && b.pr_url.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)$/);
    if (!m) return send(res, 400, { ok: false, error: 'pr_url must look like https://github.com/owner/repo/pull/N' });
    const allowed = Object.values(repoMap()).map(s => String(s).toLowerCase());
    if (!allowed.includes(m[1].toLowerCase())) return send(res, 403, { ok: false, error: `repo ${m[1]} is not listed in src/ship/repos.json` });
    const mock = process.env.MOCK === '1' || u.searchParams.get('mock') === '1';
    if (mock) return send(res, 200, { ok: true, simulated: true, message: 'Mock mode: nothing was merged.', pr_url: b.pr_url });
    execFile(GH, ['pr', 'merge', b.pr_url, '--squash', '--delete-branch'], { timeout: 60000, env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin` } }, (err, out, errout) => {
      if (err) return send(res, 502, { ok: false, error: 'gh pr merge failed', detail: String(errout || err.message).trim().slice(0, 500) });
      markMerged(b.pr_url);
      send(res, 200, { ok: true, merged: true, pr_url: b.pr_url, message: String(out).trim().slice(0, 300) });
    });
  });
}
function markMerged(url) {
  for (const id of dirs(REAL)) for (const d of dirs(path.join(REAL, id))) {
    const f = path.join(REAL, id, d, 'result.json'), r = readJSON(f);
    if (r && r.pr_url === url) { r.merged = true; try { fs.writeFileSync(f, JSON.stringify(r, null, 2)); } catch {} }
  }
}

http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/merge') {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' }, { allow: 'POST' });
      return handleMerge(req, res, u);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { ok: false, error: 'method not allowed' });
    if (u.pathname === '/api/results') {
      const s = pageState(u);
      return send(res, 200, { ...s, snippet: snippet() });
    }
    if (u.pathname === '/api/latest') { const s = pageState(u); return send(res, 200, latest(s.runs[0], s.mock)); }
    if (u.pathname === '/api/download') {
      const s = pageState(u), run = s.runs.find(r => r.run_id === u.searchParams.get('run'));
      const what = u.searchParams.get('file');
      if (!run || !['changes', 'result'].includes(what)) return send(res, 404, { ok: false, error: 'unknown run or file (file=changes|result)' });
      const body = what === 'changes' ? run.changes || {} : run.repos.map(({ dir, diff_summary, ...r }) => r);
      return send(res, 200, body, { 'content-disposition': `attachment; filename="${what}.json"` });
    }
    if (u.pathname === '/agents.md') { res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' }); return res.end(agentsMd()); }
    if (u.pathname === '/' || u.pathname === '/index.html') {
      const s = pageState(u);
      const state = JSON.stringify(latest(s.runs[0], s.mock)).replace(/</g, '\\u003c');
      const html = readText(path.join(ROOT, 'index.html')).replace('<!--STATE-->', `<script type="application/json" id="patchbay-state">${state}</script>`);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }
    const p = path.normalize(decodeURIComponent(u.pathname));
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT + path.sep) || f.startsWith(MOCK) || path.basename(f) === 'server.js' || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    if (!res.headersSent) send(res, 500, { ok: false, error: String(e.message) });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Patchbay dashboard: http://localhost:${PORT}${process.env.MOCK === '1' ? ' (mock)' : ''}`));
