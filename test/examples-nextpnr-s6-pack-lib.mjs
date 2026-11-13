// Every example on one of the Spartan-6's boards with nextpnr's Map (#3138, Process Properties' Map (Spartan-6) nextpnr:
// impl.s6Map), against Silinx's Map (#3139): nextpnr-himbaechel's spartan6 WebAssembly package packs Yosys's netlist into
// the sites of Silinx's Map (checked site by site at Place & Route: samePacking) and places them, its pads and clocks by
// its own rules; Silinx routes them with nextpnr, checks the routing and writes the bitstream. Each one routed on every
// seed, its PERIOD met, the routing check passed, every feature of the design in the bit database, with no warning; its
// slices, LUTs and flip-flops those of Silinx's Map, its period (the best of nextpnr's seeds) within PERIOD_NOISE of
// Silinx's Map's, and the board's examples within PARITY of it on average (the geometric mean of the ratios: one
// example's period moves by up to 20 % from seed to seed, both Maps alike, #2798). The figures in
// packages/silinx-fpga/research/s6/README.md (#3139).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, targetName, exampleProject } from './examples-lib.mjs';

// the bar of #3139: 5 % on average (the maintainer's, 2026-11-12; the Spartan-3E's about 4 %, #2797. Measured on
// 2026-11-12: 1.7 % on the Nexys3, 4.1 % on the Atlys, the best of 3 seeds; over 9 seeds the two Maps' mean periods within
// 3 % on every example, nextpnr's 0.4 % shorter on average: the two Maps hand nextpnr the same sites and timing arcs, the
// seeds differ); and one example's own, its seeds' spread (micro80 on the Nexys3 13 %)
export const PARITY = 1.05;
export const PERIOD_NOISE = 1.15;

/** The board's average of nextpnr's Map's periods over Silinx's Map's: the geometric mean of the examples' ratios. */
export const meanRatio = ratios => Math.exp(ratios.reduce((s, r) => s + Math.log(r), 0) / ratios.length);

// the application's open flow on a project folder (its synthesis kept with synthUpToDate: the second Map reads the first's netlist)
async function flow(dir, project, steps, synthUpToDate = false) {
  const { createJob } = await import('../server/jobs.js');
  const { runOpenImplementation } = await import('../server/open-flow.js');
  const job = createJob('example', j => runOpenImplementation(j, { project, projectDir: dir, steps, synthUpToDate }));
  while (job.status === 'running') await new Promise(r => setTimeout(r, 200));
  return job;
}

const linesOf = job => job.lines.map(l => (typeof l === 'string' ? l : l.text));
const count = (lines, re) => +(/: ([\d,]+) out of/.exec(lines.findLast(l => re.test(l)) ?? '')?.[1]?.replace(/,/g, '') ?? NaN);
// a run's figures: slices, LUTs, flip-flops (Map's report, the last: the synthesis's estimate comes first), the best of nextpnr's seeds (ns, 0: no clocked paths)
function figures(lines) {
  const seeds = lines.filter(l => /^nextpnr, seed/.test(l)).map(l => +(/([\d.]+) ns/.exec(l)?.[1] ?? 0));
  return { slices: count(lines, /Number of occupied Slices/), luts: count(lines, /Number of Slice LUTs/), ffs: count(lines, /Number of Slice Registers/), period: Math.min(...seeds), seeds };
}

