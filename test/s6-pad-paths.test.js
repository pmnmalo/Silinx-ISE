// #3152: on the Spartan-6, a port without a LOC takes a pad whose I/O path the bit database knows (fpga/s6/pad-paths.js).
// nextpnr's chip database leaves out the PIPs whose bits Silinx does not know: the slave OLOGIC2's D1 -> OQ
// route-through of the top bank's TIOI_INNER tiles (the master's known), so 30 of the XC6SLX16's pads (23 of the
// XC6SLX45's) take no output. The placer gave them to outputs without a LOC, and nextpnr failed on every seed:
// "Failed to route arc 0.0 of net …, from X6Y4/L_AQ to X5Y0/TIOB_O3_PINW" (the pad A2).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { s6Device, s6Phys, s6Verilog, NEXYS3_LD, NEXYS3_SW } from './s6-lib.mjs';
import { loadBitDbS6 } from '../packages/silinx-fpga/src/fpga/s6/bitdb-node.js';
import { padPathsS6, padFits } from '../packages/silinx-fpga/src/fpga/s6/pad-paths.js';
import { placeS6 } from '../packages/silinx-fpga/src/fpga/s6/place.js';
import { checkPlacementS6 } from '../packages/silinx-fpga/src/fpga/s6/place-check.js';

const paths = part => { const { device, sites } = s6Device(part); return { sites, paths: padPathsS6(device, loadBitDbS6(part), sites) }; };
const without = (m, d) => [...m].filter(([, v]) => !v[d]).map(([n]) => n).sort();

describe('the Spartan-6 pads\' known I/O paths (#3152)', () => {
  test('XC6SLX16: 30 top-bank pads take no output (their slave OLOGIC2\'s D1 -> OQ unknown), 4 no input', () => {
    const { sites, paths: m } = paths('xc6slx16csg324-3');
    assert.equal(m.size, sites.pads.size);
    const out = without(m, 'out');
    assert.deepEqual(out, ['A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9',
      'C11', 'C12', 'C14', 'C4', 'C6', 'C8', 'C9', 'E11', 'E12', 'E13', 'E6', 'E8', 'F10', 'F8', 'F9']);
    assert.ok(out.every(p => /^TIOB/.test(sites.pads.get(p).tile) && sites.pads.get(p).bank === 0));
    assert.deepEqual(without(m, 'in'), ['F9', 'G9', 'U11', 'V11']);
    // (the Nexys3's switches and LEDs: both ways)
    assert.ok([...NEXYS3_SW, ...NEXYS3_LD].every(p => m.get(p).in && m.get(p).out));
  });

  test('XC6SLX45: 23 top-bank pads take no output, 4 no input', () => {
    const { paths: m } = paths('xc6slx45csg324-3');
    assert.deepEqual(without(m, 'out'), ['A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8',
      'A9', 'C11', 'C14', 'C4', 'C6', 'C8', 'C9', 'E13', 'F9']);
    assert.deepEqual(without(m, 'in'), ['F9', 'G9', 'R7', 'T7']);
  });

  test('padFits: an output needs the O path, an input the I path, a bidirectional port both; no paths: every pad', () => {
    const m = new Map([['A2', { in: true, out: false }], ['G9', { in: false, out: true }], ['F9', { in: false, out: false }], ['T10', { in: true, out: true }]]);
    assert.deepEqual(['in', 'out', 'inout'].map(d => ['A2', 'G9', 'F9', 'T10'].map(p => padFits(m, p, d))),
      [[true, false, false, true], [false, true, false, true], [false, false, false, true]]);
    assert.equal(padFits(null, 'A2', 'out'), true);
    assert.equal(padFits(m, 'B1', 'out'), true);   // (a pad the map has not)
  });

  test('the placer gives the ports without a LOC pads with their path only, on every seed; a LOC is kept', async () => {
    const part = 'xc6slx16csg324-3', { sites, paths: m } = paths(part);
    const d = s6Phys(await s6Verilog('module m(input clk, input [31:0] d, output reg [63:0] q); always @(posedge clk) q <= {q[31:0], d}; endmodule'),
      'NET "clk" LOC = "V10";\nNET "q<0>" LOC = "A2";');
    for (let seed = 1; seed <= 8; seed++) {
      const r = placeS6(d.phys, sites, { seed, effort: 0, timing: 0, padPaths: m });
      assert.deepEqual(checkPlacementS6(d.phys, sites, r), []);
      const iobs = d.phys.insts.map((inst, i) => [inst, r.site[i]]).filter(([inst]) => inst.kind === 'iob');
      assert.equal(iobs.length, 97);
      for (const [inst, pad] of iobs) if (!inst.loc) assert.ok(padFits(m, pad, inst.dir), `seed ${seed}: ${inst.name} (${inst.dir}) on ${pad}`);
      assert.equal(r.site[d.phys.insts.findIndex(i => i.port === 'q<0>')], 'A2');
    }
    // (without the paths, as before: a seed puts an output on such a pad)
    const r = placeS6(d.phys, sites, { seed: 1, effort: 0, timing: 0 });
    assert.ok(d.phys.insts.some((inst, i) => inst.kind === 'iob' && !inst.loc && !padFits(m, r.site[i], inst.dir)));
  });
});

