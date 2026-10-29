// The device primitives of the schematic library (#791) through the Silinx toolchain: a schematic of a Basys2
// (XC3S250E) using IBUFG, DCM_SP, BUFG, a RAMB16_S9 with its contents and a MULT18X18SIO, with a counter, a bus join
// and a bus tap of the library, its HDL generated in VHDL and in Verilog, synthesized, mapped, placed, routed and
// its bitstream written with no warning; the generated HDL simulated: the LEDs show the product of the ROM's words
// and the switches. A BUFGMUX (#846) switching a counter between the board's two clocks, the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams, symbolDef, newDoc, netlist, generateHdl } from '../core/schdoc.js';
import { orderOpenSteps } from '../packages/silinx-fpga/src/open-steps.js';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { flow } from './timesim-lib.mjs';

const ROM = ['03', '05', '07', '0B', '0D', '11', '13', '17'];
// the schematic: every pin on a short wire ended by a label of its net (the same name joins them), the ports'
// I/O markers on wires of their own with their labels; the logic on CLKFX (75 MHz), CLK0 the DCM's feedback
function design(lang) {
  const doc = newDoc('top', lang);
  let k = 0, w = 0;
  const stub = (x, y, side, net) => {
    const dx = side === 'W' ? -20 : 20;
    doc.wires.push({ id: `W${++w}`, points: [{ x, y }, { x: x + dx, y }] });
    doc.labels.push({ id: `L${w}`, x: x + dx, y, net });
  };
  const sym = (type, params, conns) => {
    k++;
    const s = { id: `S${k}`, type, x: 200 + 400 * ((k - 1) % 3), y: 200 + 700 * Math.floor((k - 1) / 3), rot: 0, mirror: false, name: `X${k}`, params: { ...defaultParams(type), ...params } };
    doc.symbols.push(s);
    for (const q of symbolDef(s).pins) if (conns[q.name]) stub(s.x + q.x, s.y + q.y, q.side, conns[q.name]);
  };
  const port = (name, dir, width, i) => {
    const x = dir === 'in' ? 60 : 1800, y = 2400 + 60 * i;
    doc.ports.push({ id: `P${i}`, name, dir, width, x, y });
    stub(x, y, dir === 'in' ? 'E' : 'W', name);
  };
  port('clk', 'in', 1, 1); port('sw', 'in', 8, 2); port('led', 'out', 8, 3);
  sym('ibufg', {}, { I: 'clk', O: 'clkin' });
  sym('dcm_sp', { CLKFX_MULTIPLY: 3, CLKFX_DIVIDE: 2, CLKIN_PERIOD: '20.0' }, { CLKIN: 'clkin', CLKFB: 'clk0', CLK0: 'clk0u', CLKFX: 'clkfxu' });
  sym('bufg', {}, { I: 'clk0u', O: 'clk0' });
  sym('bufg', {}, { I: 'clkfxu', O: 'clkfx' });
  sym('counter', { width: 11, en: false, reset: 'none' }, { C: 'clkfx', Q: 'addr' });
  sym('ramb16_s', { portWidth: '9', contents: ROM.join(' ') }, { ADDR: 'addr', CLK: 'clkfx', DO: 'word' });
  sym('constant', { value: '0', width: 10 }, { O: 'zero' });
  sym('busjoin', { widths: '10,8' }, { I0: 'zero', I1: 'word', O: 'a' });
  sym('busjoin', { widths: '10,8' }, { I0: 'zero', I1: 'sw', O: 'b' });
  sym('mult18x18sio', { AREG: 0, BREG: 0, PREG: 1 }, { A: 'a', B: 'b', CLK: 'clkfx', P: 'p' });
  sym('slice', { msb: 7, lsb: 0 }, { I: 'p', O: 'led' });
  return doc;
}

for (const lang of ['vhdl', 'verilog']) {
  test(`${lang}: a schematic of IBUFG, DCM_SP, BUFG, RAMB16_S9 and MULT18X18SIO, generated, built by the Silinx toolchain for the XC3S250E with no warning`, { timeout: 600000 }, async () => {
    const doc = design(lang);
    assert.deepEqual(netlist(doc).diagnostics.map(d => d.message), []);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.map(d => d.message), []);
    assert.match(g.code, lang === 'vhdl' ? /X6 : RAMB16_S9\n    generic map \([\s\S]*INIT_00 => X"0+1713110D0B070503"/ : /RAMB16_S9 #\(\n[\s\S]*\.INIT_00\(256'h0+1713110D0B070503\)\n  \) X6 \(/);
    const src = { path: g.filename, lang, text: g.code };

    // simulated: the ROM's words times the switches
    const lib = compile([...primitiveSources([src]), src]);
    const d = elaborate(lib, 'top');
    assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.severity === 'error').map(x => x.message), []);
    const s = new Simulator(d);
    const port = n => d.top.ports.find(p => p.name.toLowerCase() === n).sig;
    s.force(port('sw'), V.mk(8, 3n));
    const seen = new Set();
    for (let t = 0; t < 2000000; t += 10000) {
      s.force(port('clk'), V.mk(1, (t / 10000) % 2 === 0 ? 1n : 0n));
      s.run(t + 10000);
      const v = port('led').val;
      if (!v.x) seen.add(Number(v.v));
    }
    for (const w of ROM) assert.ok(seen.has((parseInt(w, 16) * 3) & 0xFF), `${w} × 3 on the LEDs: ${[...seen]}`);

    const ucf = 'NET "clk" LOC = "B8" | IOSTANDARD = LVCMOS33 ;\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\n'
      + ['P11', 'L3', 'K3', 'B4', 'G3', 'F3', 'E2', 'N3'].map((l, i) => `NET "sw<${i}>" LOC = "${l}" | IOSTANDARD = LVCMOS33 ;\n`).join('')
      + ['M5', 'M11', 'P7', 'P6', 'N5', 'N4', 'P4', 'G1'].map((l, i) => `NET "led<${i}>" LOC = "${l}" | IOSTANDARD = LVCMOS33 ;\n`).join('');
    const r = await flow({ top: 'top', steps: orderOpenSteps(['bitgen']) }, [src], [], ucf);
    assert.equal(r.ok, true, r.lines.join('\n'));
    assert.deepEqual(r.lines.filter(l => /warning/i.test(l)), []);
    assert.ok(r.store['top.bit'], 'the bitstream');
    // the primitives in the design: the MAP report's
    const map = r.lines.join('\n');
    for (const x of [/RAMB16/, /MULT18X18/, /DCM/]) assert.match(map, x);
  });
}

