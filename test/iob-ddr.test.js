// #96: the IOBs' DDR registers (IDDR2, ODDR2) in the Silinx toolchain. Their simulation models (core/unisim.js, the
// event-driven simulator's; core/compiled-prims.js, the compiled engine's) against values computed here, in VHDL and
// in Verilog; the packer putting them in their pads' IOBs with the settings and pins ISE's map writes (read from its
// routed IDDR2 / ODDR2 on every pad: packages/silinx-fpga/research/s3e-bitstream/gen-iobreg.mjs rd / rd2), and refusing what it cannot do;
// the packed design behaving as the netlist (packages/silinx-fpga/test/fpga-sim.js); the static timing's two clock edges; the
// post-translate and post-map models behaving as the netlist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { Simulator } from '../core/simulator.js';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { pack } from '../packages/silinx-fpga/src/fpga/pack.js';
import { deviceSites, place } from '../packages/silinx-fpga/src/fpga/place.js';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { loadDb } from '../packages/silinx-fpga/src/fpga/bitdb-node.js';
import { instArcs, timingGraph } from '../packages/silinx-fpga/src/fpga/timing.js';
import { postTranslateModels, postMapModels } from '../core/sim-model.js';
import { compareSims } from '../packages/silinx-fpga/test/fpga-sim.js';
import { compareWithNetlist } from './sim-model-lib.mjs';
import { diffCycles, designOf, rng } from './compiled-diff.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (name, file) => [{ path: file, lang: file.endsWith('.v') ? 'verilog' : 'vhdl', role: 'design', text: fs.readFileSync(path.join(ROOT, 'test/fixtures/open-flow', name, file), 'utf8') }];

