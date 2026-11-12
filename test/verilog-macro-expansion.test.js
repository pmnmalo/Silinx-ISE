// Verilog macros' expansion in linear time (#3556): the lexer (packages/silinx-hdl/src/verilog/lexer.js) replaced each
// use by rebuilding the whole text (10,000 uses 0.5 s, 99,000 65 s) and refused a file of more than 100,000 uses as
// expanding "too deeply". It reads the text through a window, the text after a use set aside: a file of n uses lexes
// in about the time of n, 200,000 uses are accepted, and the limits are the depth of nested expansions and the macros'
// text, each with one error. The large cases run in a child process with a time limit (a slow one cannot be stopped in
// this one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tokenize } from '../packages/silinx-hdl/src/verilog/lexer.js';

const LIMIT = 60000;   // (ms: the child's time; 200,000 uses take about 2 s)
const LEXER = new URL('../packages/silinx-hdl/src/verilog/lexer.js', import.meta.url).href;
const CHILD = `import { tokenize } from ${JSON.stringify(LEXER)};
let s = ''; for await (const c of process.stdin) s += c;
const out = [];
for (const text of JSON.parse(s)) {
  const errors = [], t = performance.now();
  const r = tokenize(text, 'big.v', errors);
  out.push({ ms: performance.now() - t, tokens: r.tokens.length, errors, last: r.tokens.at(-2) });
}
console.log(JSON.stringify(out));`;

function lexInChild(texts) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], { input: JSON.stringify(texts), encoding: 'utf8', timeout: LIMIT, maxBuffer: 1 << 20 });
  assert.equal(r.error?.code, undefined, `not done in ${LIMIT} ms`);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const lex = (text) => { const errors = []; const r = tokenize(text, 't.v', errors); return { tokens: r.tokens, errors }; };
const uses = n => '`define W 8\n' + 'wire [`W-1:0] a;\n'.repeat(n);

test('#3556 200,000 uses of a macro: accepted, no warnings, in about twice the time of 100,000', () => {
  const [a, b] = lexInChild([uses(100000), uses(200000)]);
  for (const [r, n] of [[a, 100000], [b, 200000]]) {
    assert.deepEqual(r.errors, [], 'no errors nor warnings');
    assert.equal(r.tokens, 10 * n + 1);   // wire [ 8 - 1 : 0 ] a ; ... eof
    assert.deepEqual(r.last, { t: 'op', v: ';', line: n + 1, col: 15, end: 16, at: 16 * n + 10 });
  }
  // linear: twice the uses, about twice the time (the old rebuilding: four times)
  assert.ok(b.ms < 3.5 * a.ms + 500, `100,000 uses ${Math.round(a.ms)} ms, 200,000 ${Math.round(b.ms)} ms`);
});

test('#3556 a long identifier joined to 100,000 times (x`A`A…), a macro of 200,000 uses in its body, an argument of 1 MB', () => {
  const [join, body, arg] = lexInChild([
    '`define A y\nwire x' + '`A'.repeat(100000) + ';',
    '`define B x\n`define A ' + '`B '.repeat(200000) + '\ny = `A;',
    '`define F(a) a\ny = `F(' + 'x+'.repeat(500000) + '1);',
  ]);
  assert.deepEqual(join.errors, []);
  assert.equal(join.tokens, 4);   // wire, the identifier, ;, eof
  assert.deepEqual(body.errors, []);
  assert.equal(body.tokens, 200004);
  assert.deepEqual(arg.errors, []);
  assert.equal(arg.tokens, 1000005);
});

test('#3556 a macro used in its own body: one error, the depth of the expansions', () => {
  for (const [text, line, col] of [['`define R `R\ny = `R;\n`ifdef X\n', 2, 5], ['`define R `R`R\n\n  y = `R;', 3, 7]]) {
    const { tokens, errors } = lex(text);
    assert.deepEqual(errors, [{ file: 't.v', line, col, message: 'macro `R expands too deeply (more than 1000 nested expansions)', severity: 'error' }]);
    assert.deepEqual(tokens.map(t => t.v), ['y', '=', '']);
  }
});

test('#3556 1000 nested expansions accepted, 1001 refused', () => {
  const chain = n => [...Array(n).keys()].map(k => `\`define M${k} \`M${k + 1}\n`).join('') + `\`define M${n} 5\ny = \`M0;\n`;
  const ok = lex(chain(999));
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.tokens.map(t => t.v), ['y', '=', '5', ';', '']);
  assert.deepEqual(lex(chain(1000)).errors, [{ file: 't.v', line: 1002, col: 5, message: 'macro `M1000 expands too deeply (more than 1000 nested expansions)', severity: 'error' }]);
});

test('#3556 macros whose text doubles at each level: one error, the size of the expanded text', () => {
  let d = ''; for (let k = 0; k < 30; k++) d += `\`define M${k} \`M${k + 1} \`M${k + 1}\n`;
  const [r] = lexInChild([d + '`define M30 x\ny = `M0;\n']);
  assert.equal(r.errors.length, 1, JSON.stringify(r.errors.slice(0, 3)));
  assert.deepEqual({ ...r.errors[0], col: 0 }, { file: 'big.v', line: 32, col: 0, message: "macro `M24: the macros' expansions exceed 8388608 characters", severity: 'error' });
});

test('#3556 the expansion as before: joined names, widths, arguments over lines, a macro naming another', () => {
  const { tokens, errors } = lex('`define N 3\n`define F(a,b) a+b\n`define G `F\nwire f4_`N; x = `N\'b011 + `G(1,\n2);\ny;');
  assert.deepEqual(errors, []);
  assert.deepEqual(tokens.map(t => [t.v ?? t.digits, t.line, t.col]), [['wire', 4, 1], ['f4_3', 4, 6], [';', 4, 10], ['x', 4, 12], ['=', 4, 14],
    ['011', 4, 16], ['+', 4, 23], ['1', 4, 25], ['+', 4, 26], ['2', 4, 27], [';', 5, 1], ['y', 6, 1], [';', 6, 2], ['', 6, 3]]);
  assert.equal(tokens.src, '`define N 3\n`define F(a,b) a+b\n`define G `F\nwire f4_3; x = 3\'b011 + 1+2\n;\ny;');
});
