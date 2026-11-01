// The pre-release "Development build" (scripts/dev-notes.mjs, .github/workflows/dev-release.yml): its
// text names the commit and lists the changes not released yet (the changelog fragments, an unreleased
// section), never a released version's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { devNotes, LIMIT, FULL_LIST } from '../scripts/dev-notes.mjs';
import { readFragments } from '../scripts/changelog-release.mjs';

const CL = '# Changelog\n\n## 15.10.9\n\nIn detail:\n\n- **New thing** (#1).\n\n## 15.10.8\n\n- Old thing.\n';

test('dev notes: the commit, the dev site, the newest section when it is not released yet', () => {
  const t = devNotes({ commit: 'abc1234', date: '2026-10-13', changelog: CL, tags: ['v15.10.8'] });
  assert.match(t, /^\*\*Development build\*\* of main, commit abc1234 \(2026-10-13\): not a release/);
  assert.match(t, /https:\/\/pmnmalo\.github\.io\/Silinx-ISE\/dev\//);
  assert.match(t, /## Not released yet \(15\.10\.9\)\n\nIn detail:\n\n- \*\*New thing\*\* \(#1\)\./);
  assert.doesNotMatch(t, /Old thing/);
  // released already: no "not released yet" part
  assert.doesNotMatch(devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags: ['v15.10.8', 'v15.10.9'] }), /Not released yet/);
});

// the changelog fragments (changes/*.md, #519), with the unreleased section written by hand (the
// transition) when there is one
const F = [{ name: '7-old.md', text: 'In detail:\n\n- **Old fix** (#7).\n' },
  { name: '9-new.md', text: 'In short:\n\n- **New:** what users see.\n\nIn detail:\n\n- **New** (#9).\n' }];

test('dev notes: the pending fragments, newest issue first, with or without an unreleased section', () => {
  const t = devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags: ['v15.10.8', 'v15.10.9'], fragments: F });
  assert.ok(t.endsWith('## Not released yet\n\nIn short:\n\n- **New:** what users see.\n\nIn detail:\n\n- **New** (#9).\n- **Old fix** (#7).\n'), t);
  assert.doesNotMatch(t, /New thing|Old thing/, 'not the released sections');
  const u = devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags: ['v15.10.8'], fragments: F });
  assert.ok(u.endsWith('## Not released yet (15.10.9)\n\nIn short:\n\n- **New:** what users see.\n\nIn detail:\n\n- **New** (#9).\n- **Old fix** (#7).\n- **New thing** (#1).\n'), u);
  // nothing pending: no "not released yet" part
  assert.doesNotMatch(devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags: ['v15.10.8', 'v15.10.9'], fragments: [] }), /Not released yet/);
});

// a release's body holds at most 125,000 characters (#2411): past the limit, the short items stay in full and
// the oldest detail entries are left out, with a line saying how many and where the full list is
const many = (n, len) => Array.from({ length: n }, (_, i) => ({ name: `${i + 1}-c.md`,
  text: `In short:\n\n- **Short ${i + 1}:** seen.\n\nIn detail:\n\n- **Change ${i + 1} (#${i + 1}):** ${'x'.repeat(len)}\n  more é.\n` }));

test('dev notes: over the limit, the newest detail entries kept, every short item, a line saying what was left out', () => {
  const tags = ['v15.10.8', 'v15.10.9'], F = many(300, 500);
  const full = devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags, fragments: F, limit: Infinity });
  assert.ok(full.length > LIMIT, 'the synthetic set is over the limit');
  const t = devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags, fragments: F });
  assert.ok(Buffer.byteLength(t) <= LIMIT && LIMIT < 125000, `${t.length}`);
  for (let i = 1; i <= 300; i++) assert.ok(t.includes(`- **Short ${i}:** seen.\n`), `short ${i}`);
  const kept = [...t.matchAll(/^- \*\*Change (\d+) /gm)].map(m => +m[1]);
  assert.ok(kept.length > 100 && kept.length < 300, `${kept.length}`);
  assert.deepEqual(kept, Array.from({ length: kept.length }, (_, i) => 300 - i), 'the newest, in order');
  assert.ok(t.includes(`- **Change ${kept.at(-1)} (#${kept.at(-1)}):** ${'x'.repeat(500)}\n  more é.\n\n`), 'whole entries');
  assert.ok(t.endsWith(`\n\n${300 - kept.length} older entries of "In detail" left out (a release's notes hold at most 125,000 characters): ` +
    `the full list is in changes/ on main, ${FULL_LIST}, and in CHANGELOG.md at the next release.\n`), t.slice(-400));
  assert.ok(full.startsWith(t.slice(0, t.indexOf('- **Change'))), 'the same text up to the detail list');
  // the short items alone over the limit: every detail entry left out, the short items kept
  const s = devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags, fragments: many(3, 10), limit: 400 });
  assert.match(s, /- \*\*Short 3:\*\* seen\.\n- \*\*Short 2:\*\* seen\.\n- \*\*Short 1:\*\* seen\.\n\n3 older entries of "In detail" left out/);
  assert.doesNotMatch(s, /In detail:\n|Change \d/);
});

test('dev notes: under the limit, the text unchanged', () => {
  const tags = ['v15.10.8', 'v15.10.9'], F = many(100, 500);
  const t = devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags, fragments: F });
  assert.ok(t.length < LIMIT);
  assert.equal(t, devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags, fragments: F, limit: Infinity }));
  assert.doesNotMatch(t, /left out/);
  assert.equal([...t.matchAll(/^- \*\*Change /gm)].length, 100);
  // exactly at the limit: unchanged too
  assert.equal(devNotes({ commit: 'abc1234', date: 'd', changelog: CL, tags, fragments: F, limit: Buffer.byteLength(t) }), t);
});

test('scripts/dev-notes.mjs: runs on the repository and lists its fragments, no warnings', () => {
  const r = spawnSync(process.execPath, ['scripts/dev-notes.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', 'no warnings');
  assert.match(r.stdout, /^\*\*Development build\*\* of main, commit [0-9a-f]+ /);
  assert.ok(Buffer.byteLength(r.stdout) <= LIMIT, 'within the limit (#2411)');
  // every fragment's issue, unless its entries were left out for the limit
  if (!/older entr(y|ies) of "In detail" left out/.test(r.stdout))
    for (const f of readFragments()) assert.ok(r.stdout.includes(`#${parseInt(f.name, 10)}`), f.name);
});
