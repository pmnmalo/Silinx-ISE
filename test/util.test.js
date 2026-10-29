// core/util.js and web/js/wizard-util.js, the one copy of the small helpers several modules share (#1406): what each
// does, and that no module of core/ or web/js keeps a copy of its own (the look-alikes that differ named).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clone, hex2, lineStarts, isKw, isOp, tokenText, intOr } from '../core/util.js';
import { cleanLoc, portText, namedPages } from '../web/js/wizard-util.js';
import { tokenize } from '../core/verilog/lexer.js';
import { lex } from '../core/vhdl/lexer.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('#1406 clone: a deep copy, not the same objects', () => {
  const o = { a: [1, { b: 'x' }], c: null };
  const c = clone(o);
  assert.deepEqual(c, o);
  assert.notEqual(c.a, o.a);
  assert.notEqual(c.a[1], o.a[1]);
  assert.deepEqual(clone({ d: undefined, f: () => 1 }), {}, 'as JSON keeps it');
});

test('#1406 hex2, intOr, lineStarts', () => {
  assert.deepEqual([0, 9, 10, 171, 255].map(hex2), ['00', '09', '0A', 'AB', 'FF']);
  assert.deepEqual(['8', ' 12 ', '7.9', 'x', '', undefined, 3].map(v => intOr(v, -1)), [8, 12, 7, -1, -1, -1, 3]);
  assert.deepEqual(lineStarts('ab\ncd\n\ne'), [0, 3, 6, 7]);
  assert.deepEqual(lineStarts(''), [0]);
});

test('#1406 isKw / isOp (scopes.js\'s and quickfix.js\'s tokens: { k, v }), tokenText (the lexers\')', () => {
  assert.ok(isKw({ k: 'kw', v: 'assign' }, 'wire', 'assign'));
  assert.equal(isKw({ k: 'kw', v: 'assign' }, 'wire'), false);
  assert.equal(isKw({ k: 'op', v: 'assign' }, 'assign'), false);
  assert.ok(isOp({ k: 'op', v: '&' }, '&', '|'));
  assert.equal(isKw(undefined, 'x'), false);
  assert.equal(isOp(null, '&'), false);
  const vhdl = lex('signal s : bit_vector(3 downto 0) := "1010";\n', 'e.vhd', []).tokens;
  assert.equal(tokenText(vhdl, vhdl.find(t => t.type === 'str')), '"1010"');
  const vlog = tokenize("module m; assign y = 4'b1010; endmodule\n", 'm.v', []).tokens;
  assert.equal(tokenText(vlog, vlog.find(t => t.v === 'assign')), 'assign');
  assert.equal(tokenText([], vhdl[0]), undefined, 'no source on the array');
  assert.equal(tokenText(vhdl, {}), undefined, 'no offset');
});

test('#1406 cleanLoc / portText', () => {
  assert.deepEqual(['src', ' src/ ', 'hdl//', '', undefined, '/'].map(cleanLoc), ['src', 'src', 'hdl', 'src', 'src', 'src']);
  assert.equal(portText({ name: 'clk', width: 1 }), 'clk');
  assert.equal(portText({ name: 'count', width: '8' }), 'count [7:0]');
});

test('#1406 one copy: no module of core/ or web/js defines these helpers again', () => {
  const files = [...fs.readdirSync(path.join(ROOT, 'core'), { recursive: true }).map(f => `core/${f}`), ...fs.readdirSync(path.join(ROOT, 'web/js')).map(f => `web/js/${f}`)]
    .filter(f => f.endsWith('.js') && !/ \d\.js$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile());
  const COPY = /^(?:export )?(?:const|function) (clone|hex2|lineStarts|isKw|isOp|tokenText|cleanLoc|portText)\b/gm;
  // the ones that differ: the clipboard's clone keeps null as it is
  const DIFFERENT = new Set(['web/js/clipboard.js clone']);
  const found = files.flatMap(f => [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(COPY)].map(m => `${f} ${m[1]}`))
    .filter(x => !/^(core\/util\.js|web\/js\/wizard-util\.js) /.test(x) && !DIFFERENT.has(x));
  assert.deepEqual(found, []);
});

test('#2082 namedPages: opened by New Source, the name page left out, its checks made first by the next page', async () => {
  const calls = [];
  const name = { title: 'Name and Language', validate: async () => { calls.push('name'); return calls.length > 2 ? null : 'Name: bad.'; } };
  const io = { title: 'Inputs and Outputs', render: () => 'io', validate: () => { calls.push('io'); return null; } };
  const sum = { title: 'Summary' };
  const pages = [name, io, sum];
  assert.equal(namedPages(name, pages, false), pages);
  const [first, second, ...rest] = namedPages(name, pages, true);
  assert.deepEqual([first.title, second, rest], ['Inputs and Outputs', sum, []]);
  assert.equal(first.render, io.render);   // (no tail: the page as it is)
  assert.equal(await first.validate(), 'Name: bad.');   // the name's error, the page's own check not made
  assert.deepEqual(calls, ['name']);
  calls.push('x');
  assert.equal(await first.validate(), null);
  assert.deepEqual(calls, ['name', 'x', 'name', 'io']);
  // a first page with no checks of its own
  const [only] = namedPages(name, [name, sum], true);
  assert.equal(await only.validate(), null);
});
