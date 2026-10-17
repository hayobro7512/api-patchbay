#!/usr/bin/env node
// Mock Acme Pay API driven ONLY by an OpenAPI spec: node mock-api.mjs --spec spec-v2.yaml [--to-json]
// Env: ACME_SPEC (spec path), PORT (default 8805; 0 = pick a free port, printed on start).
// Zero deps. Includes a minimal YAML-subset reader (block maps/lists, flow {} [], scalars) for our specs.
import http from 'node:http';
import { readFileSync } from 'node:fs';

// ---- minimal YAML subset ----
const scalar = (s) => {
  s = s.trim();
  if (/^(['"]).*\1$/.test(s)) return s.slice(1, -1);
  if (s === 'true' || s === 'false') return s === 'true';
  if (s === 'null' || s === '~') return null;
  return /^-?\d+$/.test(s) ? +s : s;
};
const splitTop = (s) => { // split on commas outside {} []
  const out = []; let d = 0, cur = '';
  for (const c of s) {
    if ('{['.includes(c)) d++; if ('}]'.includes(c)) d--;
    if (c === ',' && !d) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
};
const kv = (s) => { const m = s.match(/^([^'"{\[][^:]*?|'[^']*'|"[^"]*"):(?: (.*))?$/); return m && [scalar(m[1]), m[2] ?? '']; };
function flow(s) {
  s = s.trim();
  if (s[0] === '{') return Object.fromEntries(splitTop(s.slice(1, -1)).map((p) => { const [k, v] = kv(p.trim()); return [k, flow(v)]; }));
  if (s[0] === '[') return splitTop(s.slice(1, -1)).map(flow);
  return scalar(s);
}
export function parseYaml(text) {
  const L = text.split('\n').map((l) => l.replace(/\s+#.*$/, '').replace(/\s+$/, '')).filter((l) => l.trim() && !l.trim().startsWith('#') && l.trim() !== '---')
    .map((l) => ({ ind: l.match(/^ */)[0].length, t: l.trim() }));
  let i = 0;
  function block(ind) {
    if (L[i].t.startsWith('- ')) {
      const arr = [];
      while (i < L.length && L[i].ind === ind && L[i].t.startsWith('- ')) {
        const rest = L[i].t.slice(2);
        if (!/^[{\[]/.test(rest) && kv(rest)) { L[i] = { ind: ind + 2, t: rest }; arr.push(block(ind + 2)); }
        else { arr.push(flow(rest)); i++; }
      }
      return arr;
    }
    const obj = {};
    while (i < L.length && L[i].ind === ind && !L[i].t.startsWith('- ')) {
      const [k, v] = kv(L[i].t); i++;
      obj[k] = v !== '' ? flow(v) : i < L.length && L[i].ind > ind ? block(L[i].ind) : null;
    }
    return obj;
  }
  return block(L[0].ind);
}
export const loadSpec = (p) => { const t = readFileSync(p, 'utf8'); return /\.json$/.test(p) ? JSON.parse(t) : parseYaml(t); };

// ---- spec-driven behaviour ----
const deref = (spec, s) => (s && s.$ref ? s.$ref.slice(2).split('/').reduce((o, k) => o[k], spec) : s);

function validate(spec, schema, v, at, errs) {
  schema = deref(spec, schema);
  if (!schema) return;
  const t = schema.type;
  const okType = !t || (t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' : t === 'array' ? Array.isArray(v) : t === 'object' ? v && typeof v === 'object' && !Array.isArray(v) : typeof v === t);
  if (!okType) return errs.push(`${at}: expected ${t}`);
  if (schema.enum && !schema.enum.includes(v)) errs.push(`${at}: must be one of ${schema.enum.join(', ')}`);
  if (t === 'array') v.forEach((x, n) => validate(spec, schema.items, x, `${at}[${n}]`, errs));
  if (t === 'object') {
    const props = schema.properties || {};
    for (const r of schema.required || []) if (!(r in v)) errs.push(`${at}.${r}: required`);
    for (const [k, x] of Object.entries(v)) {
      if (k in props) validate(spec, props[k], x, `${at}.${k}`, errs);
      else if (schema.additionalProperties === true) continue; // strict unless explicitly open
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validate(spec, schema.additionalProperties, x, `${at}.${k}`, errs);
      else errs.push(`${at}.${k}: unknown property`);
    }
  }
}

// Plausible response from schema. Magic request amount 99999 -> 'requires_review', 13 -> 'failed' when the enum allows.
function gen(spec, schema, ctx, name = '') {
  schema = deref(spec, schema) || {};
  if (schema.example !== undefined) return schema.example;
  if (schema.type === 'object' || schema.properties) return Object.fromEntries(Object.entries(schema.properties || {}).map(([k, s]) => [k, gen(spec, s, ctx, k)]));
  if (schema.type === 'array') return [gen(spec, schema.items, ctx)];
  if (schema.enum) return ctx.amount === 99999 && schema.enum.includes('requires_review') ? 'requires_review' : ctx.amount === 13 && schema.enum.includes('failed') ? 'failed' : schema.enum[0];
  if (schema.type === 'integer' || schema.type === 'number') return 1;
  if (schema.type === 'boolean') return true;
  if (name === 'id') return ctx.params.id ?? `${ctx.resource.slice(0, 2)}_1`;
  if (name === 'email') return 'a@b.co';
  return 'example';
}

export function makeServer(spec) {
  const ops = [];
  for (const [path, item] of Object.entries(spec.paths || {}))
    for (const [method, op] of Object.entries(item))
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method))
        ops.push({ method: method.toUpperCase(), op, re: new RegExp('^' + path.replace(/\{([^}]+)\}/g, '(?<$1>[^/]+)') + '/?$') });
  return http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d)).on('end', () => {
      const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };
      const url = new URL(req.url, 'http://x');
      let hit, other = false;
      for (const o of ops) { const m = url.pathname.match(o.re); if (m) { if (o.method === req.method) hit = { ...o, params: { ...m.groups } }; else other = true; } }
      if (!hit) return send(other ? 405 : 404, { error: `no operation ${req.method} ${url.pathname} in spec ${spec.info?.version}` });
      const rb = deref(spec, hit.op.requestBody);
      let body;
      if (rb) {
        if (raw.trim()) { try { body = JSON.parse(raw); } catch { return send(400, { error: 'invalid JSON' }); } }
        else if (rb.required) return send(400, { error: 'request body required' });
        if (body !== undefined) {
          const errs = [];
          validate(spec, rb.content?.['application/json']?.schema, body, 'body', errs);
          if (errs.length) return send(400, { error: 'invalid request', details: errs });
        }
      }
      const code = Object.keys(hit.op.responses || {}).find((c) => c.startsWith('2')) || '200';
      const rs = deref(spec, hit.op.responses?.[code])?.content?.['application/json']?.schema;
      const amount = body && (body.amount_minor ?? body.amount_cents);
      send(+code, code === '204' || !rs ? undefined : gen(spec, rs, { amount, params: hit.params, resource: url.pathname.split('/').filter((s) => !s.startsWith('{') && !(hit.params && Object.values(hit.params).includes(s))).pop() }));
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), i = a.indexOf('--spec');
  const path = i >= 0 ? a[i + 1] : process.env.ACME_SPEC;
  if (!path) { console.error('usage: mock-api.mjs --spec <openapi.yaml|json> [--to-json]'); process.exit(2); }
  const spec = loadSpec(path);
  if (a.includes('--to-json')) { console.log(JSON.stringify(spec, null, 2)); process.exit(0); }
  const s = makeServer(spec).listen(process.env.PORT ?? 8805, () => console.log(`mock acme-pay ${spec.info.version} listening on ${s.address().port}`));
}
