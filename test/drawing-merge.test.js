// The drawings' diffs and three-way merges (#3197, core/drawing-merge.js) on the repository's drawings (every schematic,
// ASM chart, state diagram, Boolean function of examples/ and test-designs/): what was added, removed, moved, changed;
// a merge taking what one side changed, a conflict where both changed an object differently, resolved "mine" or
// "theirs" for each (never mixed), an object removed on one side and changed on the other; the references a mixed
// resolution leaves dangling. And core/text-diff.js, an HDL file's diff, against git's (git diff --no-index).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { drawingKind, diffDrawings, noDiff, mergeDrawings, resolveDrawing, conflictId, danglingRefs } from '../core/drawing-merge.js';
import { diffLines, sideBySide, unifiedDiff } from '../core/text-diff.js';

const ROOT = path.join(import.meta.dirname, '..');
const DRAWINGS = ['examples', 'test-designs'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).flatMap((p) => {
  const src = path.join(ROOT, d, p, 'src');
  return fs.existsSync(src) ? fs.readdirSync(src).filter((f) => drawingKind(f)).map((f) => path.join(src, f)) : [];
}));
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const clone = (o) => structuredClone(o);
// a drawing's collections and their first objects with an id
const collsOf = (d) => Object.entries(d).filter(([, v]) => Array.isArray(v) && v.length && v.every((o) => o && (o.id ?? o.name) !== undefined)).map(([k]) => k);

test('drawingKind: a drawing\'s kind by its name', () => {
  assert.deepEqual(['a.sch.json', 'src/x.asm.json', 'X.FSM.JSON', 't.tt.json', 'f.bool.json', 'n.pn.json', 'a.json', 'a.vhd', null].map(drawingKind), ['sch', 'asm', 'fsm', 'tt', 'bool', 'pn', null, null, null]);
  assert.ok(DRAWINGS.length >= 15, DRAWINGS.length);
  assert.deepEqual([...new Set(DRAWINGS.map(drawingKind))].sort(), ['asm', 'bool', 'fsm', 'sch']);
});

test('diffDrawings on every drawing: nothing against itself; an object added, removed, moved, changed; a property', () => {
  for (const f of DRAWINGS) {
    const a = read(f);
    assert.ok(noDiff(diffDrawings(a, clone(a))), f);
    if (drawingKind(f) === 'bool') continue;   // (its maps: the next test)
    const colls = collsOf(a);
    assert.ok(colls.length, f);
    const coll = colls.find((c) => a[c].length >= 3 && a[c].some((o) => typeof o.x === 'number')) || colls[0];
    const b = clone(a);
    const [first, second, third] = b[coll];
    const moved = typeof first.x === 'number';
    if (moved) first.x += 20; else first.comment = 'changed';
    if (second) second.comment = 'a comment';
    if (third) b[coll] = b[coll].filter((o) => o !== third);
    b[coll].push({ ...clone(first), id: 'zz999', name: 'zz999' });
    b.description = 'another description';
    const d = diffDrawings(a, b);
    const key = (o) => String(o.id ?? o.name);
    assert.deepEqual(d.added, [{ coll, key: 'zz999' }], f);
    assert.deepEqual(d.removed, third ? [{ coll, key: key(third) }] : [], f);
    assert.deepEqual(d.moved.map((m) => m.key), moved ? [key(first)] : [], f);
    assert.deepEqual(d.changed.map((m) => m.key), [...(moved ? [] : [key(first)]), ...(second ? [key(second)] : [])], f);
    if (second) assert.deepEqual(d.changed.find((m) => m.key === key(second)).fields, ['comment']);
    assert.deepEqual(d.props, ['description'], f);
  }
});

test('mergeDrawings on every drawing: what one side changed is taken, both sides\' different objects together, no conflict', () => {
  for (const f of DRAWINGS) {
    const base = read(f);
    const coll = collsOf(base).find((c) => base[c].length >= 2);
    if (!coll) continue;
    const mine = clone(base), theirs = clone(base);
    mine[coll][0].comment = 'mine';
    theirs[coll][1].comment = 'theirs';
    mine[coll].push({ ...clone(base[coll][0]), id: 'mine1', name: 'mine1' });
    theirs[coll].push({ ...clone(base[coll][0]), id: 'their1', name: 'their1' });
    theirs.description = 'theirs';
    const { merged, conflicts } = mergeDrawings(base, mine, theirs);
    assert.deepEqual(conflicts, [], f);
    assert.equal(merged[coll][0].comment, 'mine');
    assert.equal(merged[coll][1].comment, 'theirs');
    assert.deepEqual(merged[coll].slice(-2).map((o) => o.id ?? o.name), ['mine1', 'their1']);
    assert.equal(merged.description, 'theirs');
    // (the properties in the drawing's order)
    assert.deepEqual(Object.keys(merged), [...new Set([...Object.keys(mine), ...Object.keys(theirs)])]);
    // the same change on both sides: no conflict either
    assert.deepEqual(mergeDrawings(base, mine, clone(mine)).conflicts, []);
    assert.deepEqual(mergeDrawings(base, mine, clone(mine)).merged, mine);
  }
});

