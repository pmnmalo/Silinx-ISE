// The device primitives of the schematic library (#791, core/primitives.js, core/schdoc.js): each family's list (the
// issue's), their pins and attributes against the UNISIM models' entities, each symbol's HDL generated in VHDL and in
// Verilog, compiled, elaborated and simulated, its behaviour checked against values computed here (the words of a
// block RAM, a product, the clocks' edges counted over a time); the warnings and errors of a schematic using them;
// their resource and its count on a part in Symbol Info.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { UNISIM_SOURCE, primitiveSources } from '../core/unisim.js';
import { SYMBOLS, SYMBOL_CATEGORIES, defaultParams, symbolDef, newDoc, netlist, generateHdl, modulesFromLibrary } from '../core/schdoc.js';
import { DEVICE_PRIMITIVES, PRIMITIVE_FAMILIES, devicePrimitives, primitiveOf, primitiveResource, genericValue, initWords, RAMB16_PORTS } from '../core/primitives.js';
import { oneSymbolDoc, symbolDoc, primitiveUse } from '../core/symdocs.js';
import { findPart } from '../server/devices.js';

const PRIMS = Object.keys(SYMBOLS).filter(t => SYMBOLS[t].prim);

// ------------------------------------------------------------------ the lists
test('the Device Primitives of each family: the issue\'s list, in the palette\'s category, of their family only', () => {
  assert.deepEqual(PRIMITIVE_FAMILIES, ['spartan3e', 'spartan6']);
  assert.deepEqual(devicePrimitives('spartan3e').map(p => p.title), ['RAMB16_S', 'RAMB16_S_S', 'MULT18X18SIO', 'DCM_SP', 'BUFG', 'BUFGMUX', 'IBUFG']);
  assert.deepEqual(devicePrimitives('spartan6').map(p => p.title), ['RAMB8BWER', 'RAMB16BWER', 'DSP48A1', 'PLL_BASE', 'DCM_SP', 'BUFG', 'BUFIO2']);
  for (const f of ['spartan3', 'spartan3a', 'virtex5', null]) assert.deepEqual(devicePrimitives(f), [], String(f));
  assert.deepEqual(PRIMS.sort(), Object.keys(DEVICE_PRIMITIVES).sort());
  assert.ok(SYMBOL_CATEGORIES.indexOf('Device Primitives') === SYMBOL_CATEGORIES.indexOf('Project modules') - 1);
  // the palette's symbols of a family: the category's (sch-editor.js paletteItems' filter)
  const offered = f => PRIMS.filter(t => SYMBOLS[t].families.includes(f));
  assert.deepEqual(offered('spartan3e').sort(), devicePrimitives('spartan3e').map(p => p.type).sort());
  assert.deepEqual(offered('spartan6').sort(), devicePrimitives('spartan6').map(p => p.type).sort());
  assert.deepEqual(offered('spartan3a'), []);
  for (const t of PRIMS) {
    assert.equal(SYMBOLS[t].category, 'Device Primitives', t);
    assert.ok(SYMBOLS[t].description.length > 20, t);
    // the attributes' parameters: their UNISIM names
    for (const p of SYMBOLS[t].params) if (p.attr) assert.equal(p.label, p.name, `${t} ${p.name}`);
  }
});

// every UNISIM name a symbol makes: the block RAMs' widths, the others'
const variants = t => (t === 'ramb16_s' ? Object.keys(RAMB16_PORTS).map(w => ({ portWidth: w }))
  : t === 'ramb16_s_s' ? Object.keys(RAMB16_PORTS).flatMap((a, i) => Object.keys(RAMB16_PORTS).slice(i).map(b => ({ widthA: a, widthB: b }))) : [{}]);

