// The packer (packages/silinx-fpga/src/fpga/pack.js) on small Yosys netlists (test/fixtures/fpga/*.json): the slices
// and their XDL settings, the shapes the placer must keep, and - the main check - the packed
// design simulated from its own XDL settings behaves like the netlist (test/fpga-sim.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { pack, PackError, WIDE_MUX, connectionCriticality } from '../packages/silinx-fpga/src/fpga/pack.js';
import { criticalDelay } from '../packages/silinx-fpga/src/synth-open.js';
import { compareSims } from './fpga-sim.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fpga');
const load = n => readYosysJson(fs.readFileSync(path.join(FIX, `${n}.json`), 'utf8'));
const cfgOf = inst => Object.fromEntries(inst.cfg.map(c => [c.attr, c]));
const val = (inst, a) => cfgOf(inst)[a]?.value;

for (const [name, cycles] of [['sw', 50], ['counter', 600], ['ffs', 400], ['widemux', 300], ['mux64', 150], ['latches', 600], ['srmux', 300]]) {
  test(`packed ${name} behaves like its netlist (random stimulus, ${cycles} cycles)`, () => {
    const nl = load(name);
    const p = pack(nl);
    const d = compareSims(nl, p, { cycles, seed: 7 });
    assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
  });
}

test('pads: IBUF / IOB instances named after the ports, settings from the UCF', () => {
  const ucf = 'NET "sw" LOC = "P11" | IOSTANDARD = LVCMOS33 | PULLDOWN;\nNET "led" LOC = "M5" | IOSTANDARD = LVCMOS33 | DRIVE = 8 | SLEW = FAST;';
  const p = pack(load('sw'), { ucf });
  const sw = p.insts.find(i => i.name === 'sw'), led = p.insts.find(i => i.name === 'led'), one = p.insts.find(i => i.name === 'one');
  assert.equal(sw.type, 'IBUF');
  assert.equal(sw.loc, 'P11');
  assert.deepEqual([val(sw, 'IOATTRBOX'), val(sw, 'IMUX'), val(sw, 'PULL')], ['LVCMOS33', '1', 'PULLDOWN']);
  assert.equal(cfgOf(sw).PAD.name, 'sw');
  assert.equal(led.type, 'IOB');
  assert.deepEqual([val(led, 'IOATTRBOX'), val(led, 'DRIVEATTRBOX'), val(led, 'SLEW'), val(led, 'OMUX')], ['LVCMOS33', '8', 'FAST', 'O1']);
  // without constraints: ISE's defaults
  assert.deepEqual([one.loc, val(one, 'IOATTRBOX'), val(one, 'DRIVEATTRBOX'), val(one, 'SLEW')], [null, 'LVCMOS25', '12', 'SLOW']);
  // the switch drives the LED straight from pad to pad; the constant output comes from a vcc net
  const k = i => p.insts.indexOf(i);
  const n = p.nets.find(x => x.outpins[0]?.inst === k(sw));
  assert.deepEqual(n.inpins, [{ inst: k(led), pin: 'O1' }]);
  const vcc = p.nets.find(x => x.type === 'vcc');
  assert.deepEqual(vcc.inpins, [{ inst: k(one), pin: 'O1' }]);
  assert.equal(vcc.outpins.length, 0);
});

