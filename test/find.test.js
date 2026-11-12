// Unit tests (#1430): find in the project's texts and drawings, and replace (core/find.js), against a reference made
// with String methods.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPattern, findInText, replaceInText, findInDrawing, findPaths, findInProject, FIND_MAX } from '../core/find.js';

const TEXT = 'entity Counter is\n  port (clk : in std_logic;\n        count : out unsigned(3 downto 0));\nend counter;\n-- counter of clk\n';

test('findPattern: a text (case and word), a regular expression; nothing to find; an error said', () => {
  assert.equal(findPattern({ text: '' }).re, null);
  assert.equal(findPattern({ text: 'a.b' }).re.source, 'a\\.b');
  assert.equal(findPattern({ text: 'x', matchCase: true }).re.flags, 'g');
  assert.equal(findPattern({ text: 'x' }).re.flags, 'gi');
  const bad = findPattern({ text: '(', regex: true });
  assert.equal(bad.re, null);
  assert.match(bad.error, /Unterminated group|unterminated/i);
});

test('findInText: every match with its line and column, case and whole word, against indexOf', () => {
  const all = findInText(TEXT, findPattern({ text: 'counter' }).re);
  assert.deepEqual(all.map(m => [m.line, m.col, m.length]), [[1, 8, 7], [4, 5, 7], [5, 4, 7]]);
  assert.equal(all[1].text, 'end counter;');
  // (the reference: every case-insensitive occurrence)
  const low = TEXT.toLowerCase(), ref = [];
  for (let i = low.indexOf('counter'); i >= 0; i = low.indexOf('counter', i + 1)) ref.push(i);
  assert.deepEqual(all.map(m => m.index), ref);
  assert.deepEqual(findInText(TEXT, findPattern({ text: 'counter', matchCase: true }).re).map(m => m.line), [4, 5]);
  assert.deepEqual(findInText(TEXT, findPattern({ text: 'count', word: true }).re).map(m => [m.line, m.col]), [[3, 9]], 'not counter');
  assert.deepEqual(findInText(TEXT, findPattern({ text: 'c\\w+r\\b', regex: true }).re).map(m => m.text.slice(m.col - 1, m.col - 1 + m.length)), ['Counter', 'counter', 'counter']);
  assert.equal(findInText('aaaa', findPattern({ text: 'a' }).re, { max: 2 }).length, 2);
  assert.deepEqual(findInText('abc', findPattern({ text: 'x*', regex: true }).re), [], 'an empty match only: none');
});

test('replaceInText: every match replaced, how many; a regular expression\'s groups; nothing to replace', () => {
  const r = replaceInText(TEXT, findPattern({ text: 'clk', word: true }).re, 'clock');
  assert.equal(r.count, 2);
  assert.equal(r.text, TEXT.split('clk').join('clock'));
  const g = replaceInText('a1 b22 c3', findPattern({ text: '([a-z])(\\d+)', regex: true }).re, '$2$1', { regex: true });
  assert.deepEqual(g, { text: '1a 22b 3c', count: 3 });
  assert.deepEqual(replaceInText('x$&y', findPattern({ text: '$&' }).re, '-'), { text: 'x-y', count: 1 }, 'a text with $ found as written');
  assert.deepEqual(replaceInText('abc', null, 'z'), { text: 'abc', count: 0 });
});

test('findInDrawing: the string values of a drawing\'s document, where each is; not JSON: none', () => {
  const doc = { name: 'traffic', states: [{ name: 'RED', label: 'stop the cars' }, { name: 'GREEN' }], notes: 'red light first', n: 3 };
  const m = findInDrawing(JSON.stringify(doc), findPattern({ text: 'red' }).re);
  assert.deepEqual(m.map(x => [x.where, x.col]), [['states[0].name', 1], ['notes', 1]]);
  assert.deepEqual(findInDrawing('not json', findPattern({ text: 'a' }).re), []);
});

test('findPaths: the project\'s files, its sources and its constraints once each, sorted; its text sources and drawings only (#3546)', () => {
  const tree = ['src/top.vhd', 'src/ctl.fsm.json', 'src/ctl.vhd', 'build/x.bit', 'notes.pdf', 'src/rom.mem', 'src/c.c'];
  const files = [{ path: 'src/top.vhd' }, { path: 'sim/tb.v' }];
  assert.deepEqual(findPaths(tree, files, 'constraints/top.ucf'), [
    { path: 'constraints/top.ucf', drawing: false }, { path: 'sim/tb.v', drawing: false }, { path: 'src/ctl.fsm.json', drawing: true },
    { path: 'src/ctl.vhd', drawing: false }, { path: 'src/rom.mem', drawing: false }, { path: 'src/top.vhd', drawing: false }]);
  assert.deepEqual(findPaths(), []);
  assert.deepEqual(findPaths(['a.sch.json'], [], null), [{ path: 'a.sch.json', drawing: true }]);
});

test('findInProject: each text\'s matches (its lines, or its drawing\'s texts), the texts with none left out; at most FIND_MAX a file (#3546)', () => {
  const re = findPattern({ text: 'counter' }).re;
  const r = findInProject([
    { path: 'a.vhd', text: TEXT, drawing: false, generated: true },
    { path: 'b.v', text: 'module x; endmodule\n', drawing: false },
    { path: 'c.fsm.json', text: JSON.stringify({ name: 'counter', states: [{ label: 'Counter' }] }), drawing: true },
  ], re);
  assert.deepEqual(r.map(f => [f.path, f.generated, f.hits.length]), [['a.vhd', true, 3], ['c.fsm.json', undefined, 2]]);
  assert.deepEqual(r[0].hits, findInText(TEXT, re), 'findInText\'s');
  assert.deepEqual(r[1].hits.map(m => m.where), ['name', 'states[0].label']);
  assert.equal(FIND_MAX, 2000);
  assert.equal(findInProject([{ path: 'x.txt', text: 'a'.repeat(3000), drawing: false }], findPattern({ text: 'a' }).re)[0].hits.length, FIND_MAX);
  assert.equal(findInProject([{ path: 'x.txt', text: 'aaa', drawing: false }], findPattern({ text: 'a' }).re, { max: 2 })[0].hits.length, 2);
});
