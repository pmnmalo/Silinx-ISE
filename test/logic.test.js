// core/logic.js: Boolean expressions, truth tables, canonical forms, Quine–McCluskey minimisation
// (checked against a brute-force exact cover), Karnaugh map groups, and the circuits of a truth
// table (VHDL / Verilog module, gate schematic) simulated back to the same table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseExpr, formatExpr, exprVars, exprColumn, canonical, canonicalAsts, minimize, minimalAst, gateCount, primeImplicants,
  cubeMinterms, kmapLayout, kmapRects, KMAP_ORDERS, gray, newTable, normalizeTable, validateTable, reshapeTable, analyzeOutput,
  generateTableHdl, dontCaresInHdl, truthTableFromModule, schematicFromTable, schematicErrors, LogicError,
  minimizeXor, exprCost, MAX_XOR_INPUTS, gateForm, outputForm, FORMS,
} from '../core/logic.js';
import { generateHdl } from '../core/schdoc.js';
import { compile, elaborate } from '../core/compile.js';

// deterministic random numbers
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const randCol = (r, n, pdc = 0.15) => Array.from({ length: 1 << n }, () => { const x = r(); return x < pdc ? 'X' : x < pdc + (1 - pdc) / 2 ? '1' : '0'; }).join('');
const V = n => 'abcdef'.slice(0, n).split('');

// ------------------------------------------------------------------ parser and formats
test('parser: operators, precedence, juxtaposition, postfix and prefix NOT', () => {
  const vars = ['a', 'b', 'c'];
  const col = s => exprColumn(parseExpr(s, { vars }), vars);
  assert.equal(col("ab'c"), col("a*~b*c"));
  assert.equal(col("ab'c"), col('a and not b and c'));
  assert.equal(col("ab'c"), '00000100');
  assert.equal(col("a·b' + c"), col("(a & !b) | c"));
  assert.equal(col('a + b c'), col('a or (b and c)'));          // AND binds tighter than OR
  assert.equal(col('a ^ b c'), col('a xor (b & c)'));           // AND binds tighter than XOR
  assert.equal(col('a + b ^ c'), col('a | (b ^ c)'));           // XOR tighter than OR
  assert.equal(col("(a+b)'"), col("~a~b"));
  assert.equal(col("a''"), col('a'));
  assert.equal(col('a(b+c)'), col('ab + ac'));
  assert.equal(col('(a+b)(a+c)'), col('a + bc'));
  assert.equal(col('a nand b'), col("(ab)'"));
  assert.equal(col('a nor b'), col("a'b'"));
  assert.equal(col('a xnor b'), col("(a^b)'"));
  assert.equal(col('1'), '11111111');
  assert.equal(col("0 + a·1"), col('a'));
  assert.equal(col("A B'"), col("ab'"));                         // case-insensitive names
  // multi-letter names: no juxtaposition splitting
  const v2 = ['x1', 'x2', 'en'];
  assert.equal(exprColumn(parseExpr("x1 x2' + en", { vars: v2 }), v2), exprColumn(parseExpr('(x1 and not x2) or en', { vars: v2 }), v2));
  assert.deepEqual(exprVars(parseExpr("q·r' + s")), ['q', 'r', 's']);
});

