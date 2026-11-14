// core/hier-order.js (#3819): the hierarchy's names in natural order (the digit runs by their value, the rest
// case-insensitively, ties kept in their order), checked against a reference of its own; the roots of a view's
// hierarchy, the Implementation view's top first; a module's instances by their names, then their modules'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { naturalCompare, hierarchyOrder, hierarchyRoots, instanceOrder } from '../core/hier-order.js';
import { compile } from '../core/compile.js';

const sorted = names => [...names].sort(naturalCompare);

// the reference: the name cut into its digit runs and the rest; a digit run compared by its value (its length without
// the leading zeros, then its digits), the rest by its lower case; a digit run before a letter
function reference(a, b) {
  const parts = s => String(s).toLowerCase().match(/\d+|\D+/g) || [];
  const pa = parts(a), pb = parts(b);
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i], dx = /^\d/.test(x), dy = /^\d/.test(y);
    if (dx && dy) {
      const vx = x.replace(/^0+/, ''), vy = y.replace(/^0+/, '');
      if (vx.length !== vy.length) return vx.length - vy.length;
      if (vx !== vy) return vx < vy ? -1 : 1;
    } else if (dx !== dy) {
      return dx ? -1 : 1;
    } else if (x !== y) {
      // (a prefix first; else the first character that differs, letters and digits after the underscore)
      for (let k = 0; k < Math.min(x.length, y.length); k++) if (x[k] !== y[k]) return rank(x[k]) - rank(y[k]);
      return x.length - y.length;
    }
  }
  return pa.length - pb.length;
}
const rank = c => (c === '_' ? -1 : c.charCodeAt(0));

test('#3819 natural order: the numbers by their value, the issue\'s names', () => {
  assert.deepEqual(sorted(['access_next_state_1', 'access_next_state_10', 'access_next_state_11', 'access_next_state_2', 'access_next_state_3']),
    ['access_next_state_1', 'access_next_state_2', 'access_next_state_3', 'access_next_state_10', 'access_next_state_11']);
  assert.deepEqual(sorted(['x_10', 'x_2', 'x_1', 'x_100', 'x_9']), ['x_1', 'x_2', 'x_9', 'x_10', 'x_100']);
  // several numbers in a name: each by its value
  assert.deepEqual(sorted(['a2b10', 'a10b1', 'a2b9', 'a2b1']), ['a2b1', 'a2b9', 'a2b10', 'a10b1']);
  // a number past 2^53 compared exactly
  assert.deepEqual(sorted(['n_90071992547409930', 'n_90071992547409929', 'n_9']), ['n_9', 'n_90071992547409929', 'n_90071992547409930']);
});

test('#3819 natural order: leading zeros, case, names without digits, equal prefixes; ties keep their order', () => {
  // leading zeros: by the value; the same value a tie (in the given order)
  assert.deepEqual(sorted(['x_010', 'x_02', 'x_1']), ['x_1', 'x_02', 'x_010']);
  assert.deepEqual(sorted(['x_01', 'x_1', 'x_001']), ['x_01', 'x_1', 'x_001']);
  assert.deepEqual(sorted(['x_1', 'x_01']), ['x_1', 'x_01']);
  // case: not counted, as before (#3819 keeps it); the same name in another case a tie
  assert.deepEqual(sorted(['Beta', 'alpha', 'GAMMA', 'delta']), ['alpha', 'Beta', 'delta', 'GAMMA']);
  assert.deepEqual(sorted(['X_10', 'x_2', 'X_1']), ['X_1', 'x_2', 'X_10']);
  assert.deepEqual(sorted(['Top', 'top', 'TOP']), ['Top', 'top', 'TOP']);
  assert.deepEqual(sorted(['TOP', 'top']), ['TOP', 'top']);
  // no digits: alphabetical, as localeCompare
  const words = ['traffic', 'timer', 'lamps', 'sevenseg', 'top', 'tb_top', 'knight', 'bcd_counter'];
  assert.deepEqual(sorted(words), [...words].sort((a, b) => a.localeCompare(b)));
  // equal prefixes: the shorter first; a number after the prefix by its value
  assert.deepEqual(sorted(['counter_2', 'counter', 'counter_10', 'counter_', 'counters']), ['counter', 'counter_', 'counter_2', 'counter_10', 'counters']);
  assert.equal(naturalCompare('x', 'x'), 0);
  assert.equal(naturalCompare('', 'a') < 0, true);
  assert.equal(naturalCompare(undefined, ''), 0);
});

