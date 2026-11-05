// The packer (packages/silinx-fpga/src/fpga/pack.js) on distributed RAMs and shift registers (SLICEM), block RAMs and
// multipliers, their sites' clock network (fpga/clock-reach.js; their placement went with Silinx's placer, #2137), their timing arcs
// (packages/silinx-fpga/src/fpga/timing.js): small synthetic Yosys netlists, the XDL settings as ISE's map writes them
// (research/s3e-bitstream/README.md, stage D), and - the main check - the packed design simulated
// from its own XDL settings behaves like the netlist (test/fpga-sim.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readYosysJson } from '../src/fpga/netlist.js';
import { pack, PackError, BRAM_WIDTH, ucfPortsOf } from '../src/fpga/pack.js';
import { instArcs } from '../src/fpga/timing.js';
import { compareSims, netlistSim } from './fpga-sim.js';

// A Yosys JSON netlist: ports { name: ['input' | 'output', width] } (bits name[i]); cells
// [{ name, type, params, conns: { PIN: net name | [net names] | '0' / '1' / 'x' }, outs: [PIN] }]
function yjson(ports, cells) {
  const ids = new Map();
  let next = 2;
  const bit = n => (/^[01xz]$/.test(n) ? n : (ids.has(n) || ids.set(n, next++), ids.get(n)));
  const mod = { attributes: { top: '00000000000000000000000000000001' }, ports: {}, cells: {}, netnames: {} };
  for (const [name, [dir, w]] of Object.entries(ports)) {
    const bits = Array.from({ length: w }, (_, i) => bit(w > 1 ? `${name}[${i}]` : name));
    mod.ports[name] = { direction: dir, bits };
    mod.netnames[name] = { bits };
  }
  for (const c of cells) {
    const connections = {}, port_directions = {};
    for (const [p, v] of Object.entries(c.conns)) {
      connections[p] = (Array.isArray(v) ? v : [v]).map(bit);
      port_directions[p] = (c.outs || []).includes(p) ? 'output' : 'input';
    }
    mod.cells[c.name] = { type: c.type, parameters: c.params || {}, attributes: {}, port_directions, connections };
  }
  return readYosysJson({ modules: { top: mod } });
}
const bin = (v, n) => v.toString(2).padStart(n, '0');
const bus = (name, w, from = 0) => Array.from({ length: w }, (_, i) => `${name}[${from + i}]`);
const ibuf = (port, w) => Array.from({ length: w }, (_, i) => ({ name: `ib_${port}${i}`, type: 'IBUF', conns: { I: w > 1 ? `${port}[${i}]` : port, O: w > 1 ? `${port}_i[${i}]` : `${port}_i` }, outs: ['O'] }));
const obuf = (port, net) => ({ name: `ob_${port}`, type: 'OBUF', conns: { I: net, O: port }, outs: ['O'] });
const clock = [{ name: 'ib_clk', type: 'IBUF', conns: { I: 'clk', O: 'clk_i' }, outs: ['O'] }, { name: 'bufg', type: 'BUFG', conns: { I: 'clk_i', O: 'clk_g' }, outs: ['O'] }];
const cfgOf = inst => Object.fromEntries(inst.cfg.map(c => [c.attr, c]));
const val = (inst, a) => cfgOf(inst)[a]?.value;
const same = (nl, p, cycles = 400) => {
  const d = compareSims(nl, p, { cycles, seed: 3 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
};

// distributed RAMs of every kind on shared address / data inputs
function drams() {
  return yjson({ clk: ['input', 1], a: ['input', 6], b: ['input', 4], d: ['input', 2], we: ['input', 4], o: ['output', 8] }, [
    ...clock, ...ibuf('a', 6), ...ibuf('b', 4), ...ibuf('d', 2), ...ibuf('we', 4),
    { name: 'r16a', type: 'RAM16X1S', params: { INIT: bin(0xA5C3, 16) }, conns: { A0: 'a_i[0]', A1: 'a_i[1]', A2: 'a_i[2]', A3: 'a_i[3]', D: 'd_i[0]', WE: 'we_i[0]', WCLK: 'clk_g', O: 'o16a' }, outs: ['O'] },
    { name: 'r16b', type: 'RAM16X1S', params: { INIT: bin(0x0F0F, 16) }, conns: { A0: 'a_i[0]', A1: 'a_i[1]', A2: 'a_i[2]', A3: 'a_i[3]', D: 'd_i[1]', WE: 'we_i[0]', WCLK: 'clk_g', O: 'o16b' }, outs: ['O'] },
    { name: 'r16d', type: 'RAM16X1D', params: { INIT: bin(0x1234, 16) }, conns: { A0: 'a_i[0]', A1: 'a_i[1]', A2: 'a_i[2]', A3: 'a_i[3]', DPRA0: 'b_i[0]', DPRA1: 'b_i[1]', DPRA2: 'b_i[2]', DPRA3: 'b_i[3]', D: 'd_i[0]', WE: 'we_i[1]', WCLK: 'clk_g', SPO: 'spo', DPO: 'dpo' }, outs: ['SPO', 'DPO'] },
    { name: 'r32', type: 'RAM32X1S', params: { INIT: bin(0x89ABCDEF, 32) }, conns: { A0: 'a_i[0]', A1: 'a_i[1]', A2: 'a_i[2]', A3: 'a_i[3]', A4: 'a_i[4]', D: 'd_i[1]', WE: 'we_i[2]', WCLK: 'clk_g', O: 'o32' }, outs: ['O'] },
    { name: 'r64', type: 'RAM64X1S', params: { INIT: bin(0x0123456789ABCDEFn, 64) }, conns: { A0: 'a_i[0]', A1: 'a_i[1]', A2: 'a_i[2]', A3: 'a_i[3]', A4: 'a_i[4]', A5: 'a_i[5]', D: 'd_i[0]', WE: 'we_i[3]', WCLK: 'clk_g', O: 'o64' }, outs: ['O'] },
    obuf('o[0]', 'o16a'), obuf('o[1]', 'o16b'), obuf('o[2]', 'spo'), obuf('o[3]', 'dpo'), obuf('o[4]', 'o32'), obuf('o[5]', 'o64'),
    { name: 'ob6', type: 'OBUF', conns: { I: 'a_i[5]', O: 'o[6]' }, outs: ['O'] }, { name: 'ob7', type: 'OBUF', conns: { I: 'b_i[3]', O: 'o[7]' }, outs: ['O'] },
  ]);
}

test('distributed RAMs in SLICEMs (RAM16X1S pair, RAM16X1D, RAM32X1S, RAM64X1S) behave like the netlist', () => {
  const nl = drams();
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  // RAM16X1S pair: 1 slice; RAM16X1D: 1; RAM32X1S: 1; RAM64X1S: 2 RAM32X1S + LUTs (write enables, read multiplexer)
  assert.equal(p.stats.slicem, 5);
  for (const s of p.insts.filter(i => i.type === 'SLICEM')) {
    assert.equal(val(s, 'SRINV'), 'SR');
    assert.ok(cfgOf(s).WSGEN, 'the write strobe generator');
  }
  same(nl, p);
});

test('distributed RAMs: the settings ISE writes (#RAM contents, DUAL_PORT, DIF_MUX / DIG_MUX, SLICEWE0USED, F5)', () => {
  const p = pack(drams());
  const at = name => p.insts.find(i => Object.values(cfgOf(i)).some(c => (c.attr === 'F' || c.attr === 'G') && c.name.startsWith(name)));
  const pair = at('r16a');
  assert.deepEqual([val(pair, 'G'), val(pair, 'F'), val(pair, 'DIG_MUX'), val(pair, 'DIF_MUX')], ['#RAM:D=0xA5C3', '#RAM:D=0x0F0F', 'BY', 'BX']);
  assert.equal(val(pair, 'WG1USED'), '0');
  const d = at('r16d');
  assert.deepEqual([val(d, 'F_ATTR'), val(d, 'G_ATTR'), val(d, 'DIF_MUX'), cfgOf(d).F.name, cfgOf(d).G.name], ['DUAL_PORT', 'DUAL_PORT', 'ALTDIF', 'r16d.SLICEM_F', 'r16d.SLICEM_G']);
  const r32 = at('r32');
  // G: addresses 0-15, F: 16-31 (A4 = BX selects F)
  assert.deepEqual([val(r32, 'G'), val(r32, 'F'), val(r32, 'FXMUX'), val(r32, 'SLICEWE0USED')], ['#RAM:D=0xCDEF', '#RAM:D=0x89AB', 'F5', '0']);
  const lo = at('r64_lo'), hi = at('r64_hi');
  assert.deepEqual([val(lo, 'G'), val(lo, 'F'), val(hi, 'G'), val(hi, 'F')], ['#RAM:D=0xCDEF', '#RAM:D=0x89AB', '#RAM:D=0x4567', '#RAM:D=0x0123']);
  // nothing else in a RAM's slice (SR is its write enable)
  for (const s of p.insts.filter(i => i.type === 'SLICEM')) assert.ok(!cfgOf(s).FFX && !cfgOf(s).FFY && !/#LUT/.test(val(s, 'F') || '') && !/#LUT/.test(val(s, 'G') || ''));
});

// shift registers: with a clock enable, always enabled feeding a flip-flop, falling edge
function srls() {
  return yjson({ clk: ['input', 1], d: ['input', 2], t: ['input', 4], ce: ['input', 1], q: ['output', 4] }, [
    ...clock, ...ibuf('d', 2), ...ibuf('t', 4), ...ibuf('ce', 1),
    { name: 'sv', type: 'SRL16E', params: { INIT: bin(0x8001, 16) }, conns: { A0: 't_i[0]', A1: 't_i[1]', A2: 't_i[2]', A3: 't_i[3]', CE: 'ce_i', CLK: 'clk_g', D: 'd_i[0]', Q: 'qv' }, outs: ['Q'] },
    { name: 'sf', type: 'SRL16E', params: { INIT: bin(0x00F0, 16) }, conns: { A0: '1', A1: '0', A2: '1', A3: '0', CE: '1', CLK: 'clk_g', D: 'd_i[1]', Q: 'qf' }, outs: ['Q'] },
    { name: 'ff', type: 'FDRE', params: { INIT: '1' }, conns: { C: 'clk_g', CE: '1', R: '0', D: 'qf', Q: 'qff' }, outs: ['Q'] },
    { name: 'sn', type: 'SRL16E_1', params: { INIT: bin(0x0003, 16) }, conns: { A0: '1', A1: '1', A2: '0', A3: '0', CE: '1', CLK: 'clk_g', D: 'd_i[0]', Q: 'qn' }, outs: ['Q'] },
    obuf('q[0]', 'qv'), obuf('q[1]', 'qf'), obuf('q[2]', 'qff'), obuf('q[3]', 'qn'),
  ]);
}

test('shift registers (SRL16E, SRL16E_1) in SLICEMs: CE on SR, an always-enabled one feeds the flip-flop of its side', () => {
  const nl = srls();
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  const sl = p.insts.filter(i => i.type === 'SLICEM');
  assert.equal(sl.length, 3);
  for (const s of sl) assert.equal(val(s, cfgOf(s).G ? 'G_ATTR' : 'F_ATTR'), 'SHIFT_REG');
  const sv = sl.find(s => cfgOf(s).G?.name === 'sv');
  assert.deepEqual([val(sv, 'G'), val(sv, 'DIG_MUX'), cfgOf(sv).WSGEN.name], ['#RAM:D=0x8001', 'BY', 'sv.CE']);
  const k = p.insts.indexOf(sv);
  const ce = p.insts.findIndex(i => i.name === 'ce');
  assert.equal(p.nets.find(n => n.inpins.some(x => x.inst === k && x.pin === 'SR')).outpins[0].inst, ce, 'CE on SR');
  // the always-enabled shift register: SR = 1, the flip-flop beside it as ISE's map packs it
  const sf = sl.find(s => cfgOf(s).G?.name === 'sf');
  assert.deepEqual([val(sf, 'FFY'), val(sf, 'DYMUX'), val(sf, 'GYMUX'), val(sf, 'FFY_INIT_ATTR'), val(sf, 'FFY_SR_ATTR')], ['#FF', '1', 'G', 'INIT1', 'SRLOW']);
  const kf = p.insts.indexOf(sf);
  assert.equal(p.nets.find(n => n.inpins.some(x => x.inst === kf && x.pin === 'SR')).type, 'vcc');
  assert.equal(val(sl.find(s => cfgOf(s).G?.name === 'sn'), 'CLKINV'), 'CLK_B');
  same(nl, p);
});

// SRLC16E chains through Q15 (#2): of 4 (both SLICEMs of a CLB), 3, 2 (one slice), each stage read at the tap t,
// a shift enable on the first two chains, the last one's Q15 unused
function srlChains() {
  const cells = [...clock, ...ibuf('d', 3), ...ibuf('t', 4), ...ibuf('ce', 1)];
  const outs = [];
  [4, 3, 2].forEach((n, k) => {
    for (let j = 0; j < n; j++) {
      cells.push({ name: `s${k}_${j}`, type: 'SRLC16E', params: { INIT: bin((0x1234 * (k + 1) + 0x0F0F * j) & 0xffff, 16) },
        conns: { A0: 't_i[0]', A1: 't_i[1]', A2: 't_i[2]', A3: 't_i[3]', CE: k < 2 ? 'ce_i' : '1', CLK: 'clk_g', D: j ? `c${k}_${j - 1}` : `d_i[${k}]`, Q: `q${k}_${j}`,
          ...(j < n - 1 ? { Q15: `c${k}_${j}` } : {}) }, outs: ['Q', 'Q15'] });
      outs.push(`q${k}_${j}`);
    }
  });
  return yjson({ clk: ['input', 1], d: ['input', 3], t: ['input', 4], ce: ['input', 1], q: ['output', outs.length] }, [...cells, ...outs.map((n, i) => obuf(`q[${i}]`, n))]);
}

test('SRLC16E chains through Q15 (#2): as ISE\'s map packs them, up to 4 on the two SLICEMs of a CLB (SHIFTOUT -> SHIFTIN), behaviour', () => {
  const nl = srlChains();
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  const sl = p.insts.filter(i => i.type === 'SLICEM');
  assert.equal(sl.length, 5);
  const at = n => sl.find(s => cfgOf(s).G?.name === n);
  // chain 0: s0_0 / s0_1 in the upper slice (G, F), its SHIFTOUT into the lower one's SHIFTIN, s0_2 / s0_3 there
  const [u0, l0] = [at('s0_0'), at('s0_2')];
  assert.deepEqual([cfgOf(u0).F.name, val(u0, 'DIG_MUX'), val(u0, 'DIF_MUX'), val(u0, 'SHIFTOUTUSED')], ['s0_1', 'BY', 'SHIFTIN', '0']);
  assert.deepEqual([cfgOf(l0).F.name, val(l0, 'DIG_MUX'), val(l0, 'DIF_MUX'), val(l0, 'SHIFTOUTUSED')], ['s0_3', 'SHIFTIN', 'SHIFTIN', undefined]);
  // chain 1 (3): the lower slice's G only; chain 2 (2): one slice, no SHIFTOUT
  const [u1, l1, u2] = [at('s1_0'), at('s1_2'), at('s2_0')];
  assert.deepEqual([cfgOf(u1).F.name, val(u1, 'SHIFTOUTUSED'), cfgOf(l1).F, val(l1, 'DIG_MUX')], ['s1_1', '0', undefined, 'SHIFTIN']);
  assert.deepEqual([cfgOf(u2).F.name, val(u2, 'DIF_MUX'), val(u2, 'SHIFTOUTUSED')], ['s2_1', 'SHIFTIN', undefined]);
  // the pairs: one macro each, the upper slice above the lower one, starting on an even slice row
  const idx = s => p.insts.indexOf(s);
  for (const [u, l] of [[u0, l0], [u1, l1]]) {
    assert.deepEqual(p.macros.filter(m => m.members.some(x => x.inst === idx(u))).map(m => [m.kind, m.members, m.align]),
      [['SRL', [{ inst: idx(l), dx: 0, dy: 0 }, { inst: idx(u), dx: 0, dy: 1 }], [1, 2]]]);
    const n = p.nets.filter(x => x.inpins.some(y => y.inst === idx(l) && y.pin === 'SHIFTIN'));
    assert.deepEqual(n.map(x => [x.outpins, x.inpins]), [[[{ inst: idx(u), pin: 'SHIFTOUT' }], [{ inst: idx(l), pin: 'SHIFTIN' }]]]);
  }
  // no general routing into the stages after the first (their D inside the CLB)
  for (const s of [l0, l1]) assert.ok(!p.nets.some(x => x.inpins.some(y => y.inst === idx(s) && y.pin === 'BY')));
  same(nl, p, 600);
});

test('SRLC16E Q15: what ISE\'s map would not pack on the two SLICEMs of a CLB is refused (#2)', () => {
  const chain = (n, more = {}) => yjson({ clk: ['input', 1], d: ['input', 1], o: ['output', n] }, [...clock, ...ibuf('d', 1),
    ...Array.from({ length: n }, (_, j) => ({ name: `u${j}`, type: 'SRLC16E', conns: { A0: '0', A1: '0', A2: '0', A3: '0', CE: '1', CLK: 'clk_g', D: j ? `c${j - 1}` : 'd_i', Q: `y${j}`, Q15: `c${j}`, ...more[j] }, outs: ['Q', 'Q15'] })),
    ...Array.from({ length: n }, (_, j) => obuf(`o[${j}]`, `y${j}`))]);
  assert.doesNotThrow(() => pack(chain(4)));
  assert.throws(() => pack(chain(5)), /SRLC16E u0: a chain of 5 shift registers through Q15 is not supported yet \(at most 4, on the two SLICEMs of a CLB\)/);
  // another clock enable
  assert.throws(() => pack(chain(2, { 1: { CE: 'd_i' } })), /SRLC16E u0: the cascade output Q15 into anything but the D of one shift register of the same clock and enable is not supported yet/);
  // Q15 into anything else: a pad, or a shift register and a pad
  const out = yjson({ clk: ['input', 1], o: ['output', 2] }, [...clock,
    { name: 'u', type: 'SRLC16E', conns: { A0: '0', A1: '0', A2: '0', A3: '0', CE: '1', CLK: 'clk_g', D: 'clk_i', Q: 'y', Q15: 'y15' }, outs: ['Q', 'Q15'] }, obuf('o[0]', 'y'), obuf('o[1]', 'y15')]);
  assert.throws(() => pack(out), /SRLC16E u: the cascade output Q15 into anything but the D of one shift register/);
  const two = yjson({ clk: ['input', 1], d: ['input', 1], o: ['output', 3] }, [...clock, ...ibuf('d', 1),
    { name: 'u', type: 'SRLC16E', conns: { A0: '0', A1: '0', A2: '0', A3: '0', CE: '1', CLK: 'clk_g', D: 'd_i', Q: 'y', Q15: 'c' }, outs: ['Q', 'Q15'] },
    { name: 'v', type: 'SRLC16E', conns: { A0: '0', A1: '0', A2: '0', A3: '0', CE: '1', CLK: 'clk_g', D: 'c', Q: 'z' }, outs: ['Q', 'Q15'] }, obuf('o[0]', 'y'), obuf('o[1]', 'z'), obuf('o[2]', 'c')]);
  assert.throws(() => pack(two), /SRLC16E u: the cascade output Q15 into anything but/);
  // a ring: no first one
  const ring = yjson({ clk: ['input', 1], o: ['output', 2] }, [...clock,
    { name: 'u', type: 'SRLC16E', conns: { A0: '0', A1: '0', A2: '0', A3: '0', CE: '1', CLK: 'clk_g', D: 'b', Q: 'y', Q15: 'a' }, outs: ['Q', 'Q15'] },
    { name: 'v', type: 'SRLC16E', conns: { A0: '0', A1: '0', A2: '0', A3: '0', CE: '1', CLK: 'clk_g', D: 'a', Q: 'z', Q15: 'b' }, outs: ['Q', 'Q15'] }, obuf('o[0]', 'y'), obuf('o[1]', 'z')]);
  assert.throws(() => pack(ring), /a ring of shift registers through Q15 is not supported/);
});

// block RAMs: single port 2048 x 9 with a constant enable and undriven data bits, dual port 18 / 36
function brams() {
  const init = '0'.repeat(192) + bin(0xDEADBEEFCAFEBABEn, 64);
  return yjson({ clk: ['input', 1], a: ['input', 11], d: ['input', 8], we: ['input', 2], en: ['input', 1], q: ['output', 16] }, [
    ...clock, ...ibuf('a', 11), ...ibuf('d', 8), ...ibuf('we', 2), ...ibuf('en', 1),
    { name: 'sp', type: 'RAMB16_S9', params: { WRITE_MODE: 'READ_FIRST', INIT: bin(0x1A5, 9), SRVAL: bin(0x05A, 9), INIT_00: init },
      conns: { ADDR: bus('a_i', 11), DI: [...bus('d_i', 6), 'x', 'x'], DIP: 'x', DO: bus('qs', 8), DOP: 'qsp', CLK: 'clk_g', EN: '1', SSR: '0', WE: 'we_i[0]' }, outs: ['DO', 'DOP'] },
    { name: 'dp', type: 'RAMB16_S18_S36', params: { WRITE_MODE_A: 'WRITE_FIRST', WRITE_MODE_B: 'NO_CHANGE', INIT_A: bin(0x3FFFF, 18), SRVAL_B: bin(0x987654321n, 36), INIT_01: init },
      conns: { ADDRA: bus('a_i', 10), DIA: [...bus('d_i', 8), ...bus('d_i', 8)], DIPA: ['d_i[0]', 'd_i[1]'], DOA: bus('qa', 16), DOPA: bus('qap', 2), CLKA: 'clk_g', ENA: 'en_i', SSRA: '0', WEA: 'we_i[1]',
        ADDRB: bus('a_i', 9, 2), DIB: [...bus('d_i', 8), ...bus('d_i', 8), ...bus('d_i', 8), ...bus('d_i', 8)], DIPB: bus('d_i', 4), DOB: bus('qb', 32), DOPB: bus('qbp', 4), CLKB: 'clk_g', ENB: '1', SSRB: 'we_i[0]', WEB: 'we_i[0]' },
      outs: ['DOA', 'DOPA', 'DOB', 'DOPB'] },
    ...['qs[0]', 'qs[5]', 'qsp', 'qa[3]', 'qa[15]', 'qap[1]', 'qb[0]', 'qb[9]', 'qb[31]', 'qbp[3]', 'qs[7]', 'qa[8]', 'qb[16]', 'qbp[0]', 'qs[1]', 'qa[0]'].map((n, i) => obuf(`q[${i}]`, n)),
  ]);
}

test('block RAMs: RAMB16 sites, address pins by port width, settings as ISE writes them, behaviour', () => {
  const nl = brams();
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  assert.equal(p.stats.brams, 2);
  const sp = p.insts.find(i => i.name === 'sp'), dp = p.insts.find(i => i.name === 'dp');
  assert.deepEqual([sp.type, sp.kind, sp.wide, dp.wide], ['RAMB16', 'bram', false, true]);
  assert.deepEqual([val(sp, 'PORTA_ATTR'), val(sp, 'WRITEMODEA'), val(sp, 'INIT_A'), val(sp, 'SRVAL_A'), val(sp, 'PORTB_ATTR')], ['2048X9', 'READ_FIRST', '1A5', '05A', undefined]);
  assert.equal(val(sp, 'INIT_00'), `${'0'.repeat(48)}DEADBEEFCAFEBABE`);
  assert.equal(val(dp, 'INIT_01'), `${'0'.repeat(48)}DEADBEEFCAFEBABE`);
  assert.deepEqual([val(dp, 'PORTA_ATTR'), val(dp, 'PORTB_ATTR'), val(dp, 'INIT_A'), val(dp, 'SRVAL_B'), val(dp, 'WRITEMODEB')], ['1024X18', '512X36', '3FFFF', '987654321', 'NO_CHANGE']);
  assert.ok(cfgOf(dp).RAMB16A && cfgOf(dp).RAMB16B && cfgOf(sp).RAMB16A && !cfgOf(sp).RAMB16B);
  const pins = k => p.nets.flatMap(n => n.inpins.filter(x => x.inst === p.insts.indexOf(k)).map(x => [x.pin, n.type === 'wire' ? n.name : n.type]));
  const spPins = new Map(pins(sp));
  // a 9-bit port: 11 address bits on ADDRA3 … ADDRA13; a 36-bit port: 9 on ADDRB5 … ADDRB13
  assert.ok(spPins.has('ADDRA3') && spPins.has('ADDRA13') && !spPins.has('ADDRA2'));
  assert.ok(new Map(pins(dp)).has('ADDRB5') && !new Map(pins(dp)).has('ADDRB4'));
  // an enable tied to 1 on VCC, a reset tied to 0 on GND, neither inverted, as ISE's map ties them
  // (#50); undriven data inputs left out, the undriven parity input kept (tied to 0)
  assert.deepEqual([val(sp, 'ENAINV'), spPins.get('ENA'), val(sp, 'SSRAINV'), spPins.get('SSRA'), val(sp, 'WEAINV')], ['ENA', 'vcc', 'SSRA', 'gnd', 'WEA']);
  assert.ok(!spPins.has('DIA6') && !spPins.has('DIA7') && spPins.has('DIA5'));
  assert.equal(spPins.get('DIPA0'), 'gnd');
  assert.deepEqual([val(dp, 'ENBINV'), new Map(pins(dp)).get('ENB')], ['ENB', 'vcc']);
  same(nl, p, 300);
});

test('block RAMs: the RAMB16 port widths', () => {
  assert.deepEqual(Object.entries(BRAM_WIDTH).map(([w, x]) => [+w, x.attr, x.data + x.par, 2 ** x.addr * (x.data + x.par)]),
    [[1, '16384X1', 1, 16384], [2, '8192X2', 2, 16384], [4, '4096X4', 4, 16384], [9, '2048X9', 9, 18432], [18, '1024X18', 18, 18432], [36, '512X36', 36, 18432]]);
});

// multipliers: combinational, registered output (MULT18X18S), input / output registers (SIO)
function mults() {
  return yjson({ clk: ['input', 1], a: ['input', 6], b: ['input', 6], c: ['input', 2], p: ['output', 12] }, [
    ...clock, ...ibuf('a', 6), ...ibuf('b', 6), ...ibuf('c', 2),
    { name: 'm0', type: 'MULT18X18', conns: { A: [...bus('a_i', 6), ...Array(12).fill('a_i[5]')], B: [...bus('b_i', 6), ...Array(12).fill('0')], P: bus('p0', 36) }, outs: ['P'] },
    { name: 'm1', type: 'MULT18X18S', conns: { A: [...bus('b_i', 6), ...Array(12).fill('0')], B: [...bus('a_i', 6), ...Array(12).fill('0')], C: 'clk_g', CE: 'c_i[0]', R: 'c_i[1]', P: bus('p1', 36) }, outs: ['P'] },
    { name: 'm2', type: 'MULT18X18SIO', params: { AREG: 1, BREG: 0, PREG: 1, B_INPUT: 'DIRECT' },
      conns: { A: [...bus('a_i', 6), ...Array(12).fill('0')], B: [...bus('b_i', 6), ...Array(12).fill('b_i[5]')], BCIN: Array(18).fill('0'), CEA: 'c_i[0]', CEB: '1', CEP: '1', CLK: 'clk_g', RSTA: '0', RSTB: '0', RSTP: 'c_i[1]', P: bus('p2', 36), BCOUT: bus('bc', 18) }, outs: ['P', 'BCOUT'] },
    ...['p0[0]', 'p0[5]', 'p0[11]', 'p0[35]', 'p1[1]', 'p1[6]', 'p1[11]', 'p1[12]', 'p2[0]', 'p2[7]', 'p2[11]', 'p2[35]'].map((n, i) => obuf(`p[${i}]`, n)),
  ]);
}

test('multipliers: MULT18X18SIO sites, registers and inverters as ISE writes them, behaviour', () => {
  const nl = mults();
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  assert.equal(p.stats.mults, 3);
  const m = n => p.insts.find(i => i.name === n);
  const pins = k => new Map(p.nets.flatMap(n => n.inpins.filter(x => x.inst === p.insts.indexOf(m(k))).map(x => [x.pin, n.type === 'wire' ? p.insts[n.outpins[0].inst].name : n.type])));
  const ctrl = ['CEA', 'CEB', 'CEP', 'CLK', 'RSTA', 'RSTB', 'RSTP'];
  // as ISE builds them (#50): MULT18X18 with its enables and clock on GND, its resets on VCC;
  // MULT18X18S with CE on the three enables, R on the three resets; nothing inverted
  assert.deepEqual(['AREG', 'BREG', 'PREG', 'B_INPUT'].map(a => val(m('m0'), a)), ['0', '0', '0', 'DIRECT']);
  assert.deepEqual(ctrl.map(x => [val(m('m0'), `${x}INV`), pins('m0').get(x)]), ctrl.map(x => [x, /^RST/.test(x) ? 'vcc' : 'gnd']));
  assert.deepEqual(['AREG', 'BREG', 'PREG'].map(a => val(m('m1'), a)), ['0', '0', '1']);
  assert.deepEqual(ctrl.map(x => [val(m('m1'), `${x}INV`), pins('m1').get(x)]), ctrl.map(x => [x, { CEA: 'c<0>', CEB: 'c<0>', CEP: 'c<0>', CLK: 'bufg', RSTA: 'c<1>', RSTB: 'c<1>', RSTP: 'c<1>' }[x]]));
  // CEB / CEP tied to 1 on VCC, RSTA / RSTB tied to 0 on GND
  assert.deepEqual(['AREG', 'BREG', 'PREG'].map(a => val(m('m2'), a)), ['1', '0', '1']);
  assert.deepEqual(ctrl.map(x => [val(m('m2'), `${x}INV`), pins('m2').get(x)]), ctrl.map(x => [x, { CEA: 'c<0>', CEB: 'vcc', CEP: 'vcc', CLK: 'bufg', RSTA: 'gnd', RSTB: 'gnd', RSTP: 'c<1>' }[x]]));
  assert.equal(cfgOf(m('m2')).MULT18X18SIO.name, 'm2');
  same(nl, p, 300);
});

test('cells the Silinx toolchain cannot implement yet are reported clearly', () => {
  const one = (type, conns, outs) => yjson({ clk: ['input', 1], o: ['output', 1] }, [...clock, { name: 'u', type, conns, outs }, obuf('o', 'y')]);
  const dcm = params => yjson({ clk: ['input', 1], o: ['output', 1] }, [...clock, { name: 'u', type: 'DCM_SP', params, conns: { CLKIN: 'clk_i', CLK0: 'y' }, outs: ['CLK0'] }, obuf('o', 'y')]);
  // STARTUP_WAIT is written (its bit and the COR register: bitgen.js, measured in stage F)
  const sw = pack(dcm({ STARTUP_WAIT: 'TRUE' })).insts.find(i => i.type === 'DCM');
  assert.equal(val(sw, 'STARTUP_WAIT'), 'STARTUP_WAIT');
  assert.equal(val(pack(dcm({ STARTUP_WAIT: 'FALSE' })).insts.find(i => i.type === 'DCM'), 'STARTUP_WAIT'), undefined);
  // CLKIN_DIVIDE_BY_2 and DESKEW_ADJUST = SOURCE_SYNCHRONOUS are written as ISE's map writes them (#46)
  const d2 = pack(dcm({ CLKIN_DIVIDE_BY_2: 'TRUE', DESKEW_ADJUST: 'SOURCE_SYNCHRONOUS' }));
  const d2u = d2.insts.find(i => i.type === 'DCM');
  assert.deepEqual(['CLKIN_DIVIDE_BY_2', 'DESKEW_ADJUST'].map(a => val(d2u, a)), ['CLKIN_DIVIDE_BY_2', '0']);
  assert.deepEqual(d2.warnings, []);
  assert.equal(val(pack(dcm({ CLKIN_DIVIDE_BY_2: 'FALSE', DESKEW_ADJUST: '5' })).insts.find(i => i.type === 'DCM'), 'CLKIN_DIVIDE_BY_2'), undefined);
  assert.equal(val(pack(dcm({ DESKEW_ADJUST: '5' })).insts.find(i => i.type === 'DCM'), 'DESKEW_ADJUST'), '5');
  assert.throws(() => pack(dcm({ DESKEW_ADJUST: '16' })), /DCM_SP u: DESKEW_ADJUST = 16 is not in the bit database yet/);
  // a BUFGMUX that switches clocks is packed since #846 (test/fpga-pack.test.js)
  assert.equal(pack(one('BUFGMUX', { I0: 'clk_i', I1: 'clk_i', S: 'clk_i', O: 'y' }, ['O'])).insts.find(i => i.name === 'u').type, 'BUFGMUX');
  assert.throws(() => pack(one('RAM32X1D', { A0: 'clk_i', O: 'y' }, ['O'])), PackError);
});

test('timing arcs: SLICEM RAM / shift register, block RAM, multiplier', () => {
  const p = pack(srls());
  const sv = p.insts.find(i => i.type === 'SLICEM' && cfgOf(i).G?.name === 'sv');
  const a = instArcs({ type: 'SLICEM', site: 'SLICE_X0Y0', cfg: sv.cfg });
  assert.ok(a.clock);
  assert.ok(a.clkToOut.some(([o]) => o === 'Y'), 'the shift register output changes after the clock');
  assert.ok(a.setup.some(([i]) => i === 'SR') && a.setup.some(([i]) => i === 'BY'));
  assert.ok(a.comb.some(([i, o]) => i === 'G1' && o === 'Y'), 'the tap address reads through the LUT');
  const b = pack(brams()).insts.find(i => i.name === 'dp');
  const ab = instArcs({ type: 'RAMB16', site: 'RAMB16_X0Y0', cfg: b.cfg });
  assert.ok(ab.clock && ab.clkToOut.some(([o]) => o === 'DOB31') && ab.setup.some(([i]) => i === 'ADDRA13'));
  const mp = pack(mults());
  const am = instArcs({ type: 'MULT18X18SIO', cfg: mp.insts.find(i => i.name === 'm0').cfg });
  assert.ok(!am.clock && am.comb.some(([i, o, d]) => i === 'A0' && o === 'P35' && d > 3));
  const ar = instArcs({ type: 'MULT18X18SIO', cfg: mp.insts.find(i => i.name === 'm2').cfg });
  assert.ok(ar.clock && ar.clkToOut.some(([o]) => o === 'P0') && ar.setup.some(([i]) => i === 'A0') && !ar.comb.length);
});

test('netlistSim: SRL16E shifts on its clock when enabled, Q is the stage at the address', () => {
  const nl = srls();
  const s = netlistSim(nl);
  // sv: INIT 0x8001, address 0 -> stage 0 (1), address 15 -> 1
  s.step({ clk: 0, 'd<0>': 0, 'd<1>': 0, ce: 0, 't<0>': 0, 't<1>': 0, 't<2>': 0, 't<3>': 0 });
  assert.equal(s.out()['q<0>'], 1);
  s.step({ clk: 1, 'd<0>': 0, ce: 0 });
  assert.equal(s.out()['q<0>'], 1, 'no shift without CE');
  s.step({ clk: 0, 'd<0>': 0, ce: 1 });
  s.step({ clk: 1, 'd<0>': 0, ce: 1 });
  assert.equal(s.out()['q<0>'], 0, 'shifted: stage 0 is the new 0');
  s.step({ clk: 1, 't<0>': 1, ce: 1 });
  assert.equal(s.out()['q<0>'], 1, 'stage 1 is the old stage 0');
});

// placement on the XC3S250E's own sites (the device description that ships with Silinx)
const { loadDeviceCache } = await import('../src/fpga/device-node.js');
const { deviceSites } = await import('../src/fpga/device-sites.js');
let dev = null;
const device = () => (dev ||= deviceSites(loadDeviceCache('xc3s250ecp132-4')));

test('the multiplier cascade (#2): the site above each one is the one its BCOUT reaches in the routing graph, on every device', () => {
  for (const part of ['xc3s100ecp132-4', 'xc3s250ecp132-4', 'xc3s500efg320-4', 'xc3s1200efg320-4']) {
    const g = loadDeviceCache(part), d = deviceSites(g);
    const bcin = new Map(d.mults.map(m => [g.sitePinNode(m.name, 'BCIN0'), m.name]));
    for (const m of d.mults) {
      // BCOUT0 -> MULT_CCARRY_BCOUT0 -> MULT_CARRYB_BCOUT0 = the next one's BCIN0
      const reach = new Set();
      g.forEachPip(g.sitePinNode(m.name, 'BCOUT0'), to => { if (bcin.has(to)) reach.add(bcin.get(to)); g.forEachPip(to, x => { if (bcin.has(x)) reach.add(bcin.get(x)); }); });
      assert.deepEqual([...reach], m.above ? [m.above] : [], `${part} ${m.name}`);
    }
    // (the top one of each column: none above)
    assert.ok(d.mults.some(m => !m.above), part);
  }
});

test('the multiplier cascade (#2): what is not a chain of BCOUT -> BCIN is refused', () => {
  const two = (bcinOf, extra = [], m1 = {}) => yjson({ clk: ['input', 1], a: ['input', 2], p: ['output', 2] }, [...clock, ...ibuf('a', 2),
    { name: 'm0', type: 'MULT18X18SIO', params: { B_INPUT: 'DIRECT' }, conns: { A: Array(18).fill('a_i[0]'), B: Array(18).fill('a_i[1]'), CLK: 'clk_g', CEA: '1', CEB: '1', CEP: '1', RSTA: '0', RSTB: '0', RSTP: '0', P: bus('p0', 36), BCOUT: bus('bc', 18) }, outs: ['P', 'BCOUT'] },
    { name: 'm1', type: 'MULT18X18SIO', params: { B_INPUT: 'CASCADE', ...m1 }, conns: { A: Array(18).fill('a_i[0]'), B: Array(18).fill('0'), BCIN: bcinOf, CLK: 'clk_g', CEA: '1', CEB: '1', CEP: '1', RSTA: '0', RSTB: '0', RSTP: '0', P: bus('p1', 36) }, outs: ['P', 'BCOUT'] },
    ...extra, obuf('p[0]', 'p0[0]'), obuf('p[1]', 'p1[0]')]);
  assert.doesNotThrow(() => pack(two(bus('bc', 18))));
  // BCIN bits crossed (BCOUT<j> into another BCIN), or from the fabric
  assert.throws(() => pack(two([...bus('bc', 18)].reverse())), /MULT18X18SIO m0: the cascade output BCOUT<0> into anything but BCIN<0> of a multiplier with B_INPUT = CASCADE is not supported/);
  assert.throws(() => pack(two(Array(18).fill('a_i[1]'))), /MULT18X18SIO m1: B_INPUT = CASCADE: BCIN<0> is not the BCOUT<0> of a multiplier/);
  // BCOUT into the fabric
  assert.throws(() => pack(two(bus('bc', 18), [obuf('q', 'bc[3]')])), /MULT18X18SIO m0: the cascade output BCOUT<3> into anything but BCIN<3> of a multiplier with B_INPUT = CASCADE is not supported/);
  // BCOUT into a multiplier that does not cascade (B_INPUT = DIRECT): its BCIN is not used
  assert.throws(() => pack(two(bus('bc', 18), [], { B_INPUT: 'DIRECT' })), /MULT18X18SIO m0: the cascade output BCOUT<0> into anything but BCIN<0>/);
});

test('bufgReach: each output of the top-left DCM reaches its global buffer through switches of known bits (CLK0, CLK2X, CLKDV, CLKFX)', async () => {
  const { bufgReach } = await import('../src/fpga/clock-reach.js');
  const { knownRouting } = await import('../src/fpga/bitgen.js');
  const { loadDb } = await import('../src/fpga/bitdb-node.js');
  const known = knownRouting(loadDb('xc3s250ecp132-4'));
  const g = loadDeviceCache('xc3s250ecp132-4');
  const got = Object.fromEntries(['CLK0', 'CLK2X', 'CLKDV', 'CLKFX', 'CLK90', 'CLKFX180'].map(p => [p, bufgReach(g, 'DCM_X0Y1', p, known.allowPip)]));
  // (the DCM pins' switches measured in stage F of research/s3e-bitstream, the designs of every DCM and #46's gave some of
  // the pairs; #2 measured the DCMs' whole output multiplexer: every output reaches the four buffers of its four lines)
  const top = ['BUFGMUX_X2Y11', 'BUFGMUX_X2Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X1Y10'];
  assert.deepEqual(got, { CLK0: top, CLK2X: top, CLKDV: top, CLKFX: top, CLK90: top, CLKFX180: top });
  // without the restriction: the four buffers of the top edge
  assert.deepEqual(bufgReach(g, 'DCM_X0Y1', 'CLK90').sort(), ['BUFGMUX_X1Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X2Y10', 'BUFGMUX_X2Y11']);
});

test('clockReach: a side global buffer reaches only the slices of its half of the chip, never through general routing (#95)', async () => {
  const { clockReach } = await import('../src/fpga/clock-reach.js');
  const { knownRouting } = await import('../src/fpga/bitgen.js');
  const { loadDb } = await import('../src/fpga/bitdb-node.js');
  const { deviceSites } = await import('../src/fpga/device-sites.js');
  const known = knownRouting(loadDb('xc3s250ecp132-4'));
  const g = loadDeviceCache('xc3s250ecp132-4');
  const dev = deviceSites(g, known);
  // the side buffers are the placer's now (#95): 8 top / bottom, 16 side ones
  assert.equal(dev.bufgmux.length, 24);
  const slices = [...dev.slices.values()], centre = dev.bufgmux.find(b => b.tile.startsWith('CLKT')).px;
  const halves = name => { const r = clockReach(g, name, known.allowPip); return [slices.filter(s => r.has(s.name) && s.px < centre).length, slices.filter(s => r.has(s.name) && s.px > centre).length]; };
  // (before: the even lines' side buffers also reached 1128 slices of the other half, through the
  // side clock tile's CLKL_GCLKH_MAINk node into a hex line, N6BEG0)
  for (const k of [2, 3, 4, 6, 8, 9]) {
    assert.deepEqual(halves(`BUFGMUX_X0Y${k}`), [1224, 0], `BUFGMUX_X0Y${k}`);
    assert.deepEqual(halves(`BUFGMUX_X3Y${k}`), [0, 1224], `BUFGMUX_X3Y${k}`);
  }
  // a top / bottom buffer: the whole chip
  assert.deepEqual(halves('BUFGMUX_X2Y11'), [1224, 1224]);
  assert.deepEqual([...clockReach(g, 'BUFGMUX_X0Y4', known.allowPip)].filter(s => s.startsWith('DCM')), ['DCM_X0Y0.CLKFB']);
});

// A 14-bit memory on 1024 x 18 ports, as Yosys maps it: its 18-bit word is DI0-7, DIP0, DI8-15,
// DIP1, so bit 8 of the word is written on DIPA0 and read on DOPB0; port A writes, port B reads
function bram14(params = {}) {
  return yjson({ clk: ['input', 1], a: ['input', 10], d: ['input', 14], we: ['input', 1], q: ['output', 14] }, [
    ...clock, ...ibuf('a', 10), ...ibuf('d', 14), ...ibuf('we', 1),
    { name: 'm', type: 'RAMB16_S18_S18', params: { WRITE_MODE_A: 'READ_FIRST', WRITE_MODE_B: 'READ_FIRST', ...params },
      conns: { ADDRA: bus('a_i', 10), DIA: [...bus('d_i', 8), ...bus('d_i', 5, 9), 'x', 'x', 'x'], DIPA: ['d_i[8]', 'x'], DOA: bus('qa', 16), DOPA: bus('qap', 2),
        CLKA: 'clk_g', ENA: '1', SSRA: '0', WEA: 'we_i',
        ADDRB: bus('a_i', 10).reverse(), DIB: Array(16).fill('x'), DIPB: ['x', 'x'], DOB: bus('qb', 16), DOPB: bus('qbp', 2), CLKB: 'clk_g', ENB: '1', SSRB: '0', WEB: '0' },
      outs: ['DOA', 'DOPA', 'DOB', 'DOPB'] },
    ...[...bus('qb', 8), 'qbp[0]', ...bus('qb', 5, 8)].map((n, i) => obuf(`q[${i}]`, n)),
  ]);
}

test('block RAMs: a word bit in a parity position that its port writes and does not read moves to a free data bit (pins, contents, initial / reset values), as ISE\'s map lays it out (#35)', () => {
  // word 0: data bit 13 set; word 1: parity bit 0 set; word 0: parity bit 1 set (stays)
  const nl = bram14({ INIT_00: bin((1n << 13n) | 0xABCn, 256), INITP_00: bin(0b110, 256), INIT_A: bin(0x10000, 18), SRVAL_B: bin(0x02001, 18) });
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  const m = p.insts.find(i => i.name === 'm');
  const k = p.insts.indexOf(m);
  // each input pin: the input buffer driving it (named after its port bit), or the constant
  const ins = new Map(p.nets.flatMap(n => n.inpins.filter(x => x.inst === k).map(x => [x.pin, n.type === 'wire' ? p.insts[n.outpins[0].inst].name : n.type])));
  const outs = p.nets.flatMap(n => n.outpins.filter(x => x.inst === k).map(x => x.pin)).sort();
  // bit 8 of the word on DI13 / DO13 (the first data bit no port uses); port A's parity inputs tied to 0, port B's
  // (never written, its inputs all undriven) left out (#836)
  assert.equal(ins.get('DIA13'), 'd<8>');
  assert.deepEqual(['DIPA0', 'DIPA1', 'DIPB0', 'DIPB1'].map(x => ins.get(x)), ['gnd', 'gnd', undefined, undefined]);
  assert.ok(!ins.has('DIA14') && !ins.has('DIA15') && !ins.has('DIB13'));
  assert.deepEqual(outs, Array.from({ length: 14 }, (_, i) => `DOB${i}`).sort());
  // the contents: data bit 13 and parity bit 0 of every word swapped
  assert.equal(val(m, 'INIT_00'), ((1n << 29n) | 0xABCn).toString(16).toUpperCase().padStart(64, '0'));
  assert.equal(val(m, 'INITP_00'), '3'.padStart(64, '0'));
  assert.deepEqual([val(m, 'INIT_A'), val(m, 'SRVAL_B'), val(m, 'INIT_B'), val(m, 'SRVAL_A')], ['02000', '10001', '00000', '00000']);
  // the netlist itself is not changed
  assert.equal(nl.cells.find(c => c.name === 'm').params.INIT_A, bin(0x10000, 18));
  same(nl, p, 300);
  // a parity bit its port reads back stays where it is
  const read = yjson({ clk: ['input', 1], a: ['input', 10], d: ['input', 14], we: ['input', 1], q: ['output', 2] }, [
    ...clock, ...ibuf('a', 10), ...ibuf('d', 14), ...ibuf('we', 1),
    { name: 'm', type: 'RAMB16_S18', conns: { ADDR: bus('a_i', 10), DI: [...bus('d_i', 13), 'x', 'x', 'x'], DIP: ['d_i[13]', 'x'], DO: bus('qa', 16), DOP: bus('qap', 2), CLK: 'clk_g', EN: '1', SSR: '0', WE: 'we_i' }, outs: ['DO', 'DOP'] },
    obuf('q[0]', 'qap[0]'), obuf('q[1]', 'qa[0]'),
  ]);
  const pr = pack(read);
  assert.deepEqual(pr.warnings, []);
  const kr = pr.insts.findIndex(i => i.name === 'm');
  assert.equal(pr.insts[pr.nets.find(n => n.inpins.some(x => x.inst === kr && x.pin === 'DIPA0')).outpins[0].inst].name, 'd<13>');
  same(read, pr, 200);
});

// #836: a port never written (WE tied to 0) whose data and parity inputs are all constants (a ROM, the Block Memory
// wizard's, #794): its inputs left out, as ISE's map trims them (its DRC calls the unread outputs of a block with them
// tied dangling pins); a never-written port with a signal on a data input keeps them all, as ISE keeps them
// (feat_const_bram's b1)
test('block RAMs: a never-written port\'s constant data and parity inputs left out; one with a signal kept (#836)', () => {
  const rom = (di, dip) => yjson({ clk: ['input', 1], a: ['input', 11], d: ['input', 8], q: ['output', 3] }, [
    ...clock, ...ibuf('a', 11), ...ibuf('d', 8),
    { name: 'm', type: 'RAMB16_S9', params: { INIT_00: bin(0xA5C3n, 256) },
      conns: { ADDR: bus('a_i', 11), DI: di, DIP: dip, DO: bus('qr', 8), DOP: 'qrp', CLK: 'clk_g', EN: '1', SSR: '0', WE: '0' }, outs: ['DO', 'DOP'] },
    ...['qr[0]', 'qr[1]', 'qr[2]'].map((n, i) => obuf(`q[${i}]`, n)),
  ]);
  const insOf = p => { const k = p.insts.findIndex(i => i.name === 'm'); return new Map(p.nets.flatMap(n => n.inpins.filter(x => x.inst === k).map(x => [x.pin, n.type === 'wire' ? p.insts[n.outpins[0].inst].name : n.type]))); };
  // the ROM: its DI and DIP tied to 0 and 1: none connected; its address, clock and controls as before
  const p = pack(rom([...Array(4).fill('0'), ...Array(4).fill('1')], '0'));
  assert.deepEqual(p.warnings, []);
  const ins = insOf(p);
  assert.deepEqual([...ins.keys()].filter(x => /^DIP?A/.test(x)), []);
  assert.deepEqual(['ADDRA3', 'ENA', 'SSRA', 'WEA'].map(x => ins.get(x)), ['a<0>', 'vcc', 'gnd', 'gnd']);
  same(rom([...Array(4).fill('0'), ...Array(4).fill('1')], '0'), p, 200);
  // never written, a signal on a data input: every data and parity input kept (the constants on their constant)
  const q = insOf(pack(rom([...bus('d_i', 4), ...Array(4).fill('0')], '0')));
  assert.deepEqual(['DIA0', 'DIA3', 'DIA4', 'DIA7', 'DIPA0'].map(x => q.get(x)), ['d<0>', 'd<3>', 'gnd', 'gnd', 'gnd']);
});

// A FIFO's 64 x 9 memory on 2048 x 9 ports, as Yosys maps verilog-axis-fifo's: port A writes the
// 9 bits (DIPA the 9th), port B reads them; the address MSBs tied to 0 (msb: port A's otherwise)
function fifo9(params = {}, msb = '0') {
  return yjson({ clk: ['input', 1], wa: ['input', 6], ra: ['input', 6], h: ['input', 1], d: ['input', 9], we: ['input', 1], q: ['output', 9] }, [
    ...clock, ...ibuf('wa', 6), ...ibuf('ra', 6), ...ibuf('h', 1), ...ibuf('d', 9), ...ibuf('we', 1),
    { name: 'm', type: 'RAMB16_S9_S9', params: { WRITE_MODE_A: 'READ_FIRST', WRITE_MODE_B: 'READ_FIRST', ...params },
      conns: { ADDRA: [...bus('wa_i', 6), '0', '0', '0', '0', msb], DIA: bus('d_i', 8), DIPA: 'd_i[8]', DOA: bus('qa', 8), DOPA: 'qap', CLKA: 'clk_g', ENA: '1', SSRA: '0', WEA: 'we_i',
        ADDRB: [...bus('ra_i', 6), '0', '0', '0', '0', '0'], DIB: Array(8).fill('x'), DIPB: 'x', DOB: bus('qb', 8), DOPB: 'qbp', CLKB: 'clk_g', ENB: '1', SSRB: '0', WEB: '0' },
      outs: ['DOA', 'DOPA', 'DOB', 'DOPB'] },
    ...[...bus('qb', 8), 'qbp'].map((n, i) => obuf(`q[${i}]`, n)),
  ]);
}

test('block RAMs: a 9-bit word on 2048 x 9 ports, written on port A and read on port B, goes on 1024 x 18 ports with its parity pins unused when its address MSB is tied to 0 (#550)', () => {
  // word 1: parity bit set; word 3: data 0xA5; word 1024 (the upper half: never addressed) dropped
  const nl = fifo9({ INIT_00: bin(0xA5n << 24n, 256), INIT_20: bin(0xFF, 256), INITP_00: bin(0b10, 256), INIT_A: bin(0x1FF, 9), SRVAL_B: bin(0x103, 9) });
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  const m = p.insts.find(i => i.name === 'm');
  const k = p.insts.indexOf(m);
  const ins = new Map(p.nets.flatMap(n => n.inpins.filter(x => x.inst === k).map(x => [x.pin, n.type === 'wire' ? p.insts[n.outpins[0].inst].name : n.type])));
  const outs = p.nets.flatMap(n => n.outpins.filter(x => x.inst === k).map(x => x.pin)).sort();
  assert.deepEqual([val(m, 'PORTA_ATTR'), val(m, 'PORTB_ATTR')], ['1024X18', '1024X18']);
  // the 9th bit on DIA8 / DOB8; port A's parity inputs tied to 0 (ISE's DRC: all of a port's or none), port B's
  // (never written, its inputs all undriven) left out (#836); 10 address bits from ADDR4 (the MSB, 0, left out)
  assert.equal(ins.get('DIA8'), 'd<8>');
  assert.deepEqual(['DIPA0', 'DIPA1', 'DIPB0', 'DIPB1'].map(x => ins.get(x)), ['gnd', 'gnd', undefined, undefined]);
  assert.ok(!ins.has('DIB8'));
  assert.deepEqual(outs, Array.from({ length: 9 }, (_, i) => `DOB${i}`).sort());
  assert.deepEqual(['ADDRA4', 'ADDRB4', 'ADDRA9', 'ADDRA10', 'ADDRA13'].map(x => ins.get(x)), ['wa<0>', 'ra<0>', 'wa<5>', 'gnd', 'gnd']);
  assert.ok(!ins.has('ADDRA3') && !ins.has('ADDRB3'));
  // the contents: word a's 8 data bits then its parity bit on data bits 0-8 of 18-bit word a
  assert.equal(val(m, 'INIT_00'), ((0xA5n << 48n) | (1n << 24n)).toString(16).toUpperCase().padStart(64, '0'));
  assert.ok(!cfgOf(m).INIT_20 || /^0+$/.test(val(m, 'INIT_20')));
  assert.ok(Object.values(cfgOf(m)).every(c => !/^INITP_/.test(c.attr) || /^0+$/.test(c.value)));
  assert.deepEqual([val(m, 'INIT_A'), val(m, 'SRVAL_B')], ['001FF', '00103']);
  // the netlist itself is not changed
  assert.equal(nl.cells.find(c => c.name === 'm').type, 'RAMB16_S9_S9');
  same(nl, p, 300);
  // the MSB used (all 2048 words): the ports stay 2048 x 9, the 9th bit on DIPA0
  const nh = fifo9({}, 'h_i');
  const ph = pack(nh);
  const mh = ph.insts.find(i => i.name === 'm'), kh = ph.insts.indexOf(mh);
  assert.equal(val(mh, 'PORTA_ATTR'), '2048X9');
  assert.equal(ph.insts[ph.nets.find(n => n.inpins.some(x => x.inst === kh && x.pin === 'DIPA0')).outpins[0].inst].name, 'd<8>');
  same(nh, ph, 200);
});

// Clocks on the four devices that ship (their own graphs and bit databases), placed as the open
// flow places them: the switches of known bits (clockReach, bufgReach), the global buffers whose
// settings are known (knownRouting allowBufg). #56, #57, #58.
const SHIPPED = [['xc3s100ecp132-4', 'M4', 'G3'], ['xc3s250ecp132-4', 'M4', 'G3'], ['xc3s500efg320-4', 'N9', 'K3'], ['xc3s1200efg320-4', 'N9', 'K3']];
const flows = new Map();
async function flowOf(part) {
  if (flows.has(part)) return flows.get(part);
  const { clockReach, bufgReach } = await import('../src/fpga/clock-reach.js');
  const { knownRouting } = await import('../src/fpga/bitgen.js');
  const { loadDb } = await import('../src/fpga/bitdb-node.js');
  const g = loadDeviceCache(part);
  const known = knownRouting(loadDb(part, { graph: g }));
  const reach = new Map();
  const clockSites = site => (reach.has(site) || reach.set(site, clockReach(g, site, known.allowPip)), reach.get(site));
  const f = { sites: deviceSites(g, known), clockSites, opts: { clockSites, bufgSites: (site, pin, to) => bufgReach(g, site, pin, known.allowPip, to) } };
  flows.set(part, f);
  return f;
}

test('clockReach: the clock pins of the block RAMs and multipliers a global buffer reaches on switches of known bits (#56)', { timeout: 300000 }, async () => {
  for (const [part] of SHIPPED) {
    const { sites, clockSites } = await flowOf(part);
    const hard = [...sites.brams.flatMap(s => [`${s.name}.CLKA`, `${s.name}.CLKB`]), ...sites.mults.map(s => `${s.name}.CLK`)];
    // every top and bottom buffer reaches every one (#2: the block-RAM interconnect tiles' GCLKk -> BRAM_CLKj measured;
    // before, the bottom buffer of N9 / M4 reached none), and every slice
    for (const b of ['BUFGMUX_X1Y0', 'BUFGMUX_X1Y1', 'BUFGMUX_X2Y0', 'BUFGMUX_X2Y1', 'BUFGMUX_X1Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X2Y10', 'BUFGMUX_X2Y11']) {
      assert.deepEqual(hard.filter(h => !clockSites(b).has(h)), [], `${part} ${b}`);
    }
    // (and DCM clock inputs, #47)
    assert.equal([...clockSites('BUFGMUX_X2Y1')].filter(s => s.startsWith('SLICE_')).length, sites.slices.size, part);
  }
});

// #84: the packer reads the UCF with the top's ports, as Check Constraints does (#63): a bus bit
// written x[1] is x<1>; a name like n[1] that is not a bit of a bus stays as written
test('packer: the UCF read with the top\'s ports (a bus bit written x[1] is x<1>, another bracket name kept as written) (#84)', () => {
  const nl = yjson({ x: ['input', 2], n: ['input', 1], y: ['output', 1] }, [...ibuf('x', 2), ...ibuf('n', 1),
    { name: 'l', type: 'LUT3', params: { INIT: '10010110' }, conns: { I0: 'x_i[0]', I1: 'x_i[1]', I2: 'n_i', O: 'yy' }, outs: ['O'] }, obuf('y', 'yy')]);
  assert.deepEqual(ucfPortsOf(nl), [{ name: 'x', msb: 1, lsb: 0 }, { name: 'n' }, { name: 'y' }]);
  const p = pack(nl, { ucf: 'NET "x[1]" LOC = "P11" ;\nNET "x(0)" LOC = "L3" ;\nNET "n[0]" LOC = "K3" ;\nNET "y" LOC = "M5" ;\n' });
  const loc = n => p.insts.find(i => i.kind === 'iob' && i.name === n)?.loc;
  assert.deepEqual([loc('x<1>'), loc('x<0>'), loc('y'), loc('n')], ['P11', 'L3', 'M5', null]);
  assert.deepEqual(p.warnings, []);
});