test('counter: carry chains as vertical groups, flip-flops in the slices of their sums', () => {
  const p = pack(load('counter'), { ucf: null });
  assert.equal(p.stats.slices, 9);
  const chains = p.macros.filter(m => m.kind === 'carry');
  assert.equal(chains.length, 2);
  for (const m of chains) m.members.forEach((x, k) => assert.deepEqual([x.dx, x.dy], [0, k]));
  // the 8-bit counter: 4 slices, 2 sum bits and their 2 flip-flops in each
  const cnt = chains.find(m => m.members.length === 4);
  const sl = cnt.members.map(x => p.insts[x.inst]);
  for (const s of sl) {
    assert.equal(val(s, 'FFX'), '#FF');
    assert.equal(val(s, 'FFY'), '#FF');
    assert.deepEqual([val(s, 'FXMUX'), val(s, 'GYMUX'), val(s, 'DXMUX'), val(s, 'DYMUX')], ['FXOR', 'GXOR', '1', '1']);
    // synchronous reset and clock enable shared by the two flip-flops
    assert.deepEqual([val(s, 'SYNC_ATTR'), val(s, 'SRINV'), val(s, 'CEINV'), val(s, 'CLKINV')], ['SYNC', 'SR', 'CE', 'CLK']);
  }
  // the chain starts from the constant 0 through BX; the next slices from CIN
  assert.equal(val(sl[0], 'CYINIT'), 'BX');
  for (const s of sl.slice(1)) assert.equal(val(s, 'CYINIT'), 'CIN');
  const k = sl.map(s => p.insts.indexOf(s));
  const gnd = p.nets.find(n => n.type === 'gnd');
  assert.ok(gnd.inpins.some(x => x.inst === k[0] && x.pin === 'BX'));
  for (let j = 1; j < 4; j++) {
    const link = p.nets.find(n => n.outpins[0]?.inst === k[j - 1] && n.outpins[0].pin === 'COUT');
    assert.deepEqual(link.inpins, [{ inst: k[j], pin: 'CIN' }]);
    assert.equal(val(p.insts[k[j - 1]], 'COUTUSED'), '0');
  }
  // the constant carry inputs: CY0F 1 at bit 0 with its VCC element, 0 elsewhere with a GND one
  assert.equal(val(sl[0], 'CY0F'), '1');
  assert.ok(cfgOf(sl[0]).C1VDD);
  assert.equal(val(sl[1], 'CY0F'), '0');
  assert.ok(cfgOf(sl[1]).GNDF);
  // the comparator: its DI is not an input of the stage's LUT and the LUT is full, so a first
  // stage of its own brings the carry in (LUT F = 0, CY0F = the constant), DI comes through BY
  const cmp = chains.find(m => m.members.length === 3).members.map(x => p.insts[x.inst]);
  assert.match(val(cmp[0], 'F'), /^#LUT:D=0$/);
  assert.equal(val(cmp[0], 'CY0G'), 'BY');
  // its result leaves the chain through XB
  assert.equal(val(cmp[2], 'XBUSED'), '0');
});

test('carryOut xor: a carry out read by logic leaves through an XOR stage (LUT 0) and X / Y, never XB / YB', () => {
  const nl = load('counter');
  const p = pack(nl, { carryOut: 'xor' });
  assert.ok(!p.insts.some(i => val(i, 'XBUSED') || val(i, 'YBUSED')));
  assert.ok(!p.nets.some(n => n.outpins.some(o => o.pin === 'XB' || o.pin === 'YB')));
  // the comparator ended on the F side of its third slice: the G side of that slice is the extra stage
  const cmp = p.macros.filter(m => m.kind === 'carry').find(m => m.members.length === 3).members.map(x => p.insts[x.inst]);
  assert.match(val(cmp[2], 'G'), /^#LUT:D=0$/);
  assert.ok(cfgOf(cmp[2]).XORG);
  assert.equal(val(cmp[2], 'GYMUX'), 'GXOR');
  assert.equal(val(cmp[2], 'YUSED'), '0');
  assert.ok(p.nets.some(n => n.outpins.some(o => o.inst === p.insts.indexOf(cmp[2]) && o.pin === 'Y')));
  const d = compareSims(nl, p, { cycles: 600, seed: 7 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle}`);
});

// a chain m0 (a real stage) -> m1 -> m2 whose selects are the constant 1 (as blinky's comparator against a
// constant ended), its carry out to a pad; xorOn: an XORCY on m1's carry in (a sum that reads it)
const passChain = ({ xorOn = false } = {}) => {
  const io = (t, i, o) => ({ type: t, parameters: {}, port_directions: { I: 'input', O: 'output' }, connections: { I: [i], O: [o] } });
  const lut2 = (i0, i1, o) => ({ type: 'LUT2', parameters: { INIT: '1001' }, port_directions: { I0: 'input', I1: 'input', O: 'output' }, connections: { I0: [i0], I1: [i1], O: [o] } });
  const muxcy = (ci, di, sel, o) => ({ type: 'MUXCY', parameters: {}, port_directions: { CI: 'input', DI: 'input', S: 'input', O: 'output' }, connections: { CI: [ci], DI: [di], S: [sel], O: [o] } });
  const xorcy = (ci, li, o) => ({ type: 'XORCY', parameters: {}, port_directions: { CI: 'input', LI: 'input', O: 'output' }, connections: { CI: [ci], LI: [li], O: [o] } });
  return readYosysJson(JSON.stringify({ modules: { cmp: {
    attributes: { top: '00000000000000000000000000000001' },
    ports: { a: { direction: 'input', bits: [2] }, b: { direction: 'input', bits: [3] }, c: { direction: 'input', bits: [4] }, y: { direction: 'output', bits: [10] }, ...(xorOn && { z: { direction: 'output', bits: [11] } }) },
    cells: {
      ia: io('IBUF', 2, 12), ib: io('IBUF', 3, 13), ic: io('IBUF', 4, 14), oy: io('OBUF', 9, 10),
      s0: lut2(12, 13, 6), m0: muxcy(14, 12, 6, 7), m1: muxcy(7, 13, '1', 8), m2: muxcy(8, 12, '1', 9),
      ...(xorOn && { x1: xorcy(7, '1', 16), oz: io('OBUF', 16, 11) }),
    },
    netnames: {},
  } } }));
};

test('a carry stage whose select is the constant 1 is left out: its loads read its carry in (#591)', () => {
  const nl = passChain();
  const p = pack(nl);
  assert.equal(p.stats.carryPass, 2);
  // one stage left: m0 in one slice, its carry out to the pad through XB
  const chain = p.macros.find(m => m.kind === 'carry').members.map(x => p.insts[x.inst]);
  assert.equal(chain.length, 1);
  assert.ok(cfgOf(chain[0]).CYMUXF);
  assert.equal(cfgOf(chain[0]).CYMUXG, undefined);
  assert.equal(val(chain[0], 'XBUSED'), '0');
  assert.deepEqual(nl.cells.filter(c => c.type === 'MUXCY').map(c => p.cellSites[nl.cells.indexOf(c)]?.bel ?? null), ['CYMUXF', null, null]);
  const k = p.insts.indexOf(chain[0]);
  assert.ok(p.nets.some(n => n.outpins[0]?.inst === k && n.outpins[0].pin === 'XB' && n.inpins.some(i => p.insts[i.inst].kind === 'iob')));
  const d = compareSims(nl, p, { cycles: 64, seed: 3 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle}`);
  // the same through an XOR stage
  const px = pack(nl, { carryOut: 'xor' });
  assert.equal(px.stats.carryPass, 2);
  assert.equal(compareSims(nl, px, { cycles: 64, seed: 3 }), null);
});

test('a constant-1 carry stage whose carry in a sum reads stays in the chain (#591)', () => {
  const nl = passChain({ xorOn: true });
  const p = pack(nl);
  assert.equal(p.stats.carryPass, 1);
  const chain = p.macros.find(m => m.kind === 'carry').members.map(x => p.insts[x.inst]);
  assert.ok(cfgOf(chain[0]).CYMUXF && cfgOf(chain[0]).CYMUXG && cfgOf(chain[0]).XORG);
  const d = compareSims(nl, p, { cycles: 64, seed: 3 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle}`);
});

test('carryOut xor: a chain ending on the G side gets its XOR stage on the F side of a slice above (CIN)', () => {
  // y = {a, c} >= {b, d}-like: two MUXCY stages (F, G of one slice) whose carry out drives a pad
  const io = (t, i, o) => ({ type: t, parameters: {}, port_directions: { I: 'input', O: 'output' }, connections: { I: [i], O: [o] } });
  const lut2 = (i0, i1, o) => ({ type: 'LUT2', parameters: { INIT: '1001' }, port_directions: { I0: 'input', I1: 'input', O: 'output' }, connections: { I0: [i0], I1: [i1], O: [o] } });
  const muxcy = (ci, di, sel, o) => ({ type: 'MUXCY', parameters: {}, port_directions: { CI: 'input', DI: 'input', S: 'input', O: 'output' }, connections: { CI: [ci], DI: [di], S: [sel], O: [o] } });
  const nl = readYosysJson(JSON.stringify({ modules: { cmp: {
    attributes: { top: '00000000000000000000000000000001' },
    ports: { a: { direction: 'input', bits: [2] }, b: { direction: 'input', bits: [3] }, c: { direction: 'input', bits: [4] }, d: { direction: 'input', bits: [5] }, y: { direction: 'output', bits: [10] } },
    cells: {
      ia: io('IBUF', 2, 12), ib: io('IBUF', 3, 13), ic: io('IBUF', 4, 14), id: io('IBUF', 5, 15), oy: io('OBUF', 9, 10),
      s0: lut2(12, 13, 6), s1: lut2(14, 15, 7), m0: muxcy('0', 12, 6, 8), m1: muxcy(8, 14, 7, 9),
    },
    netnames: {},
  } } }));
  const p = pack(nl, { carryOut: 'xor' });
  const chain = p.macros.find(m => m.kind === 'carry').members.map(x => p.insts[x.inst]);
  assert.equal(chain.length, 2);
  assert.ok(cfgOf(chain[0]).CYMUXG && cfgOf(chain[0]).CYMUXF);
  assert.equal(val(chain[0], 'COUTUSED'), '0');
  assert.deepEqual([val(chain[1], 'CYINIT'), val(chain[1], 'FXMUX'), val(chain[1], 'XUSED')], ['CIN', 'FXOR', '0']);
  assert.match(val(chain[1], 'F'), /^#LUT:D=0$/);
  assert.ok(cfgOf(chain[1]).XORF);
  const k = chain.map(s => p.insts.indexOf(s));
  assert.deepEqual(p.nets.find(n => n.outpins[0]?.inst === k[0] && n.outpins[0].pin === 'COUT').inpins, [{ inst: k[1], pin: 'CIN' }]);
  assert.ok(p.nets.some(n => n.outpins[0]?.inst === k[1] && n.outpins[0].pin === 'X'));
  const d = compareSims(nl, p, { cycles: 64, seed: 3 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle}`);
  // the default: through YB, as ISE does
  assert.ok(pack(nl).nets.some(n => n.outpins.some(o => o.pin === 'YB')));
});

test('wide multiplexers: F5 in every slice, F6 / F7 / F8 in their fixed slices', () => {
  const p = pack(load('mux64'));
  const f8 = p.macros.filter(m => m.kind === 'F8');
  assert.equal(f8.length, 1);
  const m = f8[0];
  assert.equal(m.members.length, 8);
  assert.deepEqual(m.align, [2, 2]);
  const at = new Map(m.members.map(x => [`${x.dx},${x.dy}`, p.insts[x.inst]]));
  // two CLBs, one above the other
  assert.deepEqual([...at.keys()].sort(), ['0,0', '0,1', '0,2', '0,3', '1,0', '1,1', '1,2', '1,3']);
  for (const s of at.values()) assert.ok(cfgOf(s).F5MUX, 'every slice has its F5');
  // which FiMUX each slice uses: F6 at S0 / S2 of each CLB, F7 at S1, F8 at S3 of the lower CLB
  const fi = (x, y) => !!cfgOf(at.get(`${x},${y}`)).F6MUX;
  assert.deepEqual([fi(0, 0), fi(1, 0), fi(0, 1), fi(1, 1), fi(0, 2), fi(1, 2), fi(0, 3), fi(1, 3)], [true, true, true, true, true, true, true, false]);
  // the F8 input from the CLB above: FX of S1 of the upper CLB -> FXINB of S3 of the lower one
  const k = s => p.insts.indexOf(s);
  const n = p.nets.find(x => x.outpins[0]?.inst === k(at.get('0,3')) && x.outpins[0].pin === 'FX');
  assert.deepEqual(n.inpins, [{ inst: k(at.get('1,1')), pin: 'FXINB' }]);
  assert.deepEqual(WIDE_MUX[8][0], { at: [1, 1], a: [0, 1], b: [0, 3] });
  // F6: F5 of the slice above -> FXINB
  const n6 = p.nets.find(x => x.outpins[0]?.inst === k(at.get('0,1')) && x.outpins[0].pin === 'F5');
  assert.deepEqual(n6.inpins, [{ inst: k(at.get('0,0')), pin: 'FXINB' }]);
  // the registered output: the flip-flop sits in the F8's slice, fed through GYMUX = FX
  const top = at.get('1,1');
  assert.deepEqual([val(top, 'GYMUX'), val(top, 'DYMUX'), val(top, 'FFY')], ['FX', '1', '#FF']);
});

test('flip-flops fed by flip-flops (D through BX / BY) fill the free slots of the multiplexers\' slices', () => {
  const p = pack(load('srmux'));
  const slices = p.insts.filter(i => i.type === 'SLICEL');
  // FFY of a slice whose F5MUX selects through BX and whose BY no F6MUX uses: D from BY
  const shared = slices.filter(i => cfgOf(i).F5MUX && !cfgOf(i).F6MUX && val(i, 'FFY') === '#FF' && val(i, 'DYMUX') === '0');
  assert.ok(shared.length >= 4, `${shared.length} multiplexer slices with a shift-register flip-flop`);
  for (const i of slices) if (cfgOf(i).F5MUX) assert.notEqual(val(i, 'DXMUX'), '0', 'BX is the F5 select: no flip-flop from BX');
  assert.equal(p.stats.ffs, 8);
  assert.ok(p.stats.slices <= 18, `${p.stats.slices} slices`);   // 20 when the shift register had slices of its own
});

test('flip-flop kinds: set / reset, synchronous / asynchronous, falling edge, never two control sets in a slice', () => {
  const p = pack(load('ffs'));
  const ffs = p.insts.filter(i => i.kind === 'slice').flatMap(s => ['X', 'Y'].filter(X => cfgOf(s)[`FF${X}`]).map(X => ({ s, X })));
  assert.equal(ffs.length, 5);
  const kinds = ffs.map(({ s, X }) => `${val(s, 'SYNC_ATTR')}/${val(s, `FF${X}_SR_ATTR`)}/${val(s, `FF${X}_INIT_ATTR`)}/${val(s, 'CLKINV')}/${val(s, 'SRINV') || '-'}`).sort();
  // (no initial values in ffs.v: Yosys's INIT is x, read as 0 as the simulator starts registers)
  assert.deepEqual(kinds, ['ASYNC/SRHIGH/INIT0/CLK/SR', 'ASYNC/SRLOW/INIT0/CLK/SR', 'ASYNC/SRLOW/INIT0/CLK_B/-', 'SYNC/SRHIGH/INIT0/CLK/SR', 'SYNC/SRLOW/INIT0/CLK/SR']);
});

test('names are plain words; unsupported cells are reported', () => {
  const p = pack(load('counter'));
  for (const i of p.insts) { assert.doesNotMatch(i.name, /[\s:"\\]/); for (const c of i.cfg) assert.doesNotMatch(c.name, /[\s:"\\]/); }
  for (const n of p.nets) assert.doesNotMatch(n.name, /[\s:"\\]/);
  const nl = load('sw');
  nl.cells.push({ name: 'ram', type: 'RAMB16BWE_S18', params: {}, attrs: {}, pins: {}, dirs: {} });
  assert.throws(() => pack(nl), e => e instanceof PackError && /cells not supported yet: RAMB16BWE_S18/.test(e.message));
});

test('latches: #LATCH, transparent while CLKINV gives 0 (an active-high gate takes CLK_B, as ISE writes it)', () => {
  const p = pack(load('latches'));
  const lat = p.insts.filter(i => i.kind === 'slice' && ['X', 'Y'].some(X => val(i, `FF${X}`) === '#LATCH'));
  assert.ok(lat.length >= 2);
  // the LDCEs (gate g & ge): active high, CLK_B; the LDPE's gate !g2 comes through extractinv's INV, which is its
  // CLKINV (CLK: active low), not a LUT (#80): 3 LUTs, the AND, the XOR and the flip-flop's
  assert.deepEqual(lat.map(s => val(s, 'CLKINV')).sort(), ['CLK', 'CLK_B']);
  for (const s of lat) assert.equal(val(s, 'SYNC_ATTR'), 'ASYNC');
  assert.equal(p.stats.luts, 3);
});

// the counter with its flip-flops' clock through an inverter (as extractinv writes IS_C_INVERTED); extra: gives the
// inverter's output another load besides the clock pins; some: which of the clock's loads move to the inverter
function invertedClock(extra = null, some = () => true) {
  const nl = load('counter');
  const clk = nl.cells.find(c => /^FD/.test(c.type)).pins.C;
  const k = nl.nets.length;
  const moved = nl.nets[clk].loads.filter(some);
  nl.nets.push({ id: k, name: 'clk_n', driver: { cell: nl.cells.length, pin: 'O' }, port: null, loads: moved });
  for (const l of moved) nl.cells[l.cell].pins.C = k;
  nl.nets[clk].loads = [...nl.nets[clk].loads.filter(l => !moved.includes(l)), { cell: nl.cells.length, pin: 'I' }];
  nl.cells.push({ name: 'clk_inv', type: 'INV', params: {}, attrs: {}, pins: { I: clk, O: k }, dirs: { I: 'input', O: 'output' } });
  if (extra) extra(nl, k);
  return nl;
}

test('a clock inverter (extractinv\'s INV on the C pins) is the slices\' CLKINV, not a LUT on the clock (#80)', () => {
  const plain = pack(load('counter'));
  const nl = invertedClock();
  const p = pack(nl);
  assert.equal(p.stats.luts, plain.stats.luts, 'no LUT for the inverter');
  const ffs = p.insts.filter(i => i.kind === 'slice' && ['X', 'Y'].some(X => val(i, `FF${X}`) === '#FF'));
  assert.ok(ffs.length >= 4);
  for (const s of ffs) assert.equal(val(s, 'CLKINV'), 'CLK_B', s.name);
  for (const s of plain.insts.filter(i => i.kind === 'slice' && val(i, 'FFX') === '#FF')) assert.equal(val(s, 'CLKINV'), 'CLK');
  // its input netlist unchanged (the packer works on its own copies)
  assert.equal(nl.cells.at(-1).type, 'INV');
  assert.ok(nl.cells.filter(c => /^FD/.test(c.type)).every(c => !c.params.IS_C_INVERTED));
  const d = compareSims(nl, p, { cycles: 300, seed: 7 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
});

test('flip-flops of one clock, half of them through the inverter: never in one slice (CLKINV is the slice\'s, #80)', () => {
  // every other flip-flop of the counter on the inverted clock, so that pairs of neighbours differ
  let n = 0;
  const nl = invertedClock(null, () => n++ % 2 === 1);
  const p = pack(nl);
  const ffs = p.insts.filter(i => i.kind === 'slice' && ['X', 'Y'].some(X => val(i, `FF${X}`) === '#FF'));
  // a slice's flip-flops (one or two) all take its CLKINV: 4 flip-flops on each polarity, and the simulation below
  // fails if a slice held one of each
  const count = s => ['X', 'Y'].filter(X => val(s, `FF${X}`) === '#FF').length;
  assert.deepEqual(['CLK', 'CLK_B'].map(v => ffs.filter(s => val(s, 'CLKINV') === v).reduce((t, s) => t + count(s), 0)), [4, 4]);
  assert.equal(p.stats.luts, pack(load('counter')).stats.luts);
  const d = compareSims(nl, p, { cycles: 300, seed: 7 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
});

test('an inverter that also drives logic stays a LUT for the logic, the clock pins take CLKINV (#80, #527)', () => {
  const nl = invertedClock((n, k) => {
    const lut = n.cells.find(c => c.type === 'LUT4');
    n.nets[lut.pins.I3].loads = n.nets[lut.pins.I3].loads.filter(l => l.cell !== n.cells.indexOf(lut) || l.pin !== 'I3');
    lut.pins.I3 = k;
    n.nets[k].loads.push({ cell: n.cells.indexOf(lut), pin: 'I3' });
  });
  const p = pack(nl);
  assert.equal(p.stats.luts, pack(load('counter')).stats.luts + 1);
  for (const s of p.insts.filter(i => i.kind === 'slice' && val(i, 'FFX') === '#FF')) assert.equal(val(s, 'CLKINV'), 'CLK_B');
  // (the inverter in a LUT, for the logic only: the clock pins no longer go through it)
  const inv = p.cellSites[nl.cells.findIndex(c => c.name === 'clk_inv')];
  assert.ok(inv && ['F', 'G'].includes(inv.bel));
  const d = compareSims(nl, p, { cycles: 300, seed: 7 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
});

// ffs (an FDRE, FDPE, FDSE, FDRE_1 and FDCE; set / reset from the input r, clock enable from ce) with an inverter
// before each flip-flop's set / reset and clock enable, one per pin, as extractinv writes IS_<pin>_INVERTED; extra:
// gives an inverter's output another load
function invertedControls(extra = null) {
  const nl = load('ffs');
  const invs = [];
  nl.cells.forEach((c, i) => {
    if (!/^FD/.test(c.type)) return;
    for (const pin of ['R', 'S', 'CLR', 'PRE', 'CE']) {
      const src = c.pins[pin];
      if (src === undefined || nl.nets[src].const !== undefined) continue;
      const k = nl.nets.length, inv = nl.cells.length;
      nl.nets.push({ id: k, name: `${c.name}_${pin}_n`, driver: { cell: inv, pin: 'O' }, port: null, loads: [{ cell: i, pin }] });
      nl.nets[src].loads = [...nl.nets[src].loads.filter(l => l.cell !== i || l.pin !== pin), { cell: inv, pin: 'I' }];
      c.pins[pin] = k;
      nl.cells.push({ name: `${c.name}_${pin}_inv`, type: 'INV', params: {}, attrs: {}, pins: { I: src, O: k }, dirs: { I: 'input', O: 'output' } });
      invs.push({ ff: i, pin, inv, net: k });
    }
  });
  if (extra) extra(nl, invs);
  return { nl, invs };
}
const ffSlices = p => p.insts.filter(i => i.kind === 'slice' && ['X', 'Y'].some(X => val(i, `FF${X}`) === '#FF'));

test('inverters on set / reset and clock enable pins (one per flip-flop) are the slices\' SRINV / CEINV, not LUTs (#527)', () => {
  const plain = pack(load('ffs'));
  const { nl, invs } = invertedControls();
  assert.equal(invs.length, 6);
  const p = pack(nl);
  assert.equal(p.stats.luts, plain.stats.luts, 'no LUT for the inverters');
  assert.equal(p.stats.slices, plain.stats.slices);
  for (const x of invs) assert.equal(p.cellSites[x.inv], null, nl.cells[x.inv].name);
  // every flip-flop with a set / reset takes SR_B, with a clock enable CE_B; the one without (FDRE_1) neither
  const of = i => p.insts[p.cellSites[i].inst];
  const kinds = nl.cells.map((c, i) => (/^FD/.test(c.type) ? `${c.type}:${val(of(i), 'SRINV') || '-'}:${val(of(i), 'CEINV') || '-'}` : null)).filter(Boolean).sort();
  assert.deepEqual(kinds, ['FDCE:SR_B:-', 'FDPE:SR_B:CE_B', 'FDRE:SR_B:CE_B', 'FDRE_1:-:-', 'FDSE:SR_B:-']);
  for (const s of ffSlices(plain)) assert.notEqual(val(s, 'SRINV'), 'SR_B');
  // its input netlist unchanged
  assert.ok(nl.cells.every(c => !c.params.IS_CLR_INVERTED && !c.params.IS_CE_INVERTED));
  const d = compareSims(nl, p, { cycles: 400, seed: 7 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
});

test('an inverter on a reset that also drives logic stays a LUT for the logic only (#527)', () => {
  const plain = pack(load('ffs'));
  const { nl, invs } = invertedControls((n, xs) => {
    // the FDCE's CLR inverter also feeds the first LUT's I1
    const x = xs.find(y => y.pin === 'CLR'), lut = n.cells.findIndex(c => c.type === 'LUT2');
    n.nets[n.cells[lut].pins.I1].loads = n.nets[n.cells[lut].pins.I1].loads.filter(l => l.cell !== lut || l.pin !== 'I1');
    n.cells[lut].pins.I1 = x.net;
    n.nets[x.net].loads.push({ cell: lut, pin: 'I1' });
  });
  const p = pack(nl);
  assert.equal(p.stats.luts, plain.stats.luts + 1);
  const x = invs.find(y => y.pin === 'CLR');
  assert.ok(['F', 'G'].includes(p.cellSites[x.inv].bel));
  assert.equal(val(p.insts[p.cellSites[x.ff].inst], 'SRINV'), 'SR_B');
  const d = compareSims(nl, p, { cycles: 400, seed: 7 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
});

test('a flip-flop\'s control pin inverted in the netlist (IS_CLR_INVERTED, IS_CE_INVERTED) is simulated as such', () => {
  // (the reference the packed designs above are compared with)
  const nl = load('ffs');
  for (const c of nl.cells) if (c.type === 'FDCE') c.params = { ...c.params, IS_CLR_INVERTED: 1 };
  for (const c of nl.cells) if (c.type === 'FDPE') c.params = { ...c.params, IS_CE_INVERTED: 1 };
  const p = pack(nl);
  assert.deepEqual(nl.cells.filter(c => /^FD[CP]E$/.test(c.type)).map(c => `${val(p.insts[p.cellSites[nl.cells.indexOf(c)].inst], 'SRINV')}:${val(p.insts[p.cellSites[nl.cells.indexOf(c)].inst], 'CEINV') || '-'}`).sort(), ['SR:CE_B', 'SR_B:-']);
  assert.equal(compareSims(nl, p, { cycles: 400, seed: 7 }), null);
  assert.notEqual(compareSims(nl, pack(load('ffs')), { cycles: 400, seed: 7 }), null);
});

// ------------------------------------------------------------------ timing-driven packing (#528)
// a Yosys netlist of cells given as { name: [type, { pin: bit }] } (outputs: O, Q), with a clock input and ports
function tiny(cells, ins = [], outs = []) {
  const ports = { clk: { direction: 'input', bits: [2] } };
  const cs = { clkbuf: { type: 'IBUF', port_directions: { I: 'input', O: 'output' }, connections: { I: [2], O: [3] } },
    clkg: { type: 'BUFG', port_directions: { I: 'input', O: 'output' }, connections: { I: [3], O: [4] } } };
  let bit = 1000;
  for (const n of ins) { const p = bit++; ports[n] = { direction: 'input', bits: [p] }; cs[`${n}_ibuf`] = { type: 'IBUF', port_directions: { I: 'input', O: 'output' }, connections: { I: [p], O: [n] } }; }
  for (const n of outs) { const p = bit++; ports[`${n}_o`] = { direction: 'output', bits: [p] }; cs[`${n}_obuf`] = { type: 'OBUF', port_directions: { I: 'input', O: 'output' }, connections: { I: [n], O: [p] } }; }
  for (const [name, [type, pins, params = {}]] of Object.entries(cells)) {
    const dirs = Object.fromEntries(Object.keys(pins).map(p => [p, /^(O|Q)$/.test(p) ? 'output' : 'input']));
    cs[name] = { type, parameters: params, port_directions: dirs, connections: Object.fromEntries(Object.entries(pins).map(([p, b]) => [p, [b]])) };
  }
  // (bits named by strings in the cells above: numbered here)
  const num = new Map();
  const id = b => (typeof b === 'number' || b === '0' || b === '1' ? b : (num.has(b) || num.set(b, 2000 + num.size), num.get(b)));
  for (const c of Object.values(cs)) for (const p of Object.keys(c.connections)) c.connections[p] = c.connections[p].map(id);
  return readYosysJson({ modules: { t: { attributes: { top: 1 }, ports, cells: cs, netnames: {} } } });
}
const ff = (d, q) => ['FDRE', { C: 4, CE: '1', R: '0', D: d, Q: q }];
const lut2 = (a, b, o) => ['LUT2', { I0: a, I1: b, O: o }, { INIT: '0110' }];

test('criticality before placement: the critical path of synth-open\'s criticalDelay, on the netlists of the tests', () => {
  for (const name of ['sw', 'counter', 'ffs', 'widemux', 'mux64', 'latches', 'srmux']) {
    const text = fs.readFileSync(path.join(FIX, `${name}.json`), 'utf8');
    const nl = readYosysJson(text);
    const r = connectionCriticality(nl.cells.map((c, idx) => ({ ...c, idx })), nl.nets);
    assert.ok(Math.abs(r.dmax - criticalDelay(JSON.parse(text))) < 1e-9, `${name}: ${r.dmax} vs ${criticalDelay(JSON.parse(text))}`);
    for (const c of r.crit.values()) assert.ok(c >= 0 && c <= 1);
  }
});

test('criticality before placement: 1 on the critical path, 1 - slack / critical path elsewhere; a loop is no path', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  // f0 -> A -> B -> f1 (two LUTs) and f0 -> C -> f2 (one): the second has 0.70 + 0.45 of slack
  const nl = tiny({ f0: ff('a', 'q0'), A: lut2('q0', 'q0', 'na'), B: lut2('na', 'q0', 'nb'), f1: ff('nb', 'q1'), C: lut2('q0', 'q0', 'nc'), f2: ff('nc', 'q2') }, ['a'], ['q1', 'q2']);
  const cells = nl.cells.map((c, idx) => ({ ...c, idx }));
  const r = connectionCriticality(cells, nl.nets);
  const dmax = 0.59 + 0.45 + 0.70 + 0.45 + 0.70 + 0.13;
  close(r.dmax, dmax);
  const at = (name, pin) => r.crit.get(`${cells.findIndex(c => c.name === name)}:${pin}`);
  close(at('A', 'I0'), 1); close(at('B', 'I0'), 1); close(at('f1', 'D'), 1);
  // B's second input skips A: 0.70 + 0.45 of slack
  close(at('B', 'I1'), 1 - (0.70 + 0.45) / dmax);
  close(at('C', 'I0'), 1 - (0.70 + 0.45) / dmax); close(at('f2', 'D'), 1 - (0.70 + 0.45) / dmax);
  // a combinational loop does not hang it
  const loop = tiny({ f0: ff('a', 'q0'), A: lut2('q0', 'nb', 'na'), B: lut2('na', 'na', 'nb'), f1: ff('nb', 'q1') }, ['a'], ['q1']);
  assert.ok(connectionCriticality(loop.cells.map((c, idx) => ({ ...c, idx })), loop.nets).dmax > 0);
});

// a chain of five LUTs between two flip-flops (L1 … L5, the critical path), each also reading a register r1 … r5
// that short paths (M1 … M5, a LUT and a flip-flop each) share, so that the nets alone would pack them together
function chainDesign() {
  const cells = {};
  for (let i = 1; i <= 5; i++) { cells[`r${i}`] = ff('b', `r${i}`); cells[`M${i}`] = lut2(`r${i}`, `r${i % 5 + 1}`, `m${i}`); cells[`h${i}`] = ff(`m${i}`, `hq${i}`); }
  cells.f0 = ff('a', 'l0');
  for (let i = 1; i <= 5; i++) cells[`L${i}`] = lut2(`l${i - 1}`, `r${i}`, `l${i}`);
  cells.fz = ff('l5', 'z');
  return tiny(cells, ['a', 'b'], ['z', 'hq1', 'hq2', 'hq3', 'hq4', 'hq5']);
}

test('timing-driven packing: consecutive LUTs of the critical path share a slice, not one with the short paths that share their nets (#528)', () => {
  const nl = chainDesign();
  const p = pack(nl);
  const site = name => p.cellSites[nl.cells.findIndex(c => c.name === name)];
  const lutsOf = inst => nl.cells.filter((c, i) => /^LUT/.test(c.type) && p.cellSites[i]?.inst === inst).map(c => c.name).sort();
  // L5 with the flip-flop it feeds and with L4, L1 with L2 (and with the flip-flops that start the path, f0 and r1);
  // L3, whose neighbours are taken, with logic of a short path
  assert.equal(site('L5').inst, site('fz').inst);
  assert.deepEqual(lutsOf(site('L5').inst), ['L4', 'L5']);
  assert.deepEqual(lutsOf(site('L1').inst), ['L1', 'L2']);
  assert.deepEqual([site('f0').inst, site('r1').inst], [site('L1').inst, site('L1').inst]);
  assert.deepEqual(lutsOf(site('L3').inst), ['L3', 'M2']);
  // as few slices as can be: 12 flip-flops
  assert.equal(p.stats.slices, 6);
  const d = compareSims(nl, p, { cycles: 200, seed: 7 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
});

test('timing-driven packing: kept only when it costs few slices (CRIT_SLICES), else the packing by nets (#528)', () => {
  // the chain above: kept, as few slices as without timing
  const chain = pack(chainDesign());
  assert.equal(chain.stats.timing, true);
  assert.equal(chain.stats.slices, pack(chainDesign(), { timing: false }).stats.slices);
  assert.equal(pack(chainDesign(), { timing: false }).stats.timing, undefined);
  // ten LUTs of the same two registers into ten flip-flops, every path critical and none between the LUTs: by
  // timing each LUT would take a slice of its own (10), by nets two share one (6: 12 flip-flops)
  const cells = { q0: ff('a', 'q0'), q1: ff('b', 'q1') };
  for (let i = 1; i <= 10; i++) { cells[`L${i}`] = ['LUT2', { I0: 'q0', I1: 'q1', O: `l${i}` }, { INIT: i.toString(2).padStart(4, '0') }]; cells[`z${i}`] = ff(`l${i}`, `z${i}`); }
  const nl = tiny(cells, ['a', 'b'], Array.from({ length: 10 }, (_, i) => `z${i + 1}`));
  const p = pack(nl);
  assert.equal(p.stats.timing, false);
  assert.equal(p.stats.slices, 6);
  assert.equal(compareSims(nl, p, { cycles: 100, seed: 7 }), null);
  // and on the netlists of the tests: never more slices than the bound
  for (const name of ['sw', 'counter', 'ffs', 'widemux', 'mux64', 'latches', 'srmux']) {
    const a = pack(load(name)).stats.slices, b = pack(load(name), { timing: false }).stats.slices;
    assert.ok(a <= b + Math.max(1, Math.floor(0.02 * b)), `${name}: ${a} vs ${b}`);
  }
});

// #773: a NET name with wildcards constrains every port bit it matches (before, the packer looked the name up as written,
// and the pads kept LVCMOS25); the last statement that sets an attribute wins, an exact name's or a wildcard's
test('pads: UCF NET wildcards (<*>, *, ?) give every matching pad its I/O standard, drive, slew, pull and LOC (#773)', () => {
  const ucf = `NET "q<*>" IOSTANDARD = LVCMOS33 | SLEW = FAST;
NET "q<0>" LOC = "M5" | IOSTANDARD = LVTTL;
NET "q<?>" DRIVE = 4;
NET "lim*" IOSTANDARD = LVCMOS33 | PULLUP;
NET "lim<7>" PULLDOWN;
NET "h?t" IOSTANDARD = LVCMOS18 | LOC = "P6";
NET "nothing*" IOSTANDARD = LVCMOS33;`;
  const p = pack(load('counter'), { ucf });
  const pad = n => p.insts.find(i => i.name === n);
  for (let k = 1; k < 8; k++) assert.deepEqual([val(pad(`q<${k}>`), 'IOATTRBOX'), val(pad(`q<${k}>`), 'SLEW'), val(pad(`q<${k}>`), 'DRIVEATTRBOX')], ['LVCMOS33', 'FAST', '4'], `q<${k}>`);
  assert.deepEqual([pad('q<0>').loc, val(pad('q<0>'), 'IOATTRBOX'), val(pad('q<0>'), 'DRIVEATTRBOX')], ['M5', 'LVTTL', '4']);
  for (let k = 0; k < 7; k++) assert.deepEqual([val(pad(`lim<${k}>`), 'IOATTRBOX'), val(pad(`lim<${k}>`), 'PULL')], ['LVCMOS33', 'PULLUP'], `lim<${k}>`);
  assert.equal(val(pad('lim<7>'), 'PULL'), 'PULLDOWN');
  assert.deepEqual([pad('hit').loc, val(pad('hit'), 'IOATTRBOX'), val(pad('hit'), 'DRIVEATTRBOX')], ['P6', 'LVCMOS18', '12']);
  // the ports no statement names: ISE's defaults
  assert.deepEqual([pad('en').loc, val(pad('en'), 'IOATTRBOX'), val(pad('en'), 'PULL')], [null, 'LVCMOS25', undefined]);
  assert.deepEqual(p.warnings, []);
});

// ------------------------------------------------------------------ clock switches (#846)
// a BUFGMUX between the clock (through its BUFG, net 4, as Yosys's clkbufmap leaves it) and clkb, selected by sel,
// clocking a flip-flop; `also`: another flip-flop on the BUFG's own clock
function clockSwitch({ type = 'BUFGMUX', s = 'sel', also = true } = {}) {
  return tiny({
    u: [type, { I0: 4, I1: 'clkb', S: s, O: 'gclk' }],
    f1: ['FDRE', { C: 'gclk', CE: '1', R: '0', D: 'x', Q: 'q1' }],
    ...(also && { f2: ['FDRE', { C: 4, CE: '1', R: '0', D: 'x', Q: 'q2' }] }),
  }, ['clkb', 'sel', 'x'], ['q1', 'q2']);
}
const driverOf = (p, inst, pin) => { const n = p.nets.find(n => n.inpins.some(q => q.inst === inst && q.pin === pin)); return n && p.insts[n.outpins[0].inst].name; };

test('a BUFGMUX: a global buffer with I0, I1 and S, its select not inverted; its input from the clock\'s pad, not from the clock\'s BUFG (#846)', () => {
  const p = pack(clockSwitch());
  const u = p.insts.findIndex(i => i.name === 'u');
  assert.equal(p.insts[u].type, 'BUFGMUX');
  assert.deepEqual(p.insts[u].cfg.map(c => `${c.attr}:${c.name}:${c.value}`), ['DISABLE_ATTR::LOW', 'I0_USED::0', 'I1_USED::0', 'SINV::S', 'GCLKMUX:u.GCLKMUX:']);
  assert.deepEqual(['I0', 'I1', 'S'].map(pin => driverOf(p, u, pin)), ['clk', 'clkb', 'sel']);
  // the clock's BUFG stays for its other flip-flop; with none, it is gone
  assert.equal(p.stats.bufgs, 2);
  assert.equal(pack(clockSwitch({ also: false })).stats.bufgs, 1);
  assert.deepEqual(p.warnings, []);
});

test('a BUFGMUX_1: DISABLE_ATTR HIGH (its output high while it switches); a constant select: a BUFG of the input it selects (#846)', () => {
  const p = pack(clockSwitch({ type: 'BUFGMUX_1' }));
  assert.equal(val(p.insts.find(i => i.name === 'u'), 'DISABLE_ATTR'), 'HIGH');
  for (const [s, from] of [['0', 'clk'], ['1', 'clkb']]) {
    const q = pack(clockSwitch({ s }));
    const u = q.insts.findIndex(i => i.name === 'u');
    assert.deepEqual([val(q.insts[u], 'SINV'), val(q.insts[u], 'I1_USED')], ['S_B', undefined], `S = ${s}`);
    assert.equal(driverOf(q, u, 'I0'), from, `S = ${s}`);
    assert.equal(driverOf(q, u, 'I1'), undefined, `S = ${s}`);
  }
});
