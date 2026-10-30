// Silinx HLS: a sequential function's states split by the clock (#2080): the operations chained while they fit the period
// less its uncertainty, the values crossing a cycle in registers, the C's registers written in the chain's last state;
// the latency follows the clock, the results stay the C's (co-simulated), the warnings none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkC } from '../core/c-check.js';
import { scheduled } from '../core/c-schedule.js';
import { nodeDelay, UNCERTAINTY } from '../core/c-timing.js';
import { cToHdl } from '../core/c-hdl.js';
import { cAsm } from '../core/c-asm.js';
import { cosimulate } from '../core/c-cosim.js';

const chain = (n) => `int f(int a, int b) {\n  int s = a;\n${'  s = s + b;\n'.repeat(n)}  return s;\n}\n`;
const tb = (n) => `${chain(n)}int main() {\n  int e = 0;\n  for (int i = 0; i < 6; i++) if (f(i, 3 * i - 7) != i + ${n} * (3 * i - 7)) e++;\n  return e;\n}\n`;
const machine = (src, clock, family) => scheduled(checkC(src, 't.c', { top: 'f', synthesis: true }), {}, { clock, family });

test('#2080 a chain of additions: its latency follows the clock (an addition 2.08 ns; 3 fit 10 ns, 7 fit 20 ns, 1 fits 5 ns), the C\'s results, no warnings', () => {
  // [additions, clock, cycles]; 3 at 10 ns and 4 at 20 ns fit one path: combinational
  for (const [n, clock, cycles] of [[3, 5, 3], [4, 5, 4], [8, 5, 8], [4, 10, 2], [8, 10, 3], [12, 10, 4], [8, 20, 2], [12, 20, 2]]) {
    for (const lang of ['vhdl', 'verilog']) {
      const g = cToHdl(chain(n), { file: 'f.c', lang, clock });
      assert.deepEqual([g.ok, g.sequential, g.states, g.diagnostics], [true, true, cycles + 2, []], `${n} at ${clock} ns, ${lang}`);
      const c = cosimulate(tb(n), { file: 'f.c', lang, clock });
      assert.deepEqual([c.pass, c.latency.min, c.latency.max, c.gen.diagnostics], [true, cycles, cycles, []], `${n} at ${clock} ns, ${lang}`);
    }
  }
  for (const [n, clock] of [[3, 10], [4, 20]]) assert.equal(cToHdl(chain(n), { file: 'f.c', clock }).sequential, false);
});

test('#2080 each state of a chain fits the period: the longest path of what it computes, from the registers', () => {
  const m = machine(chain(12), 10);
  const g = m.graph, budget = 10 * (1 - UNCERTAINTY);
  assert.equal(m.states.length, 4);
  for (const st of m.states) {
    const at = new Map();
    for (const n of g.needed([st.next, ...st.updates.values()])) {
      at.set(n.id, n.args.reduce((t, a) => Math.max(t, at.get(a) ?? 0), 0) + nodeDelay(g, n));
      assert.ok(at.get(n.id) <= budget, `state ${st.id}: ${at.get(n.id)} ns`);
    }
  }
});

test('#2080 the C\'s registers written in the chain\'s last state only; the states before it write the registers crossing it', () => {
  const m = machine(chain(12), 10);
  const c = m.states.filter((st) => st.updates.has('s'));
  assert.deepEqual(c.length, 1);
  assert.equal(c[0].id, m.subStates.get(m.entry).at(-1));
  for (const st of m.states.filter((x) => x !== c[0])) assert.ok([...st.updates.keys()].every((r) => /^s\d+_c\d+_\d+$/.test(r)), [...st.updates.keys()].join());
});

test('#2080 a 64 x 64 multiplication longer than the period: 18 x 18 ones over cycles, each state within the period', () => {
  const src = 'long long f(long long a, long long b) {\n  return a * b + a;\n}\nint main() { return f(3, 4) == 15 ? 0 : 1; }\n';
  for (const lang of ['vhdl', 'verilog']) {
    const c = cosimulate(src, { file: 't.c', top: 'f', lang });
    assert.deepEqual([c.pass, c.latency.max, c.gen.diagnostics], [true, 6, []], lang);
  }
  const m = machine(src, 10), g = m.graph, budget = 10 * (1 - UNCERTAINTY);
  const muls = m.states.flatMap((st) => g.needed([st.next, ...st.updates.values()]).filter((n) => n.op === 'mul'));
  assert.ok(muls.length >= 10 && muls.every((n) => n.w === 36), muls.map((n) => n.w).join());
  for (const st of m.states) {
    const at = new Map();
    for (const n of g.needed([st.next, ...st.updates.values()])) {
      at.set(n.id, n.args.reduce((t, a) => Math.max(t, at.get(a) ?? 0), 0) + nodeDelay(g, n));
      assert.ok(at.get(n.id) <= budget, `state ${st.id}: ${at.get(n.id)} ns`);
    }
  }
});

