// Silinx HLS: the dataflow graph's walks (#3595, core/c-graph.js): postorder and bottomUp follow a chain with a stack of
// their own, in the order a call per node took (checked against that recursion on random graphs), so a function of a few
// thousand statements updating one variable (a chain of that many nodes) is made, not refused as nesting too deep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Graph, postorder, bottomUp } from '../core/c-graph.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { simulateC } from '../core/c-interp.js';

const LANGS = ['vhdl', 'verilog'];

// (the reference: the recursion the walks replaced, one call per node)
function postorderRec(roots, argsOf) {
  const seen = new Set(), out = [];
  const visit = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const a of argsOf(id)) visit(a);
    out.push(id);
  };
  for (const r of roots) visit(r);
  return out;
}
// (a random DAG: each node's args among the nodes before it, repeated args too)
function randomDag(n, seed) {
  let s = seed;
  const rnd = (k) => { s = (s * 1103515245 + 12345) % 2147483648; return s % k; };
  const args = [];
  for (let id = 0; id < n; id++) args.push(id ? Array.from({ length: rnd(4) }, () => rnd(id)) : []);
  return args;
}

test('#3595 postorder: the order of the recursion on random graphs, each node once, after its args', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const args = randomDag(40, seed), roots = [39, 20, 39, 5];
    const out = postorder(roots, (id) => args[id]);
    assert.deepEqual(out, postorderRec(roots, (id) => args[id]), `seed ${seed}`);
    const at = new Map(out.map((id, k) => [id, k]));
    for (const id of out) for (const a of args[id]) assert.ok(at.get(a) < at.get(id));
  }
  // (seen: the ids walked already left out, and not walked through)
  assert.deepEqual(postorder([2], (id) => [[], [0], [1]][id], new Set([1])), [2]);
  assert.deepEqual(postorder([], () => []), []);
});

test('#3595 bottomUp: a memoized pass called in the same order as on the roots alone, its results the same', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const args = randomDag(40, seed), roots = [39, 10, 39];
    const run = (warm) => {
      const memo = new Map(), calls = [];
      const f = (id) => {
        if (memo.has(id)) return memo.get(id);
        const r = args[id].reduce((x, a) => x + f(a), 1);
        calls.push(id);
        memo.set(id, r);
        return r;
      };
      return { out: warm ? bottomUp(roots, (id) => args[id], f, (id) => memo.has(id)) : roots.map(f), calls };
    };
    assert.deepEqual(run(true), run(false), `seed ${seed}`);
  }
});

test('#3595 Graph.needed on a chain of 100 000 nodes: each after its operands', () => {
  const g = new Graph();
  let x = g.add('in', [], { w: 16, s: false }, { port: { key: 'x', name: 'x' } });
  const one = g.const(1, { w: 16, s: false }), y = g.add('in', [], { w: 16, s: false }, { port: { key: 'y', name: 'y' } });
  for (let k = 0; k < 100000; k++) x = g.add(k % 2 ? 'xor' : 'add', [x, k % 2 ? y : one], { w: 16, s: false });
  const nodes = g.needed([x]);
  assert.equal(nodes.length, 100003);
  // (x, 1, x + 1, y, (x + 1) ^ y, …: the order of the recursion)
  assert.deepEqual(nodes.slice(0, 5).map((n) => n.id), [0, 1, 3, 2, 4]);
  const at = new Map(nodes.map((n, k) => [n.id, k]));
  assert.ok(nodes.every((n) => n.args.every((a) => at.get(a) < at.get(n.id))));
  assert.equal(nodes.at(-1).id, x);
});

// (the function, its test bench: top's results for a few inputs against a reference computed here)
function chain(n, line, params, ret, ref) {
  const ins = [[0, 0], [1, 2], [77, 5], [-3, 1000], [65535, -9]].map((v) => v.slice(0, params.length));
  const body = Array.from({ length: n }, () => `  ${line}`).join('\n');
  const tb = ins.map((v) => `top(${v.join(', ')}) != ${ref(...v)}`).join(' || ');
  return `int top(${params.map((p) => `int ${p}`).join(', ')}) {\n${body}\n  return ${ret};\n}\nint main() { return ${tb} ? 1 : 0; }\n`;
}
const i32 = (v) => v | 0;
const CASES = [
  // (#3595's case: 3000 times; on main a RangeError, then "nests too deep")
  ['x = (x ^ (x << 1)) & 0xffff;', ['x'], 'x', (x) => { for (let k = 0; k < 3000; k++) x = (x ^ i32(x << 1)) & 0xffff; return x; }],
  // (a chain of additions: the sums' balancing)
  ['x = x + 1;', ['x'], 'x', (x) => i32(x + 3000)],
  ['y = x - y;', ['x', 'y'], 'y', (x, y) => { for (let k = 0; k < 3000; k++) y = i32(x - y); return y; }],
];

for (const [line, params, ret, ref] of CASES) {
  test(`#3595 3000 statements '${line}': made and co-simulated in VHDL and Verilog, no warnings, in under a minute each`, () => {
    const src = chain(3000, line, params, ret, ref);
    const s = simulateC(src, { file: 't.c' });
    assert.deepEqual([s.ok, s.exitCode, s.diagnostics], [true, 0, []]);
    for (const lang of LANGS) {
      const t0 = Date.now();
      const c = cosimulate(src, { file: 't.c', top: 'top', lang });
      assert.deepEqual([c.ok, c.pass, c.mismatches, c.errors, c.gen.diagnostics], [true, true, [], [], []], lang);
      assert.ok(Date.now() - t0 < 60000, `${lang}: ${Date.now() - t0} ms`);
    }
  });
}

test('#3595 a pipelined loop of 3000 statements: its stages\' values followed with a stack of their own, made in both languages', () => {
  const body = Array.from({ length: 3000 }, () => '    x = (x ^ (x << 1)) & 0xffff;').join('\n');
  const src = `void top(int a[16], int b[16]) {\n  for (int i = 0; i < 16; i++) {\n#pragma HLS PIPELINE II=1\n    int x = a[i];\n${body}\n    b[i] = x;\n  }\n}\n`;
  for (const lang of LANGS) {
    const g = cToHdl(src, { file: 't.c', top: 'top', lang });
    assert.deepEqual([g.ok, g.sequential, g.diagnostics], [true, true, []], lang);
  }
});
