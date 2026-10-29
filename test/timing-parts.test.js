// The parts of the timing model (#405: out of packages/silinx-fpga/src/fpga/timing.js): the logic's arcs (timing-arcs.js) and the clock
// and constraint checks (timing-checks.js); timing.js still exports them. A slice's LUT and flip-flop arcs and a pad's
// in the model; two clocks' requirement (the same period, half of it shifted, a clock with no period); OFFSET
// constraints read (a NET's IN in ns, a TIMEGRP's OUT unsupported, a line that is no OFFSET left out); a switching
// limit's report line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as timing from '../packages/silinx-fpga/src/fpga/timing.js';
import { instArcs } from '../packages/silinx-fpga/src/fpga/timing-arcs.js';
import { clockRequirement, parseOffsets, switchingLine, checkSwitching, timingReport, clockSources } from '../packages/silinx-fpga/src/fpga/timing-checks.js';

const S = timing.SPEED_4.slice;

test('#405 timing parts: timing.js exports the modules\' functions', () => {
  assert.equal(timing.instArcs, instArcs);
  for (const f of [clockRequirement, parseOffsets, switchingLine, checkSwitching, timingReport, clockSources]) assert.equal(timing[f.name], f, f.name);
});

test('#405 timing parts, the logic: a slice\'s LUT into its flip-flop, a pad\'s input and output', () => {
  const a = instArcs({ type: 'SLICEL', site: 'SLICE_X1Y0', cfg: [['FXMUX', 'F'], ['FFX', '#FF'], ['DXMUX', '1']].map(([attr, value]) => ({ attr, name: '', value })) });
  assert.deepEqual(a.comb.filter(x => x[0] === 'F1' && x[1] === 'X').map(x => x[2]), [S.Tilo[0]]);
  assert.deepEqual(a.setup.find(x => x[0] === 'F1'), ['F1', S.Tilo[0] + S.Tdxck[0]]);
  assert.deepEqual(a.clkToOut, [['XQ', S.TckoX[0]]]);
  const p = instArcs({ type: 'IOB', site: 'P1', cfg: [] });
  assert.deepEqual([p.input, p.output], [[['I', timing.SPEED_4.pad.Tiopi]], [['O1', timing.SPEED_4.pad.Tioop]]]);
});

test('#405 timing parts, the checks: a clocks\' requirement, OFFSET constraints read, a switching limit\'s line', () => {
  assert.equal(clockRequirement({ period: 20, first: 0 }, { period: 20, first: 0 }), 20);
  assert.equal(clockRequirement({ period: 20, first: 0 }, { period: 10, first: 5 }), 5);
  assert.equal(clockRequirement({ period: 0, first: 0 }, { period: 10, first: 0 }), null);
  assert.deepEqual(parseOffsets(['NET "d" OFFSET = IN 5 ns BEFORE "clk";', 'TIMEGRP "g" OFFSET = OUT 800 ps AFTER clk', 'NET "x" LOC = P1;']), [
    { dir: 'in', port: 'd', required: 5, clock: 'clk', text: 'NET "d" OFFSET = IN 5 ns BEFORE "clk";' },
    { text: 'TIMEGRP "g" OFFSET = OUT 800 ps AFTER clk', unsupported: true },
  ]);
  assert.equal(switchingLine({ resource: 'BUFGMUX', limit: 'Tgpw', bound: 'min', min: 2.5, max: 0, met: true, period: 20, slack: 17.5 }),
    'switching limit of BUFGMUX (Tgpw): met, period 20.000 ns, min period limit 2.500 ns (400.000 MHz), slack 17.500 ns');
});
