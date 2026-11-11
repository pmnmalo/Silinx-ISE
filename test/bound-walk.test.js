// core/bound-walk.js (#2577): the walk through a bound tree, with a stack of its own: the same nodes in the same
// order as a recursive walk (the reference here), the keys it does not enter, a false return skipping a node's
// nodes, and a tree 100 000 levels deep; elaborate.js re-exports it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walk } from '../core/bound-walk.js';
import * as E from '../core/elaborate.js';
import { compile, elaborate } from '../core/compile.js';

const SKIP = ['sig', 't', 'fn', 'val', 'loc', 'triggers'];
function reference(n, f) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { for (const x of n) reference(x, f); return; }
  if (f(n) === false) return;
  for (const key in n) if (!SKIP.includes(key) && n[key] && typeof n[key] === 'object') reference(n[key], f);
}
const order = (w, n, f = () => {}) => { const seen = []; w(n, x => { seen.push(x); return f(x); }); return seen; };

test('#2577 walk: the nodes of a bound design in the order of a recursive walk', () => {
  const lib = compile([{ path: 't.v', text: `module t(input clk, input [3:0] a, output reg [3:0] y);
  always @(posedge clk) begin
    if (a == 0) y <= 1; else if (a == 1) y <= {a[1:0], 2'b10}; else begin case (a) 2: y <= a + 1; default: y <= ~a; endcase end
  end
endmodule` }]);
  const d = elaborate(lib, 't');
  const bodies = d.procs.map(p => p.body);
  const ours = order(walk, bodies), ref = order(reference, bodies);
  assert.ok(ref.length > 20);
  assert.equal(ours.length, ref.length);
  assert.ok(ours.every((x, k) => x === ref[k]));
  // (a false return: the if's nodes skipped)
  const skip = x => x.k !== 'if';
  assert.deepEqual(order(walk, bodies, skip).map(x => x.k), order(reference, bodies, skip).map(x => x.k));
});

test('#2577 walk: not into a signal, a type, a function, a value, a location or triggers; arrays and nulls', () => {
  const inner = { k: 'c' };
  const n = { k: 'x', sig: { k: 'no' }, t: { k: 'no' }, fn: { k: 'no' }, val: { k: 'no' }, loc: { k: 'no' }, triggers: [{ k: 'no' }], a: [null, inner, 3, [{ k: 'deep' }]], b: 'str' };
  assert.deepEqual(order(walk, n).map(x => x.k), ['x', 'c', 'deep']);
  assert.deepEqual(order(walk, null), []);
  assert.deepEqual(order(walk, [n, n]).map(x => x.k), ['x', 'c', 'deep', 'x', 'c', 'deep']);
});

test('#2577 walk: a tree 100 000 levels deep (an elsif chain\'s depth), which a recursive walk overflows on', () => {
  let n = null;
  for (let i = 0; i < 100000; i++) n = { k: 'if', c: { k: 'c', i }, then: null, else: n };
  assert.throws(() => order(reference, n), RangeError);
  const seen = order(walk, n);
  assert.equal(seen.length, 200000);
  assert.deepEqual(seen.slice(0, 4).map(x => x.k), ['if', 'c', 'if', 'c']);
  assert.equal(seen[1].i, 99999);
});

test('#2577 elaborate.js exports walk as before (the same function)', () => {
  assert.equal(E.walk, walk);
});
