#!/usr/bin/env node
// oasdiff wrapper -> changes.json (schemas/changes.schema.json)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validate } from './validate.mjs';

const specVersion = (f) => (readFileSync(f, 'utf8').match(/^\s*version:\s*['"]?([^'"\s]+)/m) || [, 'unknown'])[1];

function oasdiff(a, b) {
  try {
    return JSON.parse(execFileSync('oasdiff', ['changelog', a, b, '-f', 'json'], { encoding: 'utf8', maxBuffer: 1 << 26 }) || '[]');
  } catch (e) {
    throw new Error('oasdiff failed: ' + (e.stderr || e.message));
  }
}

export function detect({ oldFile, newFile, provider, specUrl }) {
  const raw = oasdiff(oldFile, newFile);
  const out = [];
  const take = (pred) => { const i = raw.findIndex(pred); return i < 0 ? null : raw.splice(i, 1)[0]; };
  const mk = (c) => out.push({ id: '', ...c });

  // rename: request-property-removed + new-required-request-property on same op
  let r;
  while ((r = take((e) => e.id === 'request-property-removed'))) {
    const old = /`([^`]+)`/.exec(r.text)[1];
    const add = take((e) => e.id === 'new-required-request-property' && e.operation === r.operation && e.path === r.path);
    if (add) {
      const nu = /`([^`]+)`/.exec(add.text)[1];
      mk({ kind: 'breaking', method: r.operation, path: r.path, location: 'request_param', name: old,
        summary: `Request parameter ${old} was renamed to ${nu} (now required) on ${r.operation} ${r.path}.`,
        before: old, after: nu,
        migration_hint: `In every ${r.operation} ${r.path} request body, rename the field '${old}' to '${nu}'; the value and type are unchanged. Update any wrapper function or type that builds this body.` });
    } else {
      mk({ kind: 'breaking', method: r.operation, path: r.path, location: 'request_param', name: old,
        summary: `Request parameter ${old} was removed from ${r.operation} ${r.path}.`, before: old,
        migration_hint: `Stop sending '${old}' in ${r.operation} ${r.path} requests.` });
    }
  }
  while ((r = take((e) => e.id === 'new-required-request-property'))) {
    const nu = /`([^`]+)`/.exec(r.text)[1];
    mk({ kind: 'breaking', method: r.operation, path: r.path, location: 'request_param', name: nu,
      summary: `New required request parameter ${nu} on ${r.operation} ${r.path}.`, after: nu,
      migration_hint: `Always send '${nu}' in ${r.operation} ${r.path} requests.` });
  }

  // existing optional property became required
  while ((r = take((e) => e.id === 'request-property-became-required'))) {
    const nu = /`([^`]+)`/.exec(r.text)[1];
    mk({ kind: 'breaking', method: r.operation, path: r.path, location: 'request_param', name: nu,
      summary: `Request parameter ${nu} became required on ${r.operation} ${r.path}.`, after: nu,
      migration_hint: `Always send '${nu}' in ${r.operation} ${r.path} requests; pick the value explicitly, do not rely on a server default.` });
  }

  // deprecation + newly added optional property on same op = replacement (e.g. user -> safety_identifier)
  while ((r = take((e) => e.id === 'request-property-deprecated'))) {
    const old = /`([^`]+)`/.exec(r.text)[1];
    const add = take((e) => e.id === 'new-optional-request-property' && e.operation === r.operation && e.path === r.path);
    const nu = add && /`([^`]+)`/.exec(add.text)[1];
    mk({ kind: 'deprecated', method: r.operation, path: r.path, location: 'request_param', name: old,
      summary: nu ? `Request parameter ${old} is deprecated in favor of ${nu} on ${r.operation} ${r.path}.` : `Request parameter ${old} is deprecated on ${r.operation} ${r.path}.`,
      before: old, ...(nu && { after: nu }),
      migration_hint: nu ? `In every ${r.operation} ${r.path} request body, send '${nu}' instead of '${old}' (same value and type); '${old}' still works for now but will be removed.` : `Stop sending '${old}' in ${r.operation} ${r.path} requests.` });
  }

  // endpoint removals; pair with an added endpoint of the same method for the replacement
  const added = raw.filter((e) => e.id === 'endpoint-added');
  while ((r = take((e) => /^api-path-removed|^api-removed|^endpoint-removed/.test(e.id)))) {
    const rep = added.find((a) => a.operation === r.operation);
    mk({ kind: 'breaking', method: r.operation, path: r.path, location: 'endpoint', name: r.path,
      summary: `Endpoint ${r.operation} ${r.path} was removed${rep ? `; use ${rep.operation} ${rep.path} instead` : ''}.`,
      before: `${r.operation} ${r.path}`, after: rep ? `${rep.operation} ${rep.path}` : 'removed',
      migration_hint: rep
        ? `Replace calls to ${r.operation} ${r.path} with ${rep.operation} ${rep.path} (same token argument, drop the /legacy segment).`
        : `Remove calls to ${r.operation} ${r.path}; no replacement exists.` });
  }

  // enum additions
  while ((r = take((e) => /enum-value-added/.test(e.id)))) {
    const val = /`([^`]+)` enum value/.exec(r.text)?.[1] ?? '?';
    const prop = /to the `([^`]+)`/.exec(r.text)?.[1] ?? 'value';
    mk({ kind: 'added', method: r.operation, path: r.path, location: 'enum_value', name: val,
      summary: `New enum value '${val}' for ${prop} on ${r.operation} ${r.path}.`, after: val,
      migration_hint: `Handle the new ${prop} value '${val}' everywhere the ${prop} is switched on (add a case/branch); do not let it fall into an unknown-value error.` });
  }

  // new endpoints
  for (const a of added) {
    take((e) => e === a);
    mk({ kind: 'added', method: a.operation, path: a.path, location: 'endpoint', name: a.path,
      summary: `New endpoint ${a.operation} ${a.path}.`, after: `${a.operation} ${a.path}`,
      migration_hint: `Optional: adopt ${a.operation} ${a.path} where relevant. No change required unless a removed endpoint points to it.` });
  }

  // anything left: generic
  for (const e of raw) {
    mk({ kind: e.level >= 3 ? 'breaking' : e.level === 2 ? 'deprecated' : 'added', method: e.operation || 'GET', path: e.path || '/',
      summary: e.text, migration_hint: `Review usages of ${e.operation || ''} ${e.path || ''} against this change: ${e.text}.` });
  }

  const order = { breaking: 0, deprecated: 1, added: 2 };
  out.sort((x, y) => order[x.kind] - order[y.kind]);
  out.forEach((c, i) => (c.id = 'chg_' + String(i + 1).padStart(3, '0')));
  const doc = { provider, from_version: specVersion(oldFile), to_version: specVersion(newFile), spec_url: specUrl,
    generated_at: new Date().toISOString(), changes: out };
  const errs = validate(doc);
  if (errs.length) throw new Error('changes.json invalid: ' + errs.join('; '));
  return doc;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = {};
  for (let i = 2; i < process.argv.length; i += 2) a[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  if (!a.old || !a.new) { console.error('usage: detect.mjs --old A.yaml --new B.yaml --provider P --spec-url URL --out changes.json'); process.exit(2); }
  const doc = detect({ oldFile: a.old, newFile: a.new, provider: a.provider || 'unknown', specUrl: a['spec-url'] || 'http://localhost:8800/spec.yaml' });
  const s = JSON.stringify(doc, null, 2) + '\n';
  if (a.out) { writeFileSync(a.out, s); console.error(`wrote ${a.out}: ${doc.changes.length} changes`); } else process.stdout.write(s);
}
