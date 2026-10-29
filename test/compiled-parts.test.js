// The parts of compileNetlist (#405: out of core/compiled-sim.js): the netlist read (compiled-cells.js), the
// expressions (compiled-exprs.js), the elements (compiled-elements.js), the clocks (compiled-clocks.js), mounted
// alone on the netlists of two test designs (registers of every kind with a latch and a falling edge; two cascaded
// DCMs); the activity, the counts, the steps and the code (compiled-activity.js, compiled-watch.js, compiled-steps.js,
// compiled-generate.js) through compileNetlist: every activity and a split run() give the same values, cycle by cycle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './examples-lib.mjs';
import { designOf, rng } from './compiled-diff.js';
import * as sim from '../core/compiled-sim.js';
import { CompileError, chunks } from '../core/compiled-helpers.js';
import { VGA_W, VGA_H, VGA_STATE } from '../core/compiled-vga.js';
import { mountCells } from '../core/compiled-cells.js';
import { mountExpressions } from '../core/compiled-exprs.js';
import { mountElements } from '../core/compiled-elements.js';
import { mountClocks } from '../core/compiled-clocks.js';
import { mountActivity } from '../core/compiled-activity.js';
import { mountWatch } from '../core/compiled-watch.js';
import { mountSteps } from '../core/compiled-steps.js';
import { mountGenerate } from '../core/compiled-generate.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const FIX = path.join(ROOT, 'test/fixtures/compiled-sim');
const netlist = async (file, top) => (await sim.netlistOf(designOf([{ path: file, lang: 'verilog', role: 'design', text: fs.readFileSync(path.join(FIX, file), 'utf8') }], top), { run: yosysNode })).json;

// the parts compileNetlist mounts first, on a netlist (as compileNetlist does)
function parts(json, top, { clock = null, wide = false, watch = null } = {}) {
  const mod = json.modules[top];
  const vars = [], src = new Map(), names = [];
  const newVar = (w) => { vars.push({ w, kind: wide || w > 32 ? 'b' : 'n' }); return vars.length - 1; };
  const drive = (bits, v) => bits.forEach((b, i) => { if (typeof b === 'number') src.set(b, [v, i]); });
  const cellName = (n) => n;
  const cells = mountCells({ wide, cellName, drive, mod, names, newVar, vars });
  const exprs = mountExpressions({ wide, cellName, comb: cells.comb, elems: cells.elems, mod, src, vars });
  const els = mountElements({ rdExpr: exprs.rdExpr, sig: exprs.sig, vars });
  const clocks = mountClocks({ clock, watch, async: els.async, cellName, comb: cells.comb, dcms: cells.dcms, elems: cells.elems, inBits: exprs.inBits, inputs: cells.inputs, pol: els.pol, ports: cells.ports, vars });
  return { mod, vars, src, names, ...cells, ...exprs, ...els, ...clocks };
}

test('#405 compiled simulator parts: compiled-sim.js still exports what moved', () => {
  assert.equal(sim.CompileError, CompileError);
  assert.equal(sim.chunks, chunks);
  assert.deepEqual([sim.VGA_W, sim.VGA_H, sim.VGA_STATE], [VGA_W, VGA_H, VGA_STATE]);
  for (const f of [mountActivity, mountWatch, mountSteps, mountGenerate]) assert.equal(typeof f, 'function');
});

