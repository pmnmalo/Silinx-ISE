// Deeply nested expressions in the drawings (#3559): an ASM chart's, a state diagram's, a Petri net's condition or
// action and a truth table's expression nested a thousand levels deep overflowed the stack (RangeError) in their parsers
// and every pass after them; Convert to Schematic of an XOR of 10 000 terms overflowed too, and a chain of n inverters
// was laid out in a time quadratic in n. A drawing's expression nests at most DRAWING_NESTING (MAX_NESTING / 2: the HDL
// generated from it nests up to twice as deep) levels: parentheses, unary operators, the operators of a chain; at the
// limit the drawing checks, generates HDL that compiles with no warnings and simulates as the plain expression, in VHDL
// and in Verilog; one level more, or 100 000, is the box's error, one error, never a throw. The gates' flattening of a
// chain does not recurse, and the stubs of a layout without ELK are checked against what is near them only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as asm from '../core/asm.js';
import { DRAWING_NESTING, DRAWING_NESTING_MESSAGE } from '../core/asm-expr.js';
import { validateFsm, generateFsm } from '../core/fsm.js';
import { newPetri, validatePetri } from '../core/petri.js';
import { parseExpr, exprColumn, LogicError } from '../core/logic.js';
import { compile, elaborate } from '../core/compile.js';
import { schematicFromHdl, modulesFromLibrary } from '../core/schdoc-from-hdl.js';
import { MAX_NESTING } from '../packages/silinx-hdl/src/util.js';
import { runHdl, runModel, randomVectors } from './fsm-sim.js';
import { scratchEnv } from './server-helpers.js';