// ------------------------------------------------------------------ the simulation models
// stimulus, one value per half period of C0 (changed 5 ns into it; C0 rises at 10, 30, 50… ns, C1 = not C0 at 20, 40…):
// [d, ce, r, s, d0, d1]
const N = 64;
const STIM = (() => { const r = rng(96); return Array.from({ length: N }, (_, k) => [r() < 0.5, r() < 0.8, k > 4 && r() < 0.15, k > 4 && r() < 0.15, r() < 0.5, r() < 0.5].map(Number)); })();
// the values expected 8 ns into each half period: IDDR2 SYNC with CE (INIT_Q0 1), IDDR2 ASYNC without CE, ODDR2 SYNC
// with CE (INIT 1), ODDR2 ASYNC without CE (INIT 0): R before S, CE last
function expected() {
  const st = { i0: 1, i1: 0, a0: 0, a1: 0, o0: 1, o1: 1, p0: 0, p1: 0 };
  const out = [];
  const load = (q, [d, ce, r, s], useCe, x) => (r ? 0 : s ? 1 : !useCe || ce ? x : q);
  for (let k = 0; k < N; k++) {
    const v = STIM[k], [d, , r, s, d0, d1] = v;
    // (the asynchronous ones at once)
    for (const x of ['a0', 'a1', 'p0', 'p1']) if (r || s) st[x] = r ? 0 : 1;
    const c0 = k % 2 === 1;   // C0 high during odd half periods (its rising edge began them)
    out.push([st.i0, st.i1, st.a0, st.a1, c0 ? st.o0 : st.o1, c0 ? st.p0 : st.p1].join(''));
    // the edge at the end of this half period: C0's when k is even, C1's when odd
    const e = k % 2 === 0 ? 0 : 1;
    st[`i${e}`] = load(st[`i${e}`], v, true, d);
    st[`a${e}`] = load(st[`a${e}`], v, false, d);
    st[`o${e}`] = load(st[`o${e}`], v, true, e ? d1 : d0);
    st[`p${e}`] = load(st[`p${e}`], v, false, e ? d1 : d0);
  }
  return out;
}
const DUTS = [
  ['IDDR2', 'ui', '(INIT_Q0 => \'1\', INIT_Q1 => \'0\', SRTYPE => "SYNC")', 'D => d, C0 => c0, C1 => c1, CE => ce, R => r, S => s, Q0 => q(0), Q1 => q(1)', '#(.INIT_Q0(1\'b1), .INIT_Q1(1\'b0), .SRTYPE("SYNC"))', '.D(d), .C0(c0), .C1(c1), .CE(ce), .R(r), .S(s), .Q0(q[0]), .Q1(q[1])'],
  ['IDDR2', 'ua', '(SRTYPE => "ASYNC")', 'D => d, C0 => c0, C1 => c1, CE => \'1\', R => r, S => s, Q0 => q(2), Q1 => q(3)', '#(.SRTYPE("ASYNC"))', '.D(d), .C0(c0), .C1(c1), .CE(1\'b1), .R(r), .S(s), .Q0(q[2]), .Q1(q[3])'],
  ['ODDR2', 'uo', '(INIT => \'1\', SRTYPE => "SYNC")', 'D0 => d0, D1 => d1, C0 => c0, C1 => c1, CE => ce, R => r, S => s, Q => q(4)', '#(.INIT(1\'b1), .SRTYPE("SYNC"))', '.D0(d0), .D1(d1), .C0(c0), .C1(c1), .CE(ce), .R(r), .S(s), .Q(q[4])'],
  ['ODDR2', 'up', '(SRTYPE => "ASYNC")', 'D0 => d0, D1 => d1, C0 => c0, C1 => c1, CE => \'1\', R => r, S => s, Q => q(5)', '#(.SRTYPE("ASYNC"))', '.D0(d0), .D1(d1), .C0(c0), .C1(c1), .CE(1\'b1), .R(r), .S(s), .Q(q[5])'],
];
const bit = b => `'${b}'`;
const TB_VHDL = `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
library UNISIM; use UNISIM.VCOMPONENTS.ALL;
entity tb is end;
architecture t of tb is
  signal c0 : std_logic := '0'; signal c1 : std_logic := '1';
  signal d, ce, r, s, d0, d1 : std_logic := '0';
  signal q : std_logic_vector(5 downto 0);
begin
  c0 <= not c0 after 10 ns; c1 <= not c1 after 10 ns;
${DUTS.map(([t, n, g, p]) => `  ${n} : ${t} generic map ${g} port map (${p});`).join('\n')}
  process begin
    wait for 5 ns;
${STIM.map(([dv, cev, rv, sv, d0v, d1v]) => `    d <= ${bit(dv)}; ce <= ${bit(cev)}; r <= ${bit(rv)}; s <= ${bit(sv)}; d0 <= ${bit(d0v)}; d1 <= ${bit(d1v)}; wait for 10 ns;`).join('\n')}
    wait;
  end process;
end;`;
const TB_VERILOG = `\`timescale 1ns/1ps
module tb;
  reg c0 = 1'b0, c1 = 1'b1, d = 1'b0, ce = 1'b0, r = 1'b0, s = 1'b0, d0 = 1'b0, d1 = 1'b0;
  wire [5:0] q;
  always #10 begin c0 = ~c0; c1 = ~c1; end
${DUTS.map(([t, n, , , g, p]) => `  ${t} ${g} ${n} (${p});`).join('\n')}
  initial begin
    #5;
${STIM.map(([dv, cev, rv, sv, d0v, d1v]) => `    d = ${dv}; ce = ${cev}; r = ${rv}; s = ${sv}; d0 = ${d0v}; d1 = ${d1v}; #10;`).join('\n')}
  end
endmodule`;

for (const [lang, text] of [['vhdl', TB_VHDL], ['verilog', TB_VERILOG]]) {
  test(`the IDDR2 / ODDR2 models (${lang === 'vhdl' ? 'VHDL' : 'Verilog'}): Q0 captured on C0, Q1 on C1, Q the first while C0 is high; SYNC / ASYNC set and reset (R first), CE, INIT`, () => {
    const all = [{ path: `tb.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text }];
    const lib = compile([...primitiveSources(all), ...all]);
    const d = elaborate(lib, 'tb');
    assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.severity === 'error'), []);
    const sim = new Simulator(d);
    const q = d.signals.find(x => /(^|\.)q$/i.test(x.name || x.path));
    const got = [];
    for (let k = 0; k < N; k++) {
      sim.run(10000 * k + 8000);
      got.push(Array.from({ length: 6 }, (_, j) => ((q.val.x >> BigInt(j)) & 1n ? 'x' : String(Number((q.val.v >> BigInt(j)) & 1n)))).join(''));
    }
    assert.deepEqual(got, expected());
  });
}