test('parser: clear errors with positions', () => {
  const vars = ['a', 'b'];
  const err = (s, re, pos) => {
    assert.throws(() => parseExpr(s, { vars }), (e) => { assert.ok(e instanceof LogicError, e.message); assert.match(e.message, re); if (pos) assert.equal(e.pos, pos); return true; });
  };
  err('a +', /ends too early/, 4);
  err('(a + b', /missing '\)'/, 7);
  err('a + b)', /unexpected '\)'/, 6);
  err('a + q', /unknown variable 'q'/, 5);
  err('abz', /unknown variable 'z'/, 3);
  err('a $ b', /unexpected character '\$'/, 3);
  err('a + 2', /'2' is not a constant/, 5);
  err('', /empty/);
  err('a + * b', /expected a variable, 0, 1 or \( but found '\*'/, 5);
});

test("parser: '.' is AND and '/' a prefix NOT (/a, A barrado) (#180)", () => {
  const vars = ['a', 'b', 'c'];
  const P = s => parseExpr(s, { vars });
  const col = s => exprColumn(P(s), vars);
  const A = { t: 'var', name: 'a', pos: 2 };
  const strip = e => JSON.parse(JSON.stringify(e, (k, v) => (k === 'pos' ? undefined : v)));
  const a = { t: 'var', name: 'a' }, b = { t: 'var', name: 'b' }, c = { t: 'var', name: 'c' };
  // '.': AND, with or without spaces, after a parenthesis
  assert.deepEqual(strip(P('a.b')), { t: 'and', args: [a, b] });
  assert.deepEqual(strip(P('a . b')), { t: 'and', args: [a, b] });
  assert.deepEqual(strip(P('(a+b).c')), { t: 'and', args: [{ t: 'or', args: [a, b] }, c] });
  assert.equal(col('a.b'), '00000011');
  assert.equal(col('(a+b).c'), '00010101');
  // '/': NOT of what follows
  assert.deepEqual(P('/a'), { t: 'not', a: A });
  assert.deepEqual(strip(P('/(a+b)')), { t: 'not', a: { t: 'or', args: [a, b] } });
  assert.deepEqual(strip(P('//a')), { t: 'not', a: { t: 'not', a } });
  assert.deepEqual(strip(P('a./b')), { t: 'and', args: [a, { t: 'not', a: b }] });
  assert.equal(col('/a'), '11110000');
  assert.equal(col('/(a+b)'), '11000000');
  assert.equal(col('//a'), col('a'));
  assert.equal(col('a./b'), '00001100');
  assert.equal(col('/a.b + a./b'), '00111100');          // a xor b
  assert.equal(col('/a.b + a./b'), col('a ^ b'));
  assert.equal(col('/a/b'), col("a'b'"));                 // juxtaposition: /a·/b
  // '/' is the bar over one letter: in a run of letters it negates only the next one
  assert.deepEqual(strip(P('/ab')), { t: 'and', args: [{ t: 'not', a }, b] });
  assert.equal(col('/ab'), '00110000');
  assert.equal(col('/ab'), col('/a.b'));
  assert.deepEqual(strip(P('/ab + a/b')), { t: 'or', args: [{ t: 'and', args: [{ t: 'not', a }, b] }, { t: 'and', args: [a, { t: 'not', a: b }] }] });
  assert.equal(col('/ab + a/b'), '00111100');            // a xor b
  assert.deepEqual(strip(P('/(ab)')), { t: 'not', a: { t: 'and', args: [a, b] } });
  assert.equal(col('/(ab)'), '11111100');
  assert.deepEqual(strip(P('//ab')), { t: 'and', args: [{ t: 'not', a: { t: 'not', a } }, b] });
  assert.equal(col('//ab'), '00000011');
  assert.deepEqual(strip(P("/abc'")), { t: 'and', args: [{ t: 'not', a }, b, { t: 'not', a: c }] });
  // ~ and ! still negate the whole run: ~ab = (ab)'
  assert.deepEqual(strip(P('~ab')), { t: 'not', a: { t: 'and', args: [a, b] } });
  assert.equal(col('!ab'), '11111100');
  assert.equal(col('/a.b + a./b'), col('a xor b'));
  // the other NOT forms are unchanged
  for (const s of ["a'", '~a', '!a', 'not a', '¬a']) assert.equal(col(s), '11110000', s);
  // errors: where it stops
  const err = (s, re, pos) => assert.throws(() => P(s), (e) => { assert.ok(e instanceof LogicError, e.message); assert.match(e.message, re); assert.equal(e.pos, pos); return true; });
  err('a/', /ends too early/, 3);
  err('a..b', /expected a variable, 0, 1 or \( but found '\.'/, 3);
  err('a + /', /ends too early/, 6);
  err('0.5', /'5' is not a constant/, 3);                  // no decimal numbers: '.' is AND
  err('a/+b', /expected a variable, 0, 1 or \( but found '\+'/, 3);
});

test('formats: textbook, compact, VHDL, Verilog', () => {
  const e = parseExpr("ab' + c(a+b)' + a^c", { vars: ['a', 'b', 'c'] });
  assert.equal(formatExpr(e, 'textbook'), "a·b' + c·(a + b)' + a ⊕ c");
  assert.equal(formatExpr(e, 'compact'), "ab' + c(a + b)' + a ⊕ c");
  assert.equal(formatExpr(e, 'ascii'), "a*b' + c*(a + b)' + a ^ c");
  assert.equal(formatExpr(e, 'vhdl'), '(a and not b) or (c and not (a or b)) or (a xor c)');
  assert.equal(formatExpr(e, 'verilog'), '(a & ~b) | (c & ~(a | b)) | (a ^ c)');
  assert.equal(formatExpr(parseExpr('0'), 'vhdl'), "'0'");
  assert.equal(formatExpr(parseExpr('1'), 'verilog'), "1'b1");
  // a formatted expression parses back to the same function
  const r = rng(7);
  for (let k = 0; k < 50; k++) {
    const n = 1 + Math.floor(r() * 4), vars = V(n);
    const res = minimize(randCol(r, n, 0), n, { form: r() < 0.5 ? 'sop' : 'pos' });
    const ast = minimalAst(res, vars);
    for (const N of ['textbook', 'compact', 'ascii']) assert.equal(exprColumn(parseExpr(formatExpr(ast, N), { vars }), vars), exprColumn(ast, vars), N);
  }
});

// ------------------------------------------------------------------ canonical forms and minimisation
test('canonical forms Σm / ΠM with don\'t cares', () => {
  const c = canonical('01X10X10');
  assert.deepEqual([c.ones, c.zeros, c.dcs], [[1, 3, 6], [0, 4, 7], [2, 5]]);
  assert.equal(c.sigma, 'Σm(1, 3, 6) + d(2, 5)');
  assert.equal(c.pi, 'ΠM(0, 4, 7) · D(2, 5)');
});

// a canonical form of a column, by the textbook's rule written out as text (an independent reference): a minterm's
// literal complemented where the row's bit is 0, a maxterm's where it is 1
const refCanon = (col, vars, kind) => {
  const n = vars.length, rows = [...col].map((c, r) => (c === (kind === 'sop' ? '1' : '0') ? r : -1)).filter(r => r >= 0);
  if (!rows.length) return kind === 'sop' ? '0' : '1';
  const bit = (r, j) => (r >> (n - 1 - j)) & 1;
  if (kind === 'sop') return rows.map(r => vars.map((v, j) => (bit(r, j) ? v : `${v}'`)).join('·')).join(' + ');
  const t = rows.map(r => vars.map((v, j) => (bit(r, j) ? `${v}'` : v)).join(' + '));
  return t.map(x => (vars.length > 1 && t.length > 1 ? `(${x})` : x)).join('·');
};

test('canonical SOP and POS as expressions: every input in every term, each equal to the column on every row, the don\'t cares left out (#2927)', () => {
  // a 3-input table with don't cares, in every notation
  const v3 = ['a', 'b', 'c'], c = canonicalAsts('01X10X10', v3);
  assert.deepEqual(['textbook', 'compact', 'slash', 'slash-compact', 'ascii'].map(N => [formatExpr(c.sop, N), formatExpr(c.pos, N)]), [
    ["a'·b'·c + a'·b·c + a·b·c'", "(a + b + c)·(a' + b + c)·(a' + b' + c')"],
    ["a'b'c + a'bc + abc'", "(a + b + c)(a' + b + c)(a' + b' + c')"],
    ['/a./b.c + /a.b.c + a.b./c', '(a + b + c).(/a + b + c).(/a + /b + /c)'],
    ['/a/bc + /abc + ab/c', '(a + b + c)(/a + b + c)(/a + /b + /c)'],
    ["a'*b'*c + a'*b*c + a*b*c'", "(a + b + c)*(a' + b + c)*(a' + b' + c')"],
  ]);
  assert.equal(formatExpr(c.sop, 'vhdl'), '(not a and not b and c) or (not a and b and c) or (a and b and not c)');
  assert.equal(formatExpr(c.pos, 'verilog'), '(a | b | c) & (~a | b | c) & (~a | ~b | ~c)');
  // the degenerate cases: constants, one input, one term, all don't cares
  const f = (col, vars) => { const x = canonicalAsts(col, vars); return [formatExpr(x.sop), formatExpr(x.pos)]; };
  assert.deepEqual(f('0000', ['a', 'b']), ['0', "(a + b)·(a + b')·(a' + b)·(a' + b')"]);
  assert.deepEqual(f('1111', ['a', 'b']), ["a'·b' + a'·b + a·b' + a·b", '1']);
  assert.deepEqual(f('01', ['x']), ['x', 'x']);
  assert.deepEqual(f('10', ['x']), ["x'", "x'"]);
  assert.deepEqual(f('00', ['x']), ['0', "x·x'"]);
  assert.deepEqual(f('XX', ['x']), ['0', '1']);
  assert.deepEqual(f('0100', ['a', 'b']), ["a'·b", "(a + b)·(a' + b)·(a' + b')"]);
  assert.deepEqual(f('1011', ['a', 'b']), ["a'·b' + a·b' + a·b", "a + b'"]);
  // random tables of 1 to 8 inputs: as the reference's text, equal to the column on every row but the don't cares
  // (where the SOP is 0 and the POS 1: they are left out), and read back by the parser as the same function
  const r = rng(2927);
  for (let k = 0; k < 40; k++) {
    const n = 1 + (k % 8), vars = Array.from({ length: n }, (_, j) => `x${j}`), col = randCol(r, n, k % 3 ? 0.2 : 0);
    const x = canonicalAsts(col, vars);
    assert.equal(formatExpr(x.sop), refCanon(col, vars, 'sop'), col);
    assert.equal(formatExpr(x.pos), refCanon(col, vars, 'pos'), col);
    const sop = exprColumn(x.sop, vars), pos = exprColumn(x.pos, vars);
    for (let row = 0; row < col.length; row++) {
      if (col[row] === 'X') { assert.equal(sop[row], '0'); assert.equal(pos[row], '1'); } else { assert.equal(sop[row], col[row]); assert.equal(pos[row], col[row]); }
    }
    if (n <= 4) for (const N of ['textbook', 'slash', 'ascii']) assert.equal(exprColumn(parseExpr(formatExpr(x.sop, N), { vars }), vars), sop, N);
  }
  // 8 inputs, every row 1: 256 minterms of 8 literals each
  const all = canonicalAsts('1'.repeat(256), V8);
  assert.equal(all.sop.args.length, 256);
  assert.ok(all.sop.args.every(t => t.t === 'and' && t.args.length === 8));
  assert.equal(exprColumn(all.sop, V8), '1'.repeat(256));
});
const V8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// brute force: the cheapest cover of the 1s (terms, then literals) by any implicants, by DP over covered sets
function bruteMin(col, n, target = '1') {
  const on = [...col].map((c, i) => (c === target ? i : -1)).filter(i => i >= 0);
  const bad = new Set([...col].map((c, i) => (c !== target && c !== 'X' ? i : -1)).filter(i => i >= 0));
  if (!on.length) return { terms: 0, lits: 0 };
  const cubes = [];
  for (let mask = 0; mask < 1 << n; mask++) for (let value = 0; value < 1 << n; value++) {
    if (value & mask) continue;
    const ms = cubeMinterms({ value, mask }, n);
    if (ms.some(m => bad.has(m))) continue;
    let cov = 0; on.forEach((m, i) => { if (ms.includes(m)) cov |= 1 << i; });
    if (cov) cubes.push({ cov, lits: n - [...Array(n)].filter((_, b) => mask & (1 << b)).length });
  }
  const full = (1 << on.length) - 1;
  const T = new Int32Array(full + 1).fill(1e9), Lt = new Int32Array(full + 1).fill(1e9);
  T[0] = 0; Lt[0] = 0;
  for (let m = 0; m <= full; m++) {
    if (T[m] >= 1e9) continue;
    for (const c of cubes) {
      const nm = m | c.cov;
      if (nm === m) continue;
      const t = T[m] + 1, l = Lt[m] + c.lits;
      if (t < T[nm] || (t === T[nm] && l < Lt[nm])) { T[nm] = t; Lt[nm] = l; }
    }
  }
  return { terms: T[full], lits: Lt[full] };
}

function checkCover(col, n, res) {
  const target = res.form === 'pos' ? '1' : '0';
  const f = exprColumn(minimalAst(res, V(n)), V(n));
  for (let r = 0; r < col.length; r++) if (col[r] !== 'X') assert.equal(f[r], col[r], `row ${r} of ${col} (${res.form})`);
  // every term is a prime implicant
  const on = [...col].map((c, i) => (c === (res.form === 'pos' ? '0' : '1') ? i : -1)).filter(i => i >= 0);
  const dc = [...col].map((c, i) => (c === 'X' ? i : -1)).filter(i => i >= 0);
  const primes = new Set(primeImplicants(on, dc, n).map(p => `${p.value}/${p.mask}`));
  for (const t of res.terms) assert.ok(primes.has(`${t.value}/${t.mask}`), `term ${t.value}/${t.mask} is prime`);
  return target;
}

test('Quine–McCluskey + exact cover = brute force on hundreds of random functions with don\'t cares (2–4 inputs)', () => {
  const r = rng(12345);
  let several = 0;
  for (let k = 0; k < 300; k++) {
    const n = 2 + (k % 3);
    const col = randCol(r, n, k % 4 === 0 ? 0 : 0.2);
    for (const form of ['sop', 'pos']) {
      const res = minimize(col, n, { form });
      assert.ok(res.exact);
      checkCover(col, n, res);
      const b = bruteMin(col, n, form === 'pos' ? '0' : '1');
      assert.deepEqual([res.terms.length, res.literals], [b.terms, b.lits], `${form} of ${col}`);
      if (res.several) several++;
    }
  }
  assert.ok(several > 5, `${several} functions with several minimal solutions`);
});

// every minimal cover by brute force over the prime implicants (a minimal cover is all primes: a non-prime term has
// a prime with fewer literals over it): its { value/mask } keys, sorted
function bruteCovers(col, n, target, terms, lits) {
  const on = [...col].map((c, i) => (c === target ? i : -1)).filter(i => i >= 0);
  const dc = [...col].map((c, i) => (c === 'X' ? i : -1)).filter(i => i >= 0);
  const ps = primeImplicants(on, dc, n).map(p => ({ key: `${p.value}/${p.mask}`, ms: cubeMinterms(p, n), lits: n - p.mask.toString(2).replace(/0/g, '').length }));
  const out = [];
  const rec = (start, chosen) => {
    if (chosen.length === terms) {
      if (chosen.reduce((s, p) => s + p.lits, 0) === lits && on.every(m => chosen.some(p => p.ms.includes(m)))) out.push(chosen.map(p => p.key).sort().join(' '));
      return;
    }
    for (let i = start; i < ps.length; i++) rec(i + 1, [...chosen, ps[i]]);
  };
  if (on.length) rec(0, []); else out.push('');
  return out.sort();
}

test('every minimal solution (#2928): each a minimal cover, none repeated, all of them, the first today\'s; the count unchanged', () => {
  const keys = a => a.terms.map(t => `${t.value}/${t.mask}`).sort().join(' ');
  const check = (col, n, form) => {
    const res = minimize(col, n, { form });
    const target = form === 'pos' ? '0' : '1';
    const b = bruteMin(col, n, target);
    assert.equal(res.alternatives.length, res.solutions, `${form} of ${col}`);
    assert.equal(res.several, res.alternatives.length > 1);
    assert.equal(res.alternatives[0].terms, res.terms);
    assert.equal(res.alternatives[0].literals, res.literals);
    for (const a of res.alternatives) {
      checkCover(col, n, { ...res, ...a });
      assert.deepEqual([a.terms.length, a.literals], [b.terms, b.lits], `${form} of ${col}: a minimal cover`);
      assert.equal(a.literals, a.terms.reduce((s, t) => s + t.literals.length, 0));
    }
    const ks = res.alternatives.map(keys);
    assert.equal(new Set(ks).size, ks.length, `${form} of ${col}: no repeats`);
    assert.deepEqual([...ks].sort(), bruteCovers(col, n, target, b.terms, b.lits), `${form} of ${col}: every one`);
    // stable: the same order on every call
    assert.deepEqual(minimize(col, n, { form }).alternatives.map(keys), ks);
    return res;
  };
  // the cyclic chart Σm(0,1,2,5,6,7): no essential prime, two solutions (a'b' + bc' + ac, a'c' + b'c + ab)
  const cyc = check('11100111', 3, 'sop');
  assert.deepEqual([cyc.solutions, cyc.essential.length], [2, 0]);
  const vars = ['a', 'b', 'c'];
  const exprs = cyc.alternatives.map(a => formatExpr(minimalAst({ ...cyc, ...a }, vars), 'compact'));
  assert.equal(exprs[0], formatExpr(minimalAst(cyc, vars), 'compact'));
  assert.notEqual(exprs[0], exprs[1]);
  for (const e of exprs) assert.equal(exprColumn(parseExpr(e, { vars }), vars), '11100111');
  // its complement, as a POS: cyclic too
  assert.equal(check('11100111', 3, 'pos').solutions, 1);
  assert.equal(check('00011000', 3, 'pos').solutions, 2);
  // a 4-input cyclic chart: Σm(0,1,5,7,8,10,14,15)
  let col = '0'.repeat(16).split(''); for (const m of [0, 1, 5, 7, 8, 10, 14, 15]) col[m] = '1';
  assert.ok(check(col.join(''), 4, 'sop').solutions > 1);
  // with don't cares: Σm(1,3,7,11,15) + d(0,2,5): CD + A'B' or CD + A'D
  col = '0'.repeat(16).split(''); for (const m of [1, 3, 7, 11, 15]) col[m] = '1'; for (const m of [0, 2, 5]) col[m] = 'X';
  assert.equal(check(col.join(''), 4, 'sop').solutions, 2);
  // one solution, constants
  for (const [c, n] of [['00010111', 3], ['0000', 2], ['1111', 2], ['11X1', 2]]) for (const f of ['sop', 'pos']) assert.equal(check(c, n, f).solutions, 1);
  // random functions with don't cares
  const r = rng(2928);
  for (let k = 0; k < 120; k++) { const n = 3 + (k % 2); for (const f of ['sop', 'pos']) check(randCol(r, n, 0.2), n, f); }
  // the cap: the 64 first, distinct, all minimal; a search cut short keeps one
  const bigCol = '0X1X1X1X1101XXX0X11XX0X0X1X0011X', big = minimize(bigCol, 5), bb = bruteMin(bigCol, 5);
  assert.deepEqual([big.solutions, big.alternatives.length, new Set(big.alternatives.map(keys)).size], [64, 64, 64]);
  for (const a of big.alternatives) { checkCover(bigCol, 5, { ...big, ...a }); assert.deepEqual([a.terms.length, a.literals], [bb.terms, bb.lits]); }
  const cut = minimize('0110100110010110', 4, { maxNodes: 0 });
  assert.deepEqual([cut.exact, cut.alternatives.length, cut.alternatives[0].terms], [false, 1, cut.terms]);
});

test('analyzeOutput (#2928): every minimal solution with its expression and gates, the first the form\'s', () => {
  const doc = { ...newTable('cyc', ['a', 'b', 'c'], ['f']) };
  doc.table = { f: '11100111' };
  const A = analyzeOutput(normalizeTable(doc), 'f');
  assert.equal(A.sop.alternatives.length, 2);
  assert.equal(A.sop.ast, A.sop.alternatives[0].ast);
  assert.equal(A.sop.gates, A.sop.alternatives[0].gates);
  for (const a of A.sop.alternatives) {
    assert.equal(exprColumn(a.ast, ['a', 'b', 'c']), '11100111');
    assert.deepEqual(a.gates, gateCount({ ...A.sop, ...a }));
    assert.deepEqual(a.gates, { and: 3, or: 1, not: 3, literals: 6, inputs: 9 });
  }
  // the NAND form and the HDL keep the first solution
  assert.equal(formatExpr(outputForm(normalizeTable(doc), 'f', 'sop').ast), formatExpr(A.sop.ast));
});

test('minimisation of random 5- and 6-input functions: correct, prime, no worse than a greedy cover; deterministic', () => {
  const r = rng(99);
  for (let k = 0; k < 60; k++) {
    const n = 5 + (k % 2);
    const col = randCol(r, n, 0.2);
    for (const form of ['sop', 'pos']) {
      const res = minimize(col, n, { form });
      checkCover(col, n, res);
      const greedy = minimize(col, n, { form, maxNodes: 0 });
      assert.equal(greedy.exact, false);
      checkCover(col, n, greedy);
      if (res.exact) assert.ok(res.terms.length <= greedy.terms.length);
      assert.deepEqual(minimize(col, n, { form }).terms, res.terms);
    }
  }
});

test('textbook examples: minimal literal counts, essential primes, several solutions', () => {
  // Mano: F(A,B,C,D) = Σm(0,1,2,5,8,9,10) = B'D' + B'C' + A'C'D ; POS (A'+B')(C'+D')(B'+D)
  let col = '0'.repeat(16).split(''); for (const m of [0, 1, 2, 5, 8, 9, 10]) col[m] = '1'; col = col.join('');
  const vars = ['A', 'B', 'C', 'D'];
  let sop = minimize(col, 4), pos = minimize(col, 4, { form: 'pos' });
  assert.equal(formatExpr(minimalAst(sop, vars)), "B'·C' + B'·D' + A'·C'·D");
  assert.deepEqual([sop.terms.length, sop.literals], [3, 7]);
  assert.deepEqual([pos.terms.length, pos.literals], [3, 6]);
  assert.equal(exprColumn(minimalAst(pos, vars), vars), exprColumn(parseExpr("(A'+B')(C'+D')(B'+D)", { vars }), vars));
  assert.ok(sop.terms.every(t => t.essential));
  // with don't cares: Σm(1,3,7,11,15) + d(0,2,5) = CD + A'B' (or CD + A'D): 4 literals, two solutions
  col = '0'.repeat(16).split(''); for (const m of [1, 3, 7, 11, 15]) col[m] = '1'; for (const m of [0, 2, 5]) col[m] = 'X'; col = col.join('');
  sop = minimize(col, 4);
  assert.deepEqual([sop.terms.length, sop.literals, sop.several, sop.solutions], [2, 4, true, 2]);
  assert.equal(sop.essential.length, 1);
  assert.equal(formatExpr(minimalAst(sop, vars), 'compact'), "A'B' + CD");
  // cyclic chart, no essential prime: Σm(0,1,2,5,6,7) -> 3 terms, 6 literals, two solutions
  sop = minimize('11101110'.split('').map((c, i) => ([0, 1, 2, 5, 6, 7].includes(i) ? '1' : '0')).join(''), 3);
  assert.deepEqual([sop.terms.length, sop.literals, sop.several, sop.essential.length], [3, 6, true, 0]);
  // majority, XOR, constants
  assert.equal(formatExpr(minimalAst(minimize('00010111', 3), ['a', 'b', 'c']), 'compact'), 'bc + ac + ab');
  const x4 = minimize('0110100110010110', 4);
  assert.deepEqual([x4.terms.length, x4.literals, x4.terms.every(t => t.essential)], [8, 32, true]);
  assert.deepEqual(gateCount({ ...x4, ast: null }), { and: 8, or: 1, not: 4, literals: 32, inputs: 40 });
  assert.equal(formatExpr(minimalAst(minimize('0000', 2), ['a', 'b'])), '0');
  assert.equal(formatExpr(minimalAst(minimize('11X1', 2), ['a', 'b'])), '1');
  assert.equal(formatExpr(minimalAst(minimize('1111', 2, { form: 'pos' }), ['a', 'b'])), '1');
  assert.equal(formatExpr(minimalAst(minimize('0X00', 2, { form: 'pos' }), ['a', 'b'])), '0');
  assert.deepEqual(gateCount(minimize('0000', 2)), { and: 0, or: 0, not: 0, inputs: 0, literals: 0 });
});

// ------------------------------------------------------------------ Karnaugh maps
test('K-map layout: Gray order, cell <-> minterm for 1–6 variables', () => {
  assert.deepEqual(gray(2), [0, 1, 3, 2]);
  for (let n = 1; n <= 6; n++) for (const order of KMAP_ORDERS) {
    const L = kmapLayout(n, order);
    const seen = new Set();
    L.maps.forEach((_, mi) => L.rowCodes.forEach((_, r) => L.colCodes.forEach((_, c) => seen.add(L.minterm(mi, r, c)))));
    assert.equal(seen.size, 1 << n, `n=${n}`);
    // horizontally / vertically neighbouring cells (with wrap-around) differ in one variable
    L.maps.forEach((_, mi) => L.rowCodes.forEach((_, r) => L.colCodes.forEach((_, c) => {
      const m = L.minterm(mi, r, c);
      if (L.colCodes.length > 1) { const d = m ^ L.minterm(mi, r, (c + 1) % L.colCodes.length); assert.equal(d & (d - 1), 0); }
      if (L.rowCodes.length > 1) { const d = m ^ L.minterm(mi, (r + 1) % L.rowCodes.length, c); assert.equal(d & (d - 1), 0); }
    })));
  }
  const L4 = kmapLayout(4, 'rows');
  assert.deepEqual([L4.rowVars, L4.colVars, L4.maps.length], [[0, 1], [2, 3], 1]);
  assert.equal(L4.minterm(0, 2, 3), 0b1110);   // row AB=11, column CD=10
  assert.equal(kmapLayout(5).maps.length, 2);
  assert.deepEqual(kmapLayout(6).maps.map(m => m.code), [0, 1, 3, 2]);
});

test('K-map groups cover exactly the implicant\'s cells; wrap-around groups are split with open sides', () => {
  const r = rng(5);
  for (let k = 0; k < 800; k++) {
    const n = 1 + (k % 6);
    const mask = Math.floor(r() * (1 << n)), value = Math.floor(r() * (1 << n)) & ~mask;
    const L = kmapLayout(n, KMAP_ORDERS[(k >> 3) % 2]);
    const cells = [];
    for (const rc of kmapRects(L, { value, mask })) for (let i = rc.r0; i <= rc.r1; i++) for (let j = rc.c0; j <= rc.c1; j++) cells.push(L.minterm(rc.map, i, j));
    assert.deepEqual(cells.sort((a, b) => a - b), cubeMinterms({ value, mask }, n), `n=${n} ${value}/${mask}`);
  }
  // B'D' of A,B,C,D: the four corners (A,B on the rows, C,D on the columns)
  const L4 = kmapLayout(4, 'rows');
  const corners = kmapRects(L4, { value: 0, mask: 0b1010 });
  assert.equal(corners.length, 4);
  assert.deepEqual(corners.map(c => [c.r0, c.c0, c.open.top, c.open.bottom, c.open.left, c.open.right]),
    [[0, 0, true, false, true, false], [0, 3, true, false, false, true], [3, 0, false, true, true, false], [3, 3, false, true, false, true]]);
  // B·D' (rows 01 and 11, columns 00 and 10): one group split left / right
  const sides = kmapRects(L4, { value: 0b0100, mask: 0b1010 });
  assert.deepEqual(sides.map(c => [c.r0, c.r1, c.c0, c.c1, c.open.left, c.open.right]), [[1, 2, 0, 0, true, false], [1, 2, 3, 3, false, true]]);
  // C (columns 11 and 10): adjacent, no wrap
  assert.deepEqual(kmapRects(L4, { value: 0b0010, mask: 0b1101 }).map(c => [c.r0, c.r1, c.c0, c.c1, c.open.left, c.open.right]), [[0, 3, 2, 3, false, false]]);
  // 5 variables: E alone (no A): the same rectangle in both maps
  assert.deepEqual(kmapRects(kmapLayout(5), { value: 1, mask: 0b11110 }).map(c => c.map), [0, 1]);
  // the default order (#2924), A,B on the columns, C,D on the rows: B·D' (columns 01 and 11, rows 00 and 10) split
  // top / bottom; C (rows 11 and 10) adjacent
  const C4 = kmapLayout(4);
  assert.deepEqual(kmapRects(C4, { value: 0b0100, mask: 0b1010 }).map(c => [c.r0, c.r1, c.c0, c.c1, c.open.top, c.open.bottom]), [[0, 0, 1, 2, true, false], [3, 3, 1, 2, false, true]]);
  assert.deepEqual(kmapRects(C4, { value: 0b0010, mask: 0b1101 }).map(c => [c.r0, c.r1, c.c0, c.c1, c.open.top, c.open.bottom]), [[2, 3, 0, 3, false, false]]);
});

// #2924: the variables' order of a Karnaugh map, MSB → LSB by columns then rows (the default) or by rows then columns
test('#2924 K-map order: the variables of the maps, rows and columns, and every cell\'s minterm, for both orders and 1–6 variables', () => {
  assert.deepEqual(KMAP_ORDERS, ['cols', 'rows']);
  // the variables by hand: [map, rows, columns]
  const VARS = {
    cols: { 1: [[], [], [0]], 2: [[], [1], [0]], 3: [[], [2], [0, 1]], 4: [[], [2, 3], [0, 1]], 5: [[0], [3, 4], [1, 2]], 6: [[0, 1], [4, 5], [2, 3]] },
    rows: { 1: [[], [], [0]], 2: [[], [0], [1]], 3: [[], [0], [1, 2]], 4: [[], [0, 1], [2, 3]], 5: [[0], [1, 2], [3, 4]], 6: [[0, 1], [2, 3], [4, 5]] },
  };
  // an axis's labels in Gray order, as written on the map
  const LABELS = { 0: [''], 1: ['0', '1'], 2: ['00', '01', '11', '10'] };
  for (const order of KMAP_ORDERS) for (let n = 1; n <= 6; n++) {
    const L = kmapLayout(n, order), [mv, rv, cv] = VARS[order][n];
    assert.equal(L.order, order);
    assert.deepEqual([L.mapVars, L.rowVars, L.colVars], [mv, rv, cv], `${order} ${n}`);
    // the shape is the order's alone: as wide as tall or one column wider
    assert.deepEqual([L.maps.length, L.rowCodes.length, L.colCodes.length], [LABELS[mv.length].length, LABELS[rv.length].length, LABELS[cv.length].length]);
    L.maps.forEach((_, mi) => LABELS[rv.length].forEach((rl, r) => LABELS[cv.length].forEach((cl, c) => {
      // the row of the truth table: each variable's bit read off its label, the bits joined x0 … x(n-1)
      const bit = Array(n).fill('?');
      [[mv, LABELS[mv.length][mi]], [rv, rl], [cv, cl]].forEach(([vs, label]) => vs.forEach((v, i) => { bit[v] = label[i]; }));
      assert.equal(L.minterm(mi, r, c), parseInt(bit.join(''), 2), `${order} n=${n} map ${mi} (${r}, ${c})`);
    })));
  }
  // the default
  const vars = L => [L.order, L.mapVars, L.rowVars, L.colVars];
  for (let n = 1; n <= 6; n++) assert.deepEqual(vars(kmapLayout(n)), vars(kmapLayout(n, 'cols')), 'cols by default');
  assert.equal(kmapLayout(4).minterm(0, 2, 3), 0b1011);   // column AB=10, row CD=11
  assert.throws(() => kmapLayout(4, 'diagonal'), /order is one of cols, rows/);
});

// ------------------------------------------------------------------ documents
test('table documents: normalise, validate, reshape', () => {
  const d = normalizeTable({ name: 'm', inputs: ['a', 'b'], outputs: ['f'], table: { f: '1-0' } });
  assert.equal(d.table.f, '1X00');
  assert.deepEqual(validateTable(d), []);
  assert.match(validateTable({ ...d, inputs: ['a', 'a'] }).map(e => e.message).join(), /used twice/);
  assert.match(validateTable({ ...d, outputs: ['signal'] }).map(e => e.message).join(), /not a valid name/);
  assert.match(validateTable({ ...d, name: '1x' }).map(e => e.message).join(), /module name/);
  // adding an input keeps the old rows (new input = 0) and drops the expressions
  const t = reshapeTable({ ...newTable('m', ['a', 'b'], ['f']), table: { f: '0111' }, exprs: { f: 'a+b' } }, ['a', 'b', 'c'], ['f', 'g']);
  assert.equal(t.table.f, '00111111'.split('').map((_, r) => '0111'[r >> 1]).join(''));
  assert.equal(t.table.g, '00000000');
  assert.deepEqual(t.exprs, {});
  // the logic forms (#694): the NAND and NOR ones kept, an unknown one is the minimal SOP
  assert.deepEqual(['sop', 'pos', 'xor', 'nand', 'nor', 'nandnor', undefined].map(form => normalizeTable({ ...d, form }).form), ['sop', 'pos', 'xor', 'nand', 'nor', 'sop', 'sop']);
});

// ------------------------------------------------------------------ circuits simulate to the same table
const careEqual = (col, sim) => [...col].every((c, i) => c === 'X' || c === sim[i]);

test('generated VHDL and Verilog modules simulate to the truth table (random functions, don\'t cares kept in a comment)', () => {
  const r = rng(2024);
  for (let k = 0; k < 16; k++) {
    const n = 1 + (k % 5), nout = 1 + (k % 3);
    const outs = ['f', 'g', 'h'].slice(0, nout);
    const doc = { ...newTable(`tt${k}`, V(n), outs), form: k % 2 ? 'pos' : 'sop' };
    for (const o of outs) doc.table[o] = randCol(r, n, 0.2);
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateTableHdl(doc, lang);
      const t = truthTableFromModule([{ path: g.filename, text: g.code }], doc.name);
      assert.deepEqual([t.inputs, t.outputs], [doc.inputs, outs]);
      for (const o of outs) assert.ok(careEqual(doc.table[o], t.table[o]), `${lang} ${o}: ${doc.table[o]} vs ${t.table[o]}`);
      const dcs = dontCaresInHdl(g.code);
      for (const o of outs) assert.deepEqual(dcs[o] || [], canonical(doc.table[o]).dcs);
    }
  }
});

test('sync round trip: table -> HDL, the HDL edited by hand -> table (names, don\'t cares from the comment)', () => {
  const doc = { ...newTable('sel', ['s', 'x', 'y'], ['o', 'p']), table: { o: '0011X101', p: '1X000000' } };
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateTableHdl(doc, lang);
    // unchanged HDL: the same table back (don't cares from the comments)
    const back = truthTableFromModule([{ path: g.filename, text: g.code }], 'sel');
    const dcs = dontCaresInHdl(g.code);
    const withX = (o) => [...back.table[o]].map((c, r) => ((dcs[o] || []).includes(r) ? 'X' : c)).join('');
    assert.deepEqual([back.inputs, back.outputs, withX('o'), withX('p')], [doc.inputs, doc.outputs, doc.table.o, doc.table.p]);
    // edited: p = s xor x, the don't care comment of p removed
    const edited = g.code.replace(/(assign )?p (<)?= .*;/, lang === 'vhdl' ? 'p <= s xor x;' : 'assign p = s ^ x;').replace(/.*don't care: p = .*\n/, '');
    const t2 = truthTableFromModule([{ path: g.filename, text: edited }], 'sel');
    assert.equal(t2.table.p, '00111100');
    assert.deepEqual(dontCaresInHdl(edited), { o: [4] });
  }
});

test('truth table of a module: vectors become bits, sequential / too large / latches are refused', () => {
  const add = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity add2 is port (a, b : in std_logic_vector(1 downto 0); s : out std_logic_vector(2 downto 0)); end add2;
architecture rtl of add2 is begin s <= std_logic_vector(resize(unsigned(a), 3) + resize(unsigned(b), 3)); end rtl;`;
  const t = truthTableFromModule([{ path: 'add2.vhd', text: add }], 'add2');
  assert.deepEqual(t.inputs, ['a_1', 'a_0', 'b_1', 'b_0']);
  assert.deepEqual(t.outputs, ['s_2', 's_1', 's_0']);
  for (let row = 0; row < 16; row++) {
    const sum = (row >> 2) + (row & 3);
    assert.equal(t.table.s_2[row] + t.table.s_1[row] + t.table.s_0[row], sum.toString(2).padStart(3, '0'), `row ${row}`);
  }
  const cnt = 'module cnt(input clk, output reg q); always @(posedge clk) q <= ~q; endmodule';
  assert.throws(() => truthTableFromModule([{ path: 'cnt.v', text: cnt }], 'cnt'), /sequential/);
  const big = 'module big(input [8:0] a, output y); assign y = ^a; endmodule';
  assert.throws(() => truthTableFromModule([{ path: 'big.v', text: big }], 'big'), /9 input bits/);
  const lat = `library ieee; use ieee.std_logic_1164.all;
entity lat is port (g, d : in std_logic; q : out std_logic); end lat;
architecture rtl of lat is begin process (g, d) begin if g = '1' then q <= d; end if; end process; end rtl;`;
  assert.throws(() => truthTableFromModule([{ path: 'lat.vhd', text: lat }], 'lat'), /latch/);
  assert.throws(() => truthTableFromModule([{ path: 'x.v', text: 'module x(input a, output y); assign y = a &; endmodule' }], 'x'), /cannot be compiled/);
});

test('gate schematics (AND/OR, POS, XOR, NAND only, NOR only) pass netlist() and simulate to the truth table', () => {
  const r = rng(77);
  let fallbacks = 0;
  const cases = [];
  for (let k = 0; k < 40; k++) cases.push({ n: 1 + (k % 6), nout: 1 + (k % 4), form: ['sop', 'pos', 'nand', 'xor', 'nor'][k % 5], lang: k % 2 ? 'verilog' : 'vhdl' });
  // larger fan-in: 6-input parity (32 terms of 6 literals: gate trees)
  const parity6 = Array.from({ length: 64 }, (_, i) => (i.toString(2).split('1').length % 2 ? '0' : '1')).join('');
  for (const form of ['sop', 'nand', 'nor', 'xor']) cases.push({ n: 6, nout: 1, form, lang: 'vhdl', col: parity6 });
  // constants, a plain input, its complement
  for (const form of ['nand', 'nor', 'xor']) cases.push({ n: 3, nout: 4, form, lang: 'vhdl', cols: ['00000000', '11111111', '00001111', '11110000'] });
  for (const [k, c] of cases.entries()) {
    const outs = ['x', 'y', 'z', 'w'].slice(0, c.nout);
    const doc = newTable(`sch${k}`, V(c.n), outs);
    outs.forEach((o, i) => { doc.table[o] = c.cols?.[i] || c.col || randCol(r, c.n, 0.15); });
    const sch = schematicFromTable(doc, { form: c.form, lang: c.lang });
    fallbacks += sch.fallbacks;
    assert.deepEqual(schematicErrors(sch).map(e => e.message), [], `case ${k}`);
    const types = [...new Set(sch.symbols.map(s => s.type))];
    if (c.form === 'nand' || c.form === 'nor') assert.ok(types.every(t => new RegExp(`^${c.form}[234]$|^constant$`).test(t)), `${c.form} only: ${types}`);
    else assert.ok(types.every(t => (c.form === 'xor' ? /^(and[2-5]|or[2-5]|x(n)?or[234]|inv|buf|constant)$/ : /^(and[2-5]|or[2-5]|inv|buf|constant)$/).test(t)), `${c.form}: ${types}`);
    const g = generateHdl(sch, { lang: c.lang });
    assert.deepEqual(g.diagnostics.filter(d => d.severity === 'error'), []);
    const t = truthTableFromModule([{ path: `${doc.name}.${c.lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.code }], doc.name);
    for (const o of outs) assert.ok(careEqual(doc.table[o], t.table[o]), `case ${k} ${JSON.stringify(c)} ${o}: ${doc.table[o]} vs ${t.table[o]}`);
  }
  assert.equal(fallbacks, 0, 'every connection is a drawn wire (no net-name labels needed)');
});

