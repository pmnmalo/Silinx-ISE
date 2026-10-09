// Pure helpers of the web UI: ISim time / value formatting and parsing (web/js/isim.js), the
// editor's language templates and instantiation templates (web/js/editor.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import * as V from '../core/values.js';
import { compile, elaborate } from '../core/compile.js';

const { fmtTime, parseTime, formatValue, parseValue } = await import('../web/js/isim.js');
const { SNIPPETS, instTemplate, typeText } = await import('../web/js/editor.js');

test('ISim time: format with the largest unit, parse with units and defaults', () => {
  assert.equal(fmtTime(0), '0 ns');
  assert.equal(fmtTime(500), '500 ps');
  assert.equal(fmtTime(1000), '1 ns');
  assert.equal(fmtTime(1_500_000), '1.5 us');
  assert.equal(fmtTime(2_000_000_000), '2 ms');
  assert.equal(fmtTime(1234567, 2), '1.23 us');
  assert.equal(fmtTime(-20000), '-20 ns');
  assert.equal(fmtTime(Infinity), '-');
  assert.equal(parseTime('100'), 100_000);
  assert.equal(parseTime('100', 'us'), 100_000_000);
  assert.equal(parseTime('1.5 us'), 1_500_000);
  assert.equal(parseTime('20ns'), 20_000);
  assert.equal(parseTime('3 ps'), 3);
  assert.equal(parseTime('2 ms'), 2_000_000_000);
  assert.equal(parseTime('1 s'), 1e12);
  assert.equal(parseTime('1e3 ps'), 1000);
  assert.ok(Number.isNaN(parseTime('soon')));
  for (const ps of [1, 999, 1000, 25_000, 1_000_000, 7_500_000_000]) assert.equal(parseTime(fmtTime(ps)), ps, `round trip ${ps}`);
});

const logic = (w, s = false) => ({ kind: 'logic', w, s });

test('ISim values: default radix per type, hex / octal / decimal / ASCII, X and Z digits', () => {
  const v8 = V.fromInt(0xa5, 8);
  assert.equal(formatValue(v8, logic(8)), 'A5');
  assert.equal(formatValue(v8, logic(8), 'bin'), '10100101');
  assert.equal(formatValue(v8, logic(8), 'oct'), '245');
  assert.equal(formatValue(v8, logic(8), 'udec'), '165');
  assert.equal(formatValue(V.fromInt(-2, 8), logic(8, true), 'sdec'), '-2');
  assert.equal(formatValue(V.fromInt(0x4869, 16), logic(16), 'ascii'), 'Hi');
  assert.equal(formatValue(V.ONE, logic(1)), '1');
  assert.equal(formatValue(V.fromBits('xxxx0001'), logic(8)), 'X1');
  assert.equal(formatValue(V.fromBits('zzzz'), logic(4)), 'Z');
  assert.equal(formatValue(V.fromInt(2, 2), { kind: 'enum', w: 2, names: ['IDLE', 'RUN', 'DONE'] }), 'DONE');
  assert.equal(formatValue(V.ONE, { kind: 'bool', w: 1 }), 'TRUE');
  assert.equal(formatValue(V.fromInt(-7, 32, true), { kind: 'int', w: 32, s: true }), '-7');
  assert.equal(formatValue(null, logic(1)), '');
  assert.equal(formatValue([V.ONE], logic(1)), '(array)');
});

test('ISim values: parse what the user types (force / set value) in every notation', () => {
  const t8 = logic(8);
  const hex = (v) => formatValue(v, t8, 'hex');
  assert.equal(hex(parseValue('10100101', t8)), 'A5');
  assert.equal(hex(parseValue('A5', t8, 'hex')), 'A5');
  assert.equal(hex(parseValue("8'hA5", t8)), 'A5');
  assert.equal(hex(parseValue("8'b1010_0101", t8)), 'A5');
  assert.equal(hex(parseValue('x"A5"', t8)), 'A5');
  assert.equal(hex(parseValue('"10100101"', t8)), 'A5');
  assert.equal(hex(parseValue('0xA5', t8)), 'A5');
  assert.equal(hex(parseValue('165', t8, 'udec')), 'A5');
  assert.equal(hex(parseValue('-91', logic(8, true), 'sdec')), 'A5');
  assert.equal(hex(parseValue('x', t8)), 'XX');
  assert.equal(hex(parseValue('z', t8)), 'ZZ');
  assert.equal(formatValue(parseValue('RUN', { kind: 'enum', w: 2, names: ['IDLE', 'RUN'] }), { kind: 'enum', w: 2, names: ['IDLE', 'RUN'] }), 'RUN');
  assert.equal(formatValue(parseValue('true', { kind: 'bool', w: 1 }), { kind: 'bool', w: 1 }), 'TRUE');
  assert.throws(() => parseValue('', t8), /empty/);
  assert.throws(() => parseValue('12G', t8, 'hex'), /invalid hex digit/);
  assert.throws(() => parseValue('1.5', t8, 'udec'), /invalid decimal/);
  // values wider than the signal are cut to its width
  assert.equal(hex(parseValue('1FF', t8, 'hex')), 'FF');
});