test('each primitive: its resource on its families (core/resources.js), the count of a part', () => {
  const want = { ramb16_s: 'ramb16', ramb16_s_s: 'ramb16', mult18x18sio: 'mult18x18', dcm_sp: 'dcm', bufg: 'bufgmux', bufgmux: 'bufgmux', ibufg: 'iob',
    ramb8bwer: 'ramb8bwer', ramb16bwer: 'ramb16bwer', dsp48a1: 'dsp48a1', pll_base: 'pll', bufio2: 'bufio2' };
  for (const t of PRIMS) for (const f of SYMBOLS[t].families) for (const v of variants(t)) assert.equal(primitiveResource(t, f, v), want[t], `${t} ${f} ${JSON.stringify(v)}`);
  assert.equal(primitiveResource('dsp48a1', 'spartan3e'), null);
  assert.equal(primitiveResource('ramb16_s', 'spartan6'), null);
  assert.equal(variants('ramb16_s').length + variants('ramb16_s_s').length, 27, 'every RAMB16_S* of resources.js');
  // (DS312: the XC3S250E's 12 block RAMs, 4 DCMs; DS160: the XC6SLX16's 32 DSP48A1, 2 PLLs)
  assert.deepEqual(primitiveUse('ramb16_s', {}, findPart('xc3s250e'), 3), { id: 'ramb16', label: { en: 'Block RAM (18 Kb)', pt: 'RAM de bloco (18 Kb)' }, count: 12, used: 3 });
  assert.equal(primitiveUse('dcm_sp', {}, findPart('xc3s100e')).count, 2);
  assert.equal(primitiveUse('dsp48a1', {}, findPart('xc6slx16')).count, 32);
  assert.equal(primitiveUse('pll_base', {}, findPart('xc6slx16')).count, 2);
  assert.equal(primitiveUse('ramb8bwer', {}, findPart('xc6slx45')).count, 232);
  assert.equal(primitiveUse('and2', {}, findPart('xc3s250e')), null);
  assert.equal(primitiveUse('ramb16_s', {}, findPart('xc6slx16')), null, 'not of its family');
});

test('pins and attributes as UNISIM\'s: each primitive\'s against the entity of its model (core/unisim.js, unisim-s6.js)', () => {
  const lib = modulesFromLibrary(compile([UNISIM_SOURCE]), { asWritten: true });
  const ent = n => Object.values(lib).find(m => m.name.toUpperCase() === n);
  for (const t of PRIMS) for (const v of variants(t)) {
    const r = primitiveOf(t, v), e = ent(r.name);
    assert.ok(e, `${r.name}: a model`);
    const name = `${t} ${r.name}`;
    assert.deepEqual(r.pins.map(q => [q.name, q.dir, q.width]).sort(), e.ports.map(q => [q.name.toUpperCase(), q.dir, q.width]).sort(), `${name}: pins`);
    const gens = new Set(e.generics.map(g => g.name.toUpperCase()));
    for (const g of r.generics) assert.ok(gens.has(g.name), `${name}: ${g.name} a generic of the model`);
    // the symbol's pins are the primitive's, inputs on the left, outputs on the right
    const def = symbolDef({ type: t, params: { ...defaultParams(t), ...v } });
    assert.equal(def.title, r.name);
    assert.deepEqual(def.pins.map(q => [q.name, q.dir, q.width, q.side]).sort(), r.pins.map(q => [q.name, q.dir, q.width, q.dir === 'out' ? 'E' : 'W']).sort(), `${name}: symbol`);
    for (const q of r.pins) assert.ok(q.func.en.length > 3 && q.func.pt.length > 3 && q.func.en !== q.func.pt, `${name} ${q.name}: its function`);
    for (const g of r.generics) assert.ok(g.meaning.en.length > 5 && g.meaning.en !== g.meaning.pt, `${name} ${g.name}: its meaning`);
  }
});

// ------------------------------------------------------------------ attributes, contents
test('genericValue: each kind in VHDL and in Verilog, a value out of its range null', () => {
  const g = n => primitiveOf('dcm_sp').generics.find(x => x.name === n);
  assert.equal(genericValue(g('CLKFX_MULTIPLY'), 7, 'vhdl'), '7');
  assert.equal(genericValue(g('CLKFX_MULTIPLY'), '33', 'vhdl'), null);
  assert.equal(genericValue(g('CLKFX_MULTIPLY'), '1', 'verilog'), null);
  assert.equal(genericValue(g('CLKFX_MULTIPLY'), '2.5', 'vhdl'), null);
  assert.equal(genericValue(g('CLKDV_DIVIDE'), '2', 'vhdl'), '2.0');
  assert.equal(genericValue(g('CLKDV_DIVIDE'), '2.5', 'verilog'), '2.5');
  assert.equal(genericValue(g('CLKDV_DIVIDE'), '8.5', 'vhdl'), null, 'not a CLKDV_DIVIDE');
  assert.equal(genericValue(g('CLKIN_PERIOD'), '20', 'vhdl'), '20.0');
  assert.equal(genericValue(g('CLKIN_PERIOD'), 'fast', 'vhdl'), null);
  assert.equal(genericValue(g('PHASE_SHIFT'), '-255', 'vhdl'), '-255');
  assert.equal(genericValue(g('CLK_FEEDBACK'), '2X', 'verilog'), '"2X"');
  assert.equal(genericValue(g('CLK_FEEDBACK'), '3X', 'verilog'), null);
  assert.equal(genericValue(g('STARTUP_WAIT'), true, 'vhdl'), 'TRUE');
  assert.equal(genericValue(g('STARTUP_WAIT'), false, 'verilog'), '"FALSE"');
  assert.equal(genericValue(g('STARTUP_WAIT'), 'maybe', 'verilog'), null);
  const init = primitiveOf('ramb16_s', { portWidth: '9' }).generics.find(x => x.name === 'INIT');
  assert.deepEqual([init.bits, init.default], [9, '000']);
  assert.equal(genericValue(init, '1ff', 'vhdl'), 'X"1FF"');
  assert.equal(genericValue(init, '1FF', 'verilog'), "9'h1FF");
  assert.equal(genericValue(init, '0x5', 'verilog'), "9'h005");
  assert.equal(genericValue(init, '200', 'vhdl'), null, 'wider than 9 bits');
  assert.equal(genericValue(init, 'xyz', 'vhdl'), null);
  assert.equal(genericValue(primitiveOf('ramb8bwer').generics.find(x => x.name === 'INIT_A'), '3FFFF', 'vhdl'), 'X"3FFFF"');
});