test('analyzeOutput: everything shown for an output', () => {
  const doc = { ...newTable('m', ['a', 'b', 'c'], ['f']), table: { f: '01X1X0X1' } };
  const a = analyzeOutput(doc, 'f');
  assert.equal(a.sigma, 'Σm(1, 3, 7) + d(2, 4, 6)');
  assert.equal(formatExpr(a.canon.sop, 'compact'), "a'b'c + a'bc + abc");
  assert.equal(formatExpr(a.canon.pos, 'compact'), "(a + b + c)(a' + b + c')");
  assert.equal(formatExpr(a.sop.ast, 'compact'), "b + a'c");
  assert.equal(formatExpr(a.pos.ast, 'compact'), "c(a' + b)");
  assert.deepEqual(a.sop.gates, { and: 1, or: 1, not: 1, literals: 3, inputs: 4 });
  const one = analyzeOutput({ ...doc, table: { f: '01X1X1X1' } }, 'f');
  assert.equal(formatExpr(one.sop.ast), 'c');
  assert.deepEqual(one.sop.gates, { and: 0, or: 0, not: 0, literals: 1, inputs: 0 });
});

// ------------------------------------------------------------------ any number of outputs (#176)
const SIX = () => ({ ...newTable('six', ['a', 'b', 'c'], ['y0', 'y1', 'y2', 'y3', 'y4', 'y5']),
  table: { y0: '00000001', y1: '01111111', y2: '01101001', y3: '00010111', y4: '10100000', y5: '1X0X0X1X' }, form: 'sop' });   // (a table in minimal SOP: a new one's form is the least gates', #2951)

