// simulate_drawing of a schematic (server/mcp-simulate-schematic.js, #3827, #2674): Try it's live simulation through the
// MCP server, a 4-bit register made from a 1-bit one (reg(3:0), place_instance) in VHDL and in Verilog: per cycle its
// inputs set and its clock cycled, its output and the arrayed instance's pins (its copies' values side by side, the
// clock and the enable shared) read, as core/schlive.js reads them; no warnings; a schematic that cannot be simulated.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-simsch-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

const REG = {
  vhdl: ['src/reg1.vhd', 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity reg1 is\n  port (d, ce, c : in std_logic; q : out std_logic);\nend entity reg1;\n\narchitecture rtl of reg1 is\nbegin\n  process (c) begin\n    if rising_edge(c) then\n      if ce = \'1\' then q <= d; end if;\n    end if;\n  end process;\nend architecture rtl;\n'],
  verilog: ['src/reg1.v', 'module reg1 (input d, input ce, input c, output reg q);\n  always @(posedge c) if (ce) q <= d;\nendmodule\n'],
};
const TOP = { vhdl: ['src/top.vhd', 'entity top is end top;\narchitecture a of top is begin end a;\n'], verilog: ['src/top.v', 'module top;\nendmodule\n'] };

async function project(name, lang) {
  await ok('new_project', { name });
  await ok('write_file', { project: name, path: REG[lang][0], text: REG[lang][1] });
  await ok('write_file', { project: name, path: TOP[lang][0], text: TOP[lang][1] });
  const marker = (mid, n, dir, width, y) => ({ id: mid, name: n, dir, width, x: dir === 'in' ? 100 : 700, y });
  const doc = { version: 4, name: 'top', lang, generatedFile: TOP[lang][0], sheet: { w: 1700, h: 1100 }, symbols: [], wires: [], labels: [],
    ports: [marker('P1', 'd', 'in', 4, 100), marker('P2', 'ce', 'in', 1, 200), marker('P3', 'clk', 'in', 1, 300), marker('P4', 'q', 'out', 4, 100)] };
  await ok('write_file', { project: name, path: 'src/top.sch.json', text: JSON.stringify(doc) });
  await ok('place_instance', { project: name, path: 'src/top.sch.json', module: 'reg1', name: 'reg(3:0)', x: 300, y: 200, connect: { d: 'd', ce: 'ce', c: 'clk', q: 'q' } });
}

for (const lang of ['vhdl', 'verilog']) {
  test(`#3827 simulate_drawing (${lang}): a schematic's reg(3:0) cycle by cycle, its pins its copies' values side by side`, async () => {
    const name = `s${lang}`;
    await project(name, lang);
    const r = await ok('simulate_drawing', { project: name, file: 'src/top.sch.json', cycles: [{}, { d: 6, ce: 1 }, { d: '1001' }, { d: 3, ce: 1 }] });
    assert.deepEqual(r.text.split('\n'), [
      'top.sch.json: 4 clock cycle(s) of clk:',
      'cycle 0: inputs d=0000 ce=0; outputs q=xxxx; reg(3:0): d=0000 ce=0 c=0 q=xxxx',
      'cycle 1: inputs d=0110 ce=1; outputs q=0110; reg(3:0): d=0110 ce=1 c=0 q=0110',
      'cycle 2: inputs d=1001 ce=0; outputs q=0110; reg(3:0): d=1001 ce=0 c=0 q=0110',
      'cycle 3: inputs d=0011 ce=1; outputs q=0011; reg(3:0): d=0011 ce=1 c=0 q=0011',
    ]);
    assert.deepEqual(r.data.warnings, []);
    assert.equal(r.data.kind, 'schematic');
    assert.deepEqual(r.data.cycles[1], { cycle: 1, inputs: { d: 6, ce: 1 }, outputs: { q: '0110' }, instances: { 'reg(3:0)': { d: '0110', ce: '1', c: '0', q: '0110' } } });
  });
}

test('#3827 simulate_drawing of a schematic: its inputs checked, a schematic with an error not simulated', async () => {
  await project('e', 'vhdl');
  const no = await call('simulate_drawing', { project: 'e', file: 'src/top.sch.json', cycles: [{ clk: 1 }] });
  assert.equal(no.isError, true);
  assert.equal(no.text, "simulate_drawing: cycle 0: 'clk' is not an input (the inputs: d, ce)");
  // the register's source broken: why it cannot be simulated
  await ok('write_file', { project: 'e', path: 'src/reg1.vhd', text: REG.vhdl[1].replace('q <= d;', 'q <= ;') });
  const bad = await call('simulate_drawing', { project: 'e', file: 'src/top.sch.json', cycles: [{}] });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /^simulate_drawing: The schematic cannot be simulated:\nERROR: src\/reg1\.vhd:\d+: /);
});
