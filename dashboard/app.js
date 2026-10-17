const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const Q = location.search; // keeps ?mock=1 on every API call
const withQ = (p, extra = '') => p + (Q ? Q + (extra ? '&' + extra : '') : (extra ? '?' + extra : ''));
const STEPS = [['locating', 'Locate'], ['patching', 'Patch'], ['verifying', 'VM test'], ['shipped', 'PR']];
const IDX = { queued: -1, locating: 0, patching: 1, verifying: 2, passed: 3, shipped: 4 };
const toggled = new Map(); // user-set <details> open state survives re-render
const ui = new Map();      // per-repo inline state: {confirm:bool, busy:bool, msg, ok}
let data = null, selected = null, last = '';

function fmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function elapsed(r) {
  const a = Date.parse(r.started_at); if (isNaN(a)) return '';
  return fmt((r.finished_at ? Date.parse(r.finished_at) : Date.now()) - a);
}
function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (isNaN(s)) return '';
  return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : new Date(iso).toLocaleDateString();
}
const isReal = p => p === 'openai' || p === 'stripe';
const runTime = r => (r.changes && r.changes.generated_at) || (r.repos[0] && r.repos[0].started_at) || '';

// 2-3 most relevant log lines, not the whole tail
function relevant(log) {
  const lines = String(log || '').split('\n').map(l => l.trim()).filter(Boolean);
  const hot = lines.filter(l => /fail|error|expected|received|actual|assert|✖|✗|not ok|missing/i.test(l) && !/^ℹ (pass|tests) /.test(l));
  return (hot.length ? hot : lines.slice(-3)).slice(0, 3).join('\n');
}

function pipeline(r) {
  const i = r.status === 'failed' ? 2 : IDX[r.status] ?? -1, n = r.attempts.length;
  const caps = ['', n ? n + (n === 1 ? ' try' : ' tries') : '', '', (r.pr_url || '').match(/\/pull\/(\d+)/) ? '#' + r.pr_url.match(/\/pull\/(\d+)/)[1] : ''];
  return '<ol class="pipe" aria-label="Pipeline">' + STEPS.map(([, label], k) => {
    let c = '';
    if (r.status === 'failed') c = k < 2 ? 'done' : k === 2 ? 'fail' : '';
    else if (k < i) c = 'done';
    else if (k === i) c = 'active';
    if (r.status === 'shipped' && k === 3) c = 'done';
    const st = c === 'fail' ? 'failed' : c === 'done' ? 'done' : c === 'active' ? 'in progress' : 'waiting';
    return `<li class="step ${c}"><i class="dot" aria-hidden="true"></i><span class="sr">${esc(label)}: ${st}</span><b aria-hidden="true">${esc(label)}</b><small aria-hidden="true">${esc(caps[k]) || '&nbsp;'}</small></li>`;
  }).join('') + '</ol>';
}

function attempts(r) {
  const a = r.attempts || [];
  if (!a.length) return '<div class="none">No attempts yet.</div>';
  return '<div class="atts">' + a.map((t, k) => {
    const key = r.run_id + r.repo + t.n, fail = t.tests !== 'pass';
    const open = toggled.has(key) ? toggled.get(key) : fail;
    const log = relevant(t.log_tail);
    return `<details class="att ${fail ? 'fail' : 'pass'}" data-key="${esc(key)}"${open ? ' open' : ''}>
      <summary><span>Attempt ${t.n}</span><span class="res">${fail ? 'FAILED' : 'PASSED'}</span><span class="mdl">${esc(t.model)}</span>${k > 0 && a[k - 1].tests !== 'pass' ? '<span class="retry">retry</span>' : ''}</summary>
      ${log ? `<pre>${esc(log)}</pre>` : ''}</details>`;
  }).join('') + '</div>';
}

function actions(r) {
  const s = ui.get(r.repo) || {}, name = esc(String(r.repo).split('/').pop());
  let h = '<div class="btns">';
  if (r.pr_url && data.mock) {
    const tip = 'mock data: no real PR';
    h += `<button type="button" class="btn" disabled title="${tip}" data-action="open-pr" aria-label="Open pull request for ${name} (${tip})">Open pull request</button>
      <button type="button" class="btn" disabled title="${tip}" data-action="review-diff" aria-label="Review diff for ${name} (${tip})">Review diff</button>`;
    if (r.status === 'shipped' && !r.merged) h += `<button type="button" class="btn" disabled title="${tip}" data-action="merge" aria-label="Merge for ${name} (${tip})">Merge</button>`;
    h += `<span class="mocknote">${tip}</span>`;
  } else if (r.pr_url) {
    const pr = esc(r.pr_url);
    h += `<a class="btn primary" data-action="open-pr" href="${pr}" target="_blank" rel="noopener" aria-label="Open pull request for ${name}">Open pull request</a>`;
    h += `<a class="btn" data-action="review-diff" href="${pr.replace(/\/+$/, '')}/files" target="_blank" rel="noopener" aria-label="Review diff for ${name}">Review diff</a>`;
    if (r.status === 'shipped' && !r.merged && !s.confirm && !s.ok)
      h += `<button type="button" class="btn merge" data-action="merge" data-repo="${esc(r.repo)}" aria-label="Merge pull request for ${name}"${s.busy ? ' disabled' : ''}>Merge</button>`;
  }
  h += '</div>';
  if (s.confirm && !s.busy) h += `<div class="confirm" role="group" aria-label="Confirm merge"><span>Squash-merge this PR and delete its branch?</span>
      <button type="button" class="btn merge" data-action="merge-yes" data-repo="${esc(r.repo)}">Yes, merge</button>
      <button type="button" class="btn" data-action="merge-cancel" data-repo="${esc(r.repo)}">Cancel</button></div>`;
  if (s.busy) h += '<div class="result" role="status">Merging...</div>';
  else if (s.msg) h += `<div class="result ${s.ok ? 'ok' : 'err'}" role="status">${esc(s.msg)}</div>`;
  return h;
}

