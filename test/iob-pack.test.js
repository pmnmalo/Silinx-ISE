// #96: registers in the IOBs in the Silinx toolchain's packer (core/fpga/pack.js): which flip-flops go there (the UCF's
// IOB = TRUE / FALSE on a net or an instance, the HDL's IOB attribute, the option iobRegs as map's -pr), their
// settings as ISE's map writes them (the bit database's features, #44), their site pins, the tristate outputs; the
// packed design behaving as the netlist (test/fpga-sim.js), the static timing's arcs and the simulation model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readYosysJson } from '../core/fpga/netlist.js';
import { pack } from '../core/fpga/pack.js';
import { instArcs, timingGraph } from '../core/fpga/timing.js';
import { iobRegFeatures } from '../core/fpga/bitgen.js';
import { postMapModels } from '../core/sim-model.js';
import { compareSims, packedSim, netlistSim } from './fpga-sim.js';

// a Yosys netlist: clk -> IBUFG -> BUFG (bit 4); inputs (an IBUF each, its output named by the input), outputs
// (an OBUF each from the named bit), tristate outputs ({ name: [I bit, T bit] }: an OBUFT each), and cells
// { name: [type, { pin: bit }, params, attrs] } (outputs O and Q)
function design(cells, { ins = [], outs = [], tris = {} } = {}) {
  const ports = { clk: { direction: 'input', bits: [2] } };
  const io = (I, O) => ({ port_directions: { I: 'input', O: 'output' }, connections: { I: [I], O: [O] } });
  const cs = { clkbuf: { type: 'IBUFG', ...io(2, 3) }, clkg: { type: 'BUFG', ...io(3, 4) } };
  let bit = 1000;
  for (const n of ins) { const p = bit++; ports[n] = { direction: 'input', bits: [p] }; cs[`${n}_ibuf`] = { type: 'IBUF', ...io(p, n) }; }
  for (const n of outs) { const p = bit++; ports[`${n}_o`] = { direction: 'output', bits: [p] }; cs[`${n}_obuf`] = { type: 'OBUF', ...io(n, p) }; }
  for (const [n, [i, t]] of Object.entries(tris)) {
    const p = bit++;
    ports[n] = { direction: 'output', bits: [p] };
    cs[`${n}_obuft`] = { type: 'OBUFT', port_directions: { I: 'input', T: 'input', O: 'output' }, connections: { I: [i], T: [t], O: [p] } };
  }
  for (const [name, [type, pins, params = {}, attributes = {}]] of Object.entries(cells)) {
    const dirs = Object.fromEntries(Object.keys(pins).map(p => [p, /^(O|Q)$/.test(p) ? 'output' : 'input']));
    cs[name] = { type, parameters: params, attributes, port_directions: dirs, connections: Object.fromEntries(Object.entries(pins).map(([p, b]) => [p, [b]])) };
  }
  const num = new Map();
  const id = b => (typeof b === 'number' || b === '0' || b === '1' ? b : (num.has(b) || num.set(b, 2000 + num.size), num.get(b)));
  for (const c of Object.values(cs)) for (const p of Object.keys(c.connections)) c.connections[p] = c.connections[p].map(id);
  return readYosysJson({ modules: { t: { attributes: { top: 1 }, ports, cells: cs, netnames: {} } } });
}
const fdre = (d, q, ce = '1', r = '0') => ['FDRE', { C: 4, CE: ce, R: r, D: d, Q: q }];
const fdce = (d, q, ce, clr) => ['FDCE', { C: 4, CE: ce, CLR: clr, D: d, Q: q }];
const lut2 = (a, b, o, init = '0110') => ['LUT2', { I0: a, I1: b, O: o }, { INIT: init }];
const cfgOf = inst => Object.fromEntries(inst.cfg.map(c => [c.attr, c]));
const cfgText = inst => inst.cfg.map(c => `${c.attr}:${c.name}:${c.value}`).join(' ');
const iob = (p, port) => p.insts.find(i => i.kind === 'iob' && i.name === port);
// the nets on the site pins of an instance: { pin: net name }
const pinsOf = (p, inst) => {
  const k = p.insts.indexOf(inst), out = {};
  for (const n of p.nets) for (const x of [...n.inpins, ...n.outpins]) if (x.inst === k) out[x.pin] = n.name;
  return out;
};
const same = (nl, p, seed = 7) => {
  const d = compareSims(nl, p, { cycles: 300, seed });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
};

