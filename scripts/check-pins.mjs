#!/usr/bin/env node
// The sources Silinx pins outside npm against their upstream, monthly (#352, .github/workflows/pins.yml):
// Dependabot (.github/dependabot.yml) follows the npm packages and the GitHub Actions; these it cannot:
//   - Yosys's test designs (scripts/fetch-yosys-tests.mjs YOSYS_TESTS_PIN: a tag and its commit), against
//     Yosys's latest release tag; they follow the Yosys of @yowasp/yosys (package.json), so they are also
//     out of step when their tag is not that Yosys's
//   - the design corpus's repositories (test/designs-corpus/manifest.json: a commit each), against the
//     head of their default branch: how many commits behind, and which of the files the designs use changed
//   - the Model Checking Contest's models of the diagram corpus (test/diagram-corpus/mcc.json: a year's
//     archives), against the latest year of the contest
// What is behind becomes one issue, "Pinned sources: newer versions available" (labels enhancement and
// tests & CI), opened or updated (its text replaced); none when all are current, and the issue is closed
// when they become so. As scripts/report-failure.mjs (#251), the issue is written by the workflow.
// Not pinned, so not checked: adepttool (scripts/install-adepttool.sh clones its head), the VlogHammer
// generator (a port, test/corpus/vloghammer-gen.mjs), the ISE image's Ubuntu 14.04 (what ISE 14.7 needs).
//
//   node scripts/check-pins.mjs [--dry-run]
//   (in GitHub Actions: GITHUB_TOKEN with issues: write, GITHUB_REPOSITORY; without them, or with --dry-run,
//   it prints the issue it would write)
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { YOSYS_TESTS_PIN } from './fetch-yosys-tests.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TITLE = 'Pinned sources: newer versions available';
export const LABELS = ['enhancement', 'tests & CI'];

