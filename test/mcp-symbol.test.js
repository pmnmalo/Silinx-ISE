// The MCP server's read_symbol, edit_symbol and update_symbols (server/mcp-symbol.js, #3755): a module's symbol as the
// Symbol Editor shows and edits it (its file beside the module's source, made when it has none), with its checks and
// messages; a schematic's instance of it out of date then, update_symbols drawing it with the new symbol, its
// connections and its HDL kept.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-symbol-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, re) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.match(r.text, re); };

const REG = `library ieee; use ieee.std_logic_1164.all;
entity reg1 is port (D, CE, C : in std_logic; Q : out std_logic); end reg1;
architecture rtl of reg1 is begin
  process (C) begin if rising_edge(C) then if CE = '1' then Q <= D; end if; end if; end process;
end rtl;
`;
// the schematic: an instance of reg1 (its ports as the project reads them, in lower case; its default symbol: D, CE, C on the left, Q on the right) wired to 4 markers
function schematic() {
  const pin = { D: [200, 120], CE: [200, 140], C: [200, 160], Q: [320, 120] };
  const ports = Object.entries(pin).map(([n, [x, y]]) => ({ id: `P${n}`, name: `n_${n.toLowerCase()}`, dir: n === 'Q' ? 'out' : 'in', width: 1, x: n === 'Q' ? x + 60 : x - 60, y }));
  const wires = Object.entries(pin).map(([n, [x, y]]) => ({ id: `W${n}`, points: [{ x, y }, { x: n === 'Q' ? x + 60 : x - 60, y }] }));
  return { version: 4, name: 'top', lang: 'vhdl', generatedFile: 'src/top.vhd', sheet: { w: 1700, h: 1100 },
    symbols: [{ id: 'S1', type: 'module', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { module: 'reg1', generics: {}, ports: ['d', 'ce', 'c', 'q'].map(n => ({ name: n, dir: n === 'q' ? 'out' : 'in', width: 1 })) } }],
    wires, ports, labels: [] };
}

test('read_symbol / edit_symbol / update_symbols: the default symbol, edited and saved; an instance updated, its connections and HDL kept', async () => {
  await ok('new_project', { name: 's' });
  await ok('write_file', { project: 's', path: 'src/reg1.vhd', text: REG });
  let r = await ok('read_symbol', { project: 's', module: 'REG1' });
  assert.equal(r.text, 'reg1: the default symbol (no symbol file): left: d, ce, c; right: q; spacing 20, width auto, height auto, name top');
  assert.equal(r.data.file, null);
  assert.deepEqual(r.data.symbol.pins, [{ name: 'd', side: 'W', dir: 'in', width: 1 }, { name: 'ce', side: 'W', dir: 'in', width: 1 }, { name: 'c', side: 'W', dir: 'in', width: 1 }, { name: 'q', side: 'E', dir: 'out', width: 1 }]);
  // (its HDL file in the project first, made again from the drawing when it is written)
  await ok('write_file', { project: 's', path: 'src/top.vhd', text: 'entity top is end top;\narchitecture a of top is begin end a;\n' });
  await ok('write_file', { project: 's', path: 'src/top.sch.json', text: JSON.stringify(schematic()) });
  const hdl0 = (await ok('read_file', { project: 's', path: 'src/top.vhd' })).text;
  r = await ok('update_symbols', { project: 's', path: 'src/top.sch.json' });
  assert.equal(r.text, 'src/top.sch.json: no symbol out of date');

  // the clock to the bottom, Q first on the left, CE on the right, the spacing 30
  r = await ok('edit_symbol', { project: 's', module: 'reg1', pins: [{ name: 'c', side: 'S' }, { name: 'Q', side: 'W' }, { name: 'CE', side: 'E' }], spacing: 30 });
  assert.equal(r.text, 'src/reg1.sym.json: the symbol of module \'reg1\' saved: left: q, d; right: ce; bottom: c; spacing 30, width auto, height auto, name top');
  const file = JSON.parse((await ok('read_file', { project: 's', path: 'src/reg1.sym.json' })).text);
  assert.deepEqual(file, { version: 1, kind: 'symbol', module: 'reg1', pins: [{ name: 'c', side: 'S' }, { name: 'q', side: 'W' }, { name: 'ce', side: 'E' }, { name: 'd', side: 'W' }], spacing: 30, width: null, height: null, title: 'top' });
  r = await ok('read_symbol', { project: 's', module: 'reg1' });
  assert.equal(r.data.file, 'src/reg1.sym.json');
  assert.match(r.text, /^reg1: its symbol src\/reg1\.sym\.json: left: q, d; right: ce; bottom: c;/);

  // the schematic's instance out of date, then updated: its pins moved, the wires following them
  r = await ok('update_symbols', { project: 's', path: 'src/top.sch.json' });
  assert.equal(r.text.split('\n')[0], 'Symbol updated (U1), its connections kept');
  assert.deepEqual(r.data.updated, ['U1']);
  const doc = JSON.parse((await ok('read_file', { project: 's', path: 'src/top.sch.json' })).text);
  assert.deepEqual(doc.symbols[0].params.ports.map(q => `${q.name}:${q.side}`), ['c:S', 'q:W', 'ce:E', 'd:W']);
  assert.deepEqual(doc.symbols[0].params.layout, { spacing: 30, width: null, height: null, title: 'top' });
  assert.equal((await ok('update_symbols', { project: 's', path: 'src/top.sch.json' })).text, 'src/top.sch.json: no symbol out of date');
  assert.equal((await ok('read_file', { project: 's', path: 'src/top.vhd' })).text, hdl0, 'its HDL the same');

  // Reset to Default
  r = await ok('edit_symbol', { project: 's', module: 'reg1', reset: true });
  assert.match(r.text, /left: d, ce, c; right: q; spacing 20/);
});