// an input register (a), its output also read by logic; an output register (q) of a LUT; a register both read by
// logic and driving an output (b: not an output register)
const basic = () => design({
  ra: fdre('a', 'qa'), x: lut2('qa', 'a', 'nx'), rq: fdre('nx', 'q'), rb: fdre('nx', 'qb'), y: lut2('qb', 'qa', 'ny'), ry: fdre('ny', 'yq'),
}, { ins: ['a'], outs: ['q', 'qb', 'yq'] });

test('IOB registers: none by default (as ISE\'s flow, map -pr off); iobRegs i / o / b as map\'s -pr', () => {
  const nl = basic();
  const plain = pack(nl);
  assert.deepEqual(plain.insts.filter(i => i.kind === 'iob').flatMap(i => i.cfg.filter(c => /FF1$/.test(c.attr))), []);
  const regs = p => p.insts.filter(i => i.kind === 'iob').flatMap(i => i.cfg.filter(c => /^[IOT]FF1$/.test(c.attr)).map(c => `${i.name} ${c.attr} ${c.name}`)).sort();
  assert.deepEqual(regs(pack(nl, { iobRegs: 'i' })), ['a IFF1 ra']);
  assert.deepEqual(regs(pack(nl, { iobRegs: 'o' })), ['q_o OFF1 rq', 'yq_o OFF1 ry']);
  assert.deepEqual(regs(pack(nl, { iobRegs: 'b' })), ['a IFF1 ra', 'q_o OFF1 rq', 'yq_o OFF1 ry']);
  // (rb drives logic too: in a slice; the slices have two flip-flops fewer)
  assert.equal(pack(nl, { iobRegs: 'b' }).stats.ffs, plain.stats.ffs - 3);
  for (const o of ['off', 'i', 'o', 'b']) same(nl, pack(nl, { iobRegs: o }));
});

test('IOB registers: the UCF\'s IOB = TRUE / FALSE on a net (UCF wildcards) or an instance, the last one that matches; the HDL\'s IOB attribute', () => {
  const nl = basic();
  const regs = p => p.insts.filter(i => i.kind === 'iob').flatMap(i => i.cfg.filter(c => /^[IOT]FF1$/.test(c.attr)).map(c => c.name)).sort();
  assert.deepEqual(regs(pack(nl, { ucf: 'NET "a" IOB = TRUE ;' })), ['ra']);
  assert.deepEqual(regs(pack(nl, { ucf: 'NET "*_o" IOB = TRUE ;' })), ['rq', 'ry']);
  assert.deepEqual(regs(pack(nl, { ucf: 'NET "?q_o" IOB = TRUE ;' })), ['ry']);
  assert.deepEqual(regs(pack(nl, { ucf: 'INST "rq" IOB = TRUE ;' })), ['rq']);
  // FALSE wins over the option; the instance's over the net's
  assert.deepEqual(regs(pack(nl, { iobRegs: 'b', ucf: 'NET "*" IOB = FALSE ;\nINST "ry" IOB = TRUE ;' })), ['ry']);
  assert.deepEqual(regs(pack(nl, { iobRegs: 'b', ucf: 'NET "q_o" IOB = FALSE ;' })), ['ra', 'ry']);
  // the HDL's attribute on the flip-flop (Yosys keeps it on the cell)
  const att = design({ ra: [...fdre('a', 'qa'), {}, { IOB: 'TRUE' }], rb: [...fdre('a', 'qb'), {}, { IOB: 'FALSE' }], x: lut2('qa', 'qb', 'q') }, { ins: ['a'], outs: ['q'] });
  assert.deepEqual(regs(pack(att, { iobRegs: 'b' })), ['ra']);
  same(att, pack(att, { iobRegs: 'b' }));
});

