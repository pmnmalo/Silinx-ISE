// Silinx HLS C++ (#1898, core/cpp-consts.js): the integer constants C++ (and so Vitis HLS) lets a template's argument
// or an array's size name: const / constexpr integers and their lists, enums, a class's static const members, sizeof;
// each from its declaration on, a block's gone at its end; what is not one, none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from '../core/c-lex.js';
import { constants } from '../core/cpp-consts.js';

// (the value of expr at the end of src, src's constants read up to there; its tokens as core/cpp-np-channel.js's)
const value = (src, expr) => {
  const toks = scan(`${src}\nint ap_probe_ = ${expr};`, 1, []), c = constants();
  const at = toks.findIndex((t) => t.v === 'ap_probe_');
  for (let k = 0; k < at; k++) c.at(toks, k);
  const e = toks.findIndex((t, j) => j > at && t.v === ';');
  return c.value(toks.slice(at + 2, e));
};

test('#1898 const and constexpr integers: their values, a list\'s, of the constants before them; in a constant expression', () => {
  assert.equal(value('const int N = 16;', 'N'), 16n);
  assert.equal(value('constexpr unsigned NP = 16 / 4;', 'NP * 2 - 1'), 7n);
  assert.equal(value('static const long long W = (3 << 2) + 1;', 'W'), 13n);
  assert.equal(value('const int A = 1, B = A + 1, C = B * 3;', 'A + B + C'), 9n);
  assert.equal(value('const int N{5}; constexpr int M(N + 1);', 'M'), 6n);
  assert.equal(value('const uint8_t K = 200; const size_t S = K;', 'S'), 200n);
});

test('#1898 enums, a class\'s static const members, sizeof of the types of C', () => {
  assert.equal(value('enum { A, B, C = 7, D };', 'B * 100 + D'), 108n);
  assert.equal(value('enum E { X = 2, Y };', 'E::Y'), 3n);
  assert.equal(value('enum class F : int { P = 4, Q };', 'F::Q'), 5n);
  assert.equal(value('enum class F { P = 4 };', 'P'), null);   // (an enum class's: only by its name)
  assert.equal(value('struct C { static const int NP = 4; int x; };', 'C::NP'), 4n);
  assert.equal(value('class D : public B { public: static constexpr int N = 3; enum { M = 9 }; };', 'D::N + D::M'), 12n);
  assert.equal(value('', 'sizeof(int) + sizeof(short) + sizeof(char) + sizeof(long) + sizeof(unsigned long long) + sizeof(double)'), 31n);
  assert.equal(value('struct S { int a; };', 'sizeof(S)'), null);
});

test('#1898 what is not a constant: a variable, a float, a const without its value, a parameter, a name after . or ->; a block\'s constant gone at its end, the outer one back', () => {
  assert.equal(value('int n = 2;', 'n'), null);
  assert.equal(value('const float F = 1.5;', 'F'), null);
  assert.equal(value('int n = 2; const int M = n * 2;', 'M'), null);
  assert.equal(value('extern const int E;', 'E'), null);
  assert.equal(value('void f(const int P = 3);', 'P'), null);
  assert.equal(value('const int N = 4; struct T { int N; } t;', 't.N'), null);
  assert.equal(value('void f() { const int L = 3; }', 'L'), null);
  assert.equal(value('const int N = 4; void f() { const int N = 8; }', 'N'), 4n);
  assert.equal(value('const int N = 4; void f() { const int N = 8;', 'N'), 8n);
});
