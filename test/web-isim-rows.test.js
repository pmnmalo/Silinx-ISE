// ISim's rows of the wave window (web/js/isim-rows.js, #405: out of mountISim), on the simulator itself: a bus
// expanded into its bits, each bit's wave and value read back against the bus's own values; the groups, the dividers,
// Delete, the radix and the rows' menu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import * as V from '../core/values.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';

const { mountRows } = await import('../web/js/isim-rows.js');

// c counts every 10 ns (4 bits, [3:0]); d is c reversed ([0:3]); e a single bit
const SRC = `module top;
  reg [3:0] c = 0;
  wire [0:3] d = c;
  wire e = c[0];
  always #10 c = c + 1;
endmodule
`;
function windowOf() {
  const design = elaborate(compile([{ path: 'top.v', lang: 'verilog', text: SRC }]), 'top');
  const sim = new Simulator(design);
  sim.start(); sim.run(95000);
  const st = { rows: [], rowSeq: 1, sel: new Set() };
  const seen = [];
  const rec = (name) => (...a) => { seen.push([name, ...a.map((x) => x?.name ?? x)]); };
  const r = mountRows({ st, sim, onOpenSource: () => {}, updateVScroll: () => {}, invalidate: () => {}, renderObjects: rec('renderObjects'),
    forceDialog: rec('forceDialog'), isForced: (s) => s.name === 'c', removeForces: rec('removeForces'), openSource: rec('openSource') });
  const sig = (n) => design.signals.find((s) => s.path === `top.${n}`);
  return { design, sim, st, seen, sig, ...r };
}
const keys = (w) => w.flat().map((f) => f.key);
const labels = (items) => items.map((it) => (it.sep ? '-' : `${it.label}${it.disabled ? ' (disabled)' : ''}`));

test('#405 ISim rows: a bus expanded into its bits, in display order; each bit\'s wave and values those of the bus', () => {
  const w = windowOf();
  const [rc, rd, re] = w.addSignals([w.sig('c'), w.sig('d'), w.sig('e')]);
  assert.deepEqual(w.seen.splice(0), [['renderObjects']]);
  assert.deepEqual(keys(w), ['1', '2', '3']);
  rc.expanded = true; rd.expanded = true; re.expanded = true;
  w.rebuildFlat();
  // c[3:0]: 3 .. 0; d[0:3]: 0 .. 3; e (one bit) not expanded
  assert.deepEqual(keys(w), ['1', '1:3', '1:2', '1:1', '1:0', '2', '2:0', '2:1', '2:2', '2:3', '3']);
  assert.deepEqual(w.flat().map((f) => f.depth), [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0]);
  const c = w.sig('c');
  for (const it of w.flat().filter((f) => f.bit)) {
    const bus = it.row.sig, wave = w.itemWave(it);
    // the bit's wave: a change only where the bit changes, the bus's own bit at every time
    for (let i = 1; i < wave.t.length; i++) assert.notEqual(V.toBin(wave.v[i]), V.toBin(wave.v[i - 1]));
    for (let t = 0; t <= 95000; t += 2500) {
      const bits = V.toBin(w.sim.valueAt(bus, t)), want = bits[bits.length - 1 - it.bit.pos];
      assert.equal(V.toBin(w.valueOf(it, t)), want, `${it.key} at ${t}`);
      const k = wave.t.findLastIndex((x) => x <= t);
      assert.equal(V.toBin(wave.v[k]), want, `${it.key}'s wave at ${t}`);
    }
    assert.deepEqual(w.itemType(it), { kind: 'logic', w: 1, s: false });
    assert.equal(w.itemRadix(it), 'bin');
  }
  // c[0] toggles every 10 ns: 10 changes in 95 ns, after its first value
  assert.equal(w.itemWave(w.flat().find((f) => f.key === '1:0')).t.length, 10);
  // the cache: the same wave while the simulation has not moved, a longer one after it ran on, a new one after a restart
  const b0 = w.flat().find((f) => f.key === '1:0'), wave = w.itemWave(b0);
  assert.equal(w.itemWave(b0), wave);
  w.sim.run(125000);
  assert.equal(w.itemWave(b0).t.length, 13);
  w.clearBits();
  assert.notEqual(w.itemWave(b0), wave);
  assert.equal(w.itemType(w.flat()[0]), c.t);
  // a selection on a bit dropped when its bus collapses
  w.st.sel = new Set(['1:2', '2']);
  rc.expanded = false; w.rebuildFlat();
  assert.deepEqual([...w.st.sel], ['2']);
});