const N = DRAWING_NESTING, DEEP = 100000;
const MSG = 'expression nested more than 128 levels deep (parentheses, operators)';
// conditions n levels deep, each one the same as x: parentheses, NOTs (an even number), a chain of ANDs (n operators),
// NOTs of parentheses
const DEEP_CONDS = {
  parens: (x, n) => `${'('.repeat(n)}${x}${')'.repeat(n)}`,
  nots: (x, n) => `${'!'.repeat(n)}${x}`,
  chain: (x, n) => Array(n + 1).fill(x).join(' & '),
  notParens: (x, n) => `${'!('.repeat(n / 2)}${x}${')'.repeat(n / 2)}`
};
const ROOT = path.resolve(import.meta.dirname, '..');
const traffic = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8'));
const compiles = (code, lang) => compile([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', lang, text: code }]).errors.map(e => `${e.severity}: ${e.message}`);
const codeOf = g => (typeof g === 'string' ? g : g.code);

test('#3559 the limit: half the HDL front end\'s, and its message', () => {
  assert.equal(DRAWING_NESTING, MAX_NESTING / 2);
  assert.equal(DRAWING_NESTING_MESSAGE, MSG);
});

test(`#3559 ASM conditions and actions: ${N} levels read, one more and ${DEEP} the error (not thrown)`, () => {
  for (const [kind, f] of Object.entries(DEEP_CONDS)) {
    assert.equal(asm.parseCondition(f('start', N)).error, undefined, kind);
    assert.equal(asm.parseAction(`busy = ${f('start', N)}`).error, undefined, kind);
    assert.deepEqual(asm.parseCondition(f('start', N + 2)), { error: MSG }, kind);
    assert.deepEqual(asm.parseAction(`busy = ${f('start', N + 2)}`), { error: MSG }, kind);
    const t = Date.now();
    assert.deepEqual(asm.parseCondition(f('start', DEEP)), { error: MSG }, kind);
    assert.ok(Date.now() - t < 10000, `${kind}: ${Date.now() - t} ms`);
  }
  // one level past it, each kind
  assert.deepEqual(asm.parseCondition(DEEP_CONDS.parens('start', N + 1)), { error: MSG });
  assert.deepEqual(asm.parseCondition(DEEP_CONDS.nots('start', N + 1)), { error: MSG });
  assert.deepEqual(asm.parseCondition(DEEP_CONDS.chain('start', N + 1)), { error: MSG });
  // (a selection's parentheses are no nesting)
  assert.equal(asm.parseCondition(`${'('.repeat(N)}x(3)${')'.repeat(N)}`).error, undefined);
});

test(`#3559 an ASM chart with conditions and actions ${N} levels deep: no new diagnostic, its HDL compiles and simulates as the plain chart's, in VHDL and in Verilog`, () => {
  const plain = asm.newModel();
  const base = asm.validate(plain);
  const vectors = randomVectors(plain, 40, 3559);
  const want = { vhdl: runHdl(codeOf(asm.generate(plain, 'vhdl')), 'vhdl', plain, vectors), verilog: runHdl(codeOf(asm.generate(plain, 'verilog')), 'verilog', plain, vectors) };
  assert.deepEqual(want.vhdl, want.verilog);
  for (const [kind, f] of Object.entries(DEEP_CONDS)) {
    const m = asm.newModel();
    m.nodes[1].cond = f('start', N);
    m.nodes[2].actions = [`load = ${f('1', N)}`];
    assert.deepEqual(asm.validate(m), base, kind);
    for (const lang of ['vhdl', 'verilog']) {
      const code = codeOf(asm.generate(m, lang));
      assert.deepEqual(compiles(code, lang), [], `${kind} ${lang}`);
      assert.deepEqual(runHdl(code, lang, m, vectors), want[lang], `${kind} ${lang}`);
    }
  }
});

test(`#3559 an ASM chart with a condition and an action past the limit: their boxes' errors; generate refuses it`, () => {
  const m = asm.newModel();
  m.nodes[1].cond = DEEP_CONDS.parens('start', 1000);
  m.nodes[2].actions = [`load = ${'~'.repeat(DEEP)}1`];
  assert.deepEqual(asm.validate(m).map(d => [d.severity, d.message, d.nodeId]), [
    ['error', `Decision '${m.nodes[1].cond}': ${MSG}`, 'd1'],
    ['error', `Conditional output action '${m.nodes[2].actions[0]}': ${MSG}`, 'o1']
  ]);
  for (const lang of ['vhdl', 'verilog']) assert.throws(() => asm.generate(m, lang), e => e.message.startsWith('ASM chart \'fsm\' has 2 error(s):') && !(e instanceof RangeError));
});

test(`#3559 a state diagram with a condition ${N} levels deep simulates as the plain one; past the limit, the transition's error`, () => {
  const plain = traffic();
  const t1 = plain.transitions[0];
  assert.equal(t1.cond, 'night');
  const base = validateFsm(plain);
  const vectors = randomVectors(plain, 60, 7);
  const want = runModel(plain, vectors);
  for (const [kind, f] of Object.entries(DEEP_CONDS)) {
    const m = traffic();
    m.transitions[0].cond = f('night', N);
    assert.deepEqual(validateFsm(m), base, kind);
    assert.deepEqual(runModel(m, vectors), want, kind);
    for (const lang of ['vhdl', 'verilog']) {
      const code = codeOf(generateFsm({ ...m, lang }, lang));
      assert.deepEqual(compiles(code, lang), [], `${kind} ${lang}`);
      assert.deepEqual(runHdl(code, lang, m, vectors), want, `${kind} ${lang}`);
    }
  }
  const m = traffic();
  m.transitions[0].cond = DEEP_CONDS.parens('night', 1000);
  const diags = validateFsm(m);
  assert.deepEqual(diags.filter(d => !base.some(b => b.message === d.message)).map(d => [d.severity, d.message.endsWith(`' is not valid (${MSG})`)]), [['error', true]]);
});

test(`#3559 a Petri net's guard past the limit: the transition's error; at the limit, none`, () => {
  const base = validatePetri(newPetri());
  const p = newPetri();
  p.transitions[0].guard = DEEP_CONDS.nots('go', N);
  assert.deepEqual(validatePetri(p), base);
  p.transitions[0].guard = DEEP_CONDS.nots('go', DEEP);
  const extra = validatePetri(p).filter(d => !base.some(b => b.message === d.message));
  assert.deepEqual(extra.map(d => [d.severity, d.message.endsWith(`: ${MSG}`), d.ref]), [['error', true, { kind: 'transition', id: 't1' }]]);
});

test(`#3559 a truth table's expression: ${N} levels read to its column, one more the error at its place, ${DEEP} too`, () => {
  const vars = ['a', 'b'];
  const col = exprColumn(parseExpr('a + b', { vars }), vars);
  assert.equal(col, '0111');
  const deep = {
    parens: n => `${'('.repeat(n)}a + b${')'.repeat(n)}`,
    nots: n => `${'~'.repeat(n)}(a + b)`,   // (n NOTs and the parentheses, n + 1 levels; n NOTs and the OR, too)
    primes: n => `(a + b)${"'".repeat(n)}`   // (n NOTs and the OR: n + 1 levels)
  };
  for (const [kind, f] of Object.entries(deep)) {
    const n = kind === 'parens' ? N : N - 1;
    assert.equal(exprColumn(parseExpr(f(n), { vars }), vars), n % 2 && kind !== 'parens' ? '1000' : col, kind);
  }
  const err = (src) => { try { parseExpr(src, { vars }); return null; } catch (e) { assert.ok(e instanceof LogicError, e.message); return e.message; } };
  assert.equal(err(deep.parens(N + 1)), `${MSG} (at position ${N + 1})`);
  assert.equal(err(deep.nots(N)), `${MSG} (at position ${N + 1})`);
  assert.equal(err(deep.primes(N)), MSG);
  assert.equal(err(deep.parens(DEEP)), `${MSG} (at position ${N + 1})`);
  assert.equal(err(deep.primes(DEEP)), MSG);
  assert.equal(err(Array(DEEP).fill('a').join(' nand ')), MSG);
});

const verilogTop = body => [{ path: 'top.v', lang: 'verilog', text: `module top(input a, b, output y);\n${body}\nendmodule\n` }];
async function toSchematic(src) {
  const lib = compile(src);
  assert.deepEqual(lib.errors, []);
  const texts = Object.fromEntries(src.map(s => [s.path, s.text]));
  return schematicFromHdl(elaborate(lib, 'top').top, { sources: texts, modules: modulesFromLibrary(lib, { sources: texts }), lang: 'verilog' });
}

test('#3559 Convert to Schematic: an XOR of 10 000 terms, one HDL block (not thrown); 16 terms, a tree of XOR4 gates', async () => {
  const xor = n => verilogTop(`assign y = ${Array.from({ length: n }, (_, i) => (i % 2 ? 'a' : 'b')).join(' ^ ')};`);
  const big = await toSchematic(xor(10000));
  assert.deepEqual(big.symbols.map(s => s.type), ['hdlblock']);
  const small = await toSchematic(xor(16));
  assert.deepEqual(small.symbols.map(s => s.type), Array(5).fill('xor4'));
});

test('#3559 Convert to Schematic without a layout: a chain of 3000 inverters in a time linear in it', async () => {
  const n = 3000;
  const body = [`wire ${Array.from({ length: n }, (_, i) => `w${i}`).join(', ')};`, 'assign w0 = ~a;',
    ...Array.from({ length: n - 1 }, (_, i) => `assign w${i + 1} = ~w${i};`), `assign y = w${n - 1} & b;`].join('\n');
  const t = Date.now();
  const doc = await toSchematic(verilogTop(body));
  const ms = Date.now() - t;
  assert.equal(doc.symbols.filter(s => s.type === 'inv').length, n);
  assert.ok(ms < 15000, `${ms} ms (about 40 s before #3559)`);
  // every stub's end free: no two wires end at one point but at a pin
  assert.equal(new Set(doc.wires.map(w => `${w.points.at(-1).x},${w.points.at(-1).y}`)).size, doc.wires.length);
});

// the MCP server: check_drawing of a state diagram with a condition nested 1000 levels deep, convert_module of the XOR
let tmp;
before(async () => { tmp = await scratchEnv('silinx-drawing-nesting-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

test('#3559 MCP: check_drawing names the transition\'s error, convert_module draws an XOR of 10 000 terms as an HDL block', async () => {
  await ok('new_project_from_example', { name: 't', example: 'traffic' });
  const fsm = traffic();
  fsm.transitions[0].cond = DEEP_CONDS.parens('night', 1000);
  await ok('write_file', { project: 't', path: 'src/traffic.fsm.json', text: JSON.stringify(fsm) });
  const c = await ok('check_drawing', { project: 't', file: 'src/traffic.fsm.json' });
  const message = validateFsm(fsm).find(d => d.message.endsWith(`(${MSG})`)).message;
  assert.deepEqual(c.data.errors, [{ message, item: 't1' }]);
  assert.deepEqual(c.data.warnings, []);
  await ok('new_project', { name: 'x' });
  await ok('write_file', { project: 'x', path: 'src/top.v', text: verilogTop(`assign y = ${Array.from({ length: 10000 }, (_, i) => (i % 2 ? 'a' : 'b')).join(' ^ ')};`)[0].text });
  await ok('set_top', { project: 'x', top: 'top' });
  const r = await ok('convert_module', { project: 'x', module: 'top', to: 'schematic' });
  assert.equal(r.text, '\'top\' converted to the schematic src/top.sch.json (0 symbols drawn, 1 HDL block keeping the HDL that is not drawn): it is now the module\'s base, src/top.v generated from it.');
});