for (const [name, file] of [['feat_iob_ddr', 'top.vhd'], ['feat_iob_ddr_v', 'top.v']]) {
  test(`the compiled engine's IDDR2 / ODDR2 compute what the event-driven simulator's do (${name}, cycle by cycle)`, async () => {
    const src = fixture(name, file);
    const ins = designOf(src, 'top').top.ports.filter(x => x.dir === 'in' && x.name !== 'clk');
    const r = rng(7), cur = {};
    const res = await diffCycles(src, 'top', { cycles: 400, nets: true, clock: 'clk',
      inputs: k => { for (const x of ins) if (k === 0 || r() < 0.4) cur[x.name] = BigInt(Math.floor(r() * 2 ** x.sig.t.w)); return cur; } });
    assert.deepEqual(res.mismatches, []);
    assert.ok(res.bits > 1500, `${res.bits} bits compared`);
  });
}

// ------------------------------------------------------------------ the packer
// a Yosys netlist: clk -> IBUFG -> BUFG (bit 4), its inverse (an INV, bit 5); inputs (an IBUF each, its output named
// by the input), outputs (an OBUF each from the named bit), and cells { name: [type, { pin: bit }, params] }
function design(cells, { ins = [], outs = [] } = {}) {
  const ports = { clk: { direction: 'input', bits: [2] } };
  const io = (I, O) => ({ port_directions: { I: 'input', O: 'output' }, connections: { I: [I], O: [O] } });
  const cs = { clkbuf: { type: 'IBUFG', ...io(2, 3) }, clkg: { type: 'BUFG', ...io(3, 4) }, clkn: { type: 'INV', ...io(4, 5) } };
  let b = 1000;
  for (const n of ins) { const p = b++; ports[n] = { direction: 'input', bits: [p] }; cs[`${n}_ibuf`] = { type: 'IBUF', ...io(p, n) }; }
  for (const n of outs) { const p = b++; ports[`${n}_o`] = { direction: 'output', bits: [p] }; cs[`${n}_obuf`] = { type: 'OBUF', ...io(n, p) }; }
  for (const [name, [type, pins, params = {}]] of Object.entries(cells)) {
    const dirs = Object.fromEntries(Object.keys(pins).map(p => [p, /^(O|Q\d?)$/.test(p) ? 'output' : 'input']));
    cs[name] = { type, parameters: params, attributes: {}, port_directions: dirs, connections: Object.fromEntries(Object.entries(pins).map(([p, x]) => [p, [x]])) };
  }
  const num = new Map();
  const id = x => (typeof x === 'number' || x === '0' || x === '1' ? x : (num.has(x) || num.set(x, 2000 + num.size), num.get(x)));
  for (const c of Object.values(cs)) for (const p of Object.keys(c.connections)) c.connections[p] = c.connections[p].map(id);
  const netnames = Object.fromEntries([...num].map(([n, k]) => [n, { bits: [k] }]));
  return readYosysJson({ modules: { t: { attributes: { top: 1 }, ports, cells: cs, netnames } } });
}
const iddr2 = (d, q0, q1, { ce = '1', r = '0', s = '0', c1 = 5, ...params } = {}) => ['IDDR2', { D: d, C0: 4, C1: c1, CE: ce, R: r, S: s, Q0: q0, Q1: q1 }, { DDR_ALIGNMENT: 'NONE', SRTYPE: 'SYNC', INIT_Q0: '0', INIT_Q1: '0', ...params }];
const oddr2 = (d0, d1, q, { ce = '1', r = '0', s = '0', c1 = 5, ...params } = {}) => ['ODDR2', { D0: d0, D1: d1, C0: 4, C1: c1, CE: ce, R: r, S: s, Q: q }, { DDR_ALIGNMENT: 'NONE', SRTYPE: 'SYNC', INIT: '0', ...params }];
const lut2 = (a, b, o, init = '0110') => ['LUT2', { I0: a, I1: b, O: o }, { INIT: init }];
const cfgText = inst => inst.cfg.map(c => `${c.attr}:${c.name}:${c.value}`).join(' ');
const iob = (p, port) => p.insts.find(i => i.kind === 'iob' && i.name === port);
const pinsOf = (p, inst) => {
  const k = p.insts.indexOf(inst), out = [];
  for (const n of p.nets) for (const x of n.inpins) if (x.inst === k) out.push(`${x.pin}<-${n.type === 'wire' ? n.name : n.type}`);
  for (const n of p.nets) for (const x of n.outpins) if (x.inst === k) out.push(`${x.pin}->${n.name}`);
  return out.sort();
};