/** The tests of every example on target t (S6_TARGETS'), in a file of its own (each board's within 15 minutes). */
export function packTests(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `silinx-nextpnr-s6-pack-${targetName(t)}-`));
  // the shipped device descriptions, never ones built in the user's ~/.silinx/devices
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
  test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ratios = new Map();

  for (const example of EXAMPLES) {
    test(`#3138 #3139 example ${example} on ${targetName(t)} with nextpnr's Map: packed as Silinx's Map, routed on every seed, its bitstream, no warning; its size Silinx's Map's, its period within ${Math.round((PERIOD_NOISE - 1) * 100)} %`, { timeout: 900000 }, async (ctx) => {
      const { dir, project } = exampleProject(example, t, tmp);
      try {
        // Silinx's Map first (impl.s6Map 'silinx': nextpnr's is the default since #3140), then nextpnr's on the same synthesis
        const ours = await flow(dir, { ...project, impl: { ...project.impl, s6Map: 'silinx' } }, ['synth', 'translate', 'map', 'par']);
        assert.equal(ours.status, 'ok', linesOf(ours).filter(l => /ERROR/.test(l)).join('\n'));
        const silinx = figures(linesOf(ours));
        const job = await flow(dir, { ...project, impl: { ...project.impl, s6Map: 'nextpnr' } }, ['translate', 'map', 'par', 'trce', 'bitgen'], true);
        const lines = linesOf(job);
        assert.ok(!lines.some(l => /^Netlist: /.test(l)), 'the synthesis run again');
        assert.equal(job.status, 'ok', lines.filter(l => /ERROR|nextpnr, seed|^ {2}/.test(l)).join('\n'));
        assert.deepEqual(lines.filter(l => /WARNING/.test(l)), []);
        const seeds = lines.filter(l => /^nextpnr, seed/.test(l));
        assert.deepEqual(seeds.map(l => l.replace(/ [\d.]+ ns/, ' … ns')), [1, 2, 3].map(s => `nextpnr, seed ${s}: ${example === 'gates' ? 'no clocked paths' : 'minimum period … ns'}.`));
        const sites = +/^Packed and placed (\d+) sites by nextpnr in /.exec(lines.find(l => /^Packed and placed /.test(l)) ?? '')?.[1];
        assert.ok(sites > 0, lines.join('\n'));
        assert.ok(lines.includes('All signals are completely routed.'));
        // (every PERIOD met: one not met is a warning)
        if (example !== 'gates') assert.ok(lines.some(l => /^constraint PERIOD [\d.]+ ns on \w+: met \(period \d+\.\d{3} ns, slack \d+\.\d{3} ns\)$/.test(l)), lines.filter(l => /PERIOD/.test(l)).join('\n'));
        assert.ok(lines.some(l => /^Bitstream: build\/\w+\.bit \(\d+ bytes, every feature in the bit database\)$/.test(l)), lines.slice(-20).join('\n'));
        const nextpnr = figures(lines);
        // the size: no more slices than Silinx's Map (the same sites: the same slices, LUTs and flip-flops)
        assert.ok(nextpnr.slices > 0);
        assert.deepEqual({ slices: nextpnr.slices, luts: nextpnr.luts, ffs: nextpnr.ffs }, { slices: silinx.slices, luts: silinx.luts, ffs: silinx.ffs });
        if (example !== 'gates') {
          const ratio = nextpnr.period / silinx.period;
          assert.ok(ratio <= PERIOD_NOISE, `${example}: ${nextpnr.period} ns with nextpnr's Map, ${silinx.period} ns with Silinx's`);
          ratios.set(example, ratio);
        }
        ctx.diagnostic(`${example} ${targetName(t)}: ${nextpnr.slices} slices (Silinx's Map ${silinx.slices}), ${sites} sites, best period ${nextpnr.period.toFixed(3)} ns (seeds ${nextpnr.seeds.join(' / ')}; Silinx's Map ${silinx.period.toFixed(3)} ns)`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  test(`#3139 the examples on ${targetName(t)}: nextpnr's Map's periods within ${Math.round((PARITY - 1) * 100)} % of Silinx's Map's on average`, (ctx) => {
    const clocked = EXAMPLES.filter(e => e !== 'gates');
    // (every example measured: one test failed, or left out by a name pattern, leaves no average)
    if (ratios.size < clocked.length) return ctx.skip(`${clocked.length - ratios.size} example(s) not measured`);
    const mean = meanRatio([...ratios.values()]);
    ctx.diagnostic(`${targetName(t)}: nextpnr's Map ${((mean - 1) * 100).toFixed(1)} % on average (${[...ratios].map(([e, r]) => `${e} ${((r - 1) * 100).toFixed(1)} %`).join(', ')})`);
    assert.ok(mean <= PARITY, `${((mean - 1) * 100).toFixed(1)} % on average`);
  });
}