test('#3819 natural order: the same as the reference on generated names', () => {
  let seed = 3819;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  const piece = () => ['x', 'X', 'u', 'state', 'next_', '_', '0', '00', '1', '2', '9', '10', '011', '100'][rnd(14)];
  const names = Array.from({ length: 400 }, () => Array.from({ length: 1 + rnd(4) }, piece).join(''));
  const sign = v => Math.sign(v);
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j += 7) assert.equal(sign(naturalCompare(names[i], names[j])), sign(reference(names[i], names[j])), `${names[i]} / ${names[j]}`);
  }
});

test('#3819 hierarchyOrder: the top first (any case), then natural order; a copy', () => {
  const names = ['x_10', 'top', 'x_2', 'x_1'];
  assert.deepEqual(hierarchyOrder(names, 'TOP'), ['top', 'x_1', 'x_2', 'x_10']);
  assert.deepEqual(hierarchyOrder(names, 'x_10'), ['x_10', 'top', 'x_1', 'x_2']);
  assert.deepEqual(hierarchyOrder(names), ['top', 'x_1', 'x_2', 'x_10']);
  assert.deepEqual(hierarchyOrder(names, 'nothere'), ['top', 'x_1', 'x_2', 'x_10']);
  assert.deepEqual(names, ['x_10', 'top', 'x_2', 'x_1'], 'not sorted in place');
});

test('#3819 hierarchyRoots: the Implementation view\'s top first, the Simulation view\'s in natural order', () => {
  const leaf = n => `module ${n}(input a, output y); assign y = a; endmodule\n`;
  const lib = compile([
    { path: 'src/x.v', lang: 'verilog', text: ['x_10', 'x_2', 'x_1', 'leaf'].map(leaf).join('') },
    { path: 'src/top.v', lang: 'verilog', text: 'module top(input a, output y); wire w; leaf u_2(.a(a), .y(w)); leaf u_10(.a(w), .y(y)); endmodule\n' },
    { path: 'sim/tb.v', lang: 'verilog', text: 'module tb_top; reg a; wire y; top uut(.a(a), .y(y)); endmodule\n' },
  ]);
  const design = n => n !== 'tb_top';
  assert.deepEqual(hierarchyRoots(lib, { top: 'top', visible: design }), ['top', 'x_1', 'x_2', 'x_10']);
  assert.deepEqual(hierarchyRoots(lib, { top: 'x_10', visible: design }), ['x_10', 'top', 'x_1', 'x_2']);
  assert.deepEqual(hierarchyRoots(lib, { sim: true, top: 'top' }), ['tb_top', 'x_1', 'x_2', 'x_10']);
  assert.deepEqual(hierarchyRoots(compile([])), []);
});

test('#3819 instanceOrder: by the instances\' names in natural order, then their modules\'; a copy', () => {
  const kids = [{ name: 'u_10', module: 'x_10' }, { name: 'u_2', module: 'x_2' }, { name: 'u_1', module: 'x_1' }];
  assert.deepEqual(instanceOrder(kids).map(k => k.name), ['u_1', 'u_2', 'u_10']);
  assert.deepEqual(kids.map(k => k.name), ['u_10', 'u_2', 'u_1'], 'not sorted in place');
  // the examples' traffic: u_display, u_fsm, u_lamps, u_timer (not their source's order)
  assert.deepEqual(instanceOrder(['u_fsm', 'u_timer', 'u_lamps', 'u_display'].map(name => ({ name, module: 'm' }))).map(k => k.name), ['u_display', 'u_fsm', 'u_lamps', 'u_timer']);
  // the same name (another case, in two generate branches): by the module, natural; then kept
  assert.deepEqual(instanceOrder([{ name: 'g.U', module: 'm_10' }, { name: 'g.u', module: 'm_2' }, { name: 'G.u', module: 'M_2' }]).map(k => `${k.name} ${k.module}`),
    ['g.u m_2', 'G.u M_2', 'g.U m_10']);
  // generate prefixes: by their numbers too
  assert.deepEqual(instanceOrder(['g[10].u', 'g[2].u', 'g[1].u', 'u'].map(name => ({ name, module: 'm' }))).map(k => k.name), ['g[1].u', 'g[2].u', 'g[10].u', 'u']);
  assert.deepEqual(instanceOrder([]), []);
});
