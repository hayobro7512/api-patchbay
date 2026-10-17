const STEPS = ['locating', 'patching', 'verifying', 'passed', 'shipped'];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const open = new Set(); // expanded attempt logs survive re-render
let last = '';

function fmt(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function elapsed(r) {
  const a = Date.parse(r.started_at); if (isNaN(a)) return '';
  const b = r.finished_at ? Date.parse(r.finished_at) : Date.now();
  return fmt(b - a);
}
function pipeline(r) {
  const i = STEPS.indexOf(r.status === 'failed' ? 'verifying' : r.status);
  return '<ol class="pipe">' + STEPS.map((s, k) => {
    let c = k < i ? 'done' : k === i ? (r.status === 'failed' ? 'fail' : (r.status === 'passed' || r.status === 'shipped') ? 'done' : 'active') : '';
    return `<li class="step ${s === 'shipped' ? 'ship ' : ''}${c}">${s}</li>`;
  }).join('') + '</ol>';
}
function attempts(r) {
  const a = r.attempts || [];
  if (!a.length) return '<div class="none">no attempts yet</div>';
  return '<div class="atts">' + a.map((t, k) => {
    const key = r.run_id + r.repo + t.n;
    return `<details class="att ${t.tests}" data-key="${esc(key)}"${open.has(key) ? ' open' : ''}>
      <summary><span>#${t.n}</span><span class="res">${t.tests === 'pass' ? 'PASS' : 'FAIL'}</span><span class="mdl">${esc(t.model)}</span>${k > 0 && a[k - 1].tests === 'fail' ? '<span class="retry">retry</span>' : ''}</summary>
      ${t.log_tail ? `<pre>${esc(t.log_tail)}</pre>` : ''}</details>`;
  }).join('') + '</div>';
}
function card(r) {
  const cls = r.status === 'queued' ? 'queued' : ['passed', 'shipped', 'failed'].includes(r.status) ? r.status : 'active';
  const sb = r.sandbox === 'freestyle' ? `<span class="badge fs">Freestyle VM ${esc(r.vm_id || '')}</span>` : '<span class="badge">Local sandbox</span>';
  return `<article class="card s-${cls}" data-id="${esc(r.run_id + r.repo)}">
    <div class="row"><div class="name" title="${esc(r.repo)}">${esc(String(r.repo).split('/').pop())}</div><div class="status">${esc(r.merged ? 'merged' : r.status)}</div></div>
    ${pipeline(r)}
    <div class="meta">${sb}<span>${(r.attempts || []).length} attempt${(r.attempts || []).length === 1 ? '' : 's'}</span>
      <span class="elapsed" data-start="${esc(r.started_at)}" data-end="${esc(r.finished_at || '')}">${elapsed(r)}</span></div>
    ${attempts(r)}
    ${r.pr_url ? `<a class="pr" href="${esc(r.pr_url)}" target="_blank" rel="noopener">Open pull request &rarr;</a>` : ''}
  </article>`;
}
function head(c) {
  if (!c) return '<div class="prov">awaiting change feed</div>';
  const n = k => c.changes.filter(x => x.kind === k).length;
  return `<div class="prov">${esc(c.provider)}</div>
    <div class="ver"><s>${esc(c.from_version)}</s><i>&rarr;</i>${esc(c.to_version)}</div>
    <div class="chips">${['breaking', 'deprecated', 'added'].map(k => `<div class="chip ${k}">${n(k)} <small>${k}</small></div>`).join('')}</div>`;
}
function feed(c) {
  const list = (c && c.changes) || [];
  $('feed-count').textContent = list.length ? `(${list.length})` : '';
  $('feed-list').innerHTML = list.map(x => `<li><span class="kind ${esc(x.kind)}">${esc(x.kind)}</span>
    <div class="ep"><b>${esc(x.method)}</b> ${esc(x.path)}${x.name && x.name !== x.path ? ' &middot; ' + esc(x.name) : ''}</div>
    <div class="sum">${esc(x.summary)}</div><div class="hint">${esc(x.migration_hint)}</div></li>`).join('');
}
function render(d) {
  $('mock').hidden = !d.mock;
  const run = d.runs[0];
  const sig = JSON.stringify([d.mock, run || null]);
  if (sig === last) return;
  last = sig;
  document.querySelectorAll('.att').forEach(e => e.open ? open.add(e.dataset.key) : open.delete(e.dataset.key));
  $('head').innerHTML = head(run && run.changes);
  $('repos').innerHTML = run && run.repos.length ? run.repos.map(card).join('') : '<div class="empty">No runs yet. Waiting for result.json files.</div>';
  feed(run && run.changes);
}
async function poll() {
  try {
    const r = await fetch('/api/results' + location.search, { cache: 'no-store' });
    render(await r.json());
    $('live').className = 'live on'; $('live').textContent = 'live';
  } catch { $('live').className = 'live off'; $('live').textContent = 'offline'; }
}
document.addEventListener('toggle', e => { const k = e.target.dataset && e.target.dataset.key; if (k) e.target.open ? open.add(k) : open.delete(k); }, true);
setInterval(() => document.querySelectorAll('.elapsed').forEach(e => {
  if (e.dataset.end) return;
  e.textContent = fmt(Date.now() - Date.parse(e.dataset.start));
}), 1000);
poll(); setInterval(poll, 1500);
