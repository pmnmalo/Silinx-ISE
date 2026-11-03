// Silinx - the helpers the HDL translators share (core/translate.js, #2693): the error a construct with no
// translation throws, constant folding of integer expressions, the names of the other language's reserved words.
// Isomorphic ES module: no DOM and no Node APIs.
import { VHDL93_WORDS, VERILOG_WORDS, SV_WORDS } from './reserved.js';

/** What cannot be translated (a construct, at its line): the translators throw it, translate() reports it. */
export class Untranslatable extends Error {
  constructor(message, loc) { super(message); this.line = loc?.line ?? at.line; }
}
export const cannot = (what, node, loc) => { throw new Untranslatable(what, node?.loc || loc); };
/** The line of the statement being translated (an expression has none of its own): set by the translators. */
export const at = { line: null };
export const atLine = node => { if (node?.loc?.line) at.line = node.loc.line; };

/** An integer expression's value when it is made of integer literals only (else null). */
export function intOf(e) {
  if (!e) return null;
  if (e.op === 'int') return Number(e.value);
  if (e.op === 'lit' && !/[xz]/.test(e.bits) && e.bits.length <= 31) return parseInt(e.bits || '0', 2);
  if (e.op === 'unary' && e.o === '-') { const a = intOf(e.a); return a == null ? null : -a; }
  if (e.op === 'binary') {
    const a = intOf(e.a), b = intOf(e.b);
    if (a == null || b == null) return null;
    switch (e.o) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b ? Math.trunc(a / b) : null;
      case '**': return a ** b;
    }
  }
  return null;
}

/** The number of bits an integer range needs (signed when it goes below 0), or null when it is not constant. */
export function intRangeBits(range) {
  const lo = Math.min(intOf(range?.left) ?? NaN, intOf(range?.right) ?? NaN);
  const hi = Math.max(intOf(range?.left) ?? NaN, intOf(range?.right) ?? NaN);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi >= 2 ** 31 - 1) return null;
  if (lo >= 0) return { w: Math.max(1, Math.ceil(Math.log2(hi + 1))), signed: false };
  let w = 1;
  while (-(2 ** (w - 1)) > lo || 2 ** (w - 1) - 1 < hi) w++;
  return { w, signed: true };
}

/** A name that is a reserved word of the language it is written in (it is renamed). */
export const reservedInVerilog = name => VERILOG_WORDS.has(name) || SV_WORDS.has(name);
export const reservedInVhdl = name => VHDL93_WORDS.has(String(name).toLowerCase());

/** Every node of an IR tree (statements and expressions), depth first. */
export function walk(node, f) {
  if (Array.isArray(node)) { for (const n of node) walk(n, f); return; }
  if (!node || typeof node !== 'object') return;
  f(node);
  for (const [k, v] of Object.entries(node)) if (k !== 'loc' && v && typeof v === 'object') walk(v, f);
}

/** The name an assignment's target is of (through its indices and slices), or null. */
export function targetName(t) {
  while (t && (t.op === 'index' || t.op === 'slice' || t.op === 'pslice' || (t.op === 'apply' && t.args?.length === 1))) {
    if (t.op === 'apply') return t.name;
    t = t.base;
  }
  return t?.op === 'ref' ? t.name : null;
}

export const indent = (lines, n = 1) => lines.map(l => (l ? '    '.repeat(n) + l : l));
