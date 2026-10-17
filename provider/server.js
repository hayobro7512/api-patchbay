// Acme Pay spec server. Zero deps. PORT overrides 8800.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let version = 'v1';
http.createServer((req, res) => {
  const send = (c, b, t = 'application/json') => { res.writeHead(c, { 'content-type': t }); res.end(b); };
  if (req.method === 'GET' && req.url === '/spec.yaml')
    return send(200, fs.readFileSync(path.join(__dirname, `spec-${version}.yaml`)), 'application/yaml');
  if (req.method === 'GET' && req.url === '/version') return send(200, JSON.stringify({ version }));
  if (req.method === 'POST' && req.url === '/admin/version') {
    let b = ''; req.on('data', d => b += d).on('end', () => {
      try { const v = JSON.parse(b).version; if (!['v1', 'v2'].includes(v)) throw 0; version = v; send(200, JSON.stringify({ version })); }
      catch { send(400, '{"error":"version must be v1 or v2"}'); }
    });
    return;
  }
  send(404, '{"error":"not found"}');
}).listen(process.env.PORT || 8800);
