// export_project / import_project of a schematic with an arrayed instance and a module's symbol of its own (#3828,
// #2674): a 4-bit register from a 1-bit one (place_instance reg(3:0)), its module's symbol edited (edit_symbol: Q on
// the left, D on the top, the clock at the bottom) and the instance updated, exported as a Xilinx ISE project (its .sch,
// the module's .sym with the pins on their sides; no .sym.json) and imported back: the instance arrayed, drawn with the
// symbol, the module's .sym.json made from the .sym, nothing out of date, Check Syntax clean; and no warnings.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-ise-array-'));
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const { readZip } = await import('../core/zip.js');
const { NODE_CODEC } = await import('../server/impl-routes.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const out = f => path.join(tmp, 'exchange', f);

const REG = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity reg1 is\n  port (d, ce, c : in std_logic; q : out std_logic);\nend entity reg1;\n\narchitecture rtl of reg1 is\nbegin\n  process (c) begin\n    if rising_edge(c) then\n      if ce = \'1\' then q <= d; end if;\n    end if;\n  end process;\nend architecture rtl;\n';

test('#3828 export_project / import_project: reg(3:0) with its module\'s symbol of its own, to ISE and back', async () => {
  await ok('new_project', { name: 'arr' });
  await ok('write_file', { project: 'arr', path: 'src/reg1.vhd', text: REG });
  await ok('write_file', { project: 'arr', path: 'src/top.vhd', text: 'entity top is end top;\narchitecture a of top is begin end a;\n' });
  const marker = (mid, n, dir, width, x, y) => ({ id: mid, name: n, dir, width, x, y });
  const doc = { version: 4, name: 'top', lang: 'vhdl', generatedFile: 'src/top.vhd', sheet: { w: 1700, h: 1100 }, symbols: [], wires: [], labels: [],
    ports: [marker('P1', 'd', 'in', 4, 100, 100), marker('P2', 'ce', 'in', 1, 100, 200), marker('P3', 'clk', 'in', 1, 100, 300), marker('P4', 'q', 'out', 4, 700, 100)] };
  await ok('write_file', { project: 'arr', path: 'src/top.sch.json', text: JSON.stringify(doc) });
  await ok('edit_symbol', { project: 'arr', module: 'reg1', pins: [{ name: 'q', side: 'W' }, { name: 'ce', side: 'W' }, { name: 'd', side: 'N' }, { name: 'c', side: 'S' }] });
  await ok('place_instance', { project: 'arr', path: 'src/top.sch.json', module: 'reg1', name: 'reg(3:0)', x: 300, y: 200, connect: { d: 'd', ce: 'ce', c: 'clk', q: 'q' } });
  await ok('set_top', { project: 'arr', top: 'top' });
  await ok('write_file', { project: 'arr', path: 'constraints/top.ucf', text: '# no pins yet\n' });
  assert.doesNotMatch((await ok('check_syntax', { project: 'arr' })).text, /ERROR|WARNING/);

  // to ISE: the schematic and the module's .sym (its pins on their sides), no Silinx-only file
  const x = await ok('export_project', { project: 'arr', path: out('arr.zip') });
  const entries = await readZip(fs.readFileSync(out('arr.zip')), NODE_CODEC);
  assert.deepEqual(entries.map(e => e.path).sort(), ['arr.xise', 'constraints/top.ucf', 'src/reg1.sym', 'src/reg1.vhd', 'src/top.sch', 'src/top.vhd']);
  assert.deepEqual(x.data.warnings, ["src/top.sch: 'reg1': project module — ISE uses its HDL source and the reg1.sym symbol (or regenerate it with Create Schematic Symbol)"]);
  const text = name => new TextDecoder().decode(entries.find(e => e.path === name).data);
  assert.match(text('src/top.sch'), /<block symbolname="reg1" name="reg\(3:0\)">/);
  assert.match(text('src/reg1.sym'), /<pin polarity="Input" x="\d+" y="-\d+" name="d" \/>/);

  // and back: arrayed, drawn with the symbol, its .sym.json made, nothing out of date
  const i = await ok('import_project', { name: 'arr_x', from: out('arr.zip') });
  assert.deepEqual([i.data.kind, i.data.missing, i.data.warnings], ['xilinx', [], []]);
  const sym = JSON.parse((await ok('read_file', { project: 'arr_x', path: 'src/reg1.sym.json' })).text);
  assert.deepEqual(sym.pins, [{ name: 'q', side: 'W' }, { name: 'ce', side: 'W' }, { name: 'd', side: 'N' }, { name: 'c', side: 'S' }]);
  const back = JSON.parse((await ok('read_file', { project: 'arr_x', path: 'src/top.sch.json' })).text);
  const s = back.symbols.find(q => q.type === 'module');
  assert.deepEqual([s.name, s.params.ports.map(q => `${q.name}:${q.side}`)], ['reg(3:0)', ['q:W', 'ce:W', 'd:N', 'c:S']]);
  assert.equal((await ok('update_symbols', { project: 'arr_x', path: 'src/top.sch.json' })).text, 'src/top.sch.json: no symbol out of date');
  const hdl = (await ok('read_file', { project: 'arr_x', path: 'src/top.vhd' })).text;
  assert.deepEqual(hdl.match(/reg_\d : entity work\.reg1/g), ['reg_3 : entity work.reg1', 'reg_2 : entity work.reg1', 'reg_1 : entity work.reg1', 'reg_0 : entity work.reg1']);
  assert.doesNotMatch((await ok('check_syntax', { project: 'arr_x' })).text, /ERROR|WARNING/);
});
