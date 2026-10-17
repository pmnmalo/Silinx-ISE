// The packer (core/fpga/pack.js) on distributed RAMs and shift registers (SLICEM), block RAMs and
// multipliers, the placer (core/fpga/place.js) on their sites, their timing arcs
// (core/fpga/timing.js): small synthetic Yosys netlists, the XDL settings as ISE's map writes them
// (research/s3e-bitstream/README.md, stage D), and - the main check - the packed design simulated
// from its own XDL settings behaves like the netlist (test/fpga-sim.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readYosysJson } from '../core/fpga/netlist.js';
import { pack, PackError, BRAM_WIDTH, ucfPortsOf } from '../core/fpga/pack.js';
import { instArcs } from '../core/fpga/timing.js';
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
  assert.throws(() => pack(one('BUFGMUX', { I0: 'clk_i', I1: 'clk_i', S: 'clk_i', O: 'y' }, ['O'])), /BUFGMUX u: the Silinx toolchain cannot switch clocks with a BUFGMUX yet/);
  const cascade = yjson({ clk: ['input', 1], o: ['output', 2] }, [...clock,
    { name: 'u', type: 'SRLC16E', conns: { A0: '0', A1: '0', A2: '0', A3: '0', CE: '1', CLK: 'clk_g', D: 'clk_i', Q: 'y', Q15: 'y15' }, outs: ['Q', 'Q15'] }, obuf('o[0]', 'y'), obuf('o[1]', 'y15')]);
  assert.throws(() => pack(cascade), /SRLC16E u: the cascade output Q15 is not supported yet/);
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
const { loadDeviceCache } = await import('../core/fpga/device-node.js');
const { deviceSites, place, PlaceError } = await import('../core/fpga/place.js');
let dev = null;
const device = () => (dev ||= deviceSites(loadDeviceCache('xc3s250ecp132-4')));

// n multipliers and a block RAM with a 36-bit port
function multsAndBram(n) {
  const cells = [...clock, ...ibuf('a', 9)];
  for (let k = 0; k < n; k++) {
    cells.push({ name: `m${k}`, type: 'MULT18X18', conns: { A: [...bus('a_i', 9), ...Array(9).fill('0')], B: [...bus('a_i', 9).reverse(), ...Array(9).fill('0')], P: bus(`p${k}`, 36) }, outs: ['P'] });
    cells.push(obuf(`p[${k}]`, `p${k}[${k + 3}]`));
  }
  cells.push({ name: 'r', type: 'RAMB16_S36', conns: { ADDR: bus('a_i', 9), DI: [...bus('a_i', 9), ...Array(23).fill('0')], DIP: bus('a_i', 4), DO: bus('q', 32), DOP: bus('qp', 4), CLK: 'clk_g', EN: '1', SSR: '0', WE: 'a_i[0]' }, outs: ['DO', 'DOP'] });
  cells.push(obuf('q', 'q[7]'));
  return yjson({ clk: ['input', 1], a: ['input', 9], p: ['output', n], q: ['output', 1] }, cells);
}

test('placement: block RAMs and multipliers on their sites, never a multiplier beside a block RAM with 36-bit ports', () => {
  const d = device();
  assert.deepEqual([d.brams.length, d.mults.length], [12, 12]);
  const p = pack(multsAndBram(11));
  const r = place(p, d, { seed: 2, effort: 0.2 });
  const tiles = new Map();
  p.insts.forEach((inst, k) => {
    if (inst.kind === 'bram') assert.match(r.sites[k].site, /^RAMB16_X\dY\d$/);
    if (inst.kind === 'mult') assert.match(r.sites[k].site, /^MULT18X18_X\dY\d$/);
    if (inst.kind === 'bram' || inst.kind === 'mult') { assert.ok(!tiles.get(r.sites[k].tile)?.includes(inst.kind)); tiles.set(r.sites[k].tile, [...(tiles.get(r.sites[k].tile) || []), inst.kind]); }
  });
  const bramTile = r.sites[p.insts.findIndex(i => i.kind === 'bram')].tile;
  assert.deepEqual(tiles.get(bramTile), ['bram'], 'the 36-bit block RAM has its tile to itself');
  assert.equal(new Set(r.sites.map(s => s.site)).size, r.sites.length, 'one instance per site');
  // 12 multipliers leave no tile for it
  assert.throws(() => place(pack(multsAndBram(12)), d, { seed: 1, effort: 0.1 }), err => err instanceof PlaceError && /no free block RAM site/.test(err.message));
  // more multipliers than the device has: said plainly, up front (#19)
  assert.throws(() => place(pack(multsAndBram(13)), d, { seed: 1, effort: 0.1 }), err => err instanceof PlaceError && err.message === 'place: 13 multipliers needed, the device has 12');
});

test('placement: RAMs and shift registers (SLICEM instances) only on SLICEM sites', () => {
  const d = device();
  const p = pack(drams());
  const r = place(p, d, { seed: 5, effort: 0.3 });
  p.insts.forEach((inst, k) => {
    if (inst.type !== 'SLICEM') return;
    const [, x] = /^SLICE_X(\d+)Y/.exec(r.sites[k].site);
    assert.equal(+x % 2, 0, `${inst.name} on ${r.sites[k].site}`);
  });
});