test('a Boolean function\'s maps: an output\'s column merged by itself, a conflict on one column', () => {
  const f = DRAWINGS.find((x) => /lamps\.bool\.json$/.test(x));
  const base = read(f);
  const flip = (col, i) => col.slice(0, i) + (col[i] === '1' ? '0' : '1') + col.slice(i + 1);
  const mine = clone(base), theirs = clone(base);
  mine.table.car_r = flip(base.table.car_r, 0);
  theirs.table.walk_g = flip(base.table.walk_g, 1);
  assert.deepEqual(diffDrawings(base, mine), { added: [], removed: [], moved: [], changed: [{ coll: 'table', key: 'car_r', fields: [] }], props: [] });
  const m = mergeDrawings(base, mine, theirs);
  assert.deepEqual(m.conflicts, []);
  assert.deepEqual(m.merged.table, { ...base.table, car_r: mine.table.car_r, walk_g: theirs.table.walk_g });
  theirs.table.car_r = flip(base.table.car_r, 2);
  assert.deepEqual(mergeDrawings(base, mine, theirs).conflicts.map(conflictId), ['table/car_r']);
  assert.equal(resolveDrawing(base, mine, theirs, { 'table/car_r': 'theirs' }).table.car_r, theirs.table.car_r);
  assert.deepEqual(Object.keys(resolveDrawing(base, mine, theirs, { 'table/car_r': 'mine' })), Object.keys(base));
});

test('a conflict: both sides changed one object differently; resolved mine or theirs, never mixed; removed on one side, changed on the other', () => {
  const f = DRAWINGS.find((x) => /traffic\.fsm\.json$/.test(x));
  const base = read(f);
  const mine = clone(base), theirs = clone(base);
  mine.states[0].x += 40; mine.states[0].comment = 'mine';
  theirs.states[0].name = 'THEIRS';
  mine.states = mine.states.filter((s) => s.id !== 's2');
  mine.transitions = mine.transitions.filter((t) => t.from !== 's2' && t.to !== 's2');
  theirs.states.find((s) => s.id === 's2').comment = 'theirs changed it';
  mine.clock = 'clk_mine'; theirs.clock = 'clk_theirs';
  const { merged, conflicts } = mergeDrawings(base, mine, theirs);
  assert.deepEqual(conflicts.map(conflictId).sort(), ['.clock', 'states/s1', 'states/s2']);
  assert.equal(merged.states[0].comment, 'mine');   // (a conflict with no choice: mine)
  assert.throws(() => resolveDrawing(base, mine, theirs, { 'states/s1': 'mine' }), { message: 'not every conflict is resolved: .clock, states/s2' });
  const allMine = resolveDrawing(base, mine, theirs, { '.clock': 'mine', 'states/s1': 'mine', 'states/s2': 'mine' });
  assert.deepEqual(allMine.states.find((s) => s.id === 's1'), mine.states[0]);
  assert.equal(allMine.states.find((s) => s.id === 's2'), undefined);
  assert.equal(allMine.clock, 'clk_mine');
  const allTheirs = resolveDrawing(base, mine, theirs, { '.clock': 'theirs', 'states/s1': 'theirs', 'states/s2': 'theirs' });
  assert.deepEqual(allTheirs.states.find((s) => s.id === 's1'), theirs.states[0]);
  assert.equal(allTheirs.states.find((s) => s.id === 's2').comment, 'theirs changed it');
  assert.equal(allTheirs.clock, 'clk_theirs');
  // the transitions mine removed with s2 are taken away (theirs did not change them): none dangles
  assert.deepEqual(danglingRefs(allMine), []);
  assert.deepEqual(danglingRefs(allTheirs), []);
  // a resolution that keeps theirs' new transition to the state mine removed: said
  const t2 = clone(theirs);
  t2.transitions.push({ id: 't99', from: 's1', to: 's2', cond: 'x', outputs: {} });
  const mixed = resolveDrawing(base, mine, t2, { '.clock': 'mine', 'states/s1': 'mine', 'states/s2': 'mine' });
  assert.deepEqual(danglingRefs(mixed), [{ coll: 'transitions', key: 't99', field: 'to', to: 's2' }]);
});

test('diffLines and unifiedDiff against git diff --no-index; side by side', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-diff-'));
  try {
    const a = fs.readFileSync(path.join(ROOT, 'examples', 'blinky', 'src', 'top.vhd'), 'utf8');
    const lines = a.split('\n');
    const b = [...lines.slice(0, 5), '-- a new line', ...lines.slice(5, 20), ...lines.slice(22, 40).map((l, i) => (i === 3 ? `${l} -- changed` : l)), ...lines.slice(40)].join('\n');
    fs.writeFileSync(path.join(tmp, 'a'), a); fs.writeFileSync(path.join(tmp, 'b'), b);
    let git = '';
    try { execFileSync('git', ['diff', '--no-index', '--no-color', '--minimal', 'a', 'b'], { cwd: tmp, encoding: 'utf8' }); } catch (e) { git = e.stdout; }
    const hunks = git.slice(git.indexOf('@@')).replace(/^(@@ [^@]+ @@).*$/gm, '$1');
    const mine = unifiedDiff(a, b);
    assert.equal(mine.slice(mine.indexOf('@@')), hunks);
    const ops = diffLines(a, b);
    assert.deepEqual([ops.filter((o) => o.op === '+').length, ops.filter((o) => o.op === '-').length], [2, 3]);
    assert.equal(unifiedDiff(a, a), '');
    const rows = sideBySide('a\nb\nc\n', 'a\nB\nc\nd\n');
    assert.deepEqual(rows.map((r) => r.op), ['=', '~', '=', '+']);
    assert.deepEqual(rows[1], { op: '~', left: { line: 2, text: 'b' }, right: { line: 2, text: 'B' } });
    assert.deepEqual(rows[3], { op: '+', left: null, right: { line: 4, text: 'd' } });
    assert.deepEqual(diffLines('', ''), []);
    assert.deepEqual(diffLines('', 'x\n').map((o) => o.op), ['+']);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
