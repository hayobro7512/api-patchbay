// Zero-dep dashboard server. GET /api/results scans runs/<run_id>/<repo>/result.json.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.env.PORT || 8801;
const ROOT = __dirname;
const REAL = process.env.RUNS_DIR || path.join(ROOT, '..', 'runs');
const MOCK = path.join(ROOT, 'mock-runs');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const dirs = d => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return []; } };

// Mock timestamps are shifted so the run looks like it started 75s ago.
const MOCK_BASE = Date.parse('2026-10-17T15:00:00Z');
function shift(o, delta) {
  if (!o) return o;
  for (const k of ['started_at', 'finished_at', 'generated_at'])
    if (typeof o[k] === 'string') o[k] = new Date(Date.parse(o[k]) + delta).toISOString();
  return o;
}

function scan(base, mock) {
  const delta = mock ? Date.now() - 75000 - MOCK_BASE : 0;
  const runs = dirs(base).map(id => {
    const rd = path.join(base, id);
    const repos = dirs(rd).map(r => shift(readJSON(path.join(rd, r, 'result.json')), delta)).filter(r => r && typeof r === 'object' && r.repo && r.status);
    // changes.json may sit in the run dir or in any repo dir
    let changes = readJSON(path.join(rd, 'changes.json'));
    for (const r of dirs(rd)) if (!changes) changes = readJSON(path.join(rd, r, 'changes.json'));
    let t = 0; try { t = fs.statSync(rd).mtimeMs; } catch {}
    return { run_id: id, changes: shift(changes, delta), repos, t };
  }).filter(r => r.repos.length || r.changes);
  return runs.sort((a, b) => b.t - a.t || (a.run_id < b.run_id ? 1 : -1)).map(({ t, ...r }) => r);
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/results') {
    const mock = process.env.MOCK === '1' || u.searchParams.get('mock') === '1';
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ mock, runs: scan(mock ? MOCK : REAL, mock) }));
  }
  let p = path.normalize(decodeURIComponent(u.pathname));
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT + path.sep) || f.startsWith(MOCK) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log(`Patchbay dashboard: http://localhost:${PORT}${process.env.MOCK === '1' ? ' (mock)' : ''}`));
