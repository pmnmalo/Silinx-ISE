// Does the XDL written by nextpnr-to-xdl.mjs implement nextpnr's netlist? (#1954) Simulates both, cycle by cycle
// from the flip-flops' initial values, and compares every flip-flop after each rising edge: the netlist from its
// cells (LUT4 INIT, FF), the XDL from its slices' settings (the LUT equations on their site pins, FXMUX / DXMUX,
// the flip-flops' set / reset) and its nets. The spike's cells only: LUT4, FF, IOB, BUFGMUX.
//   node research/nextpnr-s3e/xdl-sim-check.mjs routed.json design.xdl [cycles] [input=value ...] [--starts N]
// Inputs (top ports) are 0 unless given (e.g. rst=1). Exits 1 at the first difference, naming the flip-flop.
// --starts N: then N runs of 64 cycles from random states (the same in both, each flip-flop 1 with probability 0.9,
// so that long carries come at once: a counter's top bits are reached without 2^n cycles).
import fs from 'node:fs';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { evalLut } from '../../packages/silinx-fpga/src/xdl.js';

const argv = process.argv.slice(2);
const si = argv.indexOf('--starts'), starts = si >= 0 ? +argv.splice(si, 2)[1] : 0;
const [jsonFile, xdlFile, cyclesArg, ...inputArgs] = argv;
const cycles = +(cyclesArg || 100000);
const inputs = Object.fromEntries(inputArgs.map(a => a.split('=')).map(([k, v]) => [k, +v]));
const json = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
const mod = (Object.values(json.modules).find(m => m.attributes?.top) || Object.values(json.modules)[0]);
const esc = x => String(x).replace(/:/g, '_');
const bitsOf = v => (typeof v === 'string' ? v : (v >>> 0).toString(2));

// ---------------------------------------------------------------- the netlist
// value of each net bit; the cells in an order the LUTs can be evaluated in (repeated until stable)
const A = { val: new Map(), luts: [], ffs: [] };
for (const [name, p] of Object.entries(mod.ports)) if (p.direction === 'input') A.val.set(p.bits[0], inputs[name] || 0);
for (const [name, c] of Object.entries(mod.cells)) {
  const con = p => c.connections[p]?.[0];
  if (c.type === 'LUT4') A.luts.push({ init: bitsOf(c.parameters.INIT).padStart(16, '0'), ins: [0, 1, 2, 3].map(i => con(`I${i}`)), out: con('O') });
  else if (c.type === 'FF') A.ffs.push({ name: esc(name), d: con('D'), q: con('Q'), ce: con('CE'), sr: con('SR'), mode: c.parameters.SRMODE, init: parseInt(bitsOf(c.parameters.INIT ?? '0'), 2) & 1 });
  else if (c.type === 'IOB') { if (con('I') !== undefined) A.val.set(con('I'), A.val.get(con('PAD')) || 0); }
  else if (c.type === 'BUFGMUX') A.clockAlias = [con('I0'), con('O')];
}
const netVal = (S, b) => (b === undefined ? 0 : b === '0' ? 0 : b === '1' ? 1 : S.val.get(b) || 0);
function evalNetlist() {
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    for (const l of A.luts) {
      const idx = l.ins.reduce((a, b, i) => a | (netVal(A, b) << i), 0);
      const v = +l.init[15 - idx];
      if (A.val.get(l.out) !== v) { A.val.set(l.out, v); changed = true; }
    }
    if (!changed) return;
  }
  throw new Error('netlist: no stable state');
}