test('#405 ISim rows: groups and dividers, Delete, the radix and the rows\' menu', () => {
  const w = windowOf();
  globalThis.prompt = () => 'G1';
  w.addSignals([w.sig('c'), w.sig('d'), w.sig('e')]);
  // New Group of d and e: the group where d was, its members after it
  w.st.sel = new Set(['2', '3']);
  assert.deepEqual(labels(w.waveRowMenu()), ['Radix', 'Expand Bus', '-', 'Force Constant... (disabled)', 'Force Clock... (disabled)', 'Remove Force (disabled)',
    '-', 'New Divider', 'Rename Divider... (disabled)', 'New Group', 'Rename Group... (disabled)', 'Ungroup (disabled)', 'Go To Source Code (disabled)', '-', 'Delete']);
  w.waveRowMenu().find((it) => it.label === 'New Group').action();
  assert.deepEqual(w.st.rows.map((r) => r.name), ['c', 'G1', 'd', 'e']);
  assert.deepEqual(w.flat().map((f) => f.depth), [0, 0, 1, 1]);
  assert.deepEqual([...w.st.sel], ['4']);
  // closed, its signals hidden
  w.st.rows[1].expanded = false; w.rebuildFlat();
  assert.deepEqual(keys(w), ['1', '4']);
  w.st.rows[1].expanded = true; w.rebuildFlat();
  // a divider before the selected group, renamed
  globalThis.prompt = () => 'Outputs';
  w.waveRowMenu().find((it) => it.label === 'New Divider').action();
  assert.deepEqual(w.st.rows.map((r) => r.name), ['c', 'Outputs', 'G1', 'd', 'e']);
  // the radix of c, the only signal selected; its menu: c forced
  w.st.sel = new Set(['1']);
  const radix = w.radixItems();
  assert.deepEqual(radix.map((it) => it.label), ['Default', 'Binary', 'Hexadecimal', 'Octal', 'Decimal (Unsigned)',
    "Decimal (Two's Complement)", "Decimal (One's Complement)", 'ASCII']);
  assert.equal(radix[0].checked, true);
  radix[2].action();
  assert.equal(w.st.rows[0].radix, 'hex');
  assert.equal(w.radixItems()[2].checked, true);
  const menu = w.waveRowMenu();
  assert.deepEqual(labels(menu).slice(3, 6), ['Force Constant...', 'Force Clock...', 'Remove Force']);
  menu.find((it) => it.label === 'Force Clock...').action();
  menu.find((it) => it.label === 'Remove Force').action();
  assert.deepEqual(w.seen.splice(0).filter((s) => s[0] !== 'renderObjects'), [['forceDialog', 'c', 'clock'], ['removeForces', 'c']]);
  // Ungroup: d and e back, in their place
  w.st.sel = new Set(['4']);
  w.waveRowMenu().find((it) => it.label === 'Ungroup').action();
  assert.deepEqual(w.st.rows.map((r) => r.name), ['c', 'Outputs', 'd', 'e']);
  assert.deepEqual(w.flat().map((f) => f.depth), [0, 0, 0, 0]);
  // a group deleted with its signals
  w.st.sel = new Set(['2', '3']);
  globalThis.prompt = () => '';
  w.waveRowMenu().find((it) => it.label === 'New Group').action();
  assert.equal(w.st.rows.find((r) => r.kind === 'group').name, 'New Group');
  w.removeSelectedRows();
  assert.deepEqual(w.st.rows.map((r) => r.name), ['c', 'Outputs']);
  assert.deepEqual(w.seen.splice(0), [['renderObjects']]);
  // the instance's signals, each once
  assert.deepEqual(w.instSignals(w.design.top).map((o) => o.sig.name), ['c', 'd', 'e']);
  delete globalThis.prompt;
});

test('#1519 ISim rows: the wave window as a simulation opens: a module\'s ports in their order, a test bench\'s signals', () => {
  // a module with ports (out first, then in) and internal signals: its ports only, in the port order
  const MOD = `module m(output [3:0] q, input clk, input en, output tc);
  reg [3:0] c = 0;
  wire full = &c;
  always @(posedge clk) if (en) c <= c + 1;
  assign q = c;
  assign tc = full;
endmodule
`;
  const design = elaborate(compile([{ path: 'm.v', lang: 'verilog', text: MOD }]), 'm');
  const sim = new Simulator(design);
  const st = { rows: [], rowSeq: 1, sel: new Set() };
  const w = mountRows({ st, sim, onOpenSource: () => {}, updateVScroll: () => {}, invalidate: () => {}, renderObjects: () => {},
    forceDialog: () => {}, isForced: () => false, removeForces: () => {}, openSource: () => {} });
  assert.deepEqual(w.waveSignals(design.top).map((s) => s.name), ['q', 'clk', 'en', 'tc']);
  assert.deepEqual(w.instSignals(design.top).map((o) => o.sig.name), ['q', 'clk', 'en', 'tc', 'c', 'full']);
  // no ports (a test bench): every signal of the top, as before
  const tb = windowOf();
  assert.deepEqual(tb.waveSignals(tb.design.top).map((s) => s.name), ['c', 'd', 'e']);
  // no signals at all: none
  assert.deepEqual(w.waveSignals({ ports: [], signals: [] }), []);
});
