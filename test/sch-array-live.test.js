// Try it on an arrayed instance (core/schlive.js, #3827): a 1-bit register's instance reg(3:0) on 4-bit buses, its
// clock and enable shared, simulated live in VHDL and in Verilog: the instance's pins (the Try it panel's list, a
// pin's value) are its copies' values side by side on a sliced pin, the value of the shared ones; an output left open
// its copies' own values too; the build's errors and warnings none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDoc, symbolPins } from '../core/schdoc.js';
import { buildLiveSim } from '../core/schlive.js';
import * as V from '../core/values.js';

const P = (name, dir = 'in', width = 1) => ({ name, dir, width });
const REG = { name: 'reg1', ports: [P('d'), P('ce'), P('c'), P('q', 'out')] };
const SRC = {
  vhdl: { path: 'src/reg1.vhd', text: 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity reg1 is\n  port (d, ce, c : in std_logic; q : out std_logic);\nend entity reg1;\n\narchitecture rtl of reg1 is\nbegin\n  process (c) begin\n    if rising_edge(c) then\n      if ce = \'1\' then q <= d; end if;\n    end if;\n  end process;\nend architecture rtl;\n' },
  verilog: { path: 'src/reg1.v', text: 'module reg1 (input d, input ce, input c, output reg q);\n  always @(posedge c) if (ce) q <= d;\nendmodule\n' },
};

// the instance `name` of reg1, each pin but those of `open` wired to an I/O marker n_<pin> (d and q `bus` bits wide)
function sheet(lang, name, open = [], bus = 4) {
  const mods = { reg1: { ...REG, lang } };
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name, params: { module: 'reg1', generics: {}, ports: REG.ports.map(q => ({ ...q })) } };
  const wires = [], ports = [];
  for (const p of symbolPins(s, mods)) {
    if (open.includes(p.name)) continue;
    const b = { x: p.x + (p.side === 'W' ? -60 : 60), y: p.y };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: `n_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: p.name === 'd' || p.name === 'q' ? bus : 1, x: b.x, y: b.y });
  }
  const doc = normalizeDoc({ version: 4, name: 'top', lang, symbols: [s], wires, ports, labels: [] }, { modules: mods });
  return buildLiveSim(doc, { modules: mods, sources: [SRC[lang]], lang });
}
const pins = live => Object.fromEntries(live.instancePorts('U').map(p => [p.name, `${p.dir}:${p.value ? V.toBin(p.value) : null}`]));

for (const lang of ['vhdl', 'verilog']) {
  test(`#3827 ${lang}: Try it on reg(3:0): its pins the copies' values side by side, the shared ones once`, () => {
    const r = sheet(lang, 'reg(3:0)');
    assert.deepEqual([r.errors, r.warnings ?? []], [[], []]);
    const live = r.live;
    assert.deepEqual(live.inputs.map(i => `${i.name}:${i.width}${i.clock ? ':clock' : ''}`), ['n_d:4', 'n_ce:1', 'n_c:1:clock']);
    assert.deepEqual(pins(live), { d: 'in:0000', ce: 'in:0', c: 'in:0', q: 'out:xxxx' });
    live.set('m_d', 0b0110n); live.set('m_ce', 1n); live.cycle('m_c');
    assert.deepEqual(pins(live), { d: 'in:0110', ce: 'in:1', c: 'in:0', q: 'out:0110' });
    assert.equal(V.toBin(live.pinValue('U', 'q')), '0110', 'a pin\'s value (its tip): its bus');
    live.set('m_d', 0b1001n); live.set('m_ce', 0n); live.cycle('m_c');
    assert.deepEqual(pins(live), { d: 'in:1001', ce: 'in:0', c: 'in:0', q: 'out:0110' }, 'disabled: Q kept');
  });

  test(`#3827 ${lang}: Try it on r(0:3) with Q open: Q its copies' own values (copy 3 the high end), as its tip says`, () => {
    const r = sheet(lang, 'r(0:3)', ['q']);
    assert.deepEqual(r.errors, []);
    const live = r.live;
    live.set('m_d', 0b0011n); live.set('m_ce', 1n); live.cycle('m_c');
    assert.deepEqual(pins(live), { d: 'in:0011', ce: 'in:1', c: 'in:0', q: 'out:0011' });
    assert.equal(V.toBin(live.pinValue('U', 'q')), '0011', 'an open pin: the instance\'s');
  });
}

test('#3827 Try it on a single instance as before: its ports, an open output the instance\'s', () => {
  const r = sheet('vhdl', 'r', ['q'], 1);
  assert.deepEqual(r.errors, []);
  r.live.set('m_ce', 1n); r.live.set('m_d', 1n); r.live.cycle('m_c');
  assert.deepEqual(pins(r.live), { d: 'in:1', ce: 'in:1', c: 'in:0', q: 'out:1' });
  assert.equal(V.toBin(r.live.pinValue('U', 'q')), '1');
});