function card(r) {
  const cls = r.status === 'queued' ? 'queued' : ['passed', 'shipped', 'failed'].includes(r.status) ? r.status : 'active';
  const vm = r.sandbox === 'freestyle' && (r.status === 'passed' || r.status === 'shipped') && r.attempts.some(a => a.tests === 'pass');
  const badge = vm ? `<span class="badge fs">Tested in a clean Freestyle VM ${esc(r.vm_id || '')}</span>`
    : r.sandbox === 'freestyle' ? `<span class="badge">Freestyle VM ${esc(r.vm_id || '')}</span>` : '<span class="badge">Local sandbox</span>';
  const ds = r.diff_summary || {};
  const statusText = r.merged ? 'merged' : r.status;
  return `<article class="card s-${cls}" id="repo-${esc(r.repo)}" data-repo="${esc(r.repo)}" data-status="${esc(r.status)}" data-merged="${!!r.merged}" data-pr-url="${esc(r.pr_url || '')}" aria-label="Repo ${esc(r.repo)}: ${esc(statusText)}">
    <div class="row"><h3 class="name" title="${esc(r.repo)}">${esc(String(r.repo).split('/').pop())}</h3>
      <div class="tags">${r.merged ? '<span class="status merged">MERGED</span>' : ''}<span class="status">${esc(r.status)}</span></div></div>
    <p class="what">${esc(ds.text || 'No code change recorded yet.')}</p>
    ${pipeline(r)}
    <div class="meta">${badge}<span>${r.attempts.length} attempt${r.attempts.length === 1 ? '' : 's'}</span>
      <span class="elapsed" data-start="${esc(r.started_at)}" data-end="${esc(r.finished_at || '')}">${elapsed(r)}</span></div>
    ${attempts(r)}
    ${actions(r)}
  </article>`;
}

function head(run) {
  const c = run && run.changes;
  if (!run) return '<div class="prov">Waiting for the first run...</div>';
  if (!c) return `<div class="prov">${esc(run.provider)}</div>`;
  const n = k => c.changes.filter(x => x.kind === k).length;
  return `<div class="prov">${esc(c.provider)}</div>
    <div class="ver" aria-label="version change"><s>${esc(c.from_version)}</s><i>&rarr;</i>${esc(c.to_version)}</div>
    <div class="chips">${['breaking', 'deprecated', 'added'].map(k => `<div class="chip ${k}">${n(k)} <small>${k}</small></div>`).join('')}</div>`;
}

function label(run) {
  const real = run && isReal(run.provider);
  const spec = run && run.changes && run.changes.spec_url;
  return real ? `<span class="rs real">REAL SPEC CHANGE</span>${spec ? ` <a class="speclink" href="${esc(spec)}" target="_blank" rel="noopener">View the provider spec</a>` : ''}`
    : '<span class="rs sim">SIMULATED PROVIDER</span>';
}

function feed(c) {
  const list = (c && c.changes) || [];
  $('feed-count').textContent = list.length ? `(${list.length})` : '';
  $('feed-list').innerHTML = list.length ? list.map(x => `<li><span class="kind ${esc(x.kind)}">${esc(x.kind)}</span>
    <div class="ep"><b>${esc(x.method)}</b> ${esc(x.path)}${x.name && x.name !== x.path ? ' &middot; ' + esc(x.name) : ''}</div>
    <div class="sum">${esc(x.summary)}</div><div class="hint"><b>Migration:</b> ${esc(x.migration_hint)}</div></li>`).join('') : '<li class="none">No change feed for this run yet.</li>';
}

