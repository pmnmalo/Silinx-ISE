// The Quality comparison's builds kept between runs (#3292, test/designs-corpus/quality-cache.mjs): a run stopped by its
// deadline leaves whole designs and the builds it made in the cache; the next run takes them from there and makes only the
// ones missing; a failed or timed-out build is not kept (nor a failure of the guard); the page of a partial comparison says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { hashTree, hashFiles, cacheKey, cacheGet, cachePut, cachePrune, cacheTouch, buildOrder, mayStart, markPending, buildsText, runSummary, runBuilds, CACHE_VERSION, doneDesigns, markDesignDone } from './designs-corpus/quality-cache.mjs';
import { newFailures, GOALS } from './designs-corpus/compare-lib.mjs';
import { qualityPage } from './designs-corpus/quality-page.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-3292-'));

test('quality cache: a project\'s hash is of its files, not of its build or size.json; a key of what decides the build', () => {
  const d = tmp();
  try {
    fs.mkdirSync(path.join(d, 'src')); fs.writeFileSync(path.join(d, 'src', 'a.v'), 'module a; endmodule');
    fs.writeFileSync(path.join(d, 'silinx.json'), '{}');
    const h = hashTree(d);
    assert.match(h, /^[0-9a-f]{64}$/);
    fs.mkdirSync(path.join(d, 'build')); fs.writeFileSync(path.join(d, 'build', 'x.ncd'), 'x');
    fs.writeFileSync(path.join(d, 'size.json'), '{"slices":1}');
    assert.equal(hashTree(d), h, 'a build and size.json do not change it');
    fs.writeFileSync(path.join(d, 'src', 'a.v'), 'module a(input x); endmodule');
    assert.notEqual(hashTree(d), h, 'a source does');
    fs.renameSync(path.join(d, 'src', 'a.v'), path.join(d, 'src', 'b.v'));
    assert.notEqual(hashTree(d), h, 'and its name');
    assert.equal(hashFiles([path.join(d, 'silinx.json')]), hashFiles([path.join(d, 'silinx.json')]));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  // the key: the same parts in any order, another for any part that differs
  const k = cacheKey({ side: 'silinx', design: 'b01', goal: 'area', commit: 'c1' });
  assert.equal(cacheKey({ commit: 'c1', goal: 'area', design: 'b01', side: 'silinx' }), k);
  for (const p of [{ commit: 'c2' }, { goal: 'speed' }, { design: 'b02' }, { side: 'ise' }]) assert.notEqual(cacheKey({ side: 'silinx', design: 'b01', goal: 'area', commit: 'c1', ...p }), k);
  assert.equal(CACHE_VERSION, 1);
});

test('quality cache: a result kept and read back; a missing, damaged or other key\'s entry is none; old entries pruned', () => {
  const d = tmp();
  try {
    const k = cacheKey({ a: 1 }), k2 = cacheKey({ a: 2 });
    assert.equal(cacheGet(d, k), null);
    cachePut(d, k, { a: 1 }, { slices: 5, periodNs: 3.2 });
    assert.deepEqual(cacheGet(d, k), { slices: 5, periodNs: 3.2 });
    assert.deepEqual(fs.readdirSync(d), [`${k}.json`], 'written whole, no temporary file left');
    fs.writeFileSync(path.join(d, `${k2}.json`), '{"key":"');
    assert.equal(cacheGet(d, k2), null, 'damaged');
    fs.copyFileSync(path.join(d, `${k}.json`), path.join(d, `${k2}.json`));
    assert.equal(cacheGet(d, k2), null, 'another key\'s entry');
    // pruned after 30 days unused; a used one touched
    const old = new Date(Date.now() - 31 * 86400e3);
    fs.utimesSync(path.join(d, `${k}.json`), old, old); fs.utimesSync(path.join(d, `${k2}.json`), old, old);
    cacheTouch(d, k);
    fs.writeFileSync(path.join(d, 'pending'), 'c\n'); fs.utimesSync(path.join(d, 'pending'), old, old);
    assert.equal(cachePrune(d, 30), 1);
    assert.deepEqual(fs.readdirSync(d).sort(), [`${k}.json`, 'pending'].sort(), 'only entries pruned, the pending mark kept');
    assert.equal(cachePrune(path.join(d, 'none'), 30), 0);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('quality cache: the builds design after design, Silinx\'s goals then ISE\'s; the deadline; the pending commit', () => {
  assert.deepEqual(buildOrder(['a', 'b'], ['area', 'speed']).map(b => `${b.name}:${b.side}:${b.goal}`),
    ['a:silinx:area', 'a:silinx:speed', 'a:ise:area', 'a:ise:speed', 'b:silinx:area', 'b:silinx:speed', 'b:ise:area', 'b:ise:speed']);
  assert.equal(mayStart(0, 5e12), true, 'no deadline');
  assert.equal(mayStart(1000, 999e3), true);
  assert.equal(mayStart(1000, 1000e3), false);
  const d = tmp();
  try {
    markPending(d, 'c1', true);
    assert.equal(fs.readFileSync(path.join(d, 'pending'), 'utf8'), 'c1\n');
    const old = new Date(Date.now() - 3 * 86400e3);
    fs.utimesSync(path.join(d, 'pending'), old, old);
    markPending(d, 'c1', true);
    assert.ok(fs.statSync(path.join(d, 'pending')).mtimeMs < Date.now() - 2 * 86400e3, 'the same commit: its date kept (the workflow gives up after 14 days)');
    markPending(d, 'c2', true);
    assert.equal(fs.readFileSync(path.join(d, 'pending'), 'utf8'), 'c2\n');
    markPending(d, 'c2', false);
    assert.equal(fs.existsSync(path.join(d, 'pending')), false, 'a whole comparison: no pending');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('quality cache: a run stopped by its deadline keeps what it made; the next makes only what is missing (#3292)', async () => {
  const d = tmp();
  try {
    const builds = buildOrder(['a', 'b', 'c'], ['area', 'speed']);
    const keyParts = b => ({ ...b, commit: 'c1' });
    let clock = 0, made = [];
    // each build takes 10 s of the clock; the deadline at 75 s: eight builds start (a and b), none after
    const build = async b => {
      made.push(`${b.name}:${b.side}:${b.goal}`); clock += 10e3;
      if (b.name === 'b' && b.side === 'ise' && b.goal === 'speed') return { error: 'timed out after 120 min (--build-timeout)', timedOut: true, seconds: 7200 };
      return { slices: b.name.charCodeAt(0), seconds: 10 };
    };
    const now = () => clock;
    const first = await runBuilds({ builds, cache: d, keyParts, build, deadline: 75, now });
    assert.deepEqual(made, ['a:silinx:area', 'a:silinx:speed', 'a:ise:area', 'a:ise:speed', 'b:silinx:area', 'b:silinx:speed', 'b:ise:area', 'b:ise:speed']);
    assert.equal(first.account.measured.length, 7);
    assert.deepEqual(first.account.timedOut.map(b => b.name), ['b']);
    assert.deepEqual(first.account.missing.map(b => `${b.name}:${b.side}:${b.goal}`), ['c:silinx:area', 'c:silinx:speed', 'c:ise:area', 'c:ise:speed']);
    assert.equal(first.results[8], undefined, 'a build not made: no result');
    assert.equal(fs.readdirSync(d).length, 7, 'the builds made kept, not the timed-out one');
    // the next run: the kept builds from the cache, the timed-out one and the missing ones made
    made = []; clock = 0;
    const second = await runBuilds({ builds, cache: d, keyParts, build: async b => { made.push(`${b.name}:${b.side}:${b.goal}`); return { slices: 1, seconds: 1 }; }, deadline: 75, now });
    assert.deepEqual(made, ['b:ise:speed', 'c:silinx:area', 'c:silinx:speed', 'c:ise:area', 'c:ise:speed']);
    assert.equal(second.account.cached.length, 7);
    assert.equal(second.account.missing.length, 0);
    assert.deepEqual(second.results[0], { slices: 97, seconds: 10 }, 'a\'s Silinx Area as the first run measured it');
    // another commit: none of the Silinx builds kept for it
    made = [];
    await runBuilds({ builds: builds.slice(0, 2), cache: d, keyParts: b => ({ ...b, commit: 'c2' }), build: async b => { made.push(b.goal); return { slices: 1 }; } });
    assert.deepEqual(made, ['area', 'speed']);
    // a result whose timing could not be checked is not kept, nor a failed build (ISE not available: made again); no cache:
    // every build made
    const e = tmp();
    await runBuilds({ builds: builds.slice(0, 1), cache: e, keyParts, build: async () => ({ slices: 1, unchecked: true }) });
    await runBuilds({ builds: builds.slice(2, 3), cache: e, keyParts, build: async () => ({ error: 'ERROR: Xilinx ISE not available (docker mode)' }) });
    assert.deepEqual(fs.readdirSync(e), []);
    fs.rmSync(e, { recursive: true, force: true });
    made = [];
    await runBuilds({ builds: builds.slice(0, 2), keyParts, build: async b => { made.push(b.goal); return {}; } });
    assert.deepEqual(made, ['area', 'speed']);
    // Silinx's and ISE's at the same time (not --serial): the account in the builds' order all the same
    const par = await runBuilds({ builds, keyParts, serial: false, concurrency: () => 2, build: async b => { await new Promise(r => setTimeout(r, b.side === 'ise' ? 1 : 3)); return {}; } });
    assert.deepEqual(par.account.measured, builds);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('quality cache: the run\'s account names the builds measured, from the cache, timed out and left', () => {
  const b = (name, side, goal) => ({ name, side, goal });
  assert.equal(buildsText([b('x', 'silinx', 'area'), b('x', 'silinx', 'speed'), b('x', 'ise', 'fast'), b('y', 'ise', 'area')]), 'x (Silinx at Area, Speed; ISE at Fast), y (ISE at Area)');
  assert.deepEqual(runSummary({ measured: [b('x', 'silinx', 'area')], cached: [b('w', 'ise', 'speed')], timedOut: [], missing: [b('y', 'silinx', 'fast')] }), [
    'builds: 1 measured, 1 from the cache, 0 timed out, 1 left for the next run',
    'measured: x (Silinx at Area)',
    'from the cache: w (ISE at Speed)',
    'left for the next run: y (Silinx at Fast)',
  ]);
  assert.deepEqual(runSummary({ measured: [], cached: [], timedOut: [], missing: [] }), ['builds: 0 measured, 0 from the cache, 0 timed out, 0 left for the next run']);
});

test('quality cache: a build not made or timed out is not a failure of the guard; a failure still is', () => {
  const ok = { slices: 1 };
  const before = { goals: GOALS, designs: [{ name: 'a', goals: { area: { silinx: ok, ise: ok }, speed: { silinx: ok, ise: ok }, fast: { silinx: ok, ise: ok } } }] };
  const now = { goals: GOALS, designs: [{ name: 'a', goals: {
    area: { silinx: { error: 'timed out after 120 min (--build-timeout)', timedOut: true }, ise: ok },
    speed: { silinx: undefined, ise: undefined },
    fast: { silinx: ok, ise: { error: 'ERROR:Place:1 - x' } } } }] };
  assert.deepEqual(newFailures(before, now), ['a (ISE, Fast): ERROR:Place:1 - x']);
});

test('quality page: a partial comparison says how many builds it has and lists the ones not measured yet (#3292)', () => {
  const b = (luts, slices, periodNs) => ({ luts, slices, ffs: 10, srl16: 0, bram: 0, mult: 0, periodNs, seconds: 5 });
  const res = { generatedAt: '2026-11-10T10:00:00Z', silinxVersion: 'x', isePeriodNs: 5, goals: GOALS, designs: [
    { name: 'a', goals: { area: { silinx: b(80, 40, 10), ise: b(100, 50, 8) }, speed: { silinx: b(90, 45, 8), ise: b(110, 55, 7) }, fast: { silinx: b(85, 42, 9), ise: b(100, 50, 9) } } },
    { name: 'b', goals: { area: { silinx: b(10, 5, 3) }, speed: {}, fast: {} } },
  ], missing: [
    { design: 'b', goal: 'area', side: 'ise' }, { design: 'b', goal: 'speed', side: 'silinx' }, { design: 'b', goal: 'fast', side: 'silinx' },
    { design: 'b', goal: 'speed', side: 'ise' }, { design: 'b', goal: 'fast', side: 'ise' },
  ] };
  const page = qualityPage(JSON.parse(JSON.stringify(res)));
  assert.match(page, /^- \*\*Partial:\*\* 7 of the 12 builds are measured; the other 5 \(under \*Not measured yet\*\)\n {2}are made by the next run of the comparison, which resumes this one\.$/m);
  assert.match(page, /^## Not measured yet\n\nThe builds this run did not reach before its deadline, made by the next run:\n\n- b \(ISE at Area, Speed, Fast; Silinx at Speed, Fast\)$/m);
  // b's Silinx Area, its ISE not made: in the size table, ISE's columns empty; the summary of what both built
  assert.ok(page.includes('| b | 10 | – | – | 10 | – | 5 | – | – | 0 / – | 0 / – | 0 / – |'), page);
  assert.match(page, /^- \*\*Area:\*\* 1 designs built by both\./m);
  // a whole comparison: neither
  delete res.missing;
  const whole = qualityPage(res);
  assert.doesNotMatch(whole, /Partial|Not measured yet/);
});

test('Quality workflow: the builds kept on the runner, a deadline and a build\'s time limit, a partial comparison resumed (#3292)', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/quality.yml'), 'utf8');
  const src = fs.readFileSync(path.join(ROOT, 'test/designs-corpus/compare-ise.mjs'), 'utf8');
  assert.match(wf, /compare-ise\.mjs "\$QUALITY_PROJECTS" --jobs 1 --ise-jobs 1 --serial --guard \\\n\s+--cache "\$HOME\/silinx-cache\/quality\/builds" --deadline \$\(\(START \+ DEADLINE_MINUTES \* 60\)\) --build-timeout "\$BUILD_TIMEOUT_MINUTES"/);
  // the deadline and the longest build inside the job's timeout
  const num = k => +new RegExp(`${k}: (\\d+)`).exec(wf)[1];
  assert.ok(num('DEADLINE_MINUTES') + num('BUILD_TIMEOUT_MINUTES') + 20 <= num('timeout-minutes'), 'a build started at the deadline ends before the timeout');
  // the pending commit the compare script marks, which the workflow resumes only when it is one of main's, checked by git
  // after main's checkout (no token, no other ref on the self-hosted runner: workflows.test.js), and its projects kept
  assert.match(wf, /P="\$HOME\/silinx-cache\/quality\/builds\/pending"/);
  assert.match(wf, /git merge-base --is-ancestor "\$c" HEAD 2>\/dev\/null; then\n\s+git checkout -q --detach "\$c"/);
  assert.equal(wf.match(/git checkout /g).length, 1, 'no other switch');
  assert.match(wf, /projects\/\$\(git rev-parse HEAD\)/);
  assert.match(src, /markPending\(CACHE, commit, true\)/, 'marked before the builds: a run killed by the job\'s timeout is resumed');
  assert.match(src, /markPending\(CACHE, commit, missing\.length > 0\)/);
  // the Silinx toolchain in a process of its own, killed at the time limit (WebAssembly: a job's cancel does not stop it)
  assert.match(src, /spawn\(process\.execPath, \[fileURLToPath\(import\.meta\.url\), '--build-one', projectDir, goal\]/);
  assert.match(src, /child\.kill\('SIGKILL'\)/);
});

test('#3342 the projects of a comparison: each design marked as it is processed, skipped by the next run (run.mjs --resume)', () => {
  const d = tmp();
  try {
    assert.deepEqual([...doneDesigns(d)], [], 'none yet');
    markDesignDone(d, 'itc99-b02'); markDesignDone(d, 'epfl-log2'); markDesignDone(d, 'epfl-log2');
    fs.writeFileSync(path.join(d, '.done', '.all'), '');
    assert.deepEqual([...doneDesigns(d)].sort(), ['epfl-log2', 'itc99-b02'], 'not .all, the whole step\'s mark');
    // (not a project: compare-ise.mjs takes the folders with a silinx.json)
    assert.equal(fs.existsSync(path.join(d, '.done', 'silinx.json')), false);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  const run = fs.readFileSync(path.join(ROOT, 'test/designs-corpus/run.mjs'), 'utf8');
  assert.match(run, /resume: args\.includes\('--resume'\)/);
  assert.match(run, /const todo = manifest\.designs\.filter\(picked\)\.map\(d => d\.name\)\.filter\(n => !kept\.has\(n\)\);/);
  // a design's result and a timeout marked; a harness error or a worker's exit not (made again)
  assert.match(run, /record\(r\.name, r\);/);
  assert.match(run, /record\(cur, timedOutResult\(/);
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/quality.yml'), 'utf8');
  assert.match(wf, /run\.mjs --stages frontend,synth,flow --sizes "\$P" --sizes-only --resume --jobs 1/);
  assert.doesNotMatch(wf, /rm -rf "\$P"/, 'a stopped step\'s projects kept');
  assert.match(wf, /mkdir -p "\$P\/\.done" && touch "\$P\/\.done\/\.all"/);
});

// #3297: a whole comparison (about 60 h) in one run, by parts of the compare job one after another, each to its own
// deadline, each resuming what the parts before it left. The "What to compare" step's own script, run on a repository of
// three commits (c0 ← c1 = main; a side commit off c0) with a runner's home of its own.
const whatToCompare = () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/quality.yml'), 'utf8');
  const m = /- name: What to compare\n\s+id: what\n\s+run: \|\n([\s\S]*?)\n {8}env:/.exec(wf);
  return m[1].split('\n').map(l => l.slice(10)).join('\n');
};
function partsRepo() {
  const d = tmp(), repo = path.join(d, 'repo'), home = path.join(d, 'home');
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
  fs.mkdirSync(repo); fs.mkdirSync(home);
  git('init', '-q', '-b', 'main');
  const commit = m => { git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', m); return git('rev-parse', 'HEAD'); };
  const c0 = commit('c0');
  git('checkout', '-q', '-b', 'side'); const side = commit('side');
  git('checkout', '-q', 'main'); const c1 = commit('c1');
  const pending = path.join(home, 'silinx-cache/quality/builds/pending');
  return {
    d, home, c0, c1, side, git,
    setPending: c => { fs.mkdirSync(path.dirname(pending), { recursive: true }); if (c) fs.writeFileSync(pending, `${c}\n`); else fs.rmSync(pending, { force: true }); },
    /** One part: a fresh checkout of main (c1), the step run; its outputs, the commit it left checked out, its exit status. */
    part(part, run = '7', attempt = '1') {
      git('checkout', '-q', '--detach', c1);
      const out = path.join(d, `out-${run}-${attempt}-${part}`);
      fs.writeFileSync(out, '');
      const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', whatToCompare()], { cwd: repo, encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: home, GITHUB_OUTPUT: out, GITHUB_RUN_ID: run, GITHUB_RUN_ATTEMPT: attempt, GITHUB_SHA: c1, PART: String(part) } });
      return { status: r.status, out: r.stdout + r.stderr, skip: /^skip=true$/m.test(fs.readFileSync(out, 'utf8')), head: git('rev-parse', 'HEAD') };
    },
  };
}

test('#3297 the comparison by parts: the first part picks the commit, the next ones resume it, then skip once it is whole', () => {
  const r = partsRepo();
  try {
    // part 1, nothing pending: main's commit, written for the parts after it
    let p = r.part(1);
    assert.equal(p.status, 0, p.out); assert.equal(p.skip, false); assert.equal(p.head, r.c1);
    assert.equal(fs.readFileSync(path.join(r.home, 'silinx-cache/quality/runs/7-1'), 'utf8').trim(), r.c1);
    // its deadline came, the comparison partial (compare-ise.mjs's mark): part 2 compares the same commit
    r.setPending(r.c1);
    p = r.part(2);
    assert.equal(p.status, 0, p.out); assert.equal(p.skip, false); assert.equal(p.head, r.c1);
    // part 2 finished it (the mark removed): parts 3 to 5 skip, nothing built again, no results uploaded
    r.setPending(null);
    for (const n of [3, 4, 5]) {
      p = r.part(n);
      assert.equal(p.status, 0, p.out); assert.equal(p.skip, true, `part ${n}`);
      assert.match(p.out, new RegExp(`::notice::Part ${n}: the comparison of ${r.c1} is whole`));
    }
    // a run whose first part has another commit's partial comparison to finish (an ancestor of main's): every part on it
    r.setPending(r.c0);
    p = r.part(1, '8');
    assert.equal(p.status, 0, p.out); assert.equal(p.head, r.c0);
    assert.match(p.out, /left partial by an earlier run/);
    p = r.part(2, '8');
    assert.equal(p.status, 0, p.out); assert.equal(p.skip, false); assert.equal(p.head, r.c0);
    assert.match(p.out, /left partial by the part before/);
    // c0 whole after part 2: part 3 skips, it does not start main's commit (whose partial results would replace c0's)
    r.setPending(null);
    p = r.part(3, '8');
    assert.equal(p.skip, true); assert.equal(p.head, r.c1);
    // a pending commit that is not one of main's: main's commit compared
    r.setPending(r.side);
    p = r.part(1, '9');
    assert.equal(p.status, 0, p.out); assert.equal(p.head, r.c1);
    // a run's attempt again (Re-run failed jobs): a first part again, which resumes the pending comparison
    r.setPending(r.c0);
    p = r.part(4, '8', '2');
    assert.equal(p.status, 0, p.out); assert.equal(p.skip, false); assert.equal(p.head, r.c0);
    assert.equal(fs.readFileSync(path.join(r.home, 'silinx-cache/quality/runs/8-2'), 'utf8').trim(), r.c0);
  } finally { fs.rmSync(r.d, { recursive: true, force: true }); }
});

test('#3297 the comparison by parts: a later part\'s commit not one of main\'s refused; the runs\' marks pruned', () => {
  const r = partsRepo();
  try {
    const runs = path.join(r.home, 'silinx-cache/quality/runs');
    fs.mkdirSync(runs, { recursive: true });
    fs.writeFileSync(path.join(runs, '5-1'), `${r.side}\n`);
    r.setPending(r.side);
    const p = r.part(2, '5');
    assert.equal(p.status, 1);
    assert.match(p.out, new RegExp(`::error::Part 2: ${r.side}, the commit of this run's first part, is not one of main's`));
    assert.equal(p.head, r.c1, 'not checked out');
    // a run's mark of more than 40 days removed, a recent one kept
    const old = path.join(runs, '1-1');
    fs.writeFileSync(old, `${r.c0}\n`);
    const t = new Date(Date.now() - 50 * 86400e3); fs.utimesSync(old, t, t);
    r.setPending(null);
    r.part(1, '6');
    assert.equal(fs.existsSync(old), false);
    assert.equal(fs.existsSync(path.join(runs, '5-1')), true);
  } finally { fs.rmSync(r.d, { recursive: true, force: true }); }
});

test('#3297 Quality workflow: the compare job in parts, one after another, every step after the choice skipped once whole', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/quality.yml'), 'utf8');
  const compare = /\n {2}compare:\n([\s\S]*?)\n {2}# the results' commit/.exec(wf)[1];
  assert.match(compare, /strategy:\n\s+max-parallel: 1\n\s+fail-fast: true.*\n\s+matrix:\n\s+part: \[1, 2, 3, 4, 5\]/);
  const parts = /part: \[([\d, ]+)\]/.exec(compare)[1].split(',').length;
  // the parts' time for builds (the projects, about 7 h, in the first) against the whole comparison's, about 60 h
  const num = k => +new RegExp(`${k}: (\\d+)`).exec(compare)[1];
  assert.ok(parts * num('DEADLINE_MINUTES') - 7 * 60 >= 70 * 60, 'room for the builds, with a margin');
  assert.match(compare, /PART: \$\{\{ matrix\.part \}\}/);
  // every step after "What to compare" skipped by a part with nothing left
  const after = compare.slice(compare.indexOf('- name: What to compare'));
  const steps = after.split(/\n {6}- /).slice(1);
  assert.equal(steps.length, 5);
  for (const s of steps) assert.match(s, /^(?:if: |.*\n\s+if: )(?:always\(\) && )?steps\.what\.outputs\.skip != 'true'$/m, s.split('\n')[0]);
  // one concurrency group for the whole run: no ISE job between its parts (#3292's group, workflow-level)
  assert.match(wf, /^concurrency:\n {2}group: ise +#.*\n {2}cancel-in-progress: false$/m);
  assert.doesNotMatch(compare, /concurrency:/);
});
