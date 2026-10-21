// The Language Templates' Device Primitives (#792, core/prim-templates.js): each family's (the schematic library's
// list), each template inserted in a module (its signals declared from the primitive's pins, as a design would),
// compiled, elaborated and simulated in VHDL and in Verilog with no warning; its placeholders, its comment with the
// primitive's count on the part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { primitiveSources } from '../core/unisim.js';
import { primitiveTemplates, primitiveTemplate, fillTemplate, templateSignal } from '../core/prim-templates.js';
import { devicePrimitives, primitiveOf } from '../core/primitives.js';
import { findPart } from '../server/devices.js';

const PART = { spartan3e: findPart('xc3s250e'), spartan6: findPart('xc6slx16') };

// a module m with the template in its body: the signals of its placeholders declared (an input the template needs:
// a port of the module; an output: a port too, so that it is not unused), the VHDL context clause with UNISIM
function wrap(type, lang, text) {
  const r = primitiveOf(type);
  const used = r.pins.filter(q => q.dir === 'out' || q.need);
  const vt = q => (q.width > 1 || q.vec ? `std_logic_vector(${q.width - 1} downto 0)` : 'std_logic');
  const body = fillTemplate(text);
  if (lang === 'vhdl') {
    return `library ieee; use ieee.std_logic_1164.all;\nlibrary UNISIM; use UNISIM.VCOMPONENTS.ALL;\nentity m is\n  port (\n${used.map(q => `    ${templateSignal(q)} : ${q.dir} ${vt(q)}`).join(';\n')}\n  );\nend m;\narchitecture a of m is\nbegin\n${body}end a;\n`;
  }
  return `module m (\n${used.map(q => `  ${q.dir === 'out' ? 'output' : 'input'} wire${q.width > 1 ? ` [${q.width - 1}:0]` : ''} ${templateSignal(q)}`).join(',\n')}\n);\n${body}endmodule\n`;
}

test('the Device Primitives templates of each family: the library\'s list, their names and comments', () => {
  for (const lang of ['vhdl', 'verilog']) {
    assert.deepEqual(primitiveTemplates('spartan3e', lang).map(t => t.name), ['RAMB16_S9', 'RAMB16_S9_S9', 'MULT18X18SIO', 'DCM_SP', 'BUFG', 'BUFGMUX', 'IBUFG']);
    assert.deepEqual(primitiveTemplates('spartan6', lang).map(t => t.name), ['RAMB8BWER', 'RAMB16BWER', 'DSP48A1', 'PLL_BASE', 'DCM_SP', 'BUFG', 'BUFIO2']);
    assert.deepEqual(primitiveTemplates('spartan6', lang).map(t => t.type), devicePrimitives('spartan6').map(p => p.type));
    assert.deepEqual(primitiveTemplates('spartan3a', lang), []);
  }
  const c = (type, lang, f) => primitiveTemplate(type, lang, PART[f]).text.split('\n').slice(0, 3);
  assert.deepEqual(c('ramb16_s', 'vhdl', 'spartan3e'), ['-- RAMB16_S9: Block RAM 16 Kbit + parity, single port (RAMB16_S1 … RAMB16_S36)',
    '-- Block RAM (18 Kb): 12 on this device (XC3S250E)', '-- (library UNISIM; use UNISIM.VCOMPONENTS.ALL; in the context clause)']);
  assert.deepEqual(c('pll_base', 'verilog', 'spartan6'), ['// PLL_BASE: Phase-locked loop: up to six clocks of the VCO\'s frequency divided', '// PLLs: 2 on this device (XC6SLX16)', 'PLL_BASE #(']);
  assert.equal(primitiveTemplate('bufg', 'verilog').text.split('\n')[1], 'BUFG ${1:u_bufg} (');
  // the placeholders: the instance's name first, the main attributes, the signals; the cursor after the instance
  const t = primitiveTemplate('dcm_sp', 'vhdl').text;
  assert.match(t, /^\$\{1:u_dcm_sp\} : DCM_SP$/m);
  assert.match(t, /^ {4}CLKFX_MULTIPLY {8}=> \$\{3:4\}, -- 2 … 32$/m);
  assert.match(t, /^ {4}CLKIN {4}=> \$\{6:clkin\}, -- Input clock \(from an IBUFG or a BUFG\)$/m);
  assert.match(t, /^ {4}RST {6}=> '0', -- Reset/m);
  assert.match(t, /\);\$0\n$/);
  assert.equal(fillTemplate('${1:u_x} : BUFG ${2:a}$0'), 'u_x : BUFG a');
  assert.match(primitiveTemplate('ramb16_s', 'verilog').text, /^ {2}\.DO {2}\(\$\{\d+:dout\}\), \/\/ Data read/m);
  assert.match(primitiveTemplate('ramb16_s', 'verilog').text, /^ {2}\.INIT_00 {3}\(256'h0{64}\)  \/\/ INIT_00 … INIT_3F/m);
});

for (const lang of ['vhdl', 'verilog']) {
  test(`${lang}: every Device Primitives template, inserted in a module, compiles, elaborates and simulates with no warning`, () => {
    for (const family of ['spartan3e', 'spartan6']) for (const tp of primitiveTemplates(family, lang, PART[family])) {
      const what = `${family} ${tp.name} ${lang}`;
      const text = wrap(tp.type, lang, tp.text);
      const srcs = [{ path: `m.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text }];
      const lib = compile([...primitiveSources(srcs), ...srcs]);
      const d = elaborate(lib, 'm');
      assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.path === srcs[0].path || x.file === srcs[0].path || x.severity === 'error').map(x => `${x.severity}: ${x.message}`), [], `${what}:\n${text}`);
      // 2 µs, a 50 MHz clock on its clock inputs, its other inputs 0
      const s = new Simulator(d);
      const ins = d.top.ports.filter(p => p.dir === 'in');
      for (const p of ins) s.force(p.sig, V.mk(p.sig.t.w, 0n));
      const clocks = primitiveOf(tp.type).pins.filter(q => q.clock && q.need).map(q => templateSignal(q));
      for (let t = 10000; t <= 2000000; t += 10000) {
        for (const p of ins) if (clocks.includes(p.name.toLowerCase())) s.force(p.sig, V.mk(1, BigInt((t / 10000) % 2)));
        s.run(t);
      }
      assert.deepEqual(s.log.filter(e => e.kind === 'warning' || e.kind === 'error' || e.kind === 'failure').map(e => e.text), [], what);
    }
  });
}
