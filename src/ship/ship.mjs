#!/usr/bin/env node
// Open a PR with the patch in the private demo repo for --lang; updates runs/<run>/<lang>/result.json.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
// --merge auto: merge the PR ourselves when the policy below passes; default is a human reviews and merges.
// --base BRANCH: PR target (created from main if missing). Use a throwaway base for demos so main stays untouched.
const { lang, patch, run, provider = 'unknown', merge = 'review', base = 'main', 'max-lines': maxLines = '200' } = o;
if (!lang || !patch || !run) { console.error('usage: ship.mjs --lang node --patch patch.diff --run RUN_ID --provider acme-pay [--merge auto --base autodemo --max-lines 200]'); process.exit(2); }

const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const repo = JSON.parse(readFileSync(join(ROOT, 'src/ship/repos.json')))[lang];
const dir = join(ROOT, 'runs', run, lang);
const rf = join(dir, 'result.json');
const res = existsSync(rf) ? JSON.parse(readFileSync(rf)) : null;
const changes = existsSync(join(dir, 'changes.json')) ? JSON.parse(readFileSync(join(dir, 'changes.json'))) : null;
const branch = `patchbay/${provider}-${changes?.to_version || 'update'}`;
const patchAbs = resolve(patch);

const tmp = mkdtempSync(join(tmpdir(), 'patchbay-ship-'));
try {
  sh('gh', ['repo', 'clone', repo, tmp + '/r', '--', '-q']);
  const cwd = tmp + '/r';
  const git = (...x) => sh('git', ['-c', 'user.name=Patchbay', '-c', 'user.email=patchbay@users.noreply.github.com', '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', ...x], cwd);
  if (base !== 'main' && !git('ls-remote', '--heads', 'origin', base)) {
    sh('gh', ['api', '-X', 'POST', `repos/${repo}/git/refs`, '-f', `ref=refs/heads/${base}`, '-f', `sha=${git('rev-parse', 'origin/main')}`]);
  }
  const remote = git('ls-remote', '--heads', 'origin', branch);
  if (remote) { git('fetch', '-q', 'origin', branch); git('checkout', '-q', '-B', branch, 'origin/' + branch); }
  else {
    git('checkout', '-q', '-b', branch);
    git('apply', patchAbs);
    git('add', '-A');
    const what = changes ? changes.changes.map((c) => `- ${c.id}: ${c.summary}`).join('\n') : '';
    git('commit', '-q', '-m', `Update ${provider} integration${changes ? ` to ${changes.to_version}` : ''}\n\nAutomated by API Patchbay.\n${what}`);
    git('push', '-q', 'origin', branch);
  }
  const stat = git('diff', '--stat', 'origin/main...HEAD');
  let url = sh('gh', ['pr', 'list', '--repo', repo, '--head', branch, '--state', 'open', '--json', 'url', '-q', '.[0].url']);
  if (!url) {
    const att = res?.attempts || [];
    const last = att[att.length - 1];
    const table = changes
      ? '| id | kind | endpoint | change |\n|---|---|---|---|\n' + changes.changes.map((c) => `| ${c.id} | ${c.kind} | \`${c.method} ${c.path}\` | ${c.summary} |`).join('\n')
      : '_No change feed attached to this run._';
    const verified = res?.sandbox === 'freestyle' && last?.tests === 'pass' && res.vm_id ? `\nVerified in a clean Freestyle VM \`${res.vm_id}\`.\n` : '';
    const body = `## What changed${changes ? ` (${changes.provider} ${changes.from_version} -> ${changes.to_version})` : ''}\n\n${table}\n\n## Diff summary\n\n\`\`\`\n${stat}\n\`\`\`\n\n## Tests\n\nResult: **${last?.tests || 'not recorded'}** after ${att.length} attempt(s) (sandbox: ${res?.sandbox || 'unknown'}).\n${att.map((x) => `- attempt ${x.n} (${x.model}): ${x.tests}`).join('\n')}\n${verified}\n${merge === 'auto' ? `Merge policy: auto. This PR is merged by Patchbay only if the tests passed in the VM and the diff is at most ${maxLines} changed lines.` : 'Opened automatically by API Patchbay. A human reviews and merges.'}`;
    url = sh('gh', ['pr', 'create', '--repo', repo, '--base', base, '--head', branch, '--title', `Update ${provider} integration${changes ? ` to ${changes.to_version}` : ''}`, '--body', body]);
  }
  let merged = false;
  if (merge === 'auto') {
    const m = git('diff', '--shortstat', 'origin/main...HEAD').match(/(\d+) insertion\D+(\d+)? ?/) || [];
    const lines = (+(git('diff', '--shortstat', 'origin/main...HEAD').match(/(\d+) insertion/)?.[1]) || 0) + (+(git('diff', '--shortstat', 'origin/main...HEAD').match(/(\d+) deletion/)?.[1]) || 0);
    const last = (res?.attempts || []).slice(-1)[0];
    const why = last?.tests !== 'pass' ? 'tests did not pass' : lines > +maxLines ? `diff has ${lines} changed lines (limit ${maxLines})` : null;
    if (why) console.error(`auto-merge skipped: ${why}; leaving the PR open for a human`);
    else { sh('gh', ['pr', 'merge', url, '--squash', '--delete-branch']); merged = true; console.error(`auto-merged (${lines} changed lines, tests passed in VM)`); }
  }
  if (res) { Object.assign(res, { pr_url: url, status: 'shipped', merged }); writeFileSync(rf, JSON.stringify(res, null, 2) + '\n'); }
  console.log(url);
} finally { rmSync(tmp, { recursive: true, force: true }); }