// ---------------------------------------------------------------- the XDL
const design = parseXdl(fs.readFileSync(xdlFile, 'utf8'));
const netOfPin = new Map();          // "inst pin" -> net name (inpins and outpins)
for (const n of design.nets) for (const p of [...n.outpins, ...n.inpins]) netOfPin.set(`${p.inst} ${p.pin}`, n.name);
const B = { val: new Map(), luts: [], ffs: [] };
const cfgOf = inst => Object.fromEntries(inst.cfg.map(c => [c.attr, c]));
for (const inst of design.insts) {
  const cfg = cfgOf(inst), pin = p => netOfPin.get(`${inst.name} ${p}`);
  if (inst.type === 'SLICEL' || inst.type === 'SLICEM') {
    for (const [side, out, X, ff] of [['F', 'X', 'X', 'FFX'], ['G', 'Y', 'Y', 'FFY']]) {
      const lutOut = `${inst.name}/${side}`;   // the LUT's output, inside the slice
      if (cfg[side]) B.luts.push({ eq: cfg[side].value.replace(/^#LUT:/, ''), ins: [1, 2, 3, 4].map(k => pin(`${side}${k}`)), out: lutOut });
      const xmux = cfg[`${side === 'F' ? 'FX' : 'GY'}MUX`]?.value;
      if (xmux && pin(out)) B.luts.push({ copy: lutOut, out: pin(out) });   // FXMUX::F / GYMUX::G: the LUT on X / Y
      if (cfg[ff]) {
        const dmux = cfg[`D${X}MUX`]?.value;
        B.ffs.push({
          name: cfg[ff].name, d: dmux === '1' ? lutOut : pin(`B${X}`), q: pin(`${X}Q`),
          ce: cfg.CEINV ? pin('CE') : undefined, sr: cfg.SRINV ? pin('SR') : undefined,
          sync: cfg.SYNC_ATTR?.value === 'SYNC', srHigh: cfg[`${ff}_SR_ATTR`]?.value === 'SRHIGH', init: cfg[`${ff}_INIT_ATTR`]?.value === 'INIT1' ? 1 : 0,
        });
      }
    }
  } else if (inst.type === 'IOB' || inst.type === 'IBUF') {
    const pad = cfg.PAD?.name;
    const port = pad && pad.replace(/<(\d+)>$/, '[$1]');
    if (pin('I')) B.val.set(pin('I'), inputs[port] || 0);
  }
}
const vB = n => (n === undefined ? 0 : B.val.get(n) || 0);
function evalXdl() {
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    for (const l of B.luts) {
      const v = l.copy ? vB(l.copy) : evalLut(l.eq, Object.fromEntries(l.ins.map((n, k) => [`A${k + 1}`, vB(n)])));
      if (B.val.get(l.out) !== +v) { B.val.set(l.out, +v); changed = true; }
    }
    if (!changed) return;
  }
  throw new Error('XDL: no stable state');
}

// ---------------------------------------------------------------- both, edge by edge
for (const f of A.ffs) A.val.set(f.q, f.init);
for (const f of B.ffs) B.val.set(f.q, f.init);
const byName = new Map(B.ffs.map(f => [f.name, f]));
for (const f of A.ffs) if (!byName.has(f.name)) { console.error(`flip-flop ${f.name} not in the XDL`); process.exit(1); }
function run(n, from) {
  for (let t = 0; t < n; t++) {
    evalNetlist(); evalXdl();
    const nextA = A.ffs.map(f => {
      const sr = netVal(A, f.sr), ce = f.ce === undefined ? 1 : netVal(A, f.ce);
      if (f.mode !== 'NONE' && sr) return /_SET$/.test(f.mode) ? 1 : 0;
      return ce ? netVal(A, f.d) : netVal(A, f.q);
    });
    const nextB = B.ffs.map(f => {
      const sr = vB(f.sr), ce = f.ce === undefined ? 1 : vB(f.ce);
      if (f.sr !== undefined && sr) return f.srHigh ? 1 : 0;
      return ce ? vB(f.d) : vB(f.q);
    });
    A.ffs.forEach((f, i) => A.val.set(f.q, nextA[i]));
    B.ffs.forEach((f, i) => B.val.set(f.q, nextB[i]));
    for (const f of A.ffs) {
      const a = A.val.get(f.q), b = B.val.get(byName.get(f.name).q);
      if (a !== b) { console.log(`${from}cycle ${t + 1}: ${f.name} is ${a} in the netlist, ${b} in the XDL`); process.exit(1); }
    }
  }
}
run(cycles, '');
let seed = 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
for (let k = 0; k < starts; k++) {
  for (const f of A.ffs) { const v = rand() < 0.9 ? 1 : 0; A.val.set(f.q, v); B.val.set(byName.get(f.name).q, v); }
  run(64, `start ${k + 1}, `);
}
console.log(`${cycles} cycles${starts ? ` and ${starts} random starts` : ''}: the XDL's ${B.ffs.length} flip-flops follow the netlist's`);