// as ISE's rd / rd2: u_i0 (SYNC, a clock enable and a reset), u_i1 (ASYNC, INIT_Q0 1, a set, CE tied to 1); u_o0
// (ASYNC, a clock enable and a reset), u_o1 (SYNC, INIT 1, a set, CE tied to 1); u_o2 with neither set nor reset, one
// of its data the pad b's input straight (also read by u_i1)
const ddrs = () => design({
  u_i0: iddr2('a', 'a0', 'a1', { ce: 'e', r: 'rs' }), u_i1: iddr2('b', 'b0', 'b1', { s: 'rs', SRTYPE: 'ASYNC', INIT_Q0: '1' }),
  x: lut2('a0', 'b1', 'x'), y: lut2('a1', 'b0', 'y'),
  u_o0: oddr2('x', 'y', 'p', { ce: 'e', r: 'rs', SRTYPE: 'ASYNC' }), u_o1: oddr2('y', 'x', 'q', { s: 'rs', INIT: '1' }), u_o2: oddr2('a0', 'b', 'w'),
}, { ins: ['a', 'b', 'e', 'rs'], outs: ['p', 'q', 'w'] });

test('IDDR2 / ODDR2 in their pads\' IOBs: the settings and pins of ISE\'s map; the clock\'s inverter left out (C1 on ICLK2 / OTCLK2 inverted)', () => {
  const p = pack(ddrs());
  assert.deepEqual(p.warnings, []);
  // (no slice for the inverter: only the two LUTs)
  assert.equal(p.stats.slices, 1);
  const delay = 'IDDRIN_MUX::2 IFD_DELAY_VALUE::DLY3 IFFDELMUX::0 IFFDMUX::1 PRE_DELAY_MUX::0';
  assert.equal(cfgText(iob(p, 'a')), `IOATTRBOX::LVCMOS25 IFF1:u_i0/FF0:#FF IFF1_INIT_ATTR::INIT0 IFF1_SR_ATTR::SRLOW IFF2:u_i0/FF1:#FF IFF2_INIT_ATTR::INIT0 IFF2_SR_ATTR::SRLOW IFFATTRBOX::SYNC ISR_USED::0 IREV_USED::0 SRINV::SR REVINV::REV ICEINV::ICE ICLK1INV::ICLK1 ICLK2INV::ICLK2_B ${delay} IFD_DELAY:a.IFD_DELAY: INBUF:a_IBUF: PAD:a:`);
  assert.equal(cfgText(iob(p, 'b')), `IDELMUX::1 IMUX::1 IOATTRBOX::LVCMOS25 IFF1:u_i1/FF0:#FF IFF1_INIT_ATTR::INIT1 IFF1_SR_ATTR::SRLOW IFF2:u_i1/FF1:#FF IFF2_INIT_ATTR::INIT0 IFF2_SR_ATTR::SRLOW IFFATTRBOX::ASYNC ISR_USED::0 IREV_USED::0 SRINV::SR REVINV::REV ICEINV::ICE ICLK1INV::ICLK1 ICLK2INV::ICLK2_B ${delay} IFD_DELAY:b.IFD_DELAY: INBUF:b_IBUF: PAD:b:`);
  const out = (n, sr, box, init) => `DRIVEATTRBOX::12 IOATTRBOX::LVCMOS25 O1INV::O1 OMUX::OFFDDR SLEW::SLOW OFF1:${n}/FF0:#FF OFF1_INIT_ATTR::${init} OFF1_SR_ATTR::${sr} OFF2:${n}/FF1:#FF OFF2_INIT_ATTR::${init} OFF2_SR_ATTR::${sr} OFFATTRBOX::${box} OSR_USED::0 SRINV::SR OCEINV::OCE PCICE_MUX::OCE O1_DDRMUX::1 O2_DDRMUX::1 O2INV::O2 OTCLK1INV::OTCLK1 OTCLK2INV::OTCLK2_B OFFDDRBLACKBOX:${n}:`;
  assert.equal(cfgText(iob(p, 'p_o')), `${out('u_o0', 'SRLOW', 'ASYNC', 'INIT0')} OUTBUF:p_o_OBUF: PAD:p_o:`);
  assert.equal(cfgText(iob(p, 'q_o')), `${out('u_o1', 'SRHIGH', 'SYNC', 'INIT1')} OUTBUF:q_o_OBUF: PAD:q_o:`);
  // the pins: R on SR, S on REV, CE on ICE, a pin tied to a constant connected to it; an ODDR2's set / reset on SR
  // (S's when used), CE on OCE, no REV; both clock pins on the clock's net
  assert.deepEqual(pinsOf(p, iob(p, 'a')), ['ICE<-e', `ICLK1<-${clockName(p)}`, `ICLK2<-${clockName(p)}`, 'REV<-gnd', 'SR<-rs', 'IQ1->a0', 'IQ2->a1'].sort());
  assert.deepEqual(pinsOf(p, iob(p, 'b')), [`ICLK1<-${clockName(p)}`, `ICLK2<-${clockName(p)}`, 'ICE<-vcc', 'REV<-rs', 'SR<-gnd', 'I->b', 'IQ1->b0', 'IQ2->b1'].sort());
  assert.deepEqual(pinsOf(p, iob(p, 'p_o')), ['O1<-x', 'O2<-y', 'OCE<-e', `OTCLK1<-${clockName(p)}`, `OTCLK2<-${clockName(p)}`, 'SR<-rs'].sort());
  assert.deepEqual(pinsOf(p, iob(p, 'q_o')), ['O1<-y', 'O2<-x', 'OCE<-vcc', `OTCLK1<-${clockName(p)}`, `OTCLK2<-${clockName(p)}`, 'SR<-rs'].sort());
  assert.deepEqual(pinsOf(p, iob(p, 'w_o')), ['O1<-a0', 'O2<-b', 'OCE<-vcc', `OTCLK1<-${clockName(p)}`, `OTCLK2<-${clockName(p)}`, 'SR<-gnd'].sort());
  // C1 on a global buffer of its own: its clock pin on that net, not inverted
  const two = design({ g2: ['BUFG', { I: 'k', O: 'k2' }], u_i0: iddr2('a', 'a0', 'a1', { c1: 'k2' }), u_o0: oddr2('a0', 'a1', 'p', { c1: 'k2' }) }, { ins: ['a', 'k'], outs: ['p'] });
  const p2 = pack(two);
  assert.match(cfgText(iob(p2, 'a')), / ICLK1INV::ICLK1 ICLK2INV::ICLK2 /);
  assert.match(cfgText(iob(p2, 'p_o')), / OTCLK1INV::OTCLK1 OTCLK2INV::OTCLK2 /);
  assert.ok(pinsOf(p2, iob(p2, 'a')).includes('ICLK2<-k2') && pinsOf(p2, iob(p2, 'p_o')).includes('OTCLK2<-k2'));
});
// the net of the clock buffer's output
const clockName = p => p.nets.find(n => n.outpins.some(x => p.insts[x.inst].type === 'BUFGMUX')).name;