test('tables of more than 4 outputs: validated, saved and loaded, reshaped, K-map and SOP of each output (#176)', () => {
  const doc = normalizeTable(SIX());
  assert.deepEqual(validateTable(doc), []);
  // 40 outputs: no limit
  const wide = newTable('wide', ['a', 'b'], Array.from({ length: 40 }, (_, i) => `o${i}`));
  assert.deepEqual(validateTable(normalizeTable(wide)), []);
  assert.deepEqual(validateTable({ ...doc, outputs: [] }).map(e => e.message), ['a truth table has at least 1 output']);
  // the file (<name>.tt.json): written and read back unchanged
  const text = JSON.stringify(doc, null, 2);
  assert.deepEqual(normalizeTable(JSON.parse(text)), doc);
  assert.deepEqual(JSON.parse(text).outputs, ['y0', 'y1', 'y2', 'y3', 'y4', 'y5']);
  assert.equal(JSON.parse(text).table.y5, '1X0X0X1X');
  // adding outputs 7 and 8 keeps the six columns, the new ones are 0
  const r = reshapeTable(doc, doc.inputs, [...doc.outputs, 'y6', 'y7']);
  assert.deepEqual(r.outputs, ['y0', 'y1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7']);
  assert.deepEqual(Object.values(r.table), ['00000001', '01111111', '01101001', '00010111', '10100000', '1X0X0X1X', '00000000', '00000000']);
  // output 5 (y4) and output 6 (y5): canonical forms, minimal SOP / POS, K-map groups
  const a5 = analyzeOutput(doc, 'y4');
  assert.deepEqual([a5.sigma, a5.pi, formatExpr(a5.sop.ast), formatExpr(a5.pos.ast)], ['Σm(0, 2)', 'ΠM(1, 3, 4, 5, 6, 7)', "a'·c'", "c'·a'"]);
  assert.deepEqual(a5.sop.gates, { and: 1, or: 0, not: 2, literals: 2, inputs: 2 });
  const rects = L => a5.sop.terms.map(t => kmapRects(L, t).map(c => [c.r0, c.r1, c.c0, c.c1, c.open.left, c.open.right]));
  assert.deepEqual(rects(kmapLayout(3, 'rows')), [[[0, 0, 0, 0, true, false], [0, 0, 3, 3, false, true]]]);   // (a on the rows, b c on the columns)
  assert.deepEqual(rects(kmapLayout(3)), [[[0, 0, 0, 1, false, false]]]);   // (a b on the columns, c on the rows, #2924)
  const a6 = analyzeOutput(doc, 'y5');
  assert.deepEqual([a6.sigma, a6.pi, formatExpr(a6.sop.ast), formatExpr(a6.pos.ast)], ['Σm(0, 6) + d(1, 3, 5, 7)', 'ΠM(2, 4) · D(1, 3, 5, 7)', "a'·b' + a·b", "(a + b')·(a' + b)"]);
  assert.deepEqual(a6.sop.terms.map(t => t.minterms), [[0, 1], [6, 7]]);
});