test('#2080 the state\'s register wide enough for the states added (from 1 state: 4 bits for 2^3 and more states)', () => {
  const m = machine(chain(30), 5);
  assert.equal(m.states.length, 30);
  assert.equal(m.stateT.w, (m.done + 29).toString(2).length);
  assert.ok(Math.max(...m.states.map((st) => st.id)) < 2 ** m.stateT.w);
});

test('#2080 a pipelined loop\'s state is not split: its II stays; a family\'s delays change the schedule', () => {
  const piped = 'int f(int x) {\n  int s = 0;\n  for (int i = 0; i < 100; i++) {\n#pragma HLS PIPELINE II=1\n    s += x * i + x + i + 1;\n  }\n  return s;\n}\n';
  const m = machine(piped, 10);
  assert.deepEqual(m.loops.map((l) => [l.pipeline, l.ii]), [[1, 1]]);
  assert.equal(m.subStates.size, 0);
  // (an addition: 2.08 ns on an Artix-7, 4.06 ns on a Spartan-3E)
  assert.equal(machine(chain(8), 10, 'artix7').states.length, 3);
  assert.equal(machine(chain(8), 10, 'spartan3e').states.length, 8);
});

// a static memory read, a long computation of its value, written back; a memory argument read and written in a loop
const MEM = `int acc(int i, int a, int b) {
  static int t[100];
  t[i] = t[i] * a + a * b + b + a + b + a;
  return t[i] + t[(i + 1) % 100] * b;
}
int ext(int x[64], int y[64], int k) {
  int s = 0;
  for (int j = 0; j < 50; j++) {
#pragma HLS PIPELINE off
    y[j] = x[j] * k + x[(j + 3) & 63] * (k + 1) + s;
    s += y[j] & 255;
  }
  return s;
}
`;
const MEM_TB = { acc: `int main() {\n  int r = 0;\n  for (int c = 0; c < 30; c++) r += acc((c * 7) % 100, c - 11, 3 * c + 1);\n  return r == 0;\n}\n`,
  ext: `int main() {\n  int x[64], y[64];\n  for (int i = 0; i < 64; i++) x[i] = i * 37 - 1000;\n  int r = ext(x, y, -7);\n  for (int i = 0; i < 50; i++) r ^= y[i];\n  return r == 0;\n}\n` };

test('#2080 a state that accesses a memory split: the access in the chain\'s last state, its value read before held; co-simulated at 5, 10 and 20 ns', () => {
  // [top, clock, cycles]
  for (const [top, clock, cycles] of [['acc', 5, 23], ['acc', 10, 12], ['acc', 20, 7], ['ext', 5, 603], ['ext', 10, 453], ['ext', 20, 403]]) {
    for (const lang of ['vhdl', 'verilog']) {
      const c = cosimulate(MEM + MEM_TB[top], { file: 't.c', top, lang, clock });
      assert.deepEqual([c.pass, c.latency.max, c.gen.diagnostics], [true, cycles, []], `${top} at ${clock} ns, ${lang}`);
    }
  }
  const m = scheduled(checkC(MEM, 't.c', { top: 'acc', synthesis: true }), {}, { clock: 10 });
  const g = m.graph, budget = 10 * (1 - UNCERTAINTY);
  assert.ok(m.subStates.size > 0);
  for (const [first, rest] of m.subStates) {
    const chain = [first, ...rest].map((id) => m.states.find((st) => st.id === id));
    // (no access but in the last state of a chain)
    assert.ok(chain.slice(0, -1).every((st) => !st.access.size), `chain ${first}`);
  }
  for (const st of m.states) {
    const roots = [st.next, ...st.updates.values(), ...[...st.access.values()].flatMap((a) => [a.addr, a.ce, a.we, a.d].filter((x) => x != null))];
    const at = new Map();
    for (const n of g.needed(roots)) {
      at.set(n.id, n.args.reduce((t, a) => Math.max(t, at.get(a) ?? 0), 0) + nodeDelay(g, n));
      assert.ok(at.get(n.id) <= budget, `state ${st.id}: ${at.get(n.id)} ns`);
    }
  }
});

test('#2080 the ASM chart: a state split its chain, the register transfers in its last; the same states as the module', () => {
  const src = 'int f(int a, int b) {\n  static int k = 0;\n  k = k + a + b + a + b + a + b + a + b;\n  return k;\n}\n';
  const r = cAsm(src, { file: 't.c', top: 'f', clock: 10 });
  assert.deepEqual(r.diagnostics, []);
  const boxes = r.model.nodes.filter((n) => n.type === 'state').map((n) => n.name);
  const g = cToHdl(src, { file: 't.c', top: 'f', clock: 10 });
  assert.equal(boxes.length, g.states);
  assert.ok(boxes.length > 3, boxes.join());
  const acting = r.model.nodes.filter((n) => n.type === 'state' && n.actions.length && !['IDLE', 'DONE'].includes(n.name));
  const first = r.model.nodes.find((n) => n.name === 'S1');
  assert.deepEqual(first.actions, []);
  assert.equal(acting.length, 1);
});