test('IDDR2 / ODDR2 the packer refuses: DDR_ALIGNMENT C0 / C1, an IDDR2 not on a pad\'s input, an ODDR2 driving logic, a clock not on a global buffer, an ODDR2 with both R and S', () => {
  const refused = (cells, msg, o = { ins: ['a'], outs: ['p'] }) => assert.throws(() => pack(design(cells, o)), { message: msg });
  refused({ u: iddr2('a', 'a0', 'p', { DDR_ALIGNMENT: 'C0' }) }, 'pack: IDDR2 u: DDR_ALIGNMENT = C0 is not supported by the Silinx toolchain yet (only NONE)');
  refused({ u: oddr2('a', 'a', 'p', { DDR_ALIGNMENT: 'C1' }) }, 'pack: ODDR2 u: DDR_ALIGNMENT = C1 is not supported by the Silinx toolchain yet (only NONE)');
  refused({ x: lut2('a', 'a', 'x'), u: iddr2('x', 'a0', 'p') }, 'pack: IDDR2 u: its D must come straight from an input port (the DDR registers are in the IOBs)');
  refused({ u: oddr2('a', 'a', 'z'), x: lut2('z', 'a', 'p') }, 'pack: ODDR2 u: its Q must drive an output port and nothing else (the DDR registers are in the IOBs)');
  refused({ u: oddr2('a', 'a', 'p', { c1: 'a' }) }, 'pack: ODDR2 u: its clock C1 (a) is not on a global clock buffer (BUFG)');
  refused({ u: oddr2('a', 'a', 'p', { r: 'a', s: 'a' }) }, 'pack: ODDR2 u: both R and S used (the IOB has one set / reset for its output registers)');
});

