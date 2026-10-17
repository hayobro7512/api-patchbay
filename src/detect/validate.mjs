// Hand-written validator for schemas/changes.schema.json (required keys, enums, additionalProperties).
const TOP = ['provider', 'from_version', 'to_version', 'spec_url', 'generated_at', 'changes'];
const REQ = ['id', 'kind', 'method', 'path', 'summary', 'migration_hint'];
const ENUMS = { kind: ['breaking', 'deprecated', 'added'], location: ['endpoint', 'request_param', 'response_field', 'enum_value'] };
const OPT = ['location', 'name', 'before', 'after'];

export function validate(doc) {
  const errs = [];
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!obj(doc)) return ['root must be an object'];
  for (const k of TOP) if (!(k in doc)) errs.push(`missing ${k}`);
  for (const k of Object.keys(doc)) if (!TOP.includes(k)) errs.push(`unexpected ${k}`);
  for (const k of TOP.slice(0, 5)) if (k in doc && typeof doc[k] !== 'string') errs.push(`${k} must be string`);
  if (typeof doc.generated_at === 'string' && isNaN(Date.parse(doc.generated_at))) errs.push('generated_at not a date-time');
  if (!Array.isArray(doc.changes)) { errs.push('changes must be array'); return errs; }
  doc.changes.forEach((c, i) => {
    const p = `changes[${i}]`;
    if (!obj(c)) return errs.push(`${p} must be object`);
    for (const k of REQ) if (!(k in c)) errs.push(`${p} missing ${k}`);
    for (const k of Object.keys(c)) {
      if (![...REQ, ...OPT].includes(k)) errs.push(`${p} unexpected ${k}`);
      else if (typeof c[k] !== 'string') errs.push(`${p}.${k} must be string`);
      else if (ENUMS[k] && !ENUMS[k].includes(c[k])) errs.push(`${p}.${k} not in enum: ${c[k]}`);
    }
  });
  return errs;
}