test('DCM: the top-left DCM site (no INST LOC: the placer\'s choice, #47), the settings as ISE\'s map writes them, constant inputs', () => {
  const nl = yjson({ clk: ['input', 1], o: ['output', 2] }, [
    { name: 'ib', type: 'IBUFG', conns: { I: 'clk', O: 'clk_i' }, outs: ['O'] },
    { name: 'u', type: 'DCM_SP', params: { CLKDV_DIVIDE: '2.500000', CLKFX_DIVIDE: bin(2, 32), CLKFX_MULTIPLY: bin(3, 32), CLKIN_PERIOD: '20.000000', CLK_FEEDBACK: '1X', DFS_FREQUENCY_MODE: 'LOW', DLL_FREQUENCY_MODE: 'LOW', STARTUP_WAIT: 'FALSE' },
      conns: { CLKIN: 'clk_i', CLKFB: 'c0b', RST: '0', DSSEN: '0', PSCLK: '0', PSEN: '0', PSINCDEC: '0', CLK0: 'c0', CLKFX: 'cfx', LOCKED: 'lk' }, outs: ['CLK0', 'CLKFX', 'LOCKED'] },
    { name: 'b0', type: 'BUFG', conns: { I: 'c0', O: 'c0b' }, outs: ['O'] },
    { name: 'bfx', type: 'BUFG', conns: { I: 'cfx', O: 'cfxb' }, outs: ['O'] },
    { name: 'ff', type: 'FDRE', params: { INIT: '0' }, conns: { C: 'cfxb', CE: '1', R: '0', D: 'lk', Q: 'q' }, outs: ['Q'] },
    obuf('o[0]', 'lk'), obuf('o[1]', 'q'),
  ]);
  const p = pack(nl);
  const u = p.insts.find(i => i.kind === 'dcm');
  assert.deepEqual([u.type, u.loc, p.stats.dcms], ['DCM', null, 1]);
  assert.deepEqual(['CLKDV_DIVIDE', 'CLKFX_MULTIPLY', 'CLKFX_DIVIDE', 'CLK_FEEDBACK', 'DESKEW_ADJUST', 'DUTY_CYCLE_CORRECTION', 'PHASE_SHIFT', 'RSTINV', 'X_CLKIN_PERIOD'].map(a => val(u, a)),
    ['2_5', '3', '2', '1X', '7', 'TRUE', '0', 'RST', '20.0000000000000000']);
  assert.equal(cfgOf(u).DCM.name, 'u');
  // the unused inputs tied to 0 as ISE's map ties them (DSSEN left open)
  const k = p.insts.indexOf(u);
  const gnd = p.nets.filter(n => n.type === 'gnd').flatMap(n => n.inpins.filter(x => x.inst === k).map(x => x.pin)).sort();
  assert.deepEqual(gnd, ['PSCLK', 'PSEN', 'PSINCDEC', 'RST']);
  // placed on the top-left DCM, its clock outputs on the global buffers their paths reach
  const r = place(p, device(), { seed: 1, effort: 0.1, bufgSites: (site, pin) => (pin === 'CLK0' ? ['BUFGMUX_X2Y10'] : pin === 'CLKFX' ? ['BUFGMUX_X1Y10'] : []) });
  assert.equal(r.sites[k].site, 'DCM_X0Y1');
  assert.equal(r.sites[p.insts.findIndex(i => i.name === 'b0')].site, 'BUFGMUX_X2Y10');
  assert.equal(r.sites[p.insts.findIndex(i => i.name === 'bfx')].site, 'BUFGMUX_X1Y10');
  assert.throws(() => place(p, device(), { seed: 1, effort: 0.1, bufgSites: () => [] }), /no free global clock buffer reachable from u\.CLK0 through switches of known bits/);
  // the output that reaches fewer buffers chooses first: CLKFX takes X1Y10, CLK0 the other one it reaches
  const r2 = place(p, device(), { seed: 1, effort: 0.1, bufgSites: (site, pin) => (pin === 'CLK0' ? ['BUFGMUX_X1Y10', 'BUFGMUX_X2Y10'] : pin === 'CLKFX' ? ['BUFGMUX_X1Y10'] : []) });
  assert.equal(r2.sites[p.insts.findIndex(i => i.name === 'bfx')].site, 'BUFGMUX_X1Y10');
  assert.equal(r2.sites[p.insts.findIndex(i => i.name === 'b0')].site, 'BUFGMUX_X2Y10');
});