test('an ODDR2 and an output register on another clock in the two IOBs of a differential pair: kept apart when free, refused when LOC\'d there (both share each clock wire of their tile)', () => {
  const sites = deviceSites(loadDeviceCache('xc3s250ecp132-4'));
  const byTile = new Map();
  for (const x of sites.pads.values()) if (x.pair && !x.inputOnly) byTile.set(x.pair, [...(byTile.get(x.pair) || []), x]);
  const [m, sl] = [...byTile.values()].find(ps => ps.length === 2).sort((a, b) => b.master - a.master);
  const nl = () => design({ g2: ['BUFG', { I: 'k', O: 'k2' }], u: oddr2('a', 'k', 'p'), r: ['FDRE', { C: 'k2', CE: '1', R: '0', D: 'a', Q: 'q' }] }, { ins: ['a', 'k'], outs: ['p', 'q'] });
  const few = { ...sites, pads: new Map([...sites.pads].filter(([n]) => n !== m.name && n !== sl.name).slice(0, 6).concat([[m.name, m], [sl.name, sl]])) };
  for (let seed = 1; seed <= 6; seed++) {
    const p = pack(nl(), { iobRegs: 'o', ucf: '' }), r = place(p, few, { seed, effort: 0.1 });
    const at = n => r.sites[p.insts.findIndex(x => x.name === n)].site;
    assert.ok(!([at('p_o'), at('q_o')].includes(m.name) && [at('p_o'), at('q_o')].includes(sl.name)), `seed ${seed}`);
  }
  const p = pack(nl(), { iobRegs: 'o', ucf: `NET "p_o" LOC = "${m.name}" ;\nNET "q_o" LOC = "${sl.name}" ;\n` });
  assert.throws(() => place(p, sites, { seed: 1, effort: 0.1 }), { message: `place: p_o, q_o: their output registers have different clocks (${clockName(p)}, k2) on pads ${m.name}, ${sl.name}, whose IOBs share the clock wires of the I/O tile ${m.tile}, and p_o's are DDR registers (both flip-flops): put them on pads of different I/O tiles` });
});

test('the packed IDDR2 / ODDR2 behave as the netlist, cycle by cycle (random stimulus, both clock edges)', () => {
  const nl = ddrs(), p = pack(nl);
  for (const seed of [1, 2, 3]) {
    const d = compareSims(nl, p, { cycles: 300, seed });
    assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
  }
});