// a module as the app describes it (app.js compileProject: portList / paramList)
function moduleInfo(src, lang, name) {
  const lib = compile([{ path: `src/${name}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: src, role: 'design' }]);
  const m = [...lib.modules.values()].find((x) => x.name === name);
  return { name, lang, portList: m.ports.map((p) => ({ name: p.name, dir: p.dir, type: typeText(p.type, lang) })), paramList: m.params.filter((p) => !p.local).map((p) => p.name) };
}
const ALU_VHDL = `library ieee; use ieee.std_logic_1164.all;
entity alu is generic (N : integer := 4); port (a, b : in std_logic_vector(N-1 downto 0); op : in std_logic; y : out std_logic_vector(N-1 downto 0)); end alu;
architecture rtl of alu is begin y <= a and b when op = '0' else a or b; end rtl;
`;
const ALU_V = `module valu #(parameter N = 4) (input [N-1:0] a, input [N-1:0] b, input op, output [N-1:0] y);
  assign y = op ? (a | b) : (a & b);
endmodule
`;

test('instantiation templates (View HDL Instantiation Template, Instantiate module) compile in a parent design', () => {
  const mv = moduleInfo(ALU_VHDL, 'vhdl', 'alu');
  assert.deepEqual(mv.portList.map((p) => `${p.dir} ${p.name}: ${p.type}`.toLowerCase()), ['in a: std_logic_vector(n-1 downto 0)', 'in b: std_logic_vector(n-1 downto 0)', 'in op: std_logic', 'out y: std_logic_vector(n-1 downto 0)']);
  const vinst = instTemplate(mv, 'vhdl');
  assert.match(vinst, /^u_alu : entity work\.alu\n {2}generic map \(\n {4}N => N\n {2}\)/i);
  const parent = `library ieee; use ieee.std_logic_1164.all;
entity parent is end parent;
architecture a of parent is
  constant N : integer := 4;
  signal a, b, y : std_logic_vector(3 downto 0); signal op : std_logic;
begin
${vinst}
end a;
`;
  let lib = compile([{ path: 'src/alu.vhd', lang: 'vhdl', text: ALU_VHDL }, { path: 'src/parent.vhd', lang: 'vhdl', text: parent }]);
  let d = elaborate(lib, 'parent');
  assert.deepEqual([...lib.errors, ...d.diags].filter((x) => x.severity === 'error').map((x) => x.message), []);
  assert.deepEqual(d.top.children.map((c) => `${c.name}:${c.module}`), ['u_alu:alu']);
  // Verilog
  const mvl = moduleInfo(ALU_V, 'verilog', 'valu');
  const linst = instTemplate(mvl, 'verilog');
  assert.match(linst, /^valu #\(\n {2}\.N\(N\)\n\) u_valu \(/);
  const vparent = `module vparent; localparam N = 4; wire [3:0] a, b, y; wire op;\n${linst}\nendmodule\n`;
  lib = compile([{ path: 'src/valu.v', lang: 'verilog', text: ALU_V }, { path: 'src/vparent.v', lang: 'verilog', text: vparent }]);
  d = elaborate(lib, 'vparent');
  assert.deepEqual([...lib.errors, ...d.diags].filter((x) => x.severity === 'error').map((x) => x.message), []);
});

test('language templates: named, unique, with a cursor mark; the entity / module ones compile', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const names = SNIPPETS[lang].map((s) => s.name);
    assert.equal(new Set(names).size, names.length, `${lang} template names are unique`);
    for (const s of SNIPPETS[lang]) {
      assert.ok(s.name && s.text, `${lang} ${s.name}`);
      assert.ok(s.text.includes('$0'), `${lang} '${s.name}' places the cursor ($0)`);
    }
  }
  const fill = (text) => text.replace(/\$\{name\}/g, 'snip').replace(/\$0/g, '');
  const vhdl = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;\n${fill(SNIPPETS.vhdl.find((s) => s.name === 'entity').text).replace(/;\s*\n\s*\);/, '\n  );')}${fill(SNIPPETS.vhdl.find((s) => s.name === 'architecture').text)}`;
  let lib = compile([{ path: 'src/snip.vhd', lang: 'vhdl', text: vhdl }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, 'snip').diags].filter((x) => x.severity === 'error').map((x) => x.message), [], vhdl);
  const vlog = fill(SNIPPETS.verilog.find((s) => s.name === 'module').text).replace(/,\s*\n\s*\n\);/, '\n);');
  lib = compile([{ path: 'src/snip.v', lang: 'verilog', text: vlog }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, 'snip').diags].filter((x) => x.severity === 'error').map((x) => x.message), [], vlog);
  // a clocked FSM template inside a module body
  const fsm = SNIPPETS.verilog.find((s) => s.name === 'FSM (localparam + 2 always)').text.replace('$0', 'if (start) next_state = RUN;');
  lib = compile([{ path: 'src/f.v', lang: 'verilog', text: `module f(input clk, input rst, input start);\n${fsm}\nendmodule\n` }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, 'f').diags].filter((x) => x.severity === 'error').map((x) => x.message), []);
});
