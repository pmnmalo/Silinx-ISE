// UI: the compiled cycle simulator's code in the browser (#650), not only in Node: vga's Post-Synthesis Simulation
// Model (a gate-level netlist at word level, core/compiled-words.js), with what the Board Emulator counts on the
// Basys2, compiled and run in a page of the app as in Node: the same outputs, counts and VGA picture state after the
// same cycles; in Chrome (V8, as Node) at about Node's speed from the start, not 3 times slower as when V8 ran a
// long-running run() seconds in Maglev before it optimized it (CompiledSim.cycle: run() in pieces).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, BROWSER } from './harness.js';
import { example, exampleUcf } from '../examples-lib.mjs';
import { designOf } from '../compiled-diff.js';
import { compileNetlist, CompiledSim, netlistOf, portBit } from '../../core/compiled-sim.js';
import { yosysNode } from '../../packages/silinx-fpga/src/synth-open-node.js';
import { parseUcf } from '../../packages/silinx-fpga/src/ucf.js';
import { resolveBoard } from '../../server/devices.js';
import { boardWiring, emulatorClocks, outputWatch } from '../../core/emulate.js';
import { vgaPins } from '../../core/vga.js';

let env, net, opts;
before(async () => {
  env = await setupUi();
  const { runOpenFlow } = await import('../../core/flow-ide.js');
  const ex = example('vga'), top = ex.project.top, written = {};
  const r = await runOpenFlow({ top, part: 'xc3s250ecp132-4', family: 'spartan3e', steps: ['postsynth'], simTop: ex.project.simTop },
    { log: () => {}, sources: () => ex.design, simSources: () => ex.sim, yosys: yosysNode, write: (n, d) => { written[n] = d; return `build/${n}`; }, read: () => null, save: () => {} });
  assert.equal(r.ok, true, r.error);
  const file = `netgen/synthesis/${top}_synthesis.v`;
  const design = designOf([{ path: file, lang: 'verilog', role: 'design', text: written[file] }], top);
  net = await netlistOf(design, { run: yosysNode });
  // what the Board Emulator counts on the Basys2 (core/emulate-compiled.js CompiledBoard): the LEDs, the displays, the
  // VGA monitor
  const rb = resolveBoard('basys2'), board = { name: rb.board.name, device: rb.device, resources: rb.resources };
  const ucfPort = (p) => { const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null }; };
  const assignments = parseUcf(exampleUcf('vga', { board: 'basys2', variant: '250' }).text, { ports: design.top.ports.map(ucfPort) }).assignments;
  const wiring = boardWiring({ ports: design.top.ports, assignments, board });
  wiring.clocks = emulatorClocks(wiring, design.top.ports);
  const watch = outputWatch(wiring), vp = vgaPins(wiring, board);
  const bit = (b) => (b ? portBit(net.json, net.top, b.port, b.pos) : '0');
  opts = { top: net.top, clock: wiring.clocks[0].port, watch: {
    levels: watch.levels.map((l) => ({ bit: bit(l.b), on: l.on })),
    pairs: watch.pairs.map(([a, b]) => [{ bit: bit(a.b), on: a.on }, { bit: bit(b.b), on: b.on }]),
    edges: watch.edges.map((e) => ({ bit: bit(e.b), capture: e.capture.map(bit) })),
    vga: { hs: bit(vp.hs), vs: bit(vp.vs), rgb: [...vp.red, ...vp.green, ...vp.blue].map(bit) } } };
});
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the millions of cycles a second from the start, as the Board Emulator runs it: 8 frames of a million cycles, what
// they counted taken after each (V8 runs the first ones before it optimizes run(): in Chrome, with run() called once
// a frame, the first 4 at a tenth of the speed); then the outputs, the counts and the VGA monitor's state after them
// and after 1000 cycles more; old: run() called once a frame (as before #650)
async function measure(cs, json, opts, old = false) {
  const outs = Object.entries(json.modules[opts.top].ports).filter(([, p]) => p.direction === 'output').map(([n]) => n);
  const sim = new cs.CompiledSim(cs.compileNetlist(json, opts));
  const go = n => (old ? sim.inst.run(n) : sim.cycle(n));
  const t0 = performance.now();
  for (let i = 0; i < 8; i++) { go(1e6); sim.take(); }
  const mhz = 8e6 / ((performance.now() - t0) / 1000) / 1e6;
  const values = [];
  for (const n of [1e6, 1000]) { go(n); values.push({ ...Object.fromEntries(outs.map(o => [o, String(sim.get(o))])), ...sim.take(), vga: Array.from(sim.vga.state) }); }
  return { values, mhz };
}

uiTest('the compiled simulator\'s code in the browser: vga\'s post-synthesis model, the outputs as in Node, at about Node\'s speed (Chrome)', E, async (page) => {
  const node = await measure({ compileNetlist, CompiledSim }, net.json, opts);
  // (measure, as in Node)
  const inPage = (old, pg = page) => pg.eval(async (src, json, o, x) => (0, eval)(`(${src})`)(await import('/core/compiled-sim.js'), json, o, x), measure.toString(), net.json, opts, old);
  const web = await inPage(false);
  // (SILINX_SPEED_DEBUG: the speeds, and run() called once a frame, in a page of its own: V8 shares the code of the
  // same source within one)
  if (process.env.SILINX_SPEED_DEBUG) {
    const pg = await env.newPage();
    const old = await inPage(true, pg);
    console.log(`# node ${node.mhz.toFixed(1)} MHz, ${BROWSER} ${web.mhz.toFixed(1)} MHz, ${BROWSER} in one run() ${old.mhz.toFixed(1)} MHz`);
  }
  assert.deepEqual(web.values, node.values);
  // (V8's browsers, Chrome and Chromium, about as fast as Node, 0.3 of it with run() called once a frame; Firefox and
  // WebKit have engines of their own)
  if (BROWSER === 'chrome' || BROWSER === 'chromium') assert.ok(web.mhz > 0.6 * node.mhz, `${web.mhz.toFixed(1)} million cycles a second in ${BROWSER}, ${node.mhz.toFixed(1)} in Node`);
}, { timeout: 180000 });