function render(force) {
  if (!data) return;
  $('mock').hidden = !data.mock;
  const runs = data.runs;
  const run = runs.find(r => r.run_id === selected) || runs[0];
  const sig = JSON.stringify([data.mock, selected, runs, [...ui]]);
  if (sig === last && !force) return;
  last = sig;
  const sel = $('runsel');
  $('runsel-wrap').hidden = runs.length < 2;
  sel.innerHTML = runs.map((r, i) => `<option value="${esc(r.run_id)}"${r === run ? ' selected' : ''}>${esc(r.provider)} - ${isReal(r.provider) ? 'REAL' : 'SIMULATED'} - ${esc(ago(runTime(r)))}${i === 0 ? ' (newest)' : ''}</option>`).join('');
  $('rs-label').outerHTML = `<span id="rs-label">${label(run)}</span>`;
  $('head').innerHTML = head(run);
  $('summary').textContent = run ? run.summary : 'No runs yet.';
  $('repos').innerHTML = run && run.repos.length ? run.repos.map(card).join('') : '<div class="empty">No runs yet. Waiting for result.json files.</div>';
  feed(run && run.changes);
  const q = run ? 'run=' + encodeURIComponent(run.run_id) : '';
  $('b-dl-changes').href = withQ('/api/download', q + '&file=changes');
  $('b-dl-result').href = withQ('/api/download', q + '&file=result');
  $('b-feed').dataset.copy = run ? 'http://localhost:8803/feed/' + run.provider + '.json' : '';
  $('b-rerun').dataset.copy = (run && run.rerun_command) || 'node src/run.mjs --sandbox freestyle --ship';
  $('rerun-preview').textContent = $('b-rerun').dataset.copy;
  $('b-snippet').dataset.copy = (data.snippet || '').replace(/acme-pay/g, run ? run.provider : 'acme-pay').replace(/Acme Pay/g, run ? run.provider : 'Acme Pay').replace(/ with `ACME_API_VERSION=v2` set,/, '');
  $('a-feed').textContent = $('b-feed').dataset.copy;
}

function renderActions(l) {
  const el = $('patchbay-state');
  if (el) el.textContent = JSON.stringify(l).replace(/</g, '\\u003c');
  $('actions').innerHTML = l.next_actions.length ? l.next_actions.map(a => `<li data-action-id="${esc(a.id)}"><code>${esc(a.method)} ${esc(a.url)}</code> <span>${esc(a.label)}</span></li>`).join('') : '<li class="none">None right now.</li>';
}

async function poll() {
  try {
    const [r, l] = await Promise.all([fetch(withQ('/api/results'), { cache: 'no-store' }), fetch(withQ('/api/latest'), { cache: 'no-store' })]);
    data = await r.json(); renderActions(await l.json()); render();
    $('live').className = 'live on'; $('live').textContent = 'live';
  } catch { $('live').className = 'live off'; $('live').textContent = 'offline'; }
}

async function copy(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {}
  if (!ok) {
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(t); t.select();
    try { ok = document.execCommand('copy'); } catch {}
    t.remove();
  }
  const old = btn.dataset.label || (btn.dataset.label = btn.textContent);
  btn.textContent = ok ? 'Copied' : 'Copy failed - select the text manually';
  btn.classList.toggle('copied', ok);
  clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 2000);
}

async function merge(repo) {
  const run = data.runs.find(r => r.run_id === selected) || data.runs[0];
  const r = run.repos.find(x => x.repo === repo);
  ui.set(repo, { busy: true }); render(true);
  try {
    const res = await fetch(withQ('/api/merge'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pr_url: r.pr_url }) });
    const j = await res.json().catch(() => ({}));
    ui.set(repo, res.ok && j.ok ? { ok: true, msg: j.simulated ? 'Mock mode: nothing was merged.' : 'Merged. Branch deleted.' } : { msg: 'Merge failed: ' + (j.error || res.status) + (j.detail ? ' - ' + j.detail : '') });
  } catch (e) { ui.set(repo, { msg: 'Merge failed: server unreachable' }); }
  render(true);
}

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.copy !== undefined) return copy(b.dataset.copy, b);
  const repo = b.dataset.repo;
  if (b.dataset.action === 'merge') { ui.set(repo, { confirm: true }); render(true); const c = document.querySelector(`[data-repo="${CSS.escape(repo)}"] [data-action="merge-yes"]`); c && c.focus(); }
  else if (b.dataset.action === 'merge-cancel') { ui.delete(repo); render(true); const m = document.querySelector(`[data-repo="${CSS.escape(repo)}"] [data-action="merge"]`); m && m.focus(); }
  else if (b.dataset.action === 'merge-yes') merge(repo);
});
$('runsel').addEventListener('change', e => { selected = e.target.value; render(true); });
document.addEventListener('toggle', e => { const k = e.target.dataset && e.target.dataset.key; if (k) toggled.set(k, e.target.open); }, true);
setInterval(() => document.querySelectorAll('.elapsed').forEach(e => { if (!e.dataset.end) e.textContent = fmt(Date.now() - Date.parse(e.dataset.start)); }), 1000);
poll(); setInterval(poll, 1500);