test('initWords: the words from address 0 in INIT_xx (the lowest bits first), against the bits laid out here', () => {
  assert.deepEqual(initWords('', 8), {});
  assert.deepEqual(initWords('12 34, AB', 8), { INIT_00: `${'0'.repeat(58)}AB3412` });
  // 32 words of 8 bits fill INIT_00; the 33rd starts INIT_01
  const words = Array.from({ length: 33 }, (_, k) => (k + 1).toString(16));
  const r = initWords(words.join(' '), 8);
  assert.deepEqual(Object.keys(r), ['INIT_00', 'INIT_01']);
  assert.equal(r.INIT_00, Array.from({ length: 32 }, (_, k) => (k + 1).toString(16).padStart(2, '0')).reverse().join('').toUpperCase());
  assert.equal(r.INIT_01, `${'0'.repeat(62)}21`);
  // a word of 1 bit: bit k of the memory
  assert.deepEqual(initWords('1 0 1 1', 1), { INIT_00: `${'0'.repeat(63)}D` });
  assert.throws(() => initWords('1FF', 8), /word 0 '1FF' is wider than 8 bits/);
  assert.throws(() => initWords('12 zz', 8), /word 1 'zz' is not hexadecimal/);
  assert.throws(() => initWords(Array(16385).fill('1').join(' '), 1), /16385 words: the memory has 16384 words of 1 bits/);
});

// ------------------------------------------------------------------ generated, compiled, simulated
// a symbol alone, its pins on ports (Symbol Info's one-symbol schematic), generated in `lang` and elaborated with the
// UNISIM models: { code, diags, set, get, run (ps), edges (rising edges of outputs while a clock runs) }
function harness(type, params, lang) {
  const { doc } = oneSymbolDoc(type, params, { lang });
  const g = generateHdl(doc, { lang });
  const srcs = [{ path: g.filename, lang, text: g.code }];
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const d = elaborate(lib, doc.name);
  assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.severity === 'error').map(x => x.message), [], `${type} ${lang}:\n${g.code}`);
  const s = new Simulator(d);
  const port = n => d.top.ports.find(p => p.name.toUpperCase() === n).sig;
  let t = 0;
  const run = dt => { t += dt; s.run(t); };
  const set = vals => { for (const [k, v] of Object.entries(vals)) s.force(port(k), V.mk(port(k).t.w, BigInt.asUintN(port(k).t.w, BigInt(v)))); run(100); };
  const get = n => { const v = port(n).val; return v.x ? null : v.v; };
  // a clock on `clk` (period in ps) for `time` ps: the rising edges of each of `outs`
  const edges = (clk, period, time, outs) => {
    const n = Object.fromEntries(outs.map(o => [o, 0])), last = Object.fromEntries(outs.map(o => [o, get(o)]));
    const step = period / 20;
    for (let k = 0; k * step < time; k++) {
      if (k % 10 === 0) s.force(port(clk), V.mk(1, (k / 10) % 2 === 0 ? 1n : 0n));
      run(step);
      for (const o of outs) { const v = get(o); if (v === 1n && last[o] === 0n) n[o]++; last[o] = v; }
    }
    return n;
  };
  // one rising edge of `clk`
  const clock = clk => { set({ [clk]: 1 }); set({ [clk]: 0 }); };
  run(100);
  return { code: g.code, diags: g.diagnostics, set, get, run, edges, clock };
}