// the flow: a design of 64 outputs and one input without a LOC, the clock's alone LOC'd, routed by nextpnr on every
// seed and its bitstream written, in Verilog and in VHDL, on the Nexys3's and the Atlys's parts (no board: a board's
// ports need their LOC). The placer's seed: the first whose placement, without the paths, put outputs on such pads (on
// the XC6SLX45 seed 1's kept them off: q<52> on C6, q<53> on A3 … with seed 2).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-s6-pads-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
const SOURCES = {
  verilog: ['top.v', 'module top(input clk, input d, output reg [63:0] q);\n  always @(posedge clk) q <= {q[62:0], d};\nendmodule\n'],
  vhdl: ['top.vhd', [
    'library ieee;', 'use ieee.std_logic_1164.all;', '',
    'entity top is', '  port (clk : in std_logic; d : in std_logic; q : out std_logic_vector(63 downto 0));', 'end top;', '',
    'architecture rtl of top is', '  signal r : std_logic_vector(63 downto 0) := (others => \'0\');', 'begin',
    '  process (clk) begin', '    if rising_edge(clk) then r <= r(62 downto 0) & d; end if;', '  end process;', '  q <= r;', 'end rtl;', ''].join('\n')],
};
const PARTS = [{ board: 'nexys3', part: 'xc6slx16', clk: 'V10', seed: 1 }, { board: 'atlys', part: 'xc6slx45', clk: 'L15', seed: 2 }];

/** The Silinx toolchain's flow on a project folder from placement seed `seed`, as the application runs it: the job. */
async function flow(dir, project, seed) {
  const { createJob } = await import('../server/jobs.js');
  const { runOpenImplementation } = await import('../server/open-flow.js');
  const job = createJob('s6-pads', j => runOpenImplementation(j, { project, projectDir: dir, steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'], seed }));
  while (job.status === 'running') await new Promise(r => setTimeout(r, 200));
  return job;
}

describe('ports without a LOC on the Spartan-6, by nextpnr (#3152)', { concurrency: 2 }, () => {
  for (const lang of ['verilog', 'vhdl']) {
    for (const t of PARTS) {
      test(`${lang} on the ${t.part}: every seed routes, the bitstream written, the free pins' warning only`, { timeout: 600000 }, async () => {
        const dir = path.join(tmp, `${lang}-${t.board}`), [file, text] = SOURCES[lang];
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', file), text);
        fs.writeFileSync(path.join(dir, 'top.ucf'), `NET "clk" LOC = "${t.clk}";\n`);
        const project = { name: 'top', version: 1, device: { family: 'spartan6', part: t.part, package: 'csg324', speed: '-3' },
          top: 'top', files: [{ path: `src/${file}`, lang, role: 'design' }], constraints: 'top.ucf', impl: { engine: 'nextpnr' } };
        fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify(project));
        const job = await flow(dir, project, t.seed);
        const lines = job.lines.map(l => (typeof l === 'string' ? l : l.text));
        assert.equal(job.status, 'ok', lines.filter(l => /ERROR|nextpnr, seed/.test(l)).join('\n'));
        assert.deepEqual(lines.filter(l => /^nextpnr, seed/.test(l)).map(l => l.replace(/ [\d.]+ ns/, ' … ns')),
          [0, 1, 2].map(k => `nextpnr, seed ${t.seed + k}: minimum period … ns.`));
        assert.deepEqual(lines.filter(l => /warning/i.test(l)), [
          'WARNING: 65 port bit(s) have no LOC constraint (d, q<0>, q<1>, q<2>, q<3>, q<4>, q<5>, q<6>, …): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream']);
        assert.ok(lines.includes('All signals are completely routed.'));
      });
    }
  }
});