// #671: the router reaches an I/O register's clock pin from the global lines only (as ISE clocks the IOBs): a register
// asked into the IOB whose clock is not on a global buffer stays in a slice
test('IOB registers: a register whose clock is not on a global clock buffer stays out of the IOB, with a warning (#671)', () => {
  // dclk: a clock divided in the fabric (a flip-flop's output, no BUFG); ra on it, rb on the global clock
  const nl = design({
    rd: fdre('nd', 'dclk'), nd: ['LUT1', { I0: 'dclk', O: 'nd' }, { INIT: '01' }],
    ra: ['FDRE', { C: 'dclk', CE: '1', R: '0', D: 'a', Q: 'qa' }], rb: fdre('b', 'qb'), x: lut2('qa', 'qb', 'q'),
  }, { ins: ['a', 'b'], outs: ['q'] });
  const regs = p => p.insts.filter(i => i.kind === 'iob').flatMap(i => i.cfg.filter(c => /^[IOT]FF1$/.test(c.attr)).map(c => c.name)).sort();
  const p = pack(nl, { ucf: 'NET "a" IOB = TRUE ;\nNET "b" IOB = TRUE ;' });
  assert.deepEqual(regs(p), ['rb']);
  assert.equal(p.warnings.length, 1);
  assert.match(p.warnings[0], /^flip-flop ra kept out of the IOB of a: its clock \S+ is not on a global clock buffer$/);
  // not asked: no warning
  assert.deepEqual(pack(nl, { ucf: 'NET "b" IOB = TRUE ;' }).warnings, []);
  same(nl, p);
});

test('IOB registers: the input register\'s settings as ISE\'s map writes them, its delay the one ISE chooses (DLY2 on the XC3S100E), its site pins', () => {
  // with an asynchronous clear and a clock enable from inputs, read by an output's logic; the pad's input not used directly
  const nl = design({ ra: fdce('a', 'qa', 'ce', 'clr'), x: lut2('qa', 'ce', 'q') }, { ins: ['a', 'ce', 'clr'], outs: ['q'] });
  const p = pack(nl, { iobRegs: 'i' });
  const a = iob(p, 'a');
  assert.equal(a.type, 'IBUF');
  assert.equal(cfgText(a), 'IOATTRBOX::LVCMOS25 IFF1:ra:#FF IFF1_INIT_ATTR::INIT0 IFF1_SR_ATTR::SRLOW IFFATTRBOX::ASYNC ISR_USED::0 SRINV::SR ICEINV::ICE ICLK1INV::ICLK1 '
    + 'IDDRIN_MUX::2 IFD_DELAY_VALUE::DLY3 IFFDELMUX::0 IFFDMUX::1 PRE_DELAY_MUX::0 IFD_DELAY:a.IFD_DELAY: INBUF:a_IBUF: PAD:a:');
  assert.equal(cfgOf(pack(nl, { iobRegs: 'i', part: 'xc3s100ecp132-4' }).insts.find(i => i.name === 'a')).IFD_DELAY_VALUE.value, 'DLY2');
  const pins = pinsOf(p, a);
  assert.deepEqual(Object.keys(pins).sort(), ['ICE', 'ICLK1', 'IQ1', 'SR']);
  assert.equal(pins.ICLK1, p.nets.find(n => n.outpins.some(x => p.insts[x.inst].kind === 'bufg')).name);
  // the bit database's features of these settings (iobRegFeatures): the delay, the register and its parts
  const f = iobRegFeatures(a.cfg);
  for (const x of ['IFD:DLY3', 'R:IFF1:#FF', 'R:IFF1_SR_ATTR:SRLOW', 'R:IFFATTRBOX:ASYNC', 'R:ICEINV:ICE', 'R:IFF2:#OFF', 'R:REVINV:#OFF']) assert.ok(f.includes(x), x);
  same(nl, p);
  // the input also read directly: IMUX, and its I pin
  const both = design({ ra: fdre('a', 'qa'), x: lut2('qa', 'a', 'q') }, { ins: ['a'], outs: ['q'] });
  const pb = pack(both, { iobRegs: 'i' });
  assert.equal(cfgOf(iob(pb, 'a')).IMUX.value, '1');
  assert.deepEqual(Object.keys(pinsOf(pb, iob(pb, 'a'))).sort(), ['I', 'ICLK1', 'IQ1']);
  same(both, pb);
});