/** The pins of the repository at `root`: [{ kind, name, file, … }] (kind: yosys-tests, commit, mcc). */
export function collectPins(root = ROOT, { testsPin = YOSYS_TESTS_PIN } = {}) {
  const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const pkg = read('package.json');
  const pins = [{ kind: 'yosys-tests', name: 'Yosys\'s test designs', file: 'scripts/fetch-yosys-tests.mjs', repo: 'YosysHQ/yosys', tag: testsPin.tag, commit: testsPin.commit,
    yowasp: pkg.dependencies?.['@yowasp/yosys'] ?? null }];
  const manifest = read('test/designs-corpus/manifest.json');
  for (const [name, src] of Object.entries(manifest.sources)) {
    const used = new Set([src.licenceFile]);
    for (const d of manifest.designs.filter(x => x.source === name)) for (const f of [...d.files, ...(d.testbench?.files || [])]) if (!f.startsWith('local:')) used.add(f);
    pins.push({ kind: 'commit', name: `design corpus: ${name}`, file: 'test/designs-corpus/manifest.json', repo: src.repo, commit: src.commit, used: [...used].sort() });
  }
  const mcc = read('test/diagram-corpus/mcc.json');
  const years = [...new Set(mcc.nets.map(n => +(/mcc\.lip6\.fr\/(\d{4})\//.exec(n.url) || [])[1]).filter(Boolean))];
  pins.push({ kind: 'mcc', name: 'diagram corpus: Model Checking Contest models', file: 'test/diagram-corpus/mcc.json', year: Math.max(...years), models: mcc.nets.map(n => n.instance) });
  return pins;
}

/** `git ls-remote` output as { ref: commit }; an annotated tag's commit (its ^{} line) over the tag object's. */
export function parseLsRemote(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const m = /^([0-9a-f]{40})\s+(\S+)$/.exec(line.trim());
    if (!m) continue;
    const peeled = m[2].endsWith('^{}');
    const ref = peeled ? m[2].slice(0, -3) : m[2];
    if (peeled || !(ref in out)) out[ref] = m[1];
  }
  return out;
}

const tagNumbers = t => (/^v(\d+)\.(\d+)(?:\.(\d+))?$/.exec(t) || []).slice(1).map(x => +(x ?? 0));

/** -1 / 0 / 1: release tags 'v0.68' < 'v0.70' < 'v0.70.1' (numerically, not as text). */
export function compareTags(a, b) {
  const x = tagNumbers(a), y = tagNumbers(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return 0;
}

/** The latest release tag of refs ({ 'refs/tags/v0.70': sha, … }): vX.Y or vX.Y.Z only (no -rc, -dev). */
export function latestReleaseTag(refs) {
  const tags = Object.keys(refs).filter(r => r.startsWith('refs/tags/')).map(r => r.slice(10)).filter(t => tagNumbers(t).length);
  return tags.sort(compareTags).at(-1) ?? null;
}

/** The Yosys tag a YoWASP version runs: '0.70.1258' → 'v0.70'. */
export function yowaspTag(version) {
  const m = /(\d+)\.(\d+)\./.exec(String(version || ''));
  return m ? `v${m[1]}.${m[2]}` : null;
}

/** Yosys's test designs: { pin, behind, current, latest, notes: [] }. refs: Yosys's ls-remote of its tags. */
export function checkYosysTests(pin, refs) {
  const latest = latestReleaseTag(refs);
  const notes = [];
  const follow = yowaspTag(pin.yowasp);
  if (follow && follow !== pin.tag) notes.push(`out of step: @yowasp/yosys ${pin.yowasp} runs Yosys ${follow}, the test designs are ${pin.tag}'s`);
  const tagCommit = refs[`refs/tags/${pin.tag}`];
  if (tagCommit && tagCommit !== pin.commit) notes.push(`the commit pinned (${pin.commit.slice(0, 7)}) is not ${pin.tag}'s (${tagCommit.slice(0, 7)})`);
  // (out of step or the wrong commit: to look at even when no newer Yosys exists)
  const wrong = notes.length > 0;
  const newer = !!latest && compareTags(latest, pin.tag) > 0;
  if (newer) notes.push(`they follow the Yosys of @yowasp/yosys${follow ? ` (${follow})` : ''}: pinned again with a Yosys update (a "yosys update" pull request)`);
  return { pin, current: pin.tag, latest: latest ?? '?', behind: newer || wrong, notes };
}

/**
 * A commit pin against its repository's head: { pin, behind, current, latest, notes }. compare: GitHub's
 * comparison of the two ({ ahead_by, files: [path] }) or null (not available: only the commits differ).
 */
export function checkCommit(pin, head, compare = null) {
  const notes = [];
  if (!head) return { pin, current: pin.commit.slice(0, 7), latest: '?', behind: false, notes: ['the head of the repository could not be read'] };
  if (head === pin.commit) return { pin, current: pin.commit.slice(0, 7), latest: head.slice(0, 7), behind: false, notes };
  if (compare) {
    notes.push(`${compare.ahead_by} commit${compare.ahead_by === 1 ? '' : 's'} behind`);
    const changed = new Set(compare.files || []);
    const used = (pin.used || []).filter(f => changed.has(f));
    notes.push(used.length ? `files the designs use changed: ${used.map(f => `\`${f}\``).join(', ')}` : 'none of the files the designs use changed');
  }
  return { pin, current: pin.commit.slice(0, 7), latest: head.slice(0, 7), behind: true, notes };
}

/** The MCC models: { pin, behind, current, latest, notes }. years: the contest years that exist (any order). */
export function checkMcc(pin, years) {
  const latest = Math.max(pin.year, ...years);
  return { pin, current: String(pin.year), latest: String(latest), behind: latest > pin.year,
    notes: latest > pin.year ? [`the models of MCC ${latest} (https://mcc.lip6.fr/${latest}/models.php): their archives' SHA-256 and expected values change with them`] : [] };
}

const HOW = {
  'yosys-tests': 'with the Yosys update: `YOSYS_TESTS_PIN` (the tag and its commit), `npm run test:corpus -- --update`, test/corpus/README.md',
  commit: 'test/designs-corpus/manifest.json (the commit), then `npm run fetch:designs` and `npm run test:designs`; review the changes, `--update` records them',
  mcc: 'test/diagram-corpus/mcc.json (url, sha256, file, expected: the contest\'s consensus), `npm run fetch:diagrams`, `npm run test:diagrams`',
};

/** The issue's text for the checks that are behind (and those that could not be read). */
export function issueBody(checks, date) {
  const behind = checks.filter(c => c.behind);
  const L = [`Sources pinned outside npm with newer versions upstream (checked ${date} by .github/workflows/pins.yml, scripts/check-pins.mjs). `
    + 'npm packages and GitHub Actions: Dependabot\'s pull requests.', '',
  '| source | file | pinned | latest | notes |', '|---|---|---|---|---|'];
  for (const c of behind) L.push(`| ${c.pin.name}${c.pin.repo ? ` ([${c.pin.repo}](https://github.com/${c.pin.repo}))` : ''} | ${c.pin.file} | ${c.current} | ${c.latest} | ${c.notes.join('; ')} |`);
  L.push('', 'To update (each a change of its own, reviewed: new sources can change the results):', '');
  for (const kind of [...new Set(behind.map(c => c.pin.kind))]) L.push(`- ${kind === 'commit' ? 'the design corpus' : kind === 'mcc' ? 'the MCC models' : 'Yosys\'s test designs'}: ${HOW[kind]}`);
  const unread = checks.filter(c => !c.behind && c.notes.length);
  if (unread.length) L.push('', 'Not checked:', '', ...unread.map(c => `- ${c.pin.name}: ${c.notes.join('; ')}`));
  L.push('', '(Written by the workflow: the next month\'s check replaces this text, and closes the issue when all are current.)');
  return L.join('\n');
}

/** What to do with the issue: 'open' | 'update' | 'close' | 'none'. */
export function issueAction(open, behindCount) {
  if (behindCount) return open ? 'update' : 'open';
  return open ? 'close' : 'none';
}

const run = promisify(execFile);
const lsRemote = async (repoUrl, ...refs) => parseLsRemote((await run('git', ['ls-remote', repoUrl, ...refs], { maxBuffer: 64 << 20, timeout: 120000 })).stdout);

/** Every pin checked; net: { lsRemote(url, …refs), compare(repo, base, head), exists(url) } (injected in the tests). */
export async function checkAll(pins, net) {
  const out = [];
  for (const pin of pins) {
    try {
      if (pin.kind === 'yosys-tests') out.push(checkYosysTests(pin, await net.lsRemote(`https://github.com/${pin.repo}.git`, 'refs/tags/v*')));
      else if (pin.kind === 'commit') {
        const head = (await net.lsRemote(`https://github.com/${pin.repo}.git`, 'HEAD')).HEAD ?? null;
        let cmp = null;
        if (head && head !== pin.commit) { try { cmp = await net.compare(pin.repo, pin.commit, head); } catch (e) { console.error(`${pin.repo}: ${e.message}`); } }
        out.push(checkCommit(pin, head, cmp));
      } else if (pin.kind === 'mcc') {
        const years = [];
        for (let y = pin.year + 1; y <= new Date().getUTCFullYear(); y++) if (await net.exists(`https://mcc.lip6.fr/${y}/models.php`)) years.push(y);
        out.push(checkMcc(pin, years));
      }
    } catch (e) {
      out.push({ pin, current: pin.tag || pin.commit?.slice(0, 7) || String(pin.year), latest: '?', behind: false, notes: [`could not be checked: ${e.message.split('\n')[0]}`] });
    }
  }
  return out;
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  const gh = async (url, opts = {}) => {
    const r = await fetch(url.startsWith('http') ? url : `https://api.github.com/${url}`, { ...opts, headers: { Accept: 'application/vnd.github+json', ...(token && { Authorization: `Bearer ${token}` }), ...(opts.body && { 'Content-Type': 'application/json' }) } });
    if (!r.ok) throw new Error(`GitHub API ${url}: ${r.status} ${r.statusText}`);
    return r.json();
  };
  const net = {
    lsRemote,
    compare: async (r, base, head) => { const c = await gh(`repos/${r}/compare/${base}...${head}`); return { ahead_by: c.ahead_by, files: (c.files || []).map(f => f.filename) }; },
    // (a year without a contest is a redirect to the site's error page: not followed)
    exists: async url => { try { return (await fetch(url, { method: 'HEAD', redirect: 'manual' })).status === 200; } catch { return false; } },
  };
  const checks = await checkAll(collectPins(), net);
  for (const c of checks) console.log(`${c.behind ? 'BEHIND ' : 'current'} ${c.pin.name}: ${c.current} (latest ${c.latest})${c.notes.length ? `: ${c.notes.join('; ')}` : ''}`);
  const behind = checks.filter(c => c.behind);
  const body = issueBody(checks, new Date().toISOString().slice(0, 10));
  if (dry || !token || !repo) { console.log(`\n${behind.length ? `the issue "${TITLE}":\n\n${body}` : 'all current: no issue'}`); return; }
  const open = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`repos/${repo}/issues?state=open&per_page=100&page=${page}`);
    open.push(...batch.filter(i => !i.pull_request));
    if (batch.length < 100) break;
  }
  const issue = open.find(i => i.title === TITLE) || null;
  const action = issueAction(issue, behind.length);
  if (action === 'open') console.log(`opened #${(await gh(`repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: TITLE, body, labels: LABELS }) })).number}`);
  else if (action === 'update') { await gh(`repos/${repo}/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ body }) }); console.log(`updated #${issue.number}`); }
  else if (action === 'close') {
    await gh(`repos/${repo}/issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `All pinned sources are current (${new Date().toISOString().slice(0, 10)}, scripts/check-pins.mjs).` }) });
    await gh(`repos/${repo}/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
    console.log(`closed #${issue.number}`);
  } else console.log('all current: no issue');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