test('bufgReach: each output of the top-left DCM reaches its global buffer through switches of known bits (CLK0, CLK2X, CLKDV, CLKFX)', async () => {
  const { bufgReach } = await import('../core/fpga/route.js');
  const { knownRouting } = await import('../core/fpga/bitgen.js');
  const { loadDb } = await import('../core/fpga/bitdb-node.js');
  const known = knownRouting(loadDb('xc3s250ecp132-4'));
  const g = loadDeviceCache('xc3s250ecp132-4');
  const got = Object.fromEntries(['CLK0', 'CLK2X', 'CLKDV', 'CLKFX', 'CLK90', 'CLKFX180'].map(p => [p, bufgReach(g, 'DCM_X0Y1', p, known.allowPip)]));
  // (the DCM pins' switches measured in stage F of research/s3e-bitstream add CLK0 -> X2Y11 and CLKFX -> X1Y11;
  // the designs of every DCM, CLK90 -> X1Y11 and CLKFX -> X2Y11: CLK90 on a global buffer is byte-identical to ISE;
  // #46's designs of every DCM, CLK0 -> X1Y10 and X1Y11)
  assert.deepEqual(got, { CLK0: ['BUFGMUX_X2Y11', 'BUFGMUX_X2Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X1Y10'], CLK2X: ['BUFGMUX_X1Y11'], CLKDV: ['BUFGMUX_X2Y11'], CLKFX: ['BUFGMUX_X2Y11', 'BUFGMUX_X1Y11', 'BUFGMUX_X1Y10'], CLK90: ['BUFGMUX_X1Y11'], CLKFX180: [] });
  // without the restriction: the four buffers of the top edge
  assert.deepEqual(bufgReach(g, 'DCM_X0Y1', 'CLK90').sort(), ['BUFGMUX_X1Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X2Y10', 'BUFGMUX_X2Y11']);
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
  // bit 8 of the word on DI13 / DO13 (the first data bit no port uses); the parity inputs tied to 0
  assert.equal(ins.get('DIA13'), 'd<8>');
  assert.deepEqual(['DIPA0', 'DIPA1', 'DIPB0', 'DIPB1'].map(x => ins.get(x)), ['gnd', 'gnd', 'gnd', 'gnd']);
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

// x * 6554 (x / 10 = x * 6554 / 65536, as the stopwatch example computes it) on all 12 multipliers:
// the B inputs tied to 0 and 1 (GLOBAL_LOGIC0 / GLOBAL_LOGIC1)
function constMults() {
  const B = [...bin(6554, 18)].reverse();
  const cells = [...ibuf('a', 14)];
  for (let k = 0; k < 12; k++) {
    cells.push({ name: `m${k}`, type: 'MULT18X18', conns: { A: [...bus('a_i', 14), '0', '0', '0', '0'], B, P: bus(`p${k}`, 36) }, outs: ['P'] });
    cells.push(obuf(`p[${k}]`, `p${k}[${16 + k}]`));
  }
  return yjson({ a: ['input', 14], p: ['output', 12] }, cells);
}

test('multipliers with constant inputs (x * 6554) on every multiplier site: every input tied to 1 routed on switches of known bits, from the VCC site of its own block-RAM interconnect tile, as ISE does (#35)', { timeout: 120000 }, async () => {
  const { routeDesign, checkRouting } = await import('../core/fpga/route.js');
  const { knownRouting, bitgen } = await import('../core/fpga/bitgen.js');
  const { loadDb } = await import('../core/fpga/bitdb-node.js');
  const { placedXdl } = await import('../core/fpga/place.js');
  const { parseXdl, writeXdl } = await import('../core/xdl.js');
  const g = loadDeviceCache('xc3s250ecp132-4');
  const db = loadDb('xc3s250ecp132-4', { graph: g });
  const nl = constMults();
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  assert.equal(p.stats.mults, 12);
  const r = place(p, device(), { seed: 1, effort: 0.1 });
  assert.equal(new Set(p.insts.map((x, k) => (x.kind === 'mult' ? r.sites[k].site : null)).filter(Boolean)).size, 12);
  const routed = routeDesign(parseXdl(writeXdl(placedXdl(p, r))), g, knownRouting(db));
  assert.deepEqual([routed.failed, routed.unreached, routed.errors], [[], [], []]);
  const text = writeXdl(routed.design);
  const check = checkRouting(parseXdl(text), g);
  assert.ok(check.ok, check.problems.slice(0, 5).join('\n'));
  // 10 inputs tied to 1 per multiplier (the 7 bits set in 6554, and a MULT18X18's RSTA, RSTB,
  // RSTP: #50), each from the VCC site of the interconnect tile of its pin: BRAM_VCC_WIRE -> the
  // pin's wire there, then the site tile's PIP
  const isMult = x => /^m\d+$/.test(x.inst);
  const vcc = routed.design.nets.filter(n => n.type === 'vcc' && n.inpins.some(isMult));
  assert.equal(vcc.flatMap(n => n.inpins.filter(isMult)).length, 12 * 10);
  for (const n of vcc) {
    assert.match(n.outpins[0].inst, /^XDL_DUMMY_BRAM[0-3]_SMALL(_BRK)?_X\d+Y\d+_VCC_X\d+Y\d+$/, n.name);
    assert.equal(n.pips.length, 2 * n.inpins.length, `${n.name}: two switches per pin`);
    for (const pip of n.pips) assert.ok(pip.from === 'BRAM_VCC_WIRE' || /^BRAMSITE2_/.test(pip.tile), `${n.name}: ${pip.tile} ${pip.from} -> ${pip.to}`);
  }
  // a complete bitstream: every switch and setting in the bit database
  assert.deepEqual(bitgen(text, db).unknown, []);
});

// Control pins tied to constants, as ISE ties them (#50, measured with ISE's map and par on the
// XC3S250E: every combination of 1 / 0 / a signal on a block RAM's EN / WE / SSR, a multiplier's
// CE / RST with and without registers, a DCM's RST / PS… / DSSEN): to VCC or GND, never inverted;
// a DCM's DSSEN left open; a DCM's pins tied to 1 from the VCC site of its own tile (#190)
test('control pins tied to 1 / 0: block RAM EN / WE / SSR, multiplier CE / RST and DCM RST / PS… on VCC / GND, not inverted, routed on switches of known bits; a DCM\'s DSSEN open (#50, #190)', { timeout: 120000 }, async () => {
  const { routeDesign, checkRouting } = await import('../core/fpga/route.js');
  const { knownRouting, bitgen, designFeatures } = await import('../core/fpga/bitgen.js');
  const { loadDb } = await import('../core/fpga/bitdb-node.js');
  const { placedXdl } = await import('../core/fpga/place.js');
  const { parseXdl, writeXdl } = await import('../core/xdl.js');
  const nl = yjson({ clk: ['input', 1], a: ['input', 10], q: ['output', 4] }, [
    ...clock, ...ibuf('a', 10),
    { name: 'b', type: 'RAMB16_S9_S9', conns: { ADDRA: bus('a_i', 10, 0).concat('a_i[0]'), DIA: bus('a_i', 8), DIPA: ['0'], DOA: bus('qa', 8), DOPA: ['qap'], CLKA: 'clk_g', ENA: '0', WEA: '1', SSRA: '1',
      ADDRB: bus('a_i', 10).reverse().concat('a_i[9]'), DIB: bus('a_i', 8, 2), DIPB: ['0'], DOB: bus('qb', 8), DOPB: ['qbp'], CLKB: 'clk_g', ENB: '1', WEB: '0', SSRB: '0' }, outs: ['DOA', 'DOPA', 'DOB', 'DOPB'] },
    { name: 'm', type: 'MULT18X18SIO', params: { AREG: 1, BREG: 0, PREG: 0, B_INPUT: 'DIRECT' },
      conns: { A: [...bus('a_i', 10), ...Array(8).fill('0')], B: [...bus('a_i', 10).reverse(), ...Array(8).fill('0')], BCIN: Array(18).fill('0'), CEA: '1', CEB: '0', CEP: '1', CLK: 'clk_g', RSTA: '0', RSTB: '1', RSTP: '0', P: bus('p', 36) }, outs: ['P'] },
    obuf('q[0]', 'qa[0]'), obuf('q[1]', 'qb[7]'), obuf('q[2]', 'p[3]'), obuf('q[3]', 'p[12]'),
  ]);
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  const pins = name => { const k = p.insts.findIndex(i => i.name === name); return new Map(p.nets.flatMap(n => n.inpins.filter(x => x.inst === k).map(x => [x.pin, n.type]))); };
  const b = p.insts.find(i => i.name === 'b'), m = p.insts.find(i => i.name === 'm');
  const bc = ['ENA', 'WEA', 'SSRA', 'ENB', 'WEB', 'SSRB'], mc = ['CEA', 'CEB', 'CEP', 'RSTA', 'RSTB', 'RSTP'];
  assert.deepEqual(bc.map(x => [val(b, `${x}INV`), pins('b').get(x)]), bc.map((x, i) => [x, ['gnd', 'vcc', 'vcc', 'vcc', 'gnd', 'gnd'][i]]));
  assert.deepEqual(mc.map(x => [val(m, `${x}INV`), pins('m').get(x)]), mc.map((x, i) => [x, ['vcc', 'gnd', 'vcc', 'gnd', 'vcc', 'gnd'][i]]));
  // placed, routed: each pin tied to 1 from the VCC site of a block-RAM interconnect tile, on
  // switches of known bits; the bitstream complete, no inverter set
  const g = loadDeviceCache('xc3s250ecp132-4');
  const db = loadDb('xc3s250ecp132-4', { graph: g });
  const { sites, opts } = await flowOf('xc3s250ecp132-4');
  const r = place(p, sites, { seed: 1, effort: 0.1, ...opts });
  const routed = routeDesign(parseXdl(writeXdl(placedXdl(p, r))), g, knownRouting(db));
  assert.deepEqual([routed.failed, routed.unreached, routed.errors], [[], [], []]);
  const text = writeXdl(routed.design);
  assert.ok(checkRouting(parseXdl(text), g).ok);
  const vcc = routed.design.nets.filter(n => n.type === 'vcc' && n.inpins.some(x => x.inst === 'b' || x.inst === 'm'));
  assert.deepEqual(vcc.flatMap(n => n.inpins.map(x => `${x.inst}.${x.pin}`)).sort(), ['b.ENB', 'b.SSRA', 'b.WEA', 'm.CEA', 'm.CEP', 'm.RSTB']);
  for (const n of vcc) assert.match(n.outpins[0].inst, /^XDL_DUMMY_BRAM[0-3]_SMALL(_BRK)?_X\d+Y\d+_VCC_X\d+Y\d+$/, n.name);
  assert.deepEqual(bitgen(text, db).unknown, []);
  const feats = designFeatures(parseXdl(text), db).feats.map(x => x.feature);
  assert.deepEqual(feats.filter(f => /^(RAMB16|MULT18X18SIO):\w+INV:/.test(f)).filter(f => /_B$/.test(f)), []);
  assert.ok(['RAMB16:ENAINV:ENA', 'RAMB16:ENBINV:ENB', 'MULT18X18SIO:CEAINV:CEA', 'MULT18X18SIO:RSTBINV:RSTB'].every(f => feats.includes(f)), feats.filter(f => /INV/.test(f)).join(' '));
  // a DCM: RST and PSINCDEC tied to 1 (VCC), PSCLK / PSEN tied to 0 (GND), DSSEN tied to 1 left open
  const dn = yjson({ clk: ['input', 1], o: ['output', 1] }, [{ name: 'ib', type: 'IBUFG', conns: { I: 'clk', O: 'clk_i' }, outs: ['O'] },
    { name: 'u', type: 'DCM_SP', params: { CLK_FEEDBACK: 'NONE' }, conns: { CLKIN: 'clk_i', RST: '1', DSSEN: '1', PSCLK: '0', PSEN: '0', PSINCDEC: '1', LOCKED: 'lk' }, outs: ['LOCKED'] }, obuf('o', 'lk')]);
  const pd = pack(dn);
  const u = pd.insts.find(i => i.name === 'u'), ku = pd.insts.indexOf(u);
  const upins = new Map(pd.nets.flatMap(n => n.inpins.filter(x => x.inst === ku).map(x => [x.pin, n.type])));
  const dc = ['RST', 'PSCLK', 'PSEN', 'PSINCDEC', 'DSSEN'];
  assert.deepEqual(dc.map(x => [val(u, `${x}INV`), upins.get(x)]), [['RST', 'vcc'], ['PSCLK', 'gnd'], ['PSEN', 'gnd'], ['PSINCDEC', 'vcc'], [undefined, undefined]]);
  // placed, routed: RST and PSINCDEC from the VCC site of the DCM's tile, through its switches (no
  // bits), as ISE routes them; every switch in the bit database (the DCM's CLK_FEEDBACK NONE is not)
  const rd = place(pd, sites, { seed: 1, effort: 0.1, ...opts });
  const routedD = routeDesign(parseXdl(writeXdl(placedXdl(pd, rd))), g, knownRouting(db));
  assert.deepEqual([routedD.failed, routedD.unreached, routedD.errors], [[], [], []]);
  const dtext = writeXdl(routedD.design);
  assert.ok(checkRouting(parseXdl(dtext), g).ok);
  const dvcc = routedD.design.nets.filter(n => n.type === 'vcc' && n.inpins.some(x => x.inst === 'u'));
  assert.deepEqual(dvcc.map(n => [n.outpins[0].inst, n.inpins.map(x => x.pin).sort(), n.pips.map(q => `${q.from} -> ${q.to}`).sort()]),
    [['XDL_DUMMY_DCM_TL_CENTER_X13Y34_VCC_X14Y36', ['PSINCDEC', 'RST'], ['DCM_G1_B2 -> DCM_PSINCDEC_PINWIRE', 'DCM_G1_B3 -> DCM_RST_PINWIRE', 'DCM_VCC_WIRE -> DCM_G1_B2', 'DCM_VCC_WIRE -> DCM_G1_B3']]]);
  assert.deepEqual(bitgen(dtext, db).unknown, [{ tile: 'DCM_TL_CENTER_X13Y34', feature: 'DCM:CLK_FEEDBACK:NONE' }]);
});

// Clocks on the four devices that ship (their own graphs and bit databases), placed as the open
// flow places them: the switches of known bits (clockReach, bufgReach), the global buffers whose
// settings are known (knownRouting allowBufg). #56, #57, #58.
const SHIPPED = [['xc3s100ecp132-4', 'M4', 'G3'], ['xc3s250ecp132-4', 'M4', 'G3'], ['xc3s500efg320-4', 'N9', 'K3'], ['xc3s1200efg320-4', 'N9', 'K3']];
const flows = new Map();
async function flowOf(part) {
  if (flows.has(part)) return flows.get(part);
  const { clockReach, bufgReach } = await import('../core/fpga/route.js');
  const { knownRouting } = await import('../core/fpga/bitgen.js');
  const { loadDb } = await import('../core/fpga/bitdb-node.js');
  const g = loadDeviceCache(part);
  const known = knownRouting(loadDb(part, { graph: g }));
  const reach = new Map();
  const clockSites = site => (reach.has(site) || reach.set(site, clockReach(g, site, known.allowPip)), reach.get(site));
  const f = { sites: deviceSites(g, known), clockSites, opts: { clockSites, bufgSites: (site, pin, to) => bufgReach(g, site, pin, known.allowPip, to) } };
  flows.set(part, f);
  return f;
}
// a block RAM (both ports) and a registered multiplier on one clock, and a flip-flop
function clockedHard() {
  return yjson({ clk: ['input', 1], a: ['input', 10], we: ['input', 1], q: ['output', 3] }, [
    ...clock, ...ibuf('a', 10), ...ibuf('we', 1),
    { name: 'm', type: 'RAMB16_S18_S18', conns: { ADDRA: bus('a_i', 10), DIA: [...bus('a_i', 10), ...Array(6).fill('0')], DIPA: ['0', '0'], DOA: bus('qa', 16), DOPA: bus('qap', 2), CLKA: 'clk_g', ENA: '1', SSRA: '0', WEA: 'we_i',
      ADDRB: bus('a_i', 10).reverse(), DIB: Array(16).fill('0'), DIPB: ['0', '0'], DOB: bus('qb', 16), DOPB: bus('qbp', 2), CLKB: 'clk_g', ENB: '1', SSRB: '0', WEB: '0' }, outs: ['DOA', 'DOPA', 'DOB', 'DOPB'] },
    { name: 'x', type: 'MULT18X18S', conns: { A: [...bus('a_i', 10), ...Array(8).fill('0')], B: [...bus('a_i', 10).reverse(), ...Array(8).fill('0')], C: 'clk_g', CE: '1', R: '0', P: bus('p', 36) }, outs: ['P'] },
    { name: 'ff', type: 'FDRE', params: { INIT: '0' }, conns: { C: 'clk_g', CE: '1', R: '0', D: 'we_i', Q: 'f' }, outs: ['Q'] },
    obuf('q[0]', 'qb[0]'), obuf('q[1]', 'p[3]'), obuf('q[2]', 'f'),
  ]);
}
// flip-flops only
const clockedFf = () => yjson({ clk: ['input', 1], d: ['input', 1], q: ['output', 1] }, [
  ...clock, ...ibuf('d', 1), { name: 'ff', type: 'FDRE', params: { INIT: '0' }, conns: { C: 'clk_g', CE: '1', R: '0', D: 'd_i', Q: 'f' }, outs: ['Q'] }, obuf('q', 'f')]);
// the warning of a DCM whose CLKIN comes from a pad through general routing (#47)
const generalClkin = (u, pad, dcm) => `${u}: its CLKIN comes from the pad ${pad} through general routing: no pad reaches the CLKIN of ${dcm} on a dedicated path of known bits`;
const siteOf = (p, r, name) => r.sites[p.insts.findIndex(i => i.name === name)].site;

test('clockReach: the clock pins of the block RAMs and multipliers a global buffer reaches on switches of known bits (#56)', { timeout: 300000 }, async () => {
  for (const [part] of SHIPPED) {
    const { sites, clockSites } = await flowOf(part);
    const hard = [...sites.brams.flatMap(s => [`${s.name}.CLKA`, `${s.name}.CLKB`]), ...sites.mults.map(s => `${s.name}.CLK`)];
    // the buffer of B8 reaches every one; the bottom buffer of N9 / M4 none (yet), but every slice
    assert.deepEqual(hard.filter(h => !clockSites('BUFGMUX_X2Y11').has(h)), [], part);
    assert.deepEqual(hard.filter(h => clockSites('BUFGMUX_X2Y1').has(h)), [], part);
    // (and DCM clock inputs, #47)
    assert.equal([...clockSites('BUFGMUX_X2Y1')].filter(s => !s.startsWith('DCM_')).length, sites.slices.size, part);
  }
});

test('a clock LOC\'d on the bottom GCLK pin (N9 / M4): its dedicated buffer when it reaches the loads, else a buffer that reaches the block RAM / multiplier clocks, with a warning (#56)', { timeout: 300000 }, async () => {
  for (const [part, bottom] of SHIPPED) {
    const { opts, sites, clockSites } = await flowOf(part);
    const ucf = `NET "clk" LOC = "${bottom}";`;
    // flip-flops only: BUFGMUX_X2Y1, on its dedicated path, no warning
    const f = pack(clockedFf(), { ucf, part });
    const rf = place(f, sites, { seed: 1, effort: 0.1, ...opts });
    assert.deepEqual([siteOf(f, rf, 'bufg'), rf.warnings], ['BUFGMUX_X2Y1', []], part);
    // a block RAM and a multiplier: BUFGMUX_X2Y11 (general routing from the pad), each on a site whose clock pins it reaches
    const p = pack(clockedHard(), { ucf, part });
    for (const seed of [1, 2]) {
      const r = place(p, sites, { seed, effort: 0.1, ...opts });
      assert.equal(siteOf(p, r, 'clk'), bottom);
      assert.equal(siteOf(p, r, 'bufg'), 'BUFGMUX_X2Y11', part);
      assert.deepEqual(r.warnings, [`clk: the global buffer BUFGMUX_X2Y1 that its pad ${bottom} reaches on a dedicated path does not reach every clock pin of its loads on switches of known bits: BUFGMUX_X2Y11 instead, through general routing`], part);
      const reach = clockSites('BUFGMUX_X2Y11');
      assert.ok(reach.has(`${siteOf(p, r, 'm')}.CLKA`) && reach.has(`${siteOf(p, r, 'm')}.CLKB`) && reach.has(`${siteOf(p, r, 'x')}.CLK`), part);
    }
  }
});

test('block RAMs and multipliers only on the sites whose clock pins their clock\'s lines reach (clockSites); none: said clearly (#56)', () => {
  const p = pack(clockedHard(), { ucf: 'NET "clk" LOC = "P11";' });
  const d = device();
  const slices = [...d.slices.values()].map(s => s.name);
  const allowed = new Set([...slices, 'RAMB16_X1Y3.CLKA', 'RAMB16_X1Y3.CLKB', 'RAMB16_X0Y2.CLKA', 'MULT18X18_X0Y4.CLK']);
  for (const seed of [1, 2, 3]) {
    const r = place(p, d, { seed, effort: 0.2, clockSites: () => allowed });
    assert.deepEqual([siteOf(p, r, 'm'), siteOf(p, r, 'x'), r.warnings], ['RAMB16_X1Y3', 'MULT18X18_X0Y4', []], `seed ${seed}`);
  }
  assert.throws(() => place(p, d, { seed: 1, effort: 0.1, clockSites: () => new Set(slices) }),
    err => err instanceof PlaceError && /^place: m: no block RAM site whose clock pins the lines of BUFGMUX_X\dY\d+ reach through switches of known bits$/.test(err.message));
});

test('a clock with no LOC that drives a DCM\'s CLKIN goes on a pad whose dedicated path of known bits reaches it (B8 -> DCM_X0Y1), kept there (#57)', { timeout: 300000 }, async () => {
  const nl = () => yjson({ clk: ['input', 1], o: ['output', 1] }, [
    { name: 'ib', type: 'IBUFG', conns: { I: 'clk', O: 'clk_i' }, outs: ['O'] },
    { name: 'u', type: 'DCM_SP', params: { CLKIN_PERIOD: '20.000000', CLK_FEEDBACK: '1X', DFS_FREQUENCY_MODE: 'LOW', DLL_FREQUENCY_MODE: 'LOW', STARTUP_WAIT: 'FALSE' },
      conns: { CLKIN: 'clk_i', CLKFB: 'c0b', RST: '0', DSSEN: '0', PSCLK: '0', PSEN: '0', PSINCDEC: '0', CLK0: 'c0' }, outs: ['CLK0'] },
    { name: 'b0', type: 'BUFG', conns: { I: 'c0', O: 'c0b' }, outs: ['O'] },
    { name: 'ff', type: 'FDRE', params: { INIT: '0' }, conns: { C: 'c0b', CE: '1', R: '0', D: 'q', Q: 'qn' }, outs: ['Q'] },
    { name: 'inv', type: 'LUT1', params: { INIT: '01' }, conns: { I0: 'qn', O: 'q' }, outs: ['O'] },
    obuf('o', 'qn'),
  ]);
  // B8 and the top-left DCM: DCM_X0Y1 on the XC3S250E and XC3S500E, DCM_X1Y3 on the XC3S1200E (#47:
  // its DCM_X0Y1 is a side DCM, whose outputs reach only side buffers); on the XC3S100E no pad reaches
  // a DCM's CLKIN on switches of known bits: any pad, through general routing, said
  for (const [part, dcm] of [['xc3s250ecp132-4', 'DCM_X0Y1'], ['xc3s500efg320-4', 'DCM_X0Y1'], ['xc3s1200efg320-4', 'DCM_X1Y3'], ['xc3s100ecp132-4', 'DCM_X0Y1']]) {
    const { opts, sites } = await flowOf(part);
    const p = pack(nl(), { part });
    for (const seed of [1, 2, 3]) {
      const r = place(p, sites, { seed, effort: 0.1, ...opts });
      const clk = part === 'xc3s100ecp132-4' ? siteOf(p, r, 'clk') : 'B8';
      assert.deepEqual([siteOf(p, r, 'clk'), siteOf(p, r, 'u'), r.warnings], [clk, dcm, part === 'xc3s100ecp132-4' ? [generalClkin('u', clk, 'DCM_X0Y1')] : []], `${part} seed ${seed}`);
    }
  }
  // only a pad whose path reaches that DCM's CLKIN (asked as bufgSites(pad, 'I', ['DCM', 'CLKIN']))
  const asked = new Set();
  const p = pack(nl());
  const buf = (site, pin) => (pin === 'CLK0' ? ['BUFGMUX_X2Y10'] : []);
  const r = place(p, device(), { seed: 1, effort: 0.1, bufgSites: (site, pin, to) => { if (to) asked.add(`${pin}>${to.join('.')}`); return to ? (site === 'L3' ? ['DCM_X0Y1'] : site === 'P11' ? ['DCM_X1Y1'] : []) : buf(site, pin); } });
  assert.deepEqual([siteOf(p, r, 'clk'), [...asked]], ['L3', ['I>DCM.CLKIN']]);
  // none: any pad, its CLKIN through general routing, said (#47)
  const none = place(p, device(), { seed: 1, effort: 0.1, bufgSites: (site, pin, to) => (to ? [] : buf(site, pin)) });
  assert.equal(siteOf(p, none, 'u'), 'DCM_X0Y1');
  assert.deepEqual(none.warnings, [`u: its CLKIN comes from the pad ${siteOf(p, none, 'clk')} through general routing: no pad reaches the CLKIN of DCM_X0Y1 on a dedicated path of known bits`]);
  // a pad that reaches another DCM's CLKIN: the DCM goes there (#47), not on the top-left site
  const other = place(p, device(), { seed: 1, effort: 0.1, bufgSites: (site, pin, to) => (to ? (site === 'P11' ? ['DCM_X1Y1'] : []) : buf(site, pin)) });
  assert.deepEqual([siteOf(p, other, 'clk'), siteOf(p, other, 'u'), other.warnings], ['P11', 'DCM_X1Y1', []]);
});

test('a clock LOC\'d on a side GCLK pin (K3 / G3): the placer does not use side buffers yet (#95), so a top / bottom buffer through general routing, with a warning (#58)', { timeout: 300000 }, async () => {
  for (const [part, , side] of SHIPPED) {
    const { opts, sites } = await flowOf(part);
    assert.deepEqual(sites.bufgmux.map(b => b.name).sort(), ['BUFGMUX_X1Y0', 'BUFGMUX_X1Y1', 'BUFGMUX_X1Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X2Y0', 'BUFGMUX_X2Y1', 'BUFGMUX_X2Y10', 'BUFGMUX_X2Y11'], part);
    const ucf = `NET "clk" LOC = "${side}";`;
    const warn = b => [`clk: its pad ${side} reaches on a dedicated path only side global buffers, which the placer does not use yet (#95) (BUFGMUX_X0Y6, BUFGMUX_X0Y8, BUFGMUX_X0Y7): ${b} instead, through general routing`];
    const p = pack(clockedHard(), { ucf, part });
    const r = place(p, sites, { seed: 1, effort: 0.1, ...opts });
    assert.deepEqual([siteOf(p, r, 'clk'), siteOf(p, r, 'bufg'), r.warnings], [side, 'BUFGMUX_X2Y11', warn('BUFGMUX_X2Y11')], part);
    const f = pack(clockedFf(), { ucf, part });
    const rf = place(f, sites, { seed: 1, effort: 0.1, ...opts });
    const b = siteOf(f, rf, 'bufg');
    assert.match(b, /^BUFGMUX_X2Y(1|11)$/, part);
    assert.deepEqual(rf.warnings, warn(b), part);
  }
});

// Two DCMs (#47): clk1 -> u1 (CLK0 the feedback, and `u1`'s outputs), clk2 -> u2 (CLK0 the feedback,
// and `u2`'s), each output on a global buffer clocking a flip-flop
function twoDcms({ u1 = ['CLKFX'], u2 = ['CLKDV'] } = {}) {
  const dcm = (u, k, extra) => [
    { name: `ib${k}`, type: 'IBUFG', conns: { I: `clk${k}`, O: `ci${k}` }, outs: ['O'] },
    { name: u, type: 'DCM_SP', params: { CLKIN_PERIOD: '20.000000', CLK_FEEDBACK: '1X', DFS_FREQUENCY_MODE: 'LOW', DLL_FREQUENCY_MODE: 'LOW', STARTUP_WAIT: 'FALSE' },
      conns: { CLKIN: `ci${k}`, CLKFB: `${u}_0b`, RST: '0', DSSEN: '0', PSCLK: '0', PSEN: '0', PSINCDEC: '0', CLK0: `${u}_0`, ...Object.fromEntries(extra.map(p => [p, `${u}_${p}`])), LOCKED: `${u}_lk` }, outs: ['CLK0', ...extra, 'LOCKED'] },
    { name: `${u}_b0`, type: 'BUFG', conns: { I: `${u}_0`, O: `${u}_0b` }, outs: ['O'] },
    ...extra.map(p => ({ name: `${u}_b${p}`, type: 'BUFG', conns: { I: `${u}_${p}`, O: `${u}_${p}b` }, outs: ['O'] })),
    ...['0', ...extra].map(p => ({ name: `${u}_ff${p}`, type: 'FDRE', params: { INIT: '0' }, conns: { C: p === '0' ? `${u}_0b` : `${u}_${p}b`, CE: '1', R: '0', D: `${u}_lk`, Q: `${u}_q${p}` }, outs: ['Q'] })),
  ];
  const all = [...dcm('u1', 1, u1), ...dcm('u2', 2, u2)];
  const qs = all.filter(c => c.type === 'FDRE').map(c => c.conns.Q);
  return yjson({ clk1: ['input', 1], clk2: ['input', 1], o: ['output', qs.length] }, [...all, ...qs.map((q, i) => obuf(`o[${i}]`, q))]);
}
const clockSitesOf = (p, r) => Object.fromEntries(p.insts.flatMap((i, k) => (i.kind === 'dcm' || i.kind === 'bufg' || /^clk\d$/.test(i.name) ? [[i.name, r.sites[k].site]] : [])));

test('two DCMs on each device: each on a site whose outputs reach global buffers of their own on switches of known bits, the clock pad on the dedicated path to a CLKIN where there is one (#47)', { timeout: 300000 }, async () => {
  // u2's CLKDV reaches a buffer only from the top-left DCM (the XC3S100E: from its bottom one, CLKDV
  // of its top one, DCM_X0Y1 in a DCM_TR_CENTER tile, reaching none)
  const want = {
    'xc3s100ecp132-4': { u1: 'DCM_X0Y1', u1_b0: 'BUFGMUX_X2Y11', u1_bCLKFX: 'BUFGMUX_X2Y10', u2: 'DCM_X0Y0', u2_b0: 'BUFGMUX_X2Y1', u2_bCLKDV: 'BUFGMUX_X2Y0' },
    'xc3s250ecp132-4': { u1: 'DCM_X1Y1', u1_b0: 'BUFGMUX_X2Y10', u1_bCLKFX: 'BUFGMUX_X1Y11', clk2: 'B8', u2: 'DCM_X0Y1', u2_b0: 'BUFGMUX_X1Y10', u2_bCLKDV: 'BUFGMUX_X2Y11' },
    'xc3s500efg320-4': { u1: 'DCM_X1Y1', u1_b0: 'BUFGMUX_X2Y10', u1_bCLKFX: 'BUFGMUX_X1Y11', clk2: 'B8', u2: 'DCM_X0Y1', u2_b0: 'BUFGMUX_X1Y10', u2_bCLKDV: 'BUFGMUX_X2Y11' },
    'xc3s1200efg320-4': { u1: 'DCM_X2Y3', u1_b0: 'BUFGMUX_X2Y10', u1_bCLKFX: 'BUFGMUX_X1Y11', clk2: 'B8', u2: 'DCM_X1Y3', u2_b0: 'BUFGMUX_X1Y10', u2_bCLKDV: 'BUFGMUX_X2Y11' },
  };
  for (const [part] of SHIPPED) {
    const { opts, sites } = await flowOf(part);
    const p = pack(twoDcms(), { part });
    for (const seed of [1, 2]) {
      const r = place(p, sites, { seed, effort: 0.1, ...opts });
      const got = clockSitesOf(p, r);
      assert.deepEqual(got, { ...want[part], clk1: got.clk1, clk2: want[part].clk2 || got.clk2 }, `${part} seed ${seed}`);
      // the CLKIN of the other DCM (no pad reaches it on a dedicated path of known bits): said
      assert.deepEqual(r.warnings, [generalClkin('u1', got.clk1, want[part].u1), ...(want[part].clk2 ? [] : [generalClkin('u2', got.clk2, want[part].u2)])], `${part} seed ${seed}`);
    }
  }
});

test('DCM outputs CLK2X180 and CLKFX180: on a DCM that reaches a global buffer from them on switches of known bits; none on the device: said clearly (#47)', { timeout: 300000 }, async () => {
  // CLK2X180: only the bottom-left DCM of the XC3S250E, XC3S500E and XC3S1200E, no DCM of the XC3S100E
  const bl = { 'xc3s250ecp132-4': 'DCM_X0Y0', 'xc3s500efg320-4': 'DCM_X0Y0', 'xc3s1200efg320-4': 'DCM_X1Y0' };
  for (const [part] of SHIPPED) {
    const { opts, sites } = await flowOf(part);
    const p = pack(twoDcms({ u1: ['CLK2X180'] }), { part });
    if (!bl[part]) {
      assert.throws(() => place(p, sites, { seed: 1, effort: 0.1, ...opts }), err => err instanceof PlaceError && err.message === 'place: u1_bCLK2X180: no free global clock buffer reachable from u1.CLK2X180 through switches of known bits', part);
      continue;
    }
    const r = place(p, sites, { seed: 1, effort: 0.1, ...opts });
    const got = clockSitesOf(p, r);
    assert.deepEqual([got.u1, got.u1_b0, got.u1_bCLK2X180, got.u2], [bl[part], 'BUFGMUX_X2Y1', 'BUFGMUX_X1Y1', part === 'xc3s1200efg320-4' ? 'DCM_X1Y3' : 'DCM_X0Y1'], part);
    assert.deepEqual(r.warnings, [generalClkin('u1', got.clk1, bl[part])], part);
  }
  // CLKFX180 and CLK90: on every device (CLKFX180 from the top-right and bottom DCMs, from both of the XC3S100E)
  for (const [part] of SHIPPED) {
    const { opts, sites } = await flowOf(part);
    const p = pack(twoDcms({ u1: ['CLKFX180'], u2: ['CLK90'] }), { part });
    const got = clockSitesOf(p, place(p, sites, { seed: 1, effort: 0.1, ...opts }));
    assert.deepEqual([got.u1, got.u1_bCLKFX180, got.u2, got.u2_bCLK90], {
      'xc3s100ecp132-4': ['DCM_X0Y1', 'BUFGMUX_X2Y11', 'DCM_X0Y0', 'BUFGMUX_X2Y0'],
      'xc3s250ecp132-4': ['DCM_X1Y1', 'BUFGMUX_X2Y11', 'DCM_X0Y1', 'BUFGMUX_X1Y11'],
      'xc3s500efg320-4': ['DCM_X1Y1', 'BUFGMUX_X2Y11', 'DCM_X0Y1', 'BUFGMUX_X1Y11'],
      'xc3s1200efg320-4': ['DCM_X2Y3', 'BUFGMUX_X2Y11', 'DCM_X1Y3', 'BUFGMUX_X1Y11'],
    }[part], part);
  }
});

test('a DCM\'s INST LOC: the packer keeps it, the placer puts the DCM there; a LOC that is no DCM site, two DCMs on one site, more DCMs than sites: said clearly (#47)', { timeout: 300000 }, async () => {
  const { opts, sites } = await flowOf('xc3s250ecp132-4');
  const p = pack(twoDcms(), { part: 'xc3s250ecp132-4', ucf: 'INST "u1" LOC = "DCM_X1Y0";\nINST u2 LOC=dcm_x0y1 ;' });
  assert.deepEqual(p.insts.filter(i => i.kind === 'dcm').map(i => [i.name, i.loc]), [['u1', 'DCM_X1Y0'], ['u2', 'DCM_X0Y1']]);
  const r = place(p, sites, { seed: 1, effort: 0.1, ...opts });
  const got = clockSitesOf(p, r);
  assert.deepEqual([got.u1, got.u2, got.clk2], ['DCM_X1Y0', 'DCM_X0Y1', 'B8']);
  assert.deepEqual(r.warnings, [generalClkin('u1', got.clk1, 'DCM_X1Y0')]);
  const bad = ucf => () => place(pack(twoDcms(), { part: 'xc3s250ecp132-4', ucf }), sites, { seed: 1, effort: 0.1, ...opts });
  assert.throws(bad('INST "u1" LOC = "DCM_X3Y1";'), err => err instanceof PlaceError && err.message === 'place: u1: no DCM site DCM_X3Y1 on xc3s250ecp132-4');
  assert.throws(bad('INST "u1" LOC = "DCM_X0Y0";\nINST "u2" LOC = "DCM_X0Y0";'), err => err instanceof PlaceError && err.message === 'place: u1: DCM site DCM_X0Y0 used twice');
  // the XC3S100E has two DCMs
  const three = yjson({ clk: ['input', 1], o: ['output', 3] }, [{ name: 'ib', type: 'IBUFG', conns: { I: 'clk', O: 'ci' }, outs: ['O'] }, ...['a', 'b', 'c'].flatMap((u, k) => [
    { name: u, type: 'DCM_SP', params: { CLK_FEEDBACK: 'NONE' }, conns: { CLKIN: 'ci', RST: '0', DSSEN: '0', PSCLK: '0', PSEN: '0', PSINCDEC: '0', LOCKED: `lk${k}` }, outs: ['LOCKED'] },
    obuf(`o[${k}]`, `lk${k}`),
  ])]);
  const s100 = (await flowOf('xc3s100ecp132-4')).sites;
  assert.throws(() => place(pack(three, { part: 'xc3s100ecp132-4' }), s100, { seed: 1, effort: 0.1 }), err => err instanceof PlaceError && err.message === 'place: 3 DCMs needed, the device has 2');
});

test('clockReach: the DCM clock inputs (CLKIN, CLKFB) a global buffer reaches on switches of known bits; a cascade of two DCMs (#47)', { timeout: 300000 }, async () => {
  const { opts, sites, clockSites } = await flowOf('xc3s250ecp132-4');
  const dcmPins = b => [...clockSites(b)].filter(s => s.startsWith('DCM_')).sort();
  // (with the DCM pins' switches of the designs of #46 / #47 with CLKIN from a global buffer: X1Y0's and X1Y1's CLKIN too)
  assert.deepEqual(dcmPins('BUFGMUX_X2Y11'), ['DCM_X0Y0.CLKFB', 'DCM_X0Y0.CLKIN', 'DCM_X0Y1.CLKFB', 'DCM_X0Y1.CLKIN', 'DCM_X1Y0.CLKIN', 'DCM_X1Y1.CLKFB', 'DCM_X1Y1.CLKIN']);
  assert.deepEqual(dcmPins('BUFGMUX_X2Y10'), ['DCM_X0Y1.CLKFB', 'DCM_X1Y0.CLKFB', 'DCM_X1Y1.CLKFB', 'DCM_X1Y1.CLKIN']);
  // u2's CLKIN from u1's CLK0 buffer: u2 on the bottom-left DCM (its CLK2X180), u1's CLK0 on the
  // buffer that reaches both u1's CLKFB and u2's CLKIN
  const nl = yjson({ clk: ['input', 1], o: ['output', 2] }, [
    { name: 'ib', type: 'IBUFG', conns: { I: 'clk', O: 'ci' }, outs: ['O'] },
    { name: 'u1', type: 'DCM_SP', params: { CLK_FEEDBACK: '1X' }, conns: { CLKIN: 'ci', CLKFB: 'a0b', RST: '0', DSSEN: '0', PSCLK: '0', PSEN: '0', PSINCDEC: '0', CLK0: 'a0', CLKFX: 'afx' }, outs: ['CLK0', 'CLKFX'] },
    { name: 'ba0', type: 'BUFG', conns: { I: 'a0', O: 'a0b' }, outs: ['O'] },
    { name: 'bafx', type: 'BUFG', conns: { I: 'afx', O: 'afxb' }, outs: ['O'] },
    { name: 'u2', type: 'DCM_SP', params: { CLK_FEEDBACK: '1X' }, conns: { CLKIN: 'a0b', CLKFB: 'b0b', RST: '0', DSSEN: '0', PSCLK: '0', PSEN: '0', PSINCDEC: '0', CLK0: 'b0', CLK2X180: 'b2' }, outs: ['CLK0', 'CLK2X180'] },
    { name: 'bb0', type: 'BUFG', conns: { I: 'b0', O: 'b0b' }, outs: ['O'] },
    { name: 'bb2', type: 'BUFG', conns: { I: 'b2', O: 'b2b' }, outs: ['O'] },
    { name: 'f1', type: 'FDRE', params: { INIT: '0' }, conns: { C: 'afxb', CE: '1', R: '0', D: 'ci', Q: 'q1' }, outs: ['Q'] },
    { name: 'f2', type: 'FDRE', params: { INIT: '0' }, conns: { C: 'b2b', CE: '1', R: '0', D: 'ci', Q: 'q2' }, outs: ['Q'] },
    obuf('o[0]', 'q1'), obuf('o[1]', 'q2'),
  ]);
  const p = pack(nl, { part: 'xc3s250ecp132-4' });
  const r = place(p, sites, { seed: 1, effort: 0.1, ...opts });
  assert.deepEqual(['clk', 'u1', 'ba0', 'u2', 'bb0', 'bb2'].map(n => siteOf(p, r, n)), ['B8', 'DCM_X0Y1', 'BUFGMUX_X2Y11', 'DCM_X0Y0', 'BUFGMUX_X2Y1', 'BUFGMUX_X1Y1']);
  assert.deepEqual(r.warnings, []);
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
