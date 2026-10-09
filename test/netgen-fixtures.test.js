// Real netgen netlists (Xilinx ISE 14.7) of small designs, simulated with Silinx's primitive models
// and compared cycle by cycle with the RTL they were synthesized from.
//
// test/fixtures/designs/<design>/  : the sources and design.json (device, top, files, stimulus)
// test/fixtures/netgen/<design>/   : {synthesis,translate,map,par}.vhd written by netgen
//                                    (regenerate them with scripts/gen-netlist-fixtures.mjs; needs ISE in docker)
//
// For every design and every model the netlist must compile and elaborate cleanly (no errors, no
// primitive generics or cells Silinx does not model), and its outputs must equal the RTL's at every
// clock cycle under the same pseudo-random stimulus. Each netlist runs with the native primitives
// (core/native.js) after scalarizing (as the app simulates it) and with the VHDL primitive models
// (core/unisim.js) on netgen's text (vector signals kept); the post-synthesis netlist also with the
// native primitives unscalarized, and regrouped by the design's hierarchy (technology schematic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { primitiveSources } from '../core/unisim.js';
import { regroupNetlist, scalarizeNetlist, splitInoutBuffers } from '../core/netlist-hier.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGNS = path.join(HERE, 'fixtures', 'designs');
const NETGEN = path.join(HERE, 'fixtures', 'netgen');
const MODELS = ['synthesis', 'translate', 'map', 'par'];

const names = fs.existsSync(NETGEN) ? fs.readdirSync(NETGEN).filter((n) => fs.existsSync(path.join(DESIGNS, n, 'design.json'))).sort() : [];
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const langOf = (f) => (/\.(vhd|vhdl)$/i.test(f) ? 'vhdl' : 'verilog');

// deterministic pseudo-random numbers (mulberry32), seeded by the design name
function rng(seedText) {
  let a = [...seedText].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 0x9e3779b9);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Input values per cycle: [{ port: BigInt }] (see the `sim` section of design.json). */
function stimulus(name, sim, inputs, cycles) {
  const r = rng(name);
  const bits = (w) => { let v = 0n; for (let i = 0; i < w; i += 16) v |= BigInt(Math.floor(r() * 65536)) << BigInt(i); return v & ((1n << BigInt(w)) - 1n); };
  const out = [];
  let cur = {};
  for (let k = 0; k < cycles; k++) {
    if (k % (sim.hold || 1) === 0) {
      cur = {};
      for (const { name: p, w } of inputs) {
        if (sim.prob?.[p] !== undefined) cur[p] = r() < sim.prob[p] ? 1n : 0n;
        else if (sim.bitprob?.[p]) cur[p] = sim.bitprob[p].reduce((v, pr, i) => v | (r() < pr ? 1n << BigInt(i) : 0n), 0n);
        else if (sim.ranges?.[p]) { const [lo, hi] = sim.ranges[p]; cur[p] = BigInt(lo + Math.floor(r() * (hi - lo + 1))); }
        else cur[p] = bits(w);
      }
      for (const [a, b] of Object.entries(sim.equalBias || {})) if (r() < 0.2) cur[a] = cur[b];
      // ports of a dual-port memory that must not address the same word in the same cycle
      for (const d of sim.distinct || []) {
        const m = BigInt(d.mask), sa = BigInt(d.shiftA || 0), sb = BigInt(d.shiftB || 0);
        if (((cur[d.a] >> sa) & m) === ((cur[d.b] >> sb) & m)) cur[d.b] ^= 1n << sb;
      }
    }
    out.push(k < 3 && sim.start ? { ...cur, ...Object.fromEntries(Object.entries(sim.start).map(([p, v]) => [p, BigInt(v)])) } : cur);
  }
  return out;
}

function compileClean(sources, top, what) {
  const lib = compile(sources);
  const design = elaborate(lib, top);
  const diags = [...lib.errors, ...design.diags];
  const bad = diags.filter((d) => d.severity !== 'warning' || /not modelled|no model|not found/i.test(d.message));
  assert.deepEqual(bad.map((d) => `${d.file || ''}:${d.line || ''} ${d.message}`), [], `${what}: compile / elaboration problems`);
  assert.ok(design.top, `${what}: no top`);
  return design;
}

/**
 * Run `design` under the stimulus: the primary clock starts low and rises at R = (k + 1/2) * period,
 * the inputs of cycle k are applied at R + period / 4 (the `late` ones, latch gates…, at R + 3/4
 * period; cycle 0's also at time 0) and the outputs are sampled 1 ns before the next rising edge.
 * Returns one string per cycle.
 */