test('IOB registers: an output register and an output-enable register share the IOB\'s clock and set / reset; a tristate output\'s enable on T1', () => {
  // y: data and enable both registered (same clock, the same clear); z: the enable from logic (TMUX T1)
  const nl = design({
    rd: fdce('d', 'qd', '1', 'clr'), rt: fdce('t', 'qt', 'ce', 'clr'), rz: fdre('d', 'qz'), zt: lut2('t', 'd', 'nz'),
  }, { ins: ['d', 't', 'ce', 'clr'], tris: { y: ['qd', 'qt'], z: ['qz', 'nz'] } });
  const p = pack(nl, { iobRegs: 'o' });
  const y = iob(p, 'y'), z = iob(p, 'z');
  assert.equal(cfgText(y), 'DRIVEATTRBOX::12 IOATTRBOX::LVCMOS25 O1INV::O1 OMUX::OFF1 SLEW::SLOW T1INV::T1 TMUX::TFF1 OFF1:rd:#FF OFF1_INIT_ATTR::INIT0 OFF1_SR_ATTR::SRLOW OFFATTRBOX::ASYNC OSR_USED::0 SRINV::SR '
    + 'OTCLK1INV::OTCLK1 O1_DDRMUX::1 TFF1:rt:#FF TFF1_INIT_ATTR::INIT0 TFF1_SR_ATTR::SRLOW TFFATTRBOX::ASYNC TSR_USED::0 TCEINV::TCE OUTBUF:y_OBUF: PAD:y:');
  assert.deepEqual(Object.keys(pinsOf(p, y)).sort(), ['O1', 'OTCLK1', 'SR', 'T1', 'TCE']);
  assert.equal(cfgOf(z).TMUX.value, 'T1');
  assert.equal(cfgOf(z).OMUX.value, 'OFF1');
  assert.deepEqual(Object.keys(pinsOf(p, z)).sort(), ['O1', 'OTCLK1', 'T1']);
  same(nl, p);
  same(nl, pack(nl));
  // an output register with a clock enable: O1_DDRMUX and PCICE_MUX as ISE's map writes them (xdl refuses the register
  // without O1_DDRMUX on P6 / P7 of the XC3S250E-CP132)
  const ce = pack(design({ rq: fdre('a', 'q', 'ce') }, { ins: ['a', 'ce'], outs: ['q'] }), { iobRegs: 'o' });
  assert.deepEqual(['O1_DDRMUX', 'PCICE_MUX', 'OCEINV'].map(a => cfgOf(iob(ce, 'q_o'))[a]?.value), ['1', 'OCE', 'OCE']);
  assert.equal(cfgOf(iob(pack(design({ rq: fdre('a', 'q') }, { ins: ['a'], outs: ['q'] }), { iobRegs: 'o' }), 'q_o')).PCICE_MUX, undefined);
  // an enable register of another clock or set / reset than the output register's: in a slice
  const other = design({ rd: fdre('d', 'qd'), rt: fdce('t', 'qt', '1', 'clr') }, { ins: ['d', 't', 'clr'], tris: { y: ['qd', 'qt'] } });
  const po = pack(other, { iobRegs: 'o' });
  assert.equal(cfgOf(iob(po, 'y')).TMUX.value, 'T1');
  assert.equal(cfgOf(iob(po, 'y')).OMUX.value, 'OFF1');
  same(other, po);
});