test('HDL of a 6-output table: the exact VHDL and Verilog, which simulate to the table and read back with 6 outputs (#176)', () => {
  const doc = SIX();
  const vhd = generateTableHdl(doc, 'vhdl');
  assert.equal(vhd.code.slice(vhd.code.indexOf('-- y4 =')), `-- y4 = Σm(0, 2)
-- y4 = a'·c'   (minimal SOP, 2 literal(s), 3 gate(s), delay 2)
-- y5 = Σm(0, 6) + d(1, 3, 5, 7)
-- y5 = a'·b' + a·b   (minimal SOP, 4 literal(s), 5 gate(s), delay 3)
-- don't care: y5 = d(1, 3, 5, 7)

library ieee;
use ieee.std_logic_1164.all;

entity six is
    port (
        a, b, c : in  std_logic;
        y0, y1, y2, y3, y4, y5 : out std_logic
    );
end six;

architecture truth_table of six is
begin
    y0 <= a and b and c;
    y1 <= c or b or a;
    y2 <= (not a and not b and c) or (not a and b and not c) or (a and not b and not c) or (a and b and c);
    y3 <= (b and c) or (a and c) or (a and b);
    y4 <= not a and not c;
    y5 <= (not a and not b) or (a and b);
end truth_table;
`);
  const v = generateTableHdl(doc, 'verilog');
  assert.equal(v.code.slice(v.code.indexOf('module six')), `module six (
    input  wire a, b, c,
    output wire y0, y1, y2, y3, y4, y5
);

    assign y0 = a & b & c;
    assign y1 = c | b | a;
    assign y2 = (~a & ~b & c) | (~a & b & ~c) | (a & ~b & ~c) | (a & b & c);
    assign y3 = (b & c) | (a & c) | (a & b);
    assign y4 = ~a & ~c;
    assign y5 = (~a & ~b) | (a & b);

endmodule
`);
  // HDL -> table (the sync of a linked module): the six outputs, don't cares from the comment
  for (const g of [vhd, v]) {
    const t = truthTableFromModule([{ path: g.filename, text: g.code }], 'six');
    assert.deepEqual([t.inputs, t.outputs], [['a', 'b', 'c'], ['y0', 'y1', 'y2', 'y3', 'y4', 'y5']]);
    assert.deepEqual(Object.values(t.table), ['00000001', '01111111', '01101001', '00010111', '10100000', '11000011']);   // y5 = a'b' + ab: its don't cares 1 and 7 at 1
    assert.deepEqual(dontCaresInHdl(g.code), { y5: [1, 3, 5, 7] });
  }
  // a module of 20 output bits (more than the 16 of before): read whole
  const dec = 'module dec(input [2:0] a, output [19:0] y); assign y = {17\'b0, a} << a; endmodule';
  const t = truthTableFromModule([{ path: 'dec.v', text: dec }], 'dec');
  assert.equal(t.outputs.length, 20);
  assert.deepEqual([t.outputs[0], t.outputs[19]], ['y_19', 'y_0']);
  for (let r = 0; r < 8; r++) assert.equal(t.outputs.map(o => t.table[o][r]).join(''), (r << r).toString(2).padStart(20, '0'), `row ${r}`);
});