// a clock switch (#846): the BUFGMUX of the library chooses the Basys2's oscillator (B8, I0) or the clock socket's
// (M6, I1) by SW0 for an 8-bit counter on the LEDs
function switchDesign(lang) {
  const doc = newDoc('top', lang);
  let w = 0;
  const stub = (x, y, side, net) => {
    const dx = side === 'W' ? -20 : 20;
    doc.wires.push({ id: `W${++w}`, points: [{ x, y }, { x: x + dx, y }] });
    doc.labels.push({ id: `L${w}`, x: x + dx, y, net });
  };
  const sym = (k, type, params, conns) => {
    const s = { id: `S${k}`, type, x: 200 + 400 * k, y: 200, rot: 0, mirror: false, name: `X${k}`, params: { ...defaultParams(type), ...params } };
    doc.symbols.push(s);
    for (const q of symbolDef(s).pins) if (conns[q.name]) stub(s.x + q.x, s.y + q.y, q.side, conns[q.name]);
  };
  [['clka', 'in', 1], ['clkb', 'in', 1], ['sel', 'in', 1], ['led', 'out', 8]].forEach(([name, dir, width], i) => {
    const x = dir === 'in' ? 60 : 1800, y = 1200 + 60 * i;
    doc.ports.push({ id: `P${i}`, name, dir, width, x, y });
    stub(x, y, dir === 'in' ? 'E' : 'W', name);
  });
  sym(1, 'bufgmux', {}, { I0: 'clka', I1: 'clkb', S: 'sel', O: 'clk' });
  sym(2, 'counter', { width: 8, en: false, reset: 'none' }, { C: 'clk', Q: 'led' });
  return doc;
}

for (const lang of ['vhdl', 'verilog']) {
  test(`${lang}: a schematic of a BUFGMUX switching a counter between two clocks, built by the Silinx toolchain for the XC3S250E with no warning (#846)`, { timeout: 600000 }, async () => {
    const doc = switchDesign(lang);
    assert.deepEqual(netlist(doc).diagnostics.map(d => d.message), []);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.map(d => d.message), []);
    assert.match(g.code, lang === 'vhdl' ? /X1 : BUFGMUX\n?\s*port map/ : /BUFGMUX X1 \(/);
    const src = { path: g.filename, lang, text: g.code };

    // simulated: the counter counts the edges of the clock SW0 chooses
    const lib = compile([...primitiveSources([src]), src]);
    const d = elaborate(lib, 'top');
    assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.severity === 'error').map(x => x.message), []);
    const s = new Simulator(d);
    const port = n => d.top.ports.find(p => p.name.toLowerCase() === n).sig;
    const count = () => Number(port('led').val.v);
    let t = 0;
    // clka every 20 ns, clkb every 60 ns (rising at 10 and 30 ns of each 60 ns)
    const run = (ns, sel) => {
      s.force(port('sel'), V.mk(1, BigInt(sel)));
      for (const end = t + ns; t < end; t += 10) {
        s.force(port('clka'), V.mk(1, (t / 10) % 2 === 1 ? 1n : 0n));
        s.force(port('clkb'), V.mk(1, (t / 30) % 2 === 1 ? 1n : 0n));
        s.run(t + 10);
      }
    };
    run(600, 0);
    const a0 = count();
    run(1200, 0);
    assert.equal((count() - a0 + 256) % 256, 60, 'on clka: one count every 20 ns');
    run(600, 1);
    const b0 = count();
    run(1200, 1);
    assert.equal((count() - b0 + 256) % 256, 20, 'on clkb: one count every 60 ns');

    const ucf = 'NET "clka" LOC = "B8" ;\nNET "clkb" LOC = "M6" ;\nNET "sel" LOC = "P11" ;\n'
      + 'NET "clka" TNM_NET = "clka" ;\nTIMESPEC "TS_clka" = PERIOD "clka" 20 ns HIGH 50% ;\nNET "clkb" TNM_NET = "clkb" ;\nTIMESPEC "TS_clkb" = PERIOD "clkb" 60 ns HIGH 50% ;\n'
      + ['M5', 'M11', 'P7', 'P6', 'N5', 'N4', 'P4', 'G1'].map((l, i) => `NET "led<${i}>" LOC = "${l}" ;\n`).join('');
    const r = await flow({ top: 'top', steps: orderOpenSteps(['bitgen']) }, [src], [], ucf);
    assert.equal(r.ok, true, r.lines.join('\n'));
    assert.deepEqual(r.lines.filter(l => /warning/i.test(l)), []);
    assert.ok(r.store['top.bit'], 'the bitstream');
  });
}