test('IDDR2 / ODDR2 in the static timing: IQ2 after the falling edge (ICLK2INV::ICLK2_B), O2 before it; a path between the two edges limits the period to twice its delay', () => {
  const p = pack(ddrs());
  const a = instArcs({ type: 'IBUF', cfg: iob(p, 'a').cfg }), o = instArcs({ type: 'IOB', cfg: iob(p, 'p_o').cfg });
  assert.deepEqual([a.clkToOut, o.setup, o.output], [[['IQ1', 0.6], ['IQ2', 0.6]], [['O1', 0.5], ['O2', 0.5]], []]);
  const insts = p.insts.map((i, k) => ({ ...i, site: null, name: i.name || `i${k}` }));
  const g = timingGraph({ insts, nets: p.nets.map(n => ({ ...n, outpins: n.outpins.map(x => ({ inst: insts[x.inst].name, pin: x.pin })), inpins: n.inpins.map(x => ({ inst: insts[x.inst].name, pin: x.pin })) })) });
  const r = g.analyze(g.conns.map(() => 1));
  assert.equal(r.clocks.length, 1);
  // a1 (IQ2, the falling edge) -> y -> u_o0's O2 (the falling edge) is a whole period, b1 (IQ2) -> x -> O1 (rising) half
  // of one: the critical path is one between the edges
  assert.equal(r.clocks[0].half, true);
  const ends = r.clocks[0].path.map(x => x.pin).filter(x => /^(IQ|O)[12]$/.test(x));
  assert.deepEqual([ends[0][0], ends.at(-1)[0]], ['I', 'O']);
  assert.notEqual(ends[0].at(-1), ends.at(-1).at(-1));
});

test('IDDR2 / ODDR2 in the post-translate and post-map models: two flip-flops each, an ODDR2\'s output through a multiplexer on its clock, behaving as the netlist (VHDL and Verilog)', () => {
  const nl = ddrs();
  const models = { translate: postTranslateModels(nl, { top: nl.name }), map: postMapModels(nl, pack(nl), { top: nl.name }) };
  for (const m of Object.values(models)) assert.deepEqual(m.unknown, []);
  const insts = m => [...m.vhdl.matchAll(/^ {2}(\S+) : (X_\w+)$/gm)].map(x => x[2]).filter(x => /^X_(S?FF|MUX2)$/.test(x)).sort().join(' ');
  assert.equal(insts(models.translate), 'X_FF X_FF X_FF X_FF X_MUX2 X_MUX2 X_MUX2 X_SFF X_SFF X_SFF X_SFF X_SFF X_SFF');
  assert.equal(insts(models.map), insts(models.translate));
  assert.deepEqual(compareWithNetlist(nl, models, { cycles: 150 }), []);
});

// ------------------------------------------------------------------ the bit database
// The IDDR2's settings on every pad of the four devices but the clock pin and the two control inputs of the designs that
// measured them (measure-iobddr.sh: rd / rd2 had ISE's map trim most of them, 68 / 85 / 142 / 158 pads before); the
// bits of a pad's IDDR2 its neighbour's features held, on their pad (ana-padowner.mjs; ISE's bitgen of an IDDR2 beside
// a plain input, rdi2 / rdi3: the XC3S500E's U11 held T11's 349,3078, C8 its tile partner D8's 178,49)
const IDDR2_FEATURES = ['R:IFF2:#FF', 'R:IREV_USED:0', 'R:REVINV:REV', 'R:ICLK2INV:ICLK2_B', 'R:IFF2_SR_ATTR:SRLOW', 'R:IFF2_INIT_ATTR:INIT0', 'R:IFF2_INIT_ATTR:INIT1'];
test('the bit database: an IDDR2\'s settings on every pad but three; the bits of a pad\'s IDDR2 on that pad, not on its neighbour', () => {
  const counts = {};
  for (const part of ['xc3s100ecp132-4', 'xc3s250ecp132-4', 'xc3s500efg320-4', 'xc3s1200efg320-4']) {
    const db = loadDb(part), pads = [...deviceSites(loadDeviceCache(part)).pads.values()];
    counts[part] = `${pads.filter(p => IDDR2_FEATURES.every(f => db.padFeats[p.name]?.[f])).length}/${pads.length}`;
  }
  assert.deepEqual(counts, { 'xc3s100ecp132-4': '80/83', 'xc3s250ecp132-4': '89/92', 'xc3s500efg320-4': '229/232', 'xc3s1200efg320-4': '247/250' });
  const f = loadDb('xc3s500efg320-4').padFeats, holds = (pad, bit) => Object.entries(f[pad]).filter(([, v]) => v.includes(bit)).map(([k]) => k);
  assert.deepEqual([holds('T11', '349,3078'), holds('U11', '349,3078'), holds('D8', '178,49'), holds('C8', '178,49')], [['R:IREV_USED:0'], [], ['R:IREV_USED:0'], []]);
});
