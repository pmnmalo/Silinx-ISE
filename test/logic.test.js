// core/logic.js: Boolean expressions, truth tables, canonical forms, Quine–McCluskey minimisation
// (checked against a brute-force exact cover), Karnaugh map groups, and the circuits of a truth
// table (VHDL / Verilog module, gate schematic) simulated back to the same table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseExpr, formatExpr, exprVars, exprColumn, canonical, minimize, minimalAst, gateCount, primeImplicants,
  cubeMinterms, kmapLayout, kmapRects, gray, newTable, normalizeTable, validateTable, reshapeTable, analyzeOutput,
  generateTableHdl, dontCaresInHdl, truthTableFromModule, schematicFromTable, schematicErrors, compareExpr, LogicError,
} from '../core/logic.js';
import { generateHdl } from '../core/schdoc.js';

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
  for (let n = 1; n <= 6; n++) {
    const L = kmapLayout(n);
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
  const L4 = kmapLayout(4);
  assert.deepEqual([L4.rowVars, L4.colVars, L4.maps.length], [[0, 1], [2, 3], 1]);
  assert.equal(L4.minterm(0, 2, 3), 0b1110);   // row AB=11, column CD=10
  assert.equal(kmapLayout(5).maps.length, 2);
  assert.deepEqual(kmapLayout(6).maps.map(m => m.code), [0, 1, 3, 2]);
});

test('K-map groups cover exactly the implicant\'s cells; wrap-around groups are split with open sides', () => {
  const r = rng(5);
  for (let k = 0; k < 400; k++) {
    const n = 1 + (k % 6);
    const mask = Math.floor(r() * (1 << n)), value = Math.floor(r() * (1 << n)) & ~mask;
    const L = kmapLayout(n);
    const cells = [];
    for (const rc of kmapRects(L, { value, mask })) for (let i = rc.r0; i <= rc.r1; i++) for (let j = rc.c0; j <= rc.c1; j++) cells.push(L.minterm(rc.map, i, j));
    assert.deepEqual(cells.sort((a, b) => a - b), cubeMinterms({ value, mask }, n), `n=${n} ${value}/${mask}`);
  }
  // B'D' of A,B,C,D: the four corners
  const L4 = kmapLayout(4);
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
});

// ------------------------------------------------------------------ documents
test('table documents: normalise, validate, reshape, compare a student expression', () => {
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
  const c = compareExpr("a + b'", ['a', 'b'], '1X11');
  assert.equal(c.equal, true);
  const w = compareExpr('a', ['a', 'b'], '1011');
  assert.deepEqual([w.equal, w.diffs], [false, [{ row: 0, expected: '1', got: '0' }]]);
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

test('gate schematics (AND/OR, POS, NAND only) pass netlist() and simulate to the truth table', () => {
  const r = rng(77);
  let fallbacks = 0;
  const cases = [];
  for (let k = 0; k < 30; k++) cases.push({ n: 1 + (k % 6), nout: 1 + (k % 4), form: k % 3 === 1 ? 'pos' : 'sop', nand: k % 3 === 2, lang: k % 2 ? 'verilog' : 'vhdl' });
  // larger fan-in: 6-input parity (32 terms of 6 literals: gate trees)
  cases.push({ n: 6, nout: 1, form: 'sop', nand: false, lang: 'vhdl', col: Array.from({ length: 64 }, (_, i) => (i.toString(2).split('1').length % 2 ? '0' : '1')).join('') });
  cases.push({ n: 6, nout: 1, form: 'sop', nand: true, lang: 'vhdl', col: Array.from({ length: 64 }, (_, i) => (i.toString(2).split('1').length % 2 ? '0' : '1')).join('') });
  cases.push({ n: 3, nout: 4, form: 'sop', nand: true, lang: 'vhdl', cols: ['00000000', '11111111', '00001111', '11110000'] });
  for (const [k, c] of cases.entries()) {
    const outs = ['x', 'y', 'z', 'w'].slice(0, c.nout);
    const doc = newTable(`sch${k}`, V(c.n), outs);
    outs.forEach((o, i) => { doc.table[o] = c.cols?.[i] || c.col || randCol(r, c.n, 0.15); });
    const sch = schematicFromTable(doc, { form: c.form, nand: c.nand, lang: c.lang });
    fallbacks += sch.fallbacks;
    assert.deepEqual(schematicErrors(sch).map(e => e.message), [], `case ${k}`);
    if (c.nand) assert.ok(sch.symbols.every(s => /^nand\d$|^constant$/.test(s.type)), `NAND only: ${[...new Set(sch.symbols.map(s => s.type))]}`);
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
  assert.equal(formatExpr(a.sop.ast, 'compact'), "b + a'c");
  assert.equal(formatExpr(a.pos.ast, 'compact'), "c(a' + b)");
  assert.deepEqual(a.sop.gates, { and: 1, or: 1, not: 1, literals: 3, inputs: 4 });
  const one = analyzeOutput({ ...doc, table: { f: '01X1X1X1' } }, 'f');
  assert.equal(formatExpr(one.sop.ast), 'c');
  assert.deepEqual(one.sop.gates, { and: 0, or: 0, not: 0, literals: 1, inputs: 0 });
});