test('#405 compiled simulator parts: registers of every kind, a latch, a falling edge: the cells, expressions, elements, clocks', async () => {
  const p = parts(await netlist('regs.v', 'regs'), 'regs');
  // the cells: the ports, the inputs as variables, the elements (no memory, no DCM)
  assert.deepEqual(p.ports.map(x => x.name), Object.keys(p.mod.ports));
  assert.deepEqual(p.inputs.map(x => x.name), ['clk', 'rst', 'arst', 'en', 'set', 'clr', 'd']);
  assert.deepEqual([p.mems.length, p.dcms.length], [0, 0]);
  const types = new Set(p.elems.map(e => e.type));
  for (const t of ['$dlatch', '$adff', '$dffsr']) assert.ok(types.has(t), t);
  // the expressions: every combinational cell in order, an input port as its variable
  assert.equal(p.order.length, p.comb.length);
  assert.ok(p.order.every(n => p.inBits(n).every(b => { const d = p.combOf.get(p.src.get(b)?.[0]); return !d || p.order.indexOf(d) < p.order.indexOf(n); })));
  const d = p.inputs.find(x => x.name === 'd');
  assert.equal(p.sig(d.bits, 'n'), `v${d.v}`);
  assert.equal(p.sig(d.bits, 'b'), `BigInt(v${d.v})`);
  assert.deepEqual(p.warnings, []);
  // the elements: a latch samples nothing (it is asynchronous only), a flip-flop commits its sample
  const lat = p.elems.find(e => e.type === '$dlatch'), ff = p.elems.find(e => e.type === '$adff');
  assert.deepEqual([p.sample(lat), p.commit(lat)], ['', '']);
  assert.match(p.async(lat), /ch = true/);
  assert.equal(p.commit(ff), `v${ff.q} = n${ff.id};`);
  // the clocks: clk the main clock, both its edges steps (q_neg), the asynchronous elements
  assert.equal(p.mainPort.name, 'clk');
  assert.equal(p.needFall, true);
  assert.equal(p.negMain.length, 1);
  assert.ok(p.asyncEls.includes(lat) && p.asyncEls.includes(ff));
  assert.equal(p.sched, null);
});

test('#405 compiled simulator parts: two cascaded DCMs, one schedule; not clocked by the main clock, a CompileError', async () => {
  const json = await netlist('dcm.v', 'dcm_v');
  const p = parts(json, 'dcm_v');
  assert.equal(p.dcms.length, 2);
  assert.equal(p.mainPort.name, 'clk');
  assert.equal(p.groups.length, 1);
  assert.ok(p.groups[0].chans.length > 0 && p.sched.T > 0);
  assert.throws(() => parts(json, 'dcm_v', { clock: false }), { name: 'Error', message: /is clocked by 'clk', with no main clock: not compiled$/ });
  assert.ok((() => { try { parts(json, 'dcm_v', { clock: false }); } catch (e) { return e instanceof CompileError; } })());
});

test('#405 compiled simulator parts: every activity, a split run(), the counts: the same values, cycle by cycle', async () => {
  const json = await netlist('regs.v', 'regs');
  const level = { bit: sim.portBit(json, 'regs', 'q_neg'), on: 1 };
  const watch = { levels: [level], pairs: [], edges: [] };
  const run = (o) => {
    const s = new sim.CompiledSim(sim.compileNetlist(json, { top: 'regs', watch, ...o }));
    const r = rng(5), out = [];
    for (let k = 0; k < 300; k++) {
      for (const [n, w] of [['rst', 1], ['arst', 1], ['en', 1], ['set', 1], ['clr', 1], ['d', 8]]) if (r() < 0.3) s.set(n, Math.floor(r() * 2 ** w));
      s.cycle(1);
      out.push(['q_sync', 'q_async', 'q_en', 'q_aen', 'q_sr', 'q_neg', 'lat', 'q_wide'].map(n => s.get(n).toString(16)).join(' '));
    }
    return { out, counts: s.take().counts };
  };
  const base = run({ activity: false });
  assert.ok(new Set(base.out).size > 100, 'the values change');
  assert.ok(base.counts[0] > 0);
  for (const o of [{}, { activity: 'fine' }, { activity: 'max' }, { wide: true }, { split: 2000, chunk: 500 }]) assert.deepEqual(run(o), base, JSON.stringify(o));
  // (a split run(): its combinational code in functions)
  assert.match(sim.compileNetlist(json, { top: 'regs', split: 2000, chunk: 500 }).code, /const CF0 = \(\) => \{/);
});