for (const lang of ['vhdl', 'verilog']) {
  test(`${lang}: every primitive's symbol generated with no message, compiled and elaborated with the UNISIM models`, () => {
    for (const t of PRIMS) for (const v of variants(t)) {
      const h = harness(t, v, lang);
      assert.deepEqual(h.diags, [], `${t} ${JSON.stringify(v)}`);
      assert.match(h.code, lang === 'vhdl' ? new RegExp(`U1 : ${primitiveOf(t, v).name}\\n`) : new RegExp(`${primitiveOf(t, v).name}( #\\(\\n[\\s\\S]*\\n\\s*\\))? U1 \\(`));
      if (lang === 'vhdl') assert.match(h.code, /library UNISIM;\nuse UNISIM\.VCOMPONENTS\.ALL;/);
    }
  });

  test(`${lang}: RAMB16_S9, its contents read, a word written (WRITE_FIRST), INIT at start and SRVAL on SSR`, () => {
    const h = harness('ramb16_s', { portWidth: '9', contents: '12 34 AB', INIT: '1C3', SRVAL: '155' }, lang);
    assert.deepEqual([h.get('DO'), h.get('DOP')], [0xC3n, 1n], 'INIT');
    h.set({ EN: 1, WE: 0, SSR: 0, DI: 0, DIP: 0, CLK: 0 });
    for (const [a, w] of [[0, 0x12n], [1, 0x34n], [2, 0xABn], [3, 0n]]) { h.set({ ADDR: a }); h.clock('CLK'); assert.equal(h.get('DO'), w, `word ${a}`); }
    h.set({ ADDR: 5, DI: 0x5A, DIP: 1, WE: 1 }); h.clock('CLK');
    assert.deepEqual([h.get('DO'), h.get('DOP')], [0x5An, 1n], 'WRITE_FIRST');
    h.set({ WE: 0, ADDR: 0 }); h.clock('CLK'); h.set({ ADDR: 5 }); h.clock('CLK');
    assert.equal(h.get('DO'), 0x5An, 'written');
    h.set({ SSR: 1 }); h.clock('CLK');
    assert.deepEqual([h.get('DO'), h.get('DOP')], [0x55n, 1n], 'SRVAL');
  });

  test(`${lang}: RAMB16_S9_S18, written through port A (8 bits), read through port B (16 bits)`, () => {
    const h = harness('ramb16_s_s', { widthA: '9', widthB: '18' }, lang);
    h.set({ ENA: 1, ENB: 1, WEA: 1, WEB: 0, SSRA: 0, SSRB: 0, DIPA: 0, DIB: 0, DIPB: 0, ADDRB: 0, CLKA: 0, CLKB: 0 });
    for (const [a, w] of [[0, 0x11], [1, 0x22], [2, 0x33], [3, 0x44]]) { h.set({ ADDRA: a, DIA: w }); h.clock('CLKA'); }
    h.clock('CLKB');
    assert.equal(h.get('DOB'), 0x2211n);
    h.set({ ADDRB: 1 }); h.clock('CLKB');
    assert.equal(h.get('DOB'), 0x4433n);
  });

  test(`${lang}: MULT18X18SIO, the signed product, combinational and registered`, () => {
    const comb = harness('mult18x18sio', { AREG: 0, BREG: 0, PREG: 0 }, lang);
    comb.set({ CEA: 1, CEB: 1, CEP: 1, RSTA: 0, RSTB: 0, RSTP: 0, CLK: 0, BCIN: 0 });
    for (const [a, b] of [[-3, 1000], [131071, -131072], [0, 5], [-1, -1]]) {
      comb.set({ A: a, B: b });
      assert.equal(comb.get('P'), BigInt.asUintN(36, BigInt(a * b)), `${a} × ${b}`);
    }
    const reg = harness('mult18x18sio', {}, lang);
    reg.set({ CEA: 1, CEB: 1, CEP: 1, RSTA: 0, RSTB: 0, RSTP: 0, CLK: 0, BCIN: 0, A: 12, B: -7 });
    reg.clock('CLK');
    assert.equal(reg.get('P'), 0n, 'A and B registered, the product not yet');
    reg.clock('CLK');
    assert.equal(reg.get('P'), BigInt.asUintN(36, -84n));
  });

  test(`${lang}: DCM_SP, its clocks' edges at their frequencies once locked`, () => {
    const h = harness('dcm_sp', { CLKFX_MULTIPLY: 3, CLKFX_DIVIDE: 2, CLKDV_DIVIDE: '4.0', CLKIN_PERIOD: '20.0' }, lang);
    h.set({ RST: 0, CLKFB: 0, DSSEN: 0, PSCLK: 0, PSEN: 0, PSINCDEC: 0 });
    h.edges('CLKIN', 20000, 200000, ['LOCKED']);
    assert.equal(h.get('LOCKED'), 1n);
    // 2 µs of a 50 MHz clock: 100 periods
    const n = h.edges('CLKIN', 20000, 2000000, ['CLK0', 'CLK2X', 'CLKDV', 'CLKFX']);
    for (const [o, want] of [['CLK0', 100], ['CLK2X', 200], ['CLKDV', 25], ['CLKFX', 150]]) assert.ok(Math.abs(n[o] - want) <= 1, `${o}: ${n[o]} edges, ${want} wanted`);
  });

  test(`${lang}: BUFG, BUFGMUX and IBUFG pass their clock`, () => {
    for (const t of ['bufg', 'ibufg']) {
      const h = harness(t, {}, lang);
      for (const v of [1n, 0n, 1n]) { h.set({ I: v }); assert.equal(h.get('O'), v, t); }
    }
    const m = harness('bufgmux', {}, lang);
    m.set({ I0: 1, I1: 0, S: 0 }); assert.equal(m.get('O'), 1n);
    m.set({ S: 1 }); assert.equal(m.get('O'), 0n);
    m.set({ I1: 1 }); assert.equal(m.get('O'), 1n);
  });

  test(`${lang}: RAMB8BWER and RAMB16BWER, their contents read through port A (9 bits: the address from bit 3)`, () => {
    for (const t of ['ramb8bwer', 'ramb16bwer']) {
      const h = harness(t, { contents: '5A A5 0F' }, lang);
      const P = t === 'ramb8bwer' ? { clk: 'CLKAWRCLK', en: 'ENAWREN', we: 'WEAWEL', addr: 'ADDRAWRADDR', dout: 'DOADO', regce: 'REGCEA', rst: 'RSTA' }
        : { clk: 'CLKA', en: 'ENA', we: 'WEA', addr: 'ADDRA', dout: 'DOA', regce: 'REGCEA', rst: 'RSTA' };
      h.set({ [P.en]: 1, [P.we]: 0, [P.regce]: 1, [P.rst]: 0, [P.clk]: 0 });
      for (const [a, w] of [[0, 0x5An], [1, 0xA5n], [2, 0x0Fn], [3, 0n]]) { h.set({ [P.addr]: a << 3 }); h.clock(P.clk); assert.equal(h.get(P.dout), w, `${t} word ${a}`); }
    }
  });

  test(`${lang}: DSP48A1 with no register, P = A × B and P = C + A × B (OPMODE)`, () => {
    const regs = Object.fromEntries(['A0REG', 'A1REG', 'B0REG', 'B1REG', 'CARRYINREG', 'CARRYOUTREG', 'CREG', 'DREG', 'MREG', 'OPMODEREG', 'PREG'].map(r => [r, 0]));
    const h = harness('dsp48a1', regs, lang);
    h.set({ CLK: 0, CARRYIN: 0, D: 0, PCIN: 0, ...Object.fromEntries(['A', 'B', 'C', 'CARRYIN', 'D', 'M', 'OPMODE', 'P'].flatMap(r => [[`CE${r}`, 1], [`RST${r}`, 0]])) });
    h.set({ A: -5, B: 7, C: 1000, OPMODE: 0b00000001 });
    assert.equal(h.get('P'), BigInt.asUintN(48, -35n));
    assert.equal(h.get('M'), BigInt.asUintN(36, -35n));
    h.set({ OPMODE: 0b00001101 });
    assert.equal(h.get('P'), 965n);
  });

  test(`${lang}: PLL_BASE, CLKOUTn = CLKIN × CLKFBOUT_MULT / (DIVCLK_DIVIDE × CLKOUTn_DIVIDE) once locked; its duty cycle`, () => {
    const h = harness('pll_base', { CLKFBOUT_MULT: 6, DIVCLK_DIVIDE: 1, CLKOUT0_DIVIDE: 6, CLKOUT1_DIVIDE: 3, CLKOUT2_DIVIDE: 12, CLKOUT3_DIVIDE: 4, CLKIN_PERIOD: '10.0' }, lang);
    h.set({ RST: 0, CLKFBIN: 0 });
    h.edges('CLKIN', 10000, 100000, ['LOCKED']);
    assert.equal(h.get('LOCKED'), 1n);
    // 1 µs of a 100 MHz clock: VCO 600 MHz
    const n = h.edges('CLKIN', 10000, 1000000, ['CLKFBOUT', 'CLKOUT0', 'CLKOUT1', 'CLKOUT2', 'CLKOUT3']);
    for (const [o, want] of [['CLKFBOUT', 100], ['CLKOUT0', 100], ['CLKOUT1', 200], ['CLKOUT2', 50], ['CLKOUT3', 150]]) assert.ok(Math.abs(n[o] - want) <= 1, `${o}: ${n[o]} edges, ${want} wanted`);
    // RST: the outputs stop and LOCKED falls
    h.set({ RST: 1 });
    assert.equal(h.get('LOCKED'), 0n);
    assert.deepEqual(h.edges('CLKIN', 10000, 200000, ['CLKOUT0']), { CLKOUT0: 0 });
  });

  test(`${lang}: BUFIO2, IOCLK the input clock, DIVCLK divided by DIVIDE, SERDESSTROBE once in DIVIDE`, () => {
    const h = harness('bufio2', { DIVIDE: 4, DIVIDE_BYPASS: false }, lang);
    const n = h.edges('I', 10000, 800000, ['IOCLK', 'DIVCLK', 'SERDESSTROBE']);
    assert.ok(Math.abs(n.IOCLK - 80) <= 1 && Math.abs(n.DIVCLK - 20) <= 1 && Math.abs(n.SERDESSTROBE - 20) <= 1, JSON.stringify(n));
    const b = harness('bufio2', {}, lang);
    const m = b.edges('I', 10000, 200000, ['IOCLK', 'DIVCLK', 'SERDESSTROBE']);
    assert.ok(Math.abs(m.DIVCLK - 20) <= 1 && m.SERDESSTROBE === 0, JSON.stringify(m));
  });
}

