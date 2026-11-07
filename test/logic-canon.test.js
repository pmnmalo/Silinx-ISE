// Unit tests (#3072): the cost of an output in its canonical forms (core/logic-canon.js canonicalCost): its terms, its
// literals and its gates (AND, OR, NOT and their inputs), counted as the minimal forms are; checked against the
// canonical expressions themselves (core/logic.js canonicalAsts), counted node by node, on every table of 1 to 3 inputs
// and on random ones of 4 to 6; the constants; a canonical form that is its minimal one costs what the minimal costs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCost } from '../core/logic-canon.js';
import { canonicalAsts, analyzeOutput, normalizeTable, newTable, gateCount } from '../core/logic.js';

const VARS = ['a', 'b', 'c', 'd', 'e', 'g'];
/** The reference: an expression's terms, literals and gates, read from its nodes (a two-level sum or product). */
function counted(ast, form) {
  const inner = form === 'sop' ? 'and' : 'or', outer = form === 'sop' ? 'or' : 'and';
  if (ast.t === 'const') return { terms: 0, literals: 0, gates: { and: 0, or: 0, not: 0, inputs: 0, literals: 0 } };
  const terms = ast.t === outer ? ast.args : [ast];
  const lits = t => (t.t === inner ? t.args : [t]);
  const negs = new Set(terms.flatMap(t => lits(t).filter(l => l.t === 'not').map(l => l.a.name)));
  const multi = terms.filter(t => t.t === inner);
  const literals = terms.reduce((s, t) => s + lits(t).length, 0);
  const g = { and: 0, or: 0, not: negs.size, inputs: multi.reduce((s, t) => s + t.args.length, 0) + (terms.length > 1 ? terms.length : 0), literals };
  g[inner] = multi.length;
  g[outer] = terms.length > 1 ? 1 : 0;
  return { terms: terms.length, literals, gates: g };
}
const check = (col, n) => {
  const a = canonicalAsts(col, VARS.slice(0, n)), c = canonicalCost(col, n);
  assert.deepEqual(c.sop, counted(a.sop, 'sop'), `SOP of ${col}`);
  assert.deepEqual(c.pos, counted(a.pos, 'pos'), `POS of ${col}`);
};

test('canonicalCost: every table of 1 to 3 inputs (0, 1, X) as its canonical expressions count', () => {
  for (let n = 1; n <= 3; n++) {
    const rows = 2 ** n;
    for (let k = 0; k < 3 ** rows; k++) {
      let col = '', x = k;
      for (let r = 0; r < rows; r++) { col += '01X'[x % 3]; x = Math.floor(x / 3); }
      check(col, n);
    }
  }
});

test('canonicalCost: random tables of 4 to 6 inputs', () => {
  let seed = 3072;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let n = 4; n <= 6; n++) for (let i = 0; i < 40; i++) check(Array.from({ length: 2 ** n }, () => '01X'[Math.floor(rnd() * 3)]).join(''), n);
});

test('canonicalCost: the examples of the editor; the constants; one row', () => {
  // f = Σm(1, 2, 4, 7): 4 terms of 3 literals, 4 AND, 1 OR, 3 NOT, 16 gate inputs; ΠM(0, 3, 5, 6) the same with OR / AND
  assert.deepEqual(canonicalCost('01101001', 3), {
    sop: { terms: 4, literals: 12, gates: { and: 4, or: 1, not: 3, inputs: 16, literals: 12 } },
    pos: { terms: 4, literals: 12, gates: { and: 1, or: 4, not: 3, inputs: 16, literals: 12 } },
  });
  // Σm(1, 2, 3, 4, 6, 7) + d(5); ΠM(0) · D(5): one maxterm, a + b + c, one OR gate, no NOT
  assert.deepEqual(canonicalCost('01111X11', 3).pos, { terms: 1, literals: 3, gates: { and: 0, or: 1, not: 0, inputs: 3, literals: 3 } });
  assert.equal(canonicalCost('01111X11', 3).sop.gates.not, 3);
  // no minterm: SOP the constant 0, nothing counted; no maxterm: POS the constant 1
  const zero = { terms: 0, literals: 0, gates: { and: 0, or: 0, not: 0, inputs: 0, literals: 0 } };
  assert.deepEqual(canonicalCost('0000', 2).sop, zero);
  assert.deepEqual(canonicalCost('1X11', 2).pos, zero);
  assert.deepEqual(canonicalCost('XXXX', 2), { sop: zero, pos: zero });
  // one input: f = a, no gate; f = /a, one NOT
  assert.deepEqual(canonicalCost('01', 1).sop, { terms: 1, literals: 1, gates: { and: 0, or: 0, not: 0, inputs: 0, literals: 1 } });
  assert.deepEqual(canonicalCost('10', 1).sop.gates.not, 1);
});

test('canonicalCost: a canonical form that is the minimal one (parity) costs what the minimal form costs', () => {
  for (const n of [2, 3, 4]) {
    const col = Array.from({ length: 2 ** n }, (_, r) => String(r.toString(2).split('').filter(b => b === '1').length % 2)).join('');
    const A = analyzeOutput(normalizeTable({ ...newTable('p', VARS.slice(0, n), ['f']), table: { f: col } }), 'f');
    const c = canonicalCost(col, n);
    assert.deepEqual([c.sop.terms, c.sop.literals, c.sop.gates], [A.sop.terms.length, A.sop.literals, gateCount(A.sop)], `SOP, ${n} inputs`);
    assert.deepEqual([c.pos.terms, c.pos.literals, c.pos.gates], [A.pos.terms.length, A.pos.literals, gateCount(A.pos)], `POS, ${n} inputs`);
  }
});