test('gate schematic of a 6- and a 9-output table: netlist() without errors, simulates to the table (#176)', () => {
  const r = rng(176);
  const nine = newTable('nine', V(4), Array.from({ length: 9 }, (_, i) => `q${i}`));
  for (const o of nine.outputs) nine.table[o] = randCol(r, 4, 0.1);
  for (const [doc, opts] of [[SIX(), { form: 'sop', lang: 'vhdl' }], [SIX(), { form: 'nand', lang: 'verilog' }], [SIX(), { form: 'nor', lang: 'vhdl' }], [SIX(), { form: 'xor', lang: 'verilog' }], [nine, { form: 'sop', lang: 'verilog' }], [nine, { form: 'pos', lang: 'vhdl' }]]) {
    const sch = schematicFromTable(doc, opts);
    assert.deepEqual(schematicErrors(sch).map(e => e.message), []);
    assert.equal(sch.fallbacks, 0);
    assert.deepEqual(sch.ports.filter(p => p.dir === 'out').map(p => p.name), doc.outputs);
    const g = generateHdl(sch, { lang: opts.lang });
    const t = truthTableFromModule([{ path: `${doc.name}.${opts.lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.code }], doc.name);
    for (const o of doc.outputs) assert.ok(careEqual(doc.table[o], t.table[o]), `${doc.name} ${JSON.stringify(opts)} ${o}: ${doc.table[o]} vs ${t.table[o]}`);
  }
});

// ------------------------------------------------------------------ the / notation (#434)
const strip = e => JSON.parse(JSON.stringify(e, (k, v) => (k === 'pos' ? undefined : v)));

test('formats: the / notation (/a.b + c, /(a + b)) and its compact form (/ab + c); XNOR in VHDL / Verilog (#434)', () => {
  const vars = ['a', 'b', 'c'];
  const e = parseExpr("ab' + c(a+b)' + a^c", { vars });
  assert.equal(formatExpr(e, 'slash'), 'a./b + c./(a + b) + a ⊕ c');
  assert.equal(formatExpr(e, 'slash-compact'), 'a/b + c/(a + b) + a ⊕ c');
  const f = parseExpr("a'b + c'", { vars });
  assert.equal(formatExpr(f, 'slash'), '/a.b + /c');
  assert.equal(formatExpr(f, 'slash-compact'), '/ab + /c');      // /ab is /a·b, as the input reads it
  assert.equal(formatExpr(parseExpr("(ab)'·c", { vars }), 'slash'), '/(a.b).c');
  assert.equal(formatExpr(parseExpr("(ab)'·c", { vars }), 'slash-compact'), '/(ab)c');
  assert.equal(formatExpr(parseExpr("a''", { vars }), 'slash'), '//a');
  assert.equal(formatExpr(parseExpr('0'), 'slash'), '0');
  assert.equal(formatExpr(parseExpr("a'·b'·c'", { vars }), 'slash-compact'), '/a/b/c');
  // names of more than one letter: no juxtaposition
  const v2 = ['x1', 'x2', 'en'];
  assert.equal(formatExpr(parseExpr("x1' x2 + en'", { vars: v2 }), 'slash-compact'), '/x1.x2 + /en');
  assert.equal(formatExpr(parseExpr("x1' x2 + en'", { vars: v2 }), 'slash'), '/x1.x2 + /en');
  // XNOR: /(a ⊕ b); xnor / ~^ in HDL (two operands), not (…) for more
  const xn = parseExpr('(a xnor b)(c ^~ a)', { vars });
  assert.deepEqual(strip(xn), strip(parseExpr("(a ^ b)'·(c ⊕ a)'", { vars })));
  assert.equal(formatExpr(xn, 'slash'), '/(a ⊕ b)./(c ⊕ a)');
  assert.equal(formatExpr(xn, 'slash-compact'), '/(a ⊕ b)/(c ⊕ a)');
  assert.equal(formatExpr(xn, 'textbook'), "(a ⊕ b)'·(c ⊕ a)'");
  assert.equal(formatExpr(xn, 'vhdl'), '(a xnor b) and (c xnor a)');
  assert.equal(formatExpr(xn, 'verilog'), '(a ~^ b) & (c ~^ a)');
  assert.equal(formatExpr(parseExpr('a ~^ b', { vars }), 'vhdl'), 'a xnor b');
  assert.equal(formatExpr(parseExpr('/(a ^ b ^ c)', { vars }), 'vhdl'), 'not (a xor b xor c)');
  assert.equal(formatExpr(parseExpr('/(a ^ b ^ c)', { vars }), 'verilog'), '~(a ^ b ^ c)');
  // Verilog's ~^ and ^~ read as XNOR
  for (const s of ['a ~^ b', 'a ^~ b', 'a^~b', 'a xnor b']) assert.equal(exprColumn(parseExpr(s, { vars }), vars), '11000011', s);
  assert.throws(() => formatExpr(e, 'slashes'), /unknown notation 'slashes'/);
});

test('round trip: every expression the editor shows reads back as the same expression in the / notations (#434)', () => {
  const r = rng(434);
  const P = (s, vars) => parseExpr(s, { vars });
  const asts = [];
  for (let k = 0; k < 120; k++) {
    const n = 1 + (k % 6), vars = k % 4 === 3 ? ['x1', 'en', 'b_2', 'q', 'y0', 'zz'].slice(0, n) : V(n);
    const col = randCol(r, n, k % 3 ? 0.15 : 0);
    const a = analyzeOutput({ ...newTable('t', vars, ['f']), table: { f: col } }, 'f');
    asts.push([vars, a.sop.ast], [vars, a.pos.ast]);
    if (a.xor) asts.push([vars, a.xor.ast]);
    // the essential prime implicants and the K-map groups: one term (or clause) each
    for (const res of [a.sop, a.pos]) for (const t of res.terms) asts.push([vars, minimalAst({ ...res, terms: [t] }, vars)]);
  }
  for (const [vars, ast] of asts) {
    for (const N of ['slash', 'slash-compact']) assert.deepEqual(strip(P(formatExpr(ast, N), vars)), strip(ast), `${N}: ${formatExpr(ast, N)}`);
    for (const N of ['textbook', 'compact', 'ascii']) assert.equal(exprColumn(P(formatExpr(ast, N), vars), vars), exprColumn(ast, vars), N);
  }
  assert.ok(asts.length > 500, `${asts.length} expressions`);
});

// ------------------------------------------------------------------ XOR / XNOR forms (#435)
const colOf = (n, f) => Array.from({ length: 1 << n }, (_, r) => (f(r) ? '1' : '0')).join('');
const parity = r => r.toString(2).split('1').length % 2 === 0;
/** The XOR form of a column in the / notation (null: none), checked on the whole table. */
const xorOf = (col, inputs) => {
  const x = minimizeXor(col, inputs);
  if (!x) return null;
  assert.ok(careEqual(col, exprColumn(x.ast, inputs)), `${col}: ${formatExpr(x.ast, 'slash')}`);
  assert.equal(x.exact, true, col);
  return formatExpr(x.ast, 'slash');
};

test('XOR forms (#435): parity of 2–6 inputs, full adder, 2-bit comparator, Gray <-> binary, exact expressions', () => {
  // parity: one XOR of every input, n literals and n - 1 operators (SOP: 2^(n-1) terms of n literals)
  for (let n = 2; n <= 6; n++) {
    const x = minimizeXor(colOf(n, parity), V(n));
    assert.equal(formatExpr(x.ast, 'slash'), V(n).join(' ⊕ '));
    assert.deepEqual([x.literals, x.ops, x.xor, x.and, x.or, x.exact], [n, n - 1, n - 1, 0, 0, true]);
    assert.equal(xorOf(colOf(n, r => !parity(r)), V(n)), `/(${V(n).join(' ⊕ ')})`);    // even parity: XNOR
  }
  // full adder: sum and carry
  const fa = ['a', 'b', 'cin'];
  assert.equal(xorOf(colOf(3, parity), fa), 'a ⊕ b ⊕ cin');
  const carry = minimizeXor('00010111', fa);
  assert.deepEqual([formatExpr(carry.ast, 'slash'), formatExpr(carry.ast, 'textbook'), formatExpr(carry.ast, 'vhdl'), formatExpr(carry.ast, 'verilog')],
    ['a.b + cin.(a ⊕ b)', 'a·b + cin·(a ⊕ b)', '(a and b) or (cin and (a xor b))', '(a & b) | (cin & (a ^ b))']);
  assert.deepEqual([carry.literals, carry.ops, carry.xor, carry.and, carry.or], [5, 4, 1, 2, 1]);   // the SOP: 6 literals, 5 operators
  // 2-bit equality comparator a1a0 = b1b0: two XNORs
  const eq = ['a1', 'a0', 'b1', 'b0'];
  const e = minimizeXor(colOf(4, r => r >> 2 === (r & 3)), eq);
  assert.deepEqual([formatExpr(e.ast, 'slash'), formatExpr(e.ast, 'slash-compact'), formatExpr(e.ast, 'textbook'), formatExpr(e.ast, 'vhdl'), formatExpr(e.ast, 'verilog')],
    ['/(a1 ⊕ b1)./(a0 ⊕ b0)', '/(a1 ⊕ b1)./(a0 ⊕ b0)', "(a1 ⊕ b1)'·(a0 ⊕ b0)'", '(a1 xnor b1) and (a0 xnor b0)', '(a1 ~^ b1) & (a0 ~^ b0)']);
  assert.deepEqual([e.literals, e.ops], [4, 3]);
  // Gray -> binary (4 bits): b_k = g3 ⊕ … ⊕ g_k; the MSB is a plain wire: no XOR form
  const g2b = r => { let b = r; for (let s = r >> 1; s; s >>= 1) b ^= s; return b; };
  const G = ['g3', 'g2', 'g1', 'g0'];
  assert.deepEqual([3, 2, 1, 0].map(k => xorOf(colOf(4, r => (g2b(r) >> k) & 1), G)), [null, 'g3 ⊕ g2', 'g3 ⊕ g2 ⊕ g1', 'g3 ⊕ g2 ⊕ g1 ⊕ g0']);
  // binary -> Gray: g_k = b_(k+1) ⊕ b_k
  const B = ['b3', 'b2', 'b1', 'b0'];
  assert.deepEqual([3, 2, 1, 0].map(k => xorOf(colOf(4, r => ((r ^ (r >> 1)) >> k) & 1), B)), [null, 'b3 ⊕ b2', 'b2 ⊕ b1', 'b1 ⊕ b0']);
  // a variable XOR a product: a ⊕ b·c (SOP a·/b + a·/c + /a·b·c, 7 literals)
  assert.equal(xorOf('00011110', V(3)), 'a ⊕ b.c');
  assert.equal(xorOf('01100000', V(3)), '/a.(b ⊕ c)');
});

test("XOR forms (#435): don't cares used; none when it is not simpler than the SOP and POS; none above 6 inputs", () => {
  // f = Σm(1, 2) + d(5, 6): with the don't cares b ⊕ c (without: /a·(b ⊕ c))
  assert.equal(xorOf('01100XX0', V(3)), 'b ⊕ c');
  assert.equal(xorOf('X1100XX0', V(3)), 'b ⊕ c');
  assert.equal(xorOf('1001X00X', V(3)), '/(b ⊕ c)');
  // XOR does not help (a·b + c, a, a + b + c, a·b·c, /a·/b…): no XOR form
  for (const col of ['01010111', '00001111', '01111111', '00000001', '11000000', '0X0X0111']) assert.equal(minimizeXor(col, V(3)), null, col);
  assert.equal(minimizeXor('0101', V(2)), null);
  // constant columns, one input, more than MAX_XOR_INPUTS inputs: none
  for (const col of ['00000000', '11111111', 'XXXXXXXX', '1X1X1X1X']) assert.equal(minimizeXor(col, V(3)), null, col);
  assert.equal(minimizeXor('01', ['a']), null);
  assert.equal(MAX_XOR_INPUTS, 6);
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.equal(minimizeXor(colOf(7, parity), seven), null);
  // analyzeOutput: the XOR form only when it is cheaper
  const fa = { ...newTable('fa', ['a', 'b', 'cin'], ['s', 'cout', 'x']), table: { s: colOf(3, parity), cout: '00010111', x: '01010111' } };
  assert.equal(formatExpr(analyzeOutput(fa, 's').xor.ast, 'slash'), 'a ⊕ b ⊕ cin');
  assert.equal(formatExpr(analyzeOutput(fa, 'cout').xor.ast, 'slash'), 'a.b + cin.(a ⊕ b)');
  assert.equal(analyzeOutput(fa, 'x').xor, null);
  assert.equal(analyzeOutput({ ...newTable('p7', seven, ['p']), table: { p: colOf(7, parity) } }, 'p', { maxNodes: 50000 }).xor, null);
  // the cost: literals, then two-input operators (NOT free)
  assert.deepEqual(exprCost(parseExpr("/(a ^ b)·c' + a", { vars: V(3) })), { literals: 4, xor: 1, and: 1, or: 1, ops: 3 });
});

test('XOR forms (#435): random functions of 2–6 inputs with don\'t cares: equivalent to the table, cheaper than the SOP and POS, quick', () => {
  const r = rng(435);
  const cost = e => { const c = exprCost(e); return c.literals * 1024 + c.ops; };
  let found = 0, worst = 0;
  for (let k = 0; k < 80; k++) {
    const n = 2 + (k % 5), vars = V(n);
    const col = randCol(r, n, [0, 0.1, 0.3][k % 3]);
    const sop = minimalAst(minimize(col, n), vars), pos = minimalAst(minimize(col, n, { form: 'pos' }), vars);
    const t0 = performance.now();
    const x = minimizeXor(col, vars);
    worst = Math.max(worst, performance.now() - t0);
    if (!x) continue;
    found++;
    assert.ok(careEqual(col, exprColumn(x.ast, vars)), `${col}: ${formatExpr(x.ast, 'slash')}`);
    assert.ok(cost(x.ast) < cost(sop) && cost(x.ast) < cost(pos), `${col}: ${formatExpr(x.ast, 'slash')} vs ${formatExpr(sop, 'slash')}`);
    assert.deepEqual(strip(parseExpr(formatExpr(x.ast, 'slash'), { vars })), strip(x.ast));
    // the same table, the same form
    assert.deepEqual(minimizeXor(col, vars, { timeMs: Infinity }).ast, x.ast);
  }
  assert.ok(found > 30, `${found} XOR forms`);
  assert.ok(worst < 1000, `${worst} ms`);
});

test("HDL with the XOR form (#435): form 'xor' uses it where it is simpler, else the minimal SOP; exact VHDL and Verilog, no warnings, simulates to the table", () => {
  const doc = { ...SIX(), form: 'xor' };
  assert.equal(normalizeTable(doc).form, 'xor');
  // the Karnaugh maps' order (#2924): 'rows' kept, the default (by columns) or anything else not written
  assert.deepEqual(['rows', 'cols', 'diagonal', undefined].map(kmapOrder => 'kmapOrder' in normalizeTable({ ...doc, kmapOrder }) && normalizeTable({ ...doc, kmapOrder }).kmapOrder), ['rows', false, false, false]);
  assert.equal(normalizeTable({ ...doc, form: 'esop' }).form, 'sop');
  const vhd = generateTableHdl(doc, 'vhdl');
  assert.equal(vhd.code.slice(vhd.code.indexOf('-- y0 =')), `-- y0 = Σm(7)
-- y0 = a·b·c   (minimal SOP, 3 literal(s), 1 gate(s), delay 1)
-- y1 = Σm(1, 2, 3, 4, 5, 6, 7)
-- y1 = c + b + a   (minimal SOP, 3 literal(s), 1 gate(s), delay 1)
-- y2 = Σm(1, 2, 4, 7)
-- y2 = a ⊕ b ⊕ c   (XOR form, 3 literal(s), 1 gate(s), delay 1)
-- y3 = Σm(3, 5, 6, 7)
-- y3 = a·b + c·(a ⊕ b)   (XOR form, 5 literal(s), 4 gate(s), delay 3)
-- y4 = Σm(0, 2)
-- y4 = a'·c'   (minimal SOP, 2 literal(s), 3 gate(s), delay 2)
-- y5 = Σm(0, 6) + d(1, 3, 5, 7)
-- y5 = (a ⊕ b)'   (XOR form, 2 literal(s), 1 gate(s), delay 1)
-- don't care: y5 = d(1, 3, 5, 7)

library ieee;
use ieee.std_logic_1164.all;

entity six is
    port (
        a, b, c : in  std_logic;
        y0, y1, y2, y3, y4, y5 : out std_logic
    );
end six;

architecture truth_table of six is
begin
    y0 <= a and b and c;
    y1 <= c or b or a;
    y2 <= a xor b xor c;
    y3 <= (a and b) or (c and (a xor b));
    y4 <= not a and not c;
    y5 <= a xnor b;
end truth_table;
`);
  const v = generateTableHdl(doc, 'verilog');
  assert.equal(v.code.slice(v.code.indexOf('module six')), `module six (
    input  wire a, b, c,
    output wire y0, y1, y2, y3, y4, y5
);

    assign y0 = a & b & c;
    assign y1 = c | b | a;
    assign y2 = a ^ b ^ c;
    assign y3 = (a & b) | (c & (a ^ b));
    assign y4 = ~a & ~c;
    assign y5 = a ~^ b;

endmodule
`);
  for (const g of [vhd, v]) {
    // compiles and elaborates with no errors and no warnings
    const lib = compile([{ path: g.filename, text: g.code }]);
    assert.deepEqual([...lib.errors, ...elaborate(lib, 'six').diags].map(d => `${d.severity}: ${d.message}`), []);
    const t = truthTableFromModule([{ path: g.filename, text: g.code }], 'six');
    assert.deepEqual(t.warnings, []);
    for (const o of doc.outputs) assert.ok(careEqual(doc.table[o], t.table[o]), `${g.lang} ${o}`);
    assert.deepEqual(dontCaresInHdl(g.code), { y5: [1, 3, 5, 7] });
  }
  // a table in minimal SOP: no XOR in the module
  assert.doesNotMatch(generateTableHdl(SIX(), 'vhdl').code, /xor|xnor|⊕/);
  // random tables of 2–6 inputs with form 'xor': simulate to the table in both languages
  const r = rng(4350);
  for (let k = 0; k < 10; k++) {
    const n = 2 + (k % 5), outs = ['y', 'z'];
    const d = { ...newTable(`x${k}`, V(n), outs), form: 'xor' };
    d.table.y = randCol(r, n, 0.2); d.table.z = colOf(n, parity);
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateTableHdl(d, lang);
      assert.match(g.code, lang === 'vhdl' ? /z <= a xor b/ : /assign z = a \^ b/);
      const t = truthTableFromModule([{ path: g.filename, text: g.code }], d.name);
      for (const o of outs) assert.ok(careEqual(d.table[o], t.table[o]), `${lang} ${o}: ${d.table[o]} vs ${t.table[o]}`);
    }
  }
});

// ------------------------------------------------------------------ NAND and NOR forms (#694)
// the gates of an expression: { op: [fan-ins] }, and whether it has only NAND (NOR) gates and inputs
const gatesOf = e => { const g = {}; const w = x => { if (x.args) { (g[x.t] ||= []).push(x.args.length); x.args.forEach(w); } else if (x.t === 'not') { (g.not ||= []).push(1); w(x.a); } }; w(e); return g; };

test('NAND and NOR forms (#694): only NAND / NOR gates of at most 4 inputs, equal to the table on every row but its don\'t cares (1–6 inputs)', () => {
  const r = rng(694);
  const cols = [];
  for (let n = 1; n <= 6; n++) for (let k = 0; k < 12; k++) cols.push([n, randCol(r, n, k % 3 ? 0.15 : 0)]);
  // and the edge cases: constants (also from don't cares), one input, its complement, parity
  for (const n of [1, 3]) for (const c of ['0', '1', 'X']) cols.push([n, c.repeat(1 << n)]);
  cols.push([2, '0011'], [2, '1100'], [2, 'X1X1'], [6, colOf(6, parity)]);
  for (const [n, col] of cols) {
    const inputs = V(n);
    for (const [g, form] of [['nand', 'sop'], ['nor', 'pos']]) {
      const m = minimize(col, n, { form });
      const f = gateForm(m, inputs, g);
      const got = exprColumn(f.ast, inputs);
      assert.ok(careEqual(col, got), `${g} of ${col}: ${formatExpr(f.ast)} = ${got}`);
      const gates = gatesOf(f.ast);
      if (f.ast.t === 'const') { assert.deepEqual([f.gates, f.inverters], [0, 0]); continue; }
      assert.deepEqual(Object.keys(gates), [g], `${g} only: ${formatExpr(f.ast)}`);
      assert.ok(gates[g].every(k => k >= 1 && k <= 4), `fan-in of ${formatExpr(f.ast)}`);
      // the gates counted: each gate once, the inverters of the inputs once each
      const inputInv = new Set(); const wi = x => { if (x.t === g && x.args.length === 1 && x.args[0].t === 'var') inputInv.add(x.args[0].name); else x.args?.forEach(wi); }; wi(f.ast);
      const gateNodes = gates[g].length - [...JSON.stringify(f.ast).matchAll(new RegExp(`{"t":"${g}","args":\\[{"t":"var","name":"[a-f]"}\\]}`, 'g'))].length;
      assert.equal(f.gates, gateNodes + inputInv.size, formatExpr(f.ast));
      // the expression the editor shows reads back as the same function, in every notation
      for (const nt of ['slash', 'textbook', 'vhdl', 'verilog']) assert.equal(exprColumn(parseExpr(formatExpr(f.ast, nt), { vars: inputs }), inputs), got, `${nt}: ${formatExpr(f.ast, nt)}`);
    }
  }
  // the textbook transformations, exactly: f = a·b + /c = /(c·/(a·b)), f = (a + b)·/c = /(/(a + b) + c)
  const f1 = gateForm(minimize('10101011', 3, { form: 'sop' }), ['a', 'b', 'c'], 'nand');
  assert.deepEqual([formatExpr(f1.ast, 'slash'), f1.gates, f1.inverters], ['/(c./(a.b))', 2, 0]);
  assert.equal(formatExpr(f1.ast, 'vhdl'), 'c nand (a nand b)');
  assert.equal(formatExpr(f1.ast, 'verilog'), '~(c & ~(a & b))');
  const f2 = gateForm(minimize('00101010', 3, { form: 'pos' }), ['a', 'b', 'c'], 'nor');
  assert.deepEqual([formatExpr(f2.ast, 'slash'), f2.gates, f2.inverters], ['/(c + /(a + b))', 2, 0]);
  assert.equal(formatExpr(f2.ast, 'vhdl'), 'c nor (a nor b)');
  assert.equal(formatExpr(f2.ast, 'verilog'), '~(c | ~(a | b))');
  // more than 4 inputs a gate: groups of ANDs (ORs) made of NANDs (NORs): a·b·c·d·e = /(/(/(/(a·b·c·d))·e)), every
  // complement a NAND with its inputs tied, /(x·x) (#3785)
  const f5 = gateForm(minimize('0'.repeat(31) + '1', 5, { form: 'sop' }), V(5), 'nand');
  assert.equal(formatExpr(f5.ast, 'slash'), '/(/(/(/(a.b.c.d)./(a.b.c.d)).e)./(/(/(a.b.c.d)./(a.b.c.d)).e))');
  // f = a and f = /a: two NANDs (an inverted rail and an inverter), one NAND
  assert.equal(formatExpr(gateForm(minimize('0011', 2, { form: 'sop' }), ['a', 'b'], 'nand').ast, 'vhdl'), '(a nand a) nand (a nand a)');
  assert.equal(formatExpr(gateForm(minimize('1100', 2, { form: 'pos' }), ['a', 'b'], 'nor').ast, 'vhdl'), 'a nor a');
  // analyzeOutput shows them (the editor's NAND and NOR forms)
  const a = analyzeOutput({ ...newTable('m', ['a', 'b', 'c'], ['f']), table: { f: '10101011' } }, 'f');
  assert.deepEqual([formatExpr(a.nand.ast, 'slash'), formatExpr(a.nor.ast, 'slash')], ['/(c./(a.b))', '/(/(a + /(c + c)) + /(b + /(c + c)))']);
});

test('HDL of the NAND and NOR forms (#694): exact VHDL and Verilog, NAND / NOR operations only, no warnings, simulates to the table', () => {
  for (const [form, vhdl, verilog] of [
    ['nand', [
      'y0 <= (not (a and b and c)) nand (not (a and b and c));',
      'y1 <= not ((c nand c) and (b nand b) and (a nand a));',
      'y2 <= not ((not ((a nand a) and (b nand b) and c)) and (not ((a nand a) and b and (c nand c))) and (not (a and (b nand b) and (c nand c))) and (not (a and b and c)));',
      'y3 <= not ((b nand c) and (a nand c) and (a nand b));',
      'y4 <= ((a nand a) nand (c nand c)) nand ((a nand a) nand (c nand c));',
      'y5 <= ((a nand a) nand (b nand b)) nand (a nand b);',
    ], [
      'assign y0 = ~(~(a & b & c) & ~(a & b & c));',
      'assign y1 = ~(~(c & c) & ~(b & b) & ~(a & a));',
      'assign y2 = ~(~(~(a & a) & ~(b & b) & c) & ~(~(a & a) & b & ~(c & c)) & ~(a & ~(b & b) & ~(c & c)) & ~(a & b & c));',
      'assign y3 = ~(~(b & c) & ~(a & c) & ~(a & b));',
      'assign y4 = ~(~(~(a & a) & ~(c & c)) & ~(~(a & a) & ~(c & c)));',
      'assign y5 = ~(~(~(a & a) & ~(b & b)) & ~(a & b));',
    ]],
    ['nor', [
      'y0 <= not ((a nor a) or (b nor b) or (c nor c));',
      'y1 <= (not (a or b or c)) nor (not (a or b or c));',
      'y2 <= not ((not (a or b or c)) or (not (a or (b nor b) or (c nor c))) or (not ((a nor a) or b or (c nor c))) or (not ((a nor a) or (b nor b) or c)));',
      'y3 <= not ((a nor b) or (a nor c) or (b nor c));',
      'y4 <= c nor a;',
      'y5 <= (a nor (b nor b)) nor ((a nor a) nor b);',
    ], [
      'assign y0 = ~(~(a | a) | ~(b | b) | ~(c | c));',
      'assign y1 = ~(~(a | b | c) | ~(a | b | c));',
      'assign y2 = ~(~(a | b | c) | ~(a | ~(b | b) | ~(c | c)) | ~(~(a | a) | b | ~(c | c)) | ~(~(a | a) | ~(b | b) | c));',
      'assign y3 = ~(~(a | b) | ~(a | c) | ~(b | c));',
      'assign y4 = ~(c | a);',
      'assign y5 = ~(~(a | ~(b | b)) | ~(~(a | a) | b));',
    ]],
  ]) {
    const doc = { ...SIX(), form };
    const vhd = generateTableHdl(doc, 'vhdl'), v = generateTableHdl(doc, 'verilog');
    assert.deepEqual(vhd.code.split('\n').filter(l => /^ {4}y\d <=/.test(l)).map(l => l.trim()), vhdl);
    assert.deepEqual(v.code.split('\n').filter(l => /^ {4}assign/.test(l)).map(l => l.trim()), verilog);
    const G = form.toUpperCase();
    // (its gates and delay as a circuit, #1427)
    assert.match(vhd.code, new RegExp(`-- y4 = .*   \\(${G} gates only, from the minimal ${form === 'nand' ? 'SOP' : 'POS'}, 2 literal\\(s\\), ${form === 'nand' ? 4 : 1} gate\\(s\\), delay \\d+\\)`));
    // NAND (NOR) operations only: no other operator but the NOT of an n-input AND (OR)
    const body = vhd.code.slice(vhd.code.indexOf('begin'));
    assert.doesNotMatch(body, form === 'nand' ? /\bx?or\b|\bnor\b|\bxnor\b/ : /\bx?and\b|\bnand\b|\bxor\b/);
    for (const g of [vhd, v]) {
      const lib = compile([{ path: g.filename, text: g.code }]);
      assert.deepEqual([...lib.errors, ...elaborate(lib, 'six').diags].map(d => `${d.severity}: ${d.message}`), []);
      const t = truthTableFromModule([{ path: g.filename, text: g.code }], 'six');
      assert.deepEqual(t.warnings, []);
      for (const o of doc.outputs) assert.ok(careEqual(doc.table[o], t.table[o]), `${form} ${g.lang} ${o}`);
      assert.deepEqual(dontCaresInHdl(g.code), { y5: [1, 3, 5, 7] });
    }
  }
});

test('every HDL logic form (#694): its VHDL and Verilog compile with no warnings and simulate to the table, several outputs with don\'t cares', () => {
  const r = rng(6940);
  for (let k = 0; k < 10; k++) {
    const n = 1 + (k % 6), outs = ['y', 'z', 'w'].slice(0, 1 + (k % 3));
    for (const form of FORMS) {
      const d = { ...newTable(`t${k}`, V(n), outs), form };
      for (const o of outs) d.table[o] = randCol(r, n, 0.2);
      for (const lang of ['vhdl', 'verilog']) {
        const g = generateTableHdl(d, lang);
        const lib = compile([{ path: g.filename, text: g.code }]);
        assert.deepEqual([...lib.errors, ...elaborate(lib, d.name).diags].map(x => `${x.severity}: ${x.message}`), [], `${form} ${lang}`);
        const t = truthTableFromModule([{ path: g.filename, text: g.code }], d.name);
        assert.deepEqual(t.warnings, []);
        for (const o of outs) assert.ok(careEqual(d.table[o], t.table[o]), `${form} ${lang} ${o}: ${d.table[o]} vs ${t.table[o]}`);
      }
    }
  }
});

test('the schematic of a table is drawn in its HDL logic form (#694): the same gates as the HDL\'s expression, simulates to the table', () => {
  const r = rng(6941);
  for (let k = 0; k < 15; k++) {
    const n = 2 + (k % 5), outs = ['y', 'z'];
    const doc = newTable(`s${k}`, V(n), outs);
    for (const o of outs) doc.table[o] = randCol(r, n, 0.15);
    for (const form of FORMS) {
      // the form of the table (no option), as in the Design pane
      const sch = schematicFromTable({ ...doc, form });
      assert.deepEqual(schematicErrors(sch).map(e => e.message), [], `${form} ${k}`);
      assert.equal(sch.fallbacks, 0);
      // its gates: those of the HDL's expressions, the inverters of the inputs once (shared by the outputs)
      const types = sch.symbols.map(s => s.type).filter(t => t !== 'constant');
      if (form === 'nand' || form === 'nor') {
        assert.ok(types.every(t => new RegExp(`^${form}[234]$`).test(t)), `${form}: ${types}`);
        let gates = 0; const inv = new Set();
        const w = x => { if (!x.args) return; if (x.args.length === 1 && x.args[0].t === 'var') inv.add(x.args[0].name); else { gates++; x.args.forEach(w); } };
        for (const o of outs) {
          const { ast } = outputForm(normalizeTable({ ...doc, form }), o, form);
          // (f = /a: an inverter gate of its own, not the inverted input)
          if (ast.args?.length === 1 && ast.args[0].t === 'var') gates++; else w(ast);
        }
        assert.equal(types.length, gates + inv.size, `${form} ${k}: ${types}`);
      }
      for (const lang of ['vhdl', 'verilog']) {
        const g = generateHdl({ ...sch, lang }, { lang });
        const t = truthTableFromModule([{ path: `${doc.name}.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.code }], doc.name);
        for (const o of outs) assert.ok(careEqual(doc.table[o], t.table[o]), `${form} ${lang} ${o}`);
      }
    }
  }
  // the XOR form drawn with XOR / XNOR gates: a full adder's sum and a 2-bit equality
  const fa = { ...newTable('fa', ['a', 'b', 'c'], ['s']), table: { s: '01101001' }, form: 'xor' };
  assert.deepEqual(schematicFromTable(fa).symbols.map(s => s.type), ['xor3']);
  const eq = { ...newTable('eq', ['a', 'b'], ['e']), table: { e: '1001' }, form: 'xor' };
  assert.deepEqual(schematicFromTable(eq).symbols.map(s => s.type), ['xnor2']);
  // NAND only: f = a·b + /c = /(c·/(a·b)), two NANDs
  const nd = { ...newTable('nd', ['a', 'b', 'c'], ['f']), table: { f: '10101011' }, form: 'nand' };
  assert.deepEqual(schematicFromTable(nd).symbols.map(s => s.type).sort(), ['nand2', 'nand2']);
  // the form given overrides the table's
  assert.deepEqual(schematicFromTable(nd, { form: 'sop' }).symbols.map(s => s.type).sort(), ['and2', 'inv', 'or2']);
});