// ------------------------------------------------------------------ a schematic using them: its messages
// a schematic with symbols of `type` (params), the pins named in `wired` on I/O markers of their names
function sheet(name, syms, lang = 'vhdl') {
  const doc = newDoc(name, lang);
  syms.forEach(({ type, params = {}, wired = [] }, k) => {
    const sym = { id: `S${k + 1}`, type, x: 400, y: 200 + 600 * k, rot: 0, mirror: false, name: `U${k + 1}`, params: { ...defaultParams(type), ...params } };
    doc.symbols.push(sym);
    for (const q of symbolDef(sym).pins.filter(q => wired.includes(q.name))) {
      const pn = syms.length > 1 ? `${q.name.toLowerCase()}${k + 1}` : q.name.toLowerCase();
      doc.ports.push({ id: `P${doc.ports.length + 1}`, name: pn, dir: q.dir === 'out' ? 'out' : 'in', width: q.width, x: sym.x + q.x, y: sym.y + q.y });
    }
  });
  return doc;
}
const msgs = d => d.map(x => `${x.severity}: ${x.message}`);

test('a primitive\'s unconnected inputs: the ones it needs a warning, the others tied (EN to 1) with none; its open outputs', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = sheet('rom', [{ type: 'ramb16_s', params: { contents: '01 02' }, wired: ['DO'] }], lang);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(msgs(g.diagnostics), ['warning: input pin ADDR of U1 (RAMB16_S9) is not connected', 'warning: input pin CLK of U1 (RAMB16_S9) is not connected'], lang);
    if (lang === 'vhdl') {
      for (const x of ["ADDR => \"00000000000\"", "EN => '1'", "SSR => '0'", "WE => '0'", "DIP(0) => '0'", 'DO => do', 'DOP => open', `INIT_00 => X"${'0'.repeat(60)}0201"`]) assert.ok(g.code.includes(x), x);
      assert.doesNotMatch(g.code, /signal/);
    } else {
      for (const x of [".ADDR(11'b0)", ".EN(1'b1)", ".DI(8'b0)", ".DIP(1'b0)", '.DO(do)', '.DOP()', `.INIT_00(256'h${'0'.repeat(60)}0201)`]) assert.ok(g.code.includes(x), x);
    }
  }
  // a DCM's feedback: needed unless CLK_FEEDBACK is NONE; the phase shift's inputs never
  const dcm = fb => generateHdl(sheet('clk', [{ type: 'dcm_sp', params: { CLK_FEEDBACK: fb }, wired: ['CLKIN', 'CLKFX'] }]));
  assert.deepEqual(msgs(dcm('1X').diagnostics), ['warning: input pin CLKFB of U1 (DCM_SP) is not connected']);
  assert.deepEqual(msgs(dcm('NONE').diagnostics), []);
  // a multiplier's operand B: from B (DIRECT), from BCIN (CASCADE, #848): the unconnected one needed warns, the other not
  const mult = (bi, wired) => msgs(generateHdl(sheet('m', [{ type: 'mult18x18sio', params: { B_INPUT: bi }, wired: ['A', 'CLK', 'P', ...wired] }])).diagnostics);
  assert.deepEqual(mult('DIRECT', ['B']), []);
  assert.deepEqual(mult('CASCADE', ['BCIN']), []);
  assert.deepEqual(mult('CASCADE', ['B']), ['warning: input pin BCIN of U1 (MULT18X18SIO) is not connected']);
  assert.deepEqual(mult('DIRECT', ['BCIN']), ['warning: input pin B of U1 (MULT18X18SIO) is not connected']);
  // a DSP48A1's clock enables tied to 1, its resets to 0, its wide inputs to zeros
  const dsp = generateHdl(sheet('mac', [{ type: 'dsp48a1', wired: ['A', 'B', 'P'] }], 'verilog'));
  assert.deepEqual(msgs(dsp.diagnostics), []);
  for (const x of [".CEP(1'b1)", ".RSTP(1'b0)", ".C(48'b0)", ".OPMODE(8'b0)", '.PCOUT()']) assert.ok(dsp.code.includes(x), x);
});