function run(design, sim, stim) {
  const P = sim.period;
  const s = new Simulator(design, { maxWaveEvents: 0 });
  const port = new Map(design.top.ports.map((p) => [p.name.toLowerCase(), p]));
  s.addClock(port.get(sim.clock.toLowerCase()).sig, { period: P });
  for (const [c, o] of Object.entries(sim.clocks || {})) s.addClock(port.get(c.toLowerCase()).sig, { period: o.period, offset: o.offset || 0 });
  const late = new Set((sim.late || []).map((x) => x.toLowerCase()));
  const outs = design.top.ports.filter((p) => p.dir !== 'in').sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  const apply = (vals, which) => {
    for (const [p, v] of Object.entries(vals)) {
      if (which !== undefined && late.has(p.toLowerCase()) !== which) continue;
      const sig = port.get(p.toLowerCase()).sig;
      s.force(sig, V.mk(sig.t.w, v));
    }
  };
  apply(stim[0]);
  const res = [];
  for (let k = 0; k < stim.length; k++) {
    const R = P / 2 + k * P;   // rising edge of cycle k
    s.run(R + P / 4); apply(stim[k], false);
    s.run(R + (3 * P) / 4); apply(stim[k], true);
    s.run(R + P - 1000);
    res.push(outs.map((p) => `${p.name}=${V.toBin(p.sig.val)}`).join(' '));
  }
  return res;
}

const hex = (o) => JSON.stringify(o, (_, v) => (typeof v === 'bigint' ? v.toString(16) : v));

function firstDiff(a, b, skip) {
  for (let k = skip; k < Math.min(a.length, b.length); k++) if (a[k] !== b[k]) return k;
  return -1;
}

for (const name of names) {
  const dir = path.join(DESIGNS, name);
  const spec = JSON.parse(read(dir, 'design.json'));
  const sim = spec.sim;
  const harness = sim.harness ? [{ path: sim.harness, lang: 'vhdl', text: read(dir, sim.harness) }] : [];
  const simTop = sim.harness ? 'harness' : spec.top;

  test(`netgen fixtures: ${name} (${spec.device.part}-${spec.device.package})`, async (t) => {
    const rtlSrcs = [...spec.files.map((f) => ({ path: f, lang: langOf(f), text: read(dir, f) })), ...harness];
    const rtlDesign = compileClean([...primitiveSources(rtlSrcs), ...rtlSrcs], simTop, 'RTL');
    const inputs = rtlDesign.top.ports.filter((p) => p.dir === 'in' && p.name.toLowerCase() !== sim.clock.toLowerCase() && !(p.name in (sim.clocks || {})))
      .map((p) => ({ name: p.name, w: p.sig.t.w }));
    const stim = stimulus(name, sim, inputs, sim.cycles);
    const rtl = run(rtlDesign, sim, stim);
    // the design must do something: outputs change during the run
    assert.ok(new Set(rtl).size > 3, `${name}: RTL outputs barely change`);
    // the hierarchy of the RTL top (for regrouping)
    const groups = (sim.harness ? compileClean([...primitiveSources(rtlSrcs), ...rtlSrcs], spec.top, 'RTL') : rtlDesign).top.children.map((c) => c.name);

    for (const model of MODELS) {
      const file = path.join(NETGEN, name, `${model}.vhd`);
      if (!fs.existsSync(file)) continue;
      const raw = read(file);
      const variants = [
        ['native, scalarized', scalarizeNetlist(raw), true, sim.cycles],
        ['VHDL models', splitInoutBuffers(raw), false, sim.vhdlCycles || sim.cycles],
        // vector signals kept (only the inout buffers split, see splitInoutBuffers); regrouped as the technology schematic shows it
        ...(model === 'synthesis' ? [['native, vectors kept', splitInoutBuffers(raw), true, sim.cycles], ['native, regrouped', splitInoutBuffers(regroupNetlist(raw, groups).text), true, sim.cycles]] : []),
      ];
      for (const [variant, text, native, cycles] of variants) {
        await t.test(`${model} netlist, ${variant}`, () => {
          const net = { path: `netgen/${name}/${model}.vhd`, lang: 'vhdl', text };
          const prims = primitiveSources([net]).map((p) => (native ? p : { ...p, path: p.path.replace('<silinx>/', 'models/') }));
          const d = compileClean([...prims, net, ...harness], simTop, `${model} (${variant})`);
          const got = run(d, sim, stim.slice(0, cycles));
          const k = firstDiff(rtl, got, sim.skip || 0);
          assert.equal(k, -1, k < 0 ? '' : `${name} ${model} (${variant}): first difference at cycle ${k}\n  inputs ${hex(stim[k])}\n  RTL     ${rtl[k]}\n  netlist ${got[k]}${k > 0 ? `\n  (cycle ${k - 1}: inputs ${hex(stim[k - 1])} RTL ${rtl[k - 1]})` : ''}`);
        });
      }
    }
  });
}