test('edit_symbol: its checks (a pin not a port, a pin twice, a spacing or size out of range, no module), nothing written', async () => {
  await ok('new_project', { name: 'e' });
  await ok('write_file', { project: 'e', path: 'src/reg1.vhd', text: REG });
  await fails('edit_symbol', { project: 'e', module: 'reg1', pins: [{ name: 'X' }] }, /^edit_symbol: module 'reg1' has no port 'X'$/);
  await fails('edit_symbol', { project: 'e', module: 'reg1', pins: [{ name: 'D' }, { name: 'd' }] }, /^edit_symbol: pin d given twice$/);
  await fails('edit_symbol', { project: 'e', module: 'reg1', spacing: 25 }, /^edit_symbol: spacing 25: a multiple of 10 from 20 to 100$/);
  await fails('edit_symbol', { project: 'e', module: 'reg1', width: 5000 }, /^edit_symbol: width 5000: from 40 to 2000$/);
  await fails('edit_symbol', { project: 'e', module: 'reg1', pins: [{ name: 'D', side: 'X' }] }, /side: one of W, E, N, S/);
  await fails('read_symbol', { project: 'e', module: 'nobody' }, /^read_symbol: no module 'nobody' in the project's sources$/);
  await fails('update_symbols', { project: 'e', path: 'src/reg1.vhd' }, /not a schematic/);
  const tree = (await ok('project_info', { project: 'e' })).text;
  assert.doesNotMatch(tree, /sym\.json/, 'no symbol file written');
});

test('place_instance: a 4-bit register from a 1-bit one, reg(3:0), its pins on named nets; its HDL the 4 copies; the errors said', async () => {
  await ok('new_project', { name: 'a' });
  await ok('write_file', { project: 'a', path: 'src/reg1.vhd', text: REG });
  await ok('write_file', { project: 'a', path: 'src/top.vhd', text: 'entity top is end top;\narchitecture a of top is begin end a;\n' });
  // the schematic: its I/O markers alone (the instance's nets join them by name)
  const marker = (id, n, dir, width, y) => ({ id, name: n, dir, width, x: dir === 'in' ? 100 : 700, y });
  const doc = { version: 4, name: 'top', lang: 'vhdl', generatedFile: 'src/top.vhd', sheet: { w: 1700, h: 1100 }, symbols: [], wires: [], labels: [],
    ports: [marker('P1', 'd', 'in', 4, 100), marker('P2', 'ce', 'in', 1, 200), marker('P3', 'clk', 'in', 1, 300), marker('P4', 'q', 'out', 4, 100)] };
  await ok('write_file', { project: 'a', path: 'src/top.sch.json', text: JSON.stringify(doc) });
  const r = await ok('place_instance', { project: 'a', path: 'src/top.sch.json', module: 'reg1', name: 'reg(3:0)', x: 300, y: 200, connect: { d: 'd', ce: 'ce', c: 'clk', q: 'q' } });
  assert.deepEqual(r.text.split('\n'), ['src/top.sch.json: reg(3:0) (reg1, 4 copies) placed at 300, 200', 'src/top.vhd updated from src/top.sch.json']);
  assert.deepEqual(r.data.diagnostics, []);
  const hdl = (await ok('read_file', { project: 'a', path: 'src/top.vhd' })).text;
  assert.deepEqual(hdl.match(/reg_\d : entity work\.reg1/g), ['reg_3 : entity work.reg1', 'reg_2 : entity work.reg1', 'reg_1 : entity work.reg1', 'reg_0 : entity work.reg1']);
  assert.match(hdl, /d => d\(2\),\n {6}ce => ce,\n {6}c => clk,\n {6}q => q\(2\)/);
  const syn = await ok('check_syntax', { project: 'a', top: 'top' });
  assert.doesNotMatch(syn.text, /ERROR|WARNING/);
  // a second one, its output on a 1-bit net (the 1-bit marker ce's): the error said; a name not a name, a pin not a port: refused
  const e = await ok('place_instance', { project: 'a', path: 'src/top.sch.json', module: 'reg1', name: 'r(1:0)', x: 300, y: 500, connect: { q: 'ce' } });
  assert.match(e.text, /\nERROR: r\(1:0\): output q of its 2 copies drives the 1-bit net 'ce': connect it to a 2-bit bus\n/);
  await fails('place_instance', { project: 'a', path: 'src/top.sch.json', module: 'reg1', name: 'r(1:', x: 0, y: 0 }, /is not a valid name/);
  await fails('place_instance', { project: 'a', path: 'src/top.sch.json', module: 'reg1', x: 0, y: 0, connect: { z: 'a' } }, /module 'reg1' has no port 'z'/);
  await fails('place_instance', { project: 'a', path: 'src/top.sch.json', module: 'nobody', x: 0, y: 0 }, /no module 'nobody'/);
});

test('#3829 rename_module: its symbol file renamed with it, the module\'s name in it; the instances keep their layout', async () => {
  await ok('new_project', { name: 'r' });
  await ok('write_file', { project: 'r', path: 'src/reg1.vhd', text: REG });
  await ok('write_file', { project: 'r', path: 'src/top.vhd', text: 'entity top is end top;\narchitecture a of top is begin end a;\n' });
  await ok('write_file', { project: 'r', path: 'src/top.sch.json', text: JSON.stringify(schematic()) });
  await ok('edit_symbol', { project: 'r', module: 'reg1', pins: [{ name: 'c', side: 'S' }, { name: 'Q', side: 'W' }], spacing: 30 });
  assert.equal((await ok('update_symbols', { project: 'r', path: 'src/top.sch.json' })).data.updated[0], 'U1');
  const hdl0 = (await ok('read_file', { project: 'r', path: 'src/top.vhd' })).text;
  const r = await ok('rename_module', { project: 'r', module: 'reg1', to: 'bit_reg' });
  assert.equal(r.text.split('\n')[0], 'Rename: module \'reg1\' renamed to \'bit_reg\' (4 file(s) updated); src/reg1.vhd → src/bit_reg.vhd; src/reg1.sym.json → src/bit_reg.sym.json.');
  assert.deepEqual(r.data.moved, [{ from: 'src/reg1.vhd', to: 'src/bit_reg.vhd' }, { from: 'src/reg1.sym.json', to: 'src/bit_reg.sym.json' }]);
  const tree = (await ok('project_info', { project: 'r' })).text;
  assert.doesNotMatch(tree, /reg1\.sym\.json/);
  const file = JSON.parse((await ok('read_file', { project: 'r', path: 'src/bit_reg.sym.json' })).text);
  assert.deepEqual(file, { version: 1, kind: 'symbol', module: 'bit_reg', pins: [{ name: 'c', side: 'S' }, { name: 'q', side: 'W' }, { name: 'd', side: 'W' }, { name: 'ce', side: 'W' }], spacing: 30, width: null, height: null, title: 'top' });
  assert.match((await ok('read_symbol', { project: 'r', module: 'bit_reg' })).text, /^bit_reg: its symbol src\/bit_reg\.sym\.json: left: q, d, ce; bottom: c; spacing 30/);
  // the instance: its module the new name, its layout the symbol's, nothing out of date; its HDL the same but the name
  assert.equal((await ok('update_symbols', { project: 'r', path: 'src/top.sch.json' })).text, 'src/top.sch.json: no symbol out of date');
  const doc = JSON.parse((await ok('read_file', { project: 'r', path: 'src/top.sch.json' })).text);
  assert.deepEqual([doc.symbols[0].params.module, doc.symbols[0].params.ports.map(q => `${q.name}:${q.side}`)], ['bit_reg', ['c:S', 'q:W', 'd:W', 'ce:W']]);
  assert.equal((await ok('read_file', { project: 'r', path: 'src/top.vhd' })).text, hdl0.replace(/\breg1\b/g, 'bit_reg'));
  const syn = await ok('check_syntax', { project: 'r', top: 'top' });
  assert.doesNotMatch(syn.text, /ERROR|WARNING/);
  // the file kept (file: keep): the symbol file still named after the module, beside it
  const k = await ok('rename_module', { project: 'r', module: 'bit_reg', to: 'r1', file: 'keep' });
  assert.deepEqual(k.data.moved, [{ from: 'src/bit_reg.sym.json', to: 'src/r1.sym.json' }]);
  assert.equal(JSON.parse((await ok('read_file', { project: 'r', path: 'src/r1.sym.json' })).text).module, 'r1');
});