test('a primitive\'s attribute out of its range, a dual-port RAM with port A the wider, contents too wide: errors', () => {
  const g = (params, type = 'dcm_sp') => msgs(generateHdl(sheet('x', [{ type, params, wired: ['CLKIN', 'CLKFB', 'CLK0', 'ADDRA', 'CLKA', 'DOB'] }])).diagnostics);
  assert.deepEqual(g({ CLKFX_MULTIPLY: 40 }), ["error: U1: CLKFX_MULTIPLY = '40' is not a value of DCM_SP's CLKFX_MULTIPLY (2 … 32)"]);
  assert.deepEqual(g({ CLKDV_DIVIDE: '17.0', CLK_FEEDBACK: '4X' }), ["error: U1: CLKDV_DIVIDE = '17.0' is not a value of DCM_SP's CLKDV_DIVIDE (1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0)",
    "error: U1: CLK_FEEDBACK = '4X' is not a value of DCM_SP's CLK_FEEDBACK (1X, 2X, NONE)"]);
  assert.deepEqual(g({ widthA: '18', widthB: '9' }, 'ramb16_s_s'), ['error: U1: no RAMB16_S18_S9: port A must not be wider than port B (RAMB16_S9_S18 with the ports swapped)']);
  assert.deepEqual(g({ INIT_A: '1000' }, 'ramb16_s_s'), ["error: U1: INIT_A = '1000' is not a value of RAMB16_S9_S9's INIT_A (9 bits, hexadecimal)"]);
  assert.deepEqual(g({ contents: '12 345' }, 'ramb16_s_s'), ["error: U1: contents: word 1 '345' is wider than 8 bits"]);
  assert.deepEqual(msgs(generateHdl(sheet('ram', [{ type: 'ramb16bwer', params: { DATA_WIDTH_A: '0', contents: '1' }, wired: ['ADDRA', 'CLKA', 'DOB'] }])).diagnostics),
    ['warning: U1: contents ignored (port A unused, DATA_WIDTH_A = 0)']);
  // a schematic named as the primitive it instances
  assert.deepEqual(msgs(generateHdl(sheet('BUFG', [{ type: 'bufg', wired: ['I', 'O'] }])).diagnostics),
    ["error: module name 'BUFG' is the name of the primitive U1 instances: rename the schematic"]);
});

