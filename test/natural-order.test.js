// core/natural-order.js (#3819): the order the Design pane's modules, the Files page, the module pickers and the MCP's
// project_info list names in: the numbers by their value, upper and lower case alike, the rest as localeCompare did;
// checked against an independent reference (the names' numbers by value, their other characters ranked '_', digits,
// letters) on random names; and project_info's files.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { naturalCompare, firstThenNatural } from '../core/natural-order.js';
import { scratchEnv } from './server-helpers.js';

const sorted = names => [...names].sort(naturalCompare);

test('#3819 the issue\'s case: access_next_state_2 before access_next_state_10', () => {
  const names = ['access_next_state_1', 'access_next_state_10', 'access_next_state_11', 'access_next_state_12', 'access_next_state_2', 'access_next_state_3', 'access_next_state_9'];
  assert.deepEqual(sorted(names), ['access_next_state_1', 'access_next_state_2', 'access_next_state_3', 'access_next_state_9', 'access_next_state_10', 'access_next_state_11', 'access_next_state_12']);
  // (the old order, plain text, is the wrong one)
  assert.deepEqual([...names].sort((a, b) => a.localeCompare(b)).slice(0, 3), ['access_next_state_1', 'access_next_state_10', 'access_next_state_11']);
});

test('numbers: by value, several in a name, leading zeros, longer than a double\'s digits', () => {
  assert.deepEqual(sorted(['r10c2', 'r2c10', 'r2c9', 'r10c1']), ['r2c9', 'r2c10', 'r10c1', 'r10c2']);
  assert.deepEqual(sorted(['x007', 'x8', 'x7', 'x10']), ['x7', 'x007', 'x8', 'x10']);
  assert.deepEqual(sorted(['n123456789012345678901', 'n123456789012345678900', 'n9']), ['n9', 'n123456789012345678900', 'n123456789012345678901']);
  assert.deepEqual(sorted(['10', '9', 'a', '1a']), ['1a', '9', '10', 'a']);
  assert.ok(naturalCompare('u0', 'u00') < 0 && naturalCompare('u00', 'u0') > 0);
});

test('mixed case: upper and lower case alike, the same name in two cases still in one order', () => {
  assert.deepEqual(sorted(['Counter', 'adder', 'Blink', 'clk_div']), ['adder', 'Blink', 'clk_div', 'Counter']);
  assert.deepEqual(sorted(['Stage_10', 'stage_2', 'STAGE_1']), ['STAGE_1', 'stage_2', 'Stage_10']);
  assert.equal(naturalCompare('Top', 'Top'), 0);
  assert.equal(Math.sign(naturalCompare('TOP', 'top')), -Math.sign(naturalCompare('top', 'TOP')));
  assert.notEqual(naturalCompare('TOP', 'top'), 0);
});

test('underscores and other characters: as localeCompare did, before the digits; a prefix before the longer name', () => {
  assert.deepEqual(sorted(['ab', 'a_b', 'a1', 'a']), ['a', 'a_b', 'a1', 'ab']);
  assert.deepEqual(sorted(['reg_10_q', 'reg_2_q', 'reg_2', 'reg__1']), ['reg__1', 'reg_2', 'reg_2_q', 'reg_10_q']);
  // (as localeCompare did: a file before its name's longer forms' .vhd, the separators before the digits)
  assert.deepEqual(sorted(['src/top.vhd', 'src/top_tb.vhd', 'src/top2.vhd']), ['src/top_tb.vhd', 'src/top.vhd', 'src/top2.vhd']);
  const old = ['src/top.vhd', 'src/top_tb.vhd', 'tb_top', 'top', 'a-b', 'a.b', 'a_b', 'A b'];
  assert.deepEqual(sorted(old), [...old].sort((a, b) => a.localeCompare(b, 'en')));
  assert.deepEqual(sorted(['src/b10.vhd', 'src/b2.vhd', 'src/a/z.vhd']), ['src/a/z.vhd', 'src/b2.vhd', 'src/b10.vhd']);
  assert.equal(naturalCompare('', ''), 0);
  assert.ok(naturalCompare('', 'a') < 0);
  assert.equal(naturalCompare(null, undefined), 0);
});

test('firstThenNatural: the top first (any case), then the natural order; no top: the natural order', () => {
  assert.deepEqual(['m_10', 'Top', 'm_2'].sort(firstThenNatural('top')), ['Top', 'm_2', 'm_10']);
  assert.deepEqual(['m_10', 'z', 'm_2'].sort(firstThenNatural(null)), ['m_2', 'm_10', 'z']);
  assert.deepEqual(['m_10', 'z', 'm_2'].sort(firstThenNatural('absent')), ['m_2', 'm_10', 'z']);
});

// an independent reference: the names as their tokens, a number (its digits, by value: BigInt) or one character ranked
// '_' first, then the digits, then the letters (lower case), compared in turn; the shorter one first
function reference(a, b) {
  const rank = ch => (ch === '_' ? 0 : /\d/.test(ch) ? 1 : 2 + ch.toLowerCase().charCodeAt(0));
  const tokens = s => (s.match(/\d+|\D/g) || []).map(c => (/^\d/.test(c) ? { n: BigInt(c), r: 1 } : { r: rank(c) }));
  const x = tokens(a), y = tokens(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i], q = y[i];
    if ('n' in p && 'n' in q) { if (p.n !== q.n) return p.n < q.n ? -1 : 1; continue; }
    if (p.r !== q.r) return p.r < q.r ? -1 : 1;
  }
  return Math.sign(x.length - y.length);
}

test('random names: the same order as the reference wherever the reference tells them apart; a total order', () => {
  let seed = 3819;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const alphabet = 'aAbB_z0129';
  const names = Array.from({ length: 400 }, () => Array.from({ length: 1 + rnd(8) }, () => alphabet[rnd(alphabet.length)]).join(''))
    .filter(s => !/(^|\D)0\d/.test(s));   // (no leading zeros: the reference has none)
  for (const a of names) for (const b of names) {
    const r = reference(a, b), c = Math.sign(naturalCompare(a, b));
    if (r !== 0) assert.equal(c, r, `${a} / ${b}`);
    assert.equal(c + Math.sign(naturalCompare(b, a)), 0, `${a} / ${b}: antisymmetric`);
    assert.equal(c === 0, a === b, `${a} / ${b}: 0 only for the same name`);
  }
  const s = sorted(names);
  for (let i = 1; i < s.length; i++) assert.ok(naturalCompare(s[i - 1], s[i]) <= 0);
});

// the MCP's project_info: the project's other files, and a design project's files, in the same order as the Files page
let tmp;
before(async () => { tmp = await scratchEnv('silinx-natural-order-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('#3819 project_info: the files in their natural order', async () => {
  const { handle } = await import('../server/mcp.js');
  const P = await import('../server/projects.js');
  let id = 0;
  const call = async (name, args) => {
    const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
    assert.equal(r.isError, false, r.content[0].text);
    return r.structuredContent;
  };
  await call('new_project_from_example', { name: 'nat', example: 'gates' });
  for (const n of [10, 2, 1]) fs.writeFileSync(path.join(P.projectDir('nat'), `note_${n}.txt`), 'x\n');
  const info = await call('project_info', { project: 'nat' });
  const notes = info.otherFiles.filter(f => /^note_/.test(f));
  assert.deepEqual(notes, ['note_1.txt', 'note_2.txt', 'note_10.txt']);
  assert.deepEqual(info.otherFiles, sorted(info.otherFiles));
});
