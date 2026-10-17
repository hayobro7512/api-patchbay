#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const feedDir = () => process.env.FEED_DIR || new URL('../../runs/feed/', import.meta.url).pathname;
const send = (res, code, type, body, h = {}) => { res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*', ...h }); res.end(body); };

createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  try {
    if (p === '/AGENTS.md') return send(res, 200, 'text/markdown; charset=utf-8', await readFile(new URL('./AGENTS.snippet.md', import.meta.url)));
    const m = /^\/feed\/([A-Za-z0-9_-]+)\.json$/.exec(p);
    if (m) {
      let body;
      try { body = await readFile(`${feedDir()}/${m[1]}.json`); }
      catch { return send(res, 404, 'application/json', JSON.stringify({ error: 'no feed for provider', provider: m[1] })); }
      const etag = '"' + createHash('sha256').update(body).digest('hex').slice(0, 16) + '"';
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag }); return res.end(); }
      return send(res, 200, 'application/json', body, { etag, 'cache-control': 'no-cache' });
    }
    send(res, 404, 'application/json', JSON.stringify({ error: 'not found' }));
  } catch (e) { send(res, 500, 'application/json', JSON.stringify({ error: e.message })); }
}).listen(Number(process.env.PORT || 8803), () => console.log('feed server on', process.env.PORT || 8803));