test('the netlist of a schematic of primitives: the clock path IBUFG → DCM_SP → BUFG, no warning', () => {
  const doc = newDoc('clocks', 'vhdl');
  const add = (id, type, x, y, params = {}) => { const s = { id, type, x, y, rot: 0, mirror: false, name: id.toLowerCase(), params: { ...defaultParams(type), ...params } }; doc.symbols.push(s); return s; };
  const pinAt = (s, n) => { const q = symbolDef(s).pins.find(p => p.name === n); return { x: s.x + q.x, y: s.y + q.y }; };
  const wire = (a, b) => doc.wires.push({ id: `W${doc.wires.length + 1}`, points: [a, { x: b.x, y: a.y }, b].filter((p, i, l) => i === 0 || p.x !== l[i - 1].x || p.y !== l[i - 1].y) });
  const ib = add('IB', 'ibufg', 100, 100), dcm = add('DCM', 'dcm_sp', 400, 100, { CLK_FEEDBACK: 'NONE' }), bg = add('BG', 'bufg', 800, 300);
  doc.ports.push({ id: 'P1', name: 'clk', dir: 'in', width: 1, ...pinAt(ib, 'I') }, { id: 'P2', name: 'fast', dir: 'out', width: 1, ...pinAt(bg, 'O') });
  wire(pinAt(ib, 'O'), pinAt(dcm, 'CLKIN'));
  wire(pinAt(dcm, 'CLKFX'), pinAt(bg, 'I'));
  assert.deepEqual(msgs(netlist(doc).diagnostics), []);
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateHdl(doc, { lang });
    assert.deepEqual(msgs(g.diagnostics), [], lang);
    const srcs = [{ path: g.filename, lang, text: g.code }];
    const lib = compile([...primitiveSources(srcs), ...srcs]);
    const d = elaborate(lib, 'clocks');
    assert.deepEqual([...lib.errors, ...d.diags].map(x => `${x.severity}: ${x.message}`), [], lang);
  }
});