test('a tristate output without registers (OBUFT): its enable on T1; an enable tied to 0 is a plain output', () => {
  const nl = design({ x: lut2('a', 'b', 'nx'), t: lut2('a', 'b', 'nt', '1000') }, { ins: ['a', 'b'], tris: { y: ['nx', 'nt'], w: ['nx', '0'] } });
  const p = pack(nl);
  assert.equal(cfgText(iob(p, 'y')), 'DRIVEATTRBOX::12 IOATTRBOX::LVCMOS25 O1INV::O1 OMUX::O1 SLEW::SLOW T1INV::T1 TMUX::T1 OUTBUF:y_OBUF: PAD:y:');
  assert.equal(cfgOf(iob(p, 'w')).TMUX, undefined);
  assert.deepEqual(Object.keys(pinsOf(p, iob(p, 'w'))), ['O1']);
  // (the simulators: high impedance while T is 1)
  const a = netlistSim(nl), b = packedSim(p);
  for (const v of [{ a: 1, b: 1 }, { a: 0, b: 1 }]) { a.step(v); b.step(v); assert.deepEqual(b.out(), a.out()); if (v.a) assert.equal(a.out().y, 'z'); }
  same(nl, p);
});

test('IOB registers in the static timing: the input register\'s IQ1 after its clock, the output and enable registers\' O1 / T1 before it', () => {
  const nl = design({ ra: fdre('a', 'qa'), x: lut2('qa', 'qa', 'nx'), rq: fdre('nx', 'q') }, { ins: ['a'], outs: ['q'] });
  const p = pack(nl, { iobRegs: 'b' });
  const a = instArcs({ type: 'IBUF', cfg: iob(p, 'a').cfg }), q = instArcs({ type: 'IOB', cfg: iob(p, 'q_o').cfg });
  assert.deepEqual([a.clock, a.clkToOut, a.setup], [true, [['IQ1', 0.6]], []]);
  assert.deepEqual([q.clock, q.clkToOut, q.setup], [true, [], [['O1', 0.5]]]);
  assert.equal(instArcs({ type: 'IOB', cfg: iob(pack(nl), 'q_o').cfg }).clock, false);
  // the path IQ1 -> LUT -> O1 is the clock's (its clock pins ICLK1, OTCLK1, not data)
  const insts = p.insts.map((i, k) => ({ ...i, site: null, name: i.name || `i${k}` }));
  const g = timingGraph({ insts, nets: p.nets.map(n => ({ ...n, outpins: n.outpins.map(x => ({ inst: insts[x.inst].name, pin: x.pin })), inpins: n.inpins.map(x => ({ inst: insts[x.inst].name, pin: x.pin })) })) });
  const r = g.analyze(g.conns.map(() => 1));
  assert.equal(r.clocks.length, 1);
  assert.deepEqual(r.clocks[0].path.map(x => `${x.inst}.${x.pin} ${x.kind}`).filter(x => /^(a|q_o)\./.test(x)), ['a.IQ1 clock-to-out', 'q_o.O1 net', 'q_o.O1 setup']);
});

test('IOB registers in the post-map simulation model: X_FF / X_SFF fed by the pad\'s buffer or feeding it, X_OBUFT for a tristate output', () => {
  // ra: no set / reset; rq: a synchronous reset; rt: an asynchronous clear
  const nl = design({ ra: fdre('a', 'qa'), x: lut2('qa', 'qa', 'nx'), rq: fdre('nx', 'q', '1', 'a'), rt: fdce('a', 'qt', '1', 'a') }, { ins: ['a'], outs: ['q'], tris: { y: ['nx', 'qt'] } });
  const m = postMapModels(nl, pack(nl, { iobRegs: 'b' }), { top: 't' });
  assert.deepEqual(m.unknown, []);
  const insts = [...m.vhdl.matchAll(/^ {2}(\S+) : (X_\w+)$/gm)].map(x => `${x[1]} ${x[2]}`);
  for (const x of ['ra X_FF', 'rq X_SFF', 'rt X_FF', 'y_OBUFT X_OBUFT', 'a_IBUF X_BUF', 'q_o_OBUF X_OBUF']) assert.ok(insts.includes(x), `${x}: ${insts.join(', ')}`);
});
