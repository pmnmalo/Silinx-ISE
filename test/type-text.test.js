// The text of a declared type and a test bench's unit under test (#2674: core/type-text.js out of web/js/editor.js,
// core/uut-info.js out of web/js/new-source.js, moved as they were, so that the server writes them too), on the
// examples' modules (traffic's timer in VHDL, blinky's prescaler in Verilog) and on types of each kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../core/compile.js';
import { exprShort, typeText } from '../core/type-text.js';
import { uutInfo } from '../core/uut-info.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulesOf = srcs => [...compile(srcs).modules.values()];
const portsText = (text, lang) => modulesOf([{ path: lang === 'vhdl' ? 'a.vhd' : 'a.v', lang, text }])[0].ports.map(p => typeText(p.type, lang));

test('typeText: logic, signed, integer ranges, named and enumerated types, in VHDL and in Verilog', () => {
  assert.deepEqual(portsText('library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;\nentity a is port (x : in std_logic; v : in std_logic_vector(7 downto 0); s : out signed(3 downto 0); n : in integer range 0 to 9); end;\narchitecture r of a is begin end;\n', 'vhdl'),
    ['std_logic', 'std_logic_vector(7 downto 0)', 'signed(3 downto 0)', 'integer range 0 to 9']);
  assert.deepEqual(portsText('module a(input x, input [7:0] v, output signed [3:0] s);\nendmodule\n', 'verilog'), ['1 bit', '[7:0]', 'signed [3:0]']);
  assert.equal(typeText(null, 'vhdl'), '');
  assert.equal(typeText({ kind: 'enum', values: ['IDLE', 'RUN'] }, 'vhdl'), '(IDLE, RUN)');
  assert.equal(typeText({ kind: 'named', name: 'word' }, 'vhdl'), 'word');
  assert.equal(exprShort({ op: 'binary', o: '-', a: { op: 'ref', name: 'W' }, b: { op: 'int', value: '1' } }), 'W-1');
  assert.equal(exprShort(null), '?');
});

test('uutInfo: the ports (width, bits, VHDL type) and the parameters of the examples\' modules', () => {
  const srcs = [{ path: 'src/timer.vhd', lang: 'vhdl', text: fs.readFileSync(path.join(ROOT, 'examples/traffic/src/timer.vhd'), 'utf8') },
    { path: 'src/counter.v', lang: 'verilog', text: fs.readFileSync(path.join(ROOT, 'examples/blinky/src/counter.v'), 'utf8') }];
  const [timer, prescaler] = modulesOf(srcs).map(m => uutInfo({ name: m.name, lang: m.lang, mod: m }));
  assert.deepEqual(timer, { name: 'timer', lang: 'vhdl', params: [{ name: 'tick', default: '50000000' }], ports: [
    { name: 'clk', dir: 'in', width: 1, msb: 0, lsb: 0, vhdlType: 'std_logic' }, { name: 'rst', dir: 'in', width: 1, msb: 0, lsb: 0, vhdlType: 'std_logic' },
    { name: 'phase', dir: 'in', width: 3, msb: 2, lsb: 0, vhdlType: 'std_logic_vector(2 downto 0)' }, { name: 'done', dir: 'out', width: 1, msb: 0, lsb: 0, vhdlType: 'std_logic' },
    { name: 'blink', dir: 'out', width: 1, msb: 0, lsb: 0, vhdlType: 'std_logic' }, { name: 'left', dir: 'out', width: 4, msb: 3, lsb: 0, vhdlType: 'std_logic_vector(3 downto 0)' }] });
  assert.deepEqual(prescaler, { name: 'prescaler', lang: 'verilog', params: [{ name: 'DIV', default: '25000000' }], ports: [
    { name: 'clk', dir: 'in', width: 1, msb: 0, lsb: 0, vhdlType: 'std_logic' }, { name: 'rst', dir: 'in', width: 1, msb: 0, lsb: 0, vhdlType: 'std_logic' },
    { name: 'tick', dir: 'out', width: 1, msb: 0, lsb: 0, vhdlType: 'std_logic' }] });
});

test('web/js/editor.js still exports typeText (from core), and new-source.js takes uutInfo from core', () => {
  const editor = fs.readFileSync(path.join(ROOT, 'web/js/editor.js'), 'utf8');
  assert.match(editor, /^import \{ exprShort, typeText \} from '\/core\/type-text\.js';$/m);
  assert.match(editor, /^export \{ typeText \};$/m);
  assert.doesNotMatch(editor, /^export function typeText/m);
  assert.match(fs.readFileSync(path.join(ROOT, 'web/js/new-source.js'), 'utf8'), /^import \{ uutInfo \} from '\/core\/uut-info\.js';$/m);
});