// ------------------------------------------------------------------ Symbol Info
test('Symbol Info: a primitive\'s datasheet, its resource on the project\'s part and the schematic\'s use of it, in English and Portuguese', () => {
  const p250 = findPart('xc3s250e');
  const en = symbolDoc('ramb16_s', { portWidth: '18' }, { part: p250, used: 2 });
  assert.equal(en.title, 'RAMB16_S18');
  assert.equal(en.category, 'Device Primitives');
  assert.equal(en.text.at(-1), 'Block RAM (18 Kb): 12 on this device (XC3S250E), 2 used in this schematic.');
  assert.deepEqual(en.resource, { id: 'ramb16', label: { en: 'Block RAM (18 Kb)', pt: 'RAM de bloco (18 Kb)' }, count: 12, used: 2 });
  const pt = symbolDoc('ramb16_s', { portWidth: '18' }, { lang: 'pt', part: p250, used: 2 });
  assert.equal(pt.text.at(-1), 'RAM de bloco (18 Kb): 12 neste dispositivo (XC3S250E), 2 usado(s) neste esquemático.');
  assert.match(pt.text[0], /^RAM de bloco de 16 Kbit/);
  assert.deepEqual(en.pins.find(q => q.name === 'DIP'), { name: 'DIP', dir: 'in', width: 2, widthText: '2', func: 'Parity bits written', inv: false, clock: false });
  assert.equal(en.params.find(q => q.name === 'WRITE_MODE').meaning, "What port A's output shows while it writes: WRITE_FIRST the word written, READ_FIRST the word that was there, NO_CHANGE the word read last.");
  assert.equal(pt.params.find(q => q.name === 'portWidth').label, 'Largura do porto');
  assert.equal(symbolDoc('dcm_sp', {}, { part: findPart('xc3s100e') }).text.at(-1), 'DCMs: 2 on this device (XC3S100E).');
  assert.equal(symbolDoc('pll_base', {}, { lang: 'pt', part: findPart('xc6slx16') }).text.at(-1), 'PLLs: 2 neste dispositivo (XC6SLX16).');
  assert.equal(symbolDoc('ramb16_s', {}, { part: findPart('xc6slx16') }).text.at(-1), 'Not a primitive of this device\'s family (XC6SLX16): the design will not build for it.');
  // no part: no count; no truth table (a clocked primitive)
  assert.equal(symbolDoc('bufg').resource, null);
  assert.match(symbolDoc('bufg').text.at(-1), /^It is the BUFG primitive of the Xilinx library \(UNISIM\) itself/);
  assert.equal(symbolDoc('bufg').mode, null);
  // its equivalent HDL: an instance of the primitive in a module named after it
  assert.match(symbolDoc('mult18x18sio').hdl.verilog, /module MULT18X18SIO_symbol \([\s\S]*MULT18X18SIO #\(/);
});
