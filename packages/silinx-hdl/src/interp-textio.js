// Silinx simulator - std.textio and math_real (#405: out of core/interp.js): lines read and written, text files,
// the textio images and parses of values, and ieee.math_real's functions.
import * as V from './values.js';
import {
  SimError, applyWrite, doAssign, evalE, isStr, resolveTarget
} from './interp.js';

// ieee.math_real (VHDL): the functions on reals that elaborate.js binds as { k: 'rfn', f, a, b }
// ---------------- std.textio ----------------
// LINE variables are strings here. write appends a value's text (justified in a field), writeline
// sends a line to the console (OUTPUT; a file's lines are shown with the file's name) and empties
// the line; readline takes the next line of a data file of the project; read takes a value off the
// front of a line.
const lineOf = (L, ctx) => { const v = evalE(L, ctx); return isStr(v) ? v.str : ''; };
function setLine(L, str, ctx) {
  const wr = [];
  resolveTarget(L, ctx, wr);
  for (const w of wr) {
    if (w.loc != null && !w.path && w.elem == null) w.fr[w.loc] = { str };
    else if (w.loc != null) w.fr[w.loc] = applyWrite(w.fr[w.loc], w, { str }, true);
    else ctx.sim?.write(w, { str });
  }
}
// a data file's lines and the next one to read (kept by the simulator, one cursor per file)
export function textFile(f, ctx) {
  const sim = ctx.sim;
  if (!sim) return null;
  sim.textFiles ||= new Map();
  if (!sim.textFiles.has(f.str)) {
    let text = sim.files?.get(f.str);
    if (text === undefined && sim.files) { const base = f.str.split('/').pop(); for (const [k, v] of sim.files) if (k.split('/').pop() === base) { text = v; break; } }
    sim.textFiles.set(f.str, text === undefined ? null : { lines: String(text).replace(/\r/g, '').split('\n').filter((l, i, a) => i < a.length - 1 || l !== ''), pos: 0 });
  }
  return sim.textFiles.get(f.str);
}
const TIME_UNIT_NAMES = [[1e12, 'sec'], [1e9, 'ms'], [1e6, 'us'], [1e3, 'ns'], [1, 'ps']];
function textioImage(v, t, op, extra) {
  if (isStr(v)) return v.str;
  if (op !== 'write' && t && t.kind === 'logic') {   // hwrite / owrite / bwrite of a vector
    const bits = V.toBin(v).toUpperCase(), g = op === 'hwrite' ? 4 : op === 'owrite' ? 3 : 1;
    if (g === 1) return bits;
    const padded = bits.padStart(Math.ceil(bits.length / g) * g, '0');
    let out = '';
    for (let i = 0; i < padded.length; i += g) { const c = padded.slice(i, i + g); out += /[^01]/.test(c) ? (/^Z+$/.test(c) ? 'Z' : 'X') : parseInt(c, 2).toString(16).toUpperCase(); }
    return out;
  }
  switch (t?.kind) {
    case 'logic': return V.toBin(v).toUpperCase();
    case 'bool': return v.x ? 'X' : v.v ? 'TRUE' : 'FALSE';
    case 'enum': return t.char ? String.fromCharCode(Number(v.v)) : (t.names[Number(v.v)] ?? V.toDec(v));
    case 'time': {   // in the unit given (ns by default): 15 ns, 2.5 us
      const ps = Number(V.toBig(v));
      let u = extra ? Number(V.toBig(extra)) : 1000;
      const name = (TIME_UNIT_NAMES.find(([k]) => k === u) || [0, null])[1];
      if (!name) u = 1000;
      return `${ps / u} ${name || 'ns'}`;
    }
    case 'real': {   // digits => 0: exponent form (1.500000e+00), else that many decimals
      const x = V.toReal(v), d = extra ? Number(V.toBig(extra)) : 0;
      return d > 0 ? x.toFixed(d) : x.toExponential(6).replace(/e([+-])(\d)$/, 'e$10$2');
    }
    default: return V.toDec(v, !!t?.s || t?.kind === 'int');
  }
}
// read: a value of the variable's type off the front of the line; null when there is none
function textioParse(text, t, op) {
  let i = 0;
  const skip = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  if (t.kind === 'str') { const n = t.slen ?? text.length; if (text.length < n) return null; return { val: { str: text.slice(0, n) }, rest: text.slice(n) }; }
  if (t.kind === 'enum' && t.char) { if (!text.length) return null; return { val: V.fromInt(text.charCodeAt(0) & 255, 8, false), rest: text.slice(1) }; }
  skip();
  const rest = j => text.slice(j);
  if (t.kind === 'int') {
    const m = /^[+-]?\d+/.exec(text.slice(i)); if (!m) return null;
    return { val: V.fromInt(parseInt(m[0], 10), 32, true), rest: rest(i + m[0].length) };
  }
  if (t.kind === 'bool') {
    const m = /^(true|false)\b/i.exec(text.slice(i)); if (!m) return null;
    return { val: V.fromBool(/^t/i.test(m[1])), rest: rest(i + m[0].length) };
  }
  if (t.kind === 'real') {
    const m = /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i)); if (!m) return null;
    return { val: V.real(parseFloat(m[0])), rest: rest(i + m[0].length) };
  }
  if (t.kind === 'logic') {
    const w = t.w, g = op === 'hread' ? 4 : op === 'oread' ? 3 : 1, nch = Math.ceil(w / g);
    let digits = '', j = i;
    while (digits.length < nch && j < text.length) { if (text[j] !== '_') digits += text[j]; j++; }
    if (digits.length < nch) return null;
    let bits = '';
    for (const c of digits) {
      if (g === 1) { const b = { '0': '0', '1': '1', x: 'x', z: 'z', u: 'x', w: 'x', l: '0', h: '1', '-': 'x' }[c.toLowerCase()]; if (b === undefined) return null; bits += b; }
      else { const k = parseInt(c, 16); if (Number.isNaN(k) || k >= 1 << g) return null; bits += k.toString(2).padStart(g, '0'); }
    }
    return { val: V.withSign(V.fromBits(bits.slice(bits.length - w)), !!t.s), rest: rest(j) };
  }
  return null;
}
export function textio(s, ctx) {
  const sim = ctx.sim;
  switch (s.op) {
    case 'deallocate': setLine(s.line, '', ctx); return;
    case 'write': case 'hwrite': case 'owrite': case 'bwrite': {
      const v = evalE(s.value, ctx);
      let text = textioImage(v, s.value.t, s.op, s.extra ? evalE(s.extra, ctx) : null);
      const field = s.field ? V.toNum(evalE(s.field, ctx)) : 0;
      if (text.length < field) text = s.justified === 'left' ? text.padEnd(field) : text.padStart(field);
      setLine(s.line, lineOf(s.line, ctx) + text, ctx);
      return;
    }
    case 'writeline': {
      const f = evalE(s.file, ctx), text = lineOf(s.line, ctx);
      if (f.std && f.str === 'input') throw new SimError('writeline to INPUT');
      if (f.mode === 'read_mode' && !f.std) throw new SimError(`writeline to '${f.str}', a file opened for reading`);
      if (sim) {
        if (f.std) sim.print(text);
        else { (sim.textOut ||= new Map()); if (!sim.textOut.has(f.str)) sim.textOut.set(f.str, []); sim.textOut.get(f.str).push(text); sim.print(`[${f.str}] ${text}`); }
      }
      setLine(s.line, '', ctx);
      return;
    }
    case 'readline': {
      const f = evalE(s.file, ctx);
      if (f.std) { setLine(s.line, '', ctx); return; }   // (no console input: an empty line)
      if (f.mode !== 'read_mode') throw new SimError(`readline from '${f.str}', a file opened for writing`);
      const tf = textFile(f, ctx);
      if (!tf) throw new SimError(`readline: file '${f.str}' not found in the project`);
      if (tf.pos >= tf.lines.length) throw new SimError(`readline: no line left in '${f.str}' (check endfile)`);
      setLine(s.line, tf.lines[tf.pos++], ctx);
      return;
    }
    case 'read': case 'hread': case 'oread': case 'bread': {
      const text = lineOf(s.line, ctx), r = textioParse(text, s.target.t, s.op);
      if (s.good) doAssign({ target: s.good, value: { k: 'c', val: V.fromBool(!!r), t: s.good.t }, nb: false }, ctx);
      if (!r) { if (!s.good) throw new SimError(`${s.op}: no value of the variable's type at the start of the line "${text}"`); return; }
      doAssign({ target: s.target, value: { k: 'c', val: r.val, t: s.target.t }, nb: false }, ctx);
      setLine(s.line, r.rest, ctx);
      return;
    }
  }
}

const VLOG_MATH = { $floor: Math.floor, $ceil: Math.ceil, $sqrt: Math.sqrt, $ln: Math.log, $log10: Math.log10, $exp: Math.exp, $pow: Math.pow, $sin: Math.sin, $cos: Math.cos, $tan: Math.tan, $asin: Math.asin, $acos: Math.acos, $atan: Math.atan, $atan2: Math.atan2, $hypot: Math.hypot, $sinh: Math.sinh, $cosh: Math.cosh, $tanh: Math.tanh };
export function mathReal(f, x, y) {
  if (VLOG_MATH[f]) return VLOG_MATH[f](x, y);   // Verilog's real math functions (IEEE 1800-2017 20.8)
  switch (f) {
    case 'ceil': return Math.ceil(x);
    case 'floor': return Math.floor(x);
    case 'round': return Math.sign(x) * Math.round(Math.abs(x));   // halves away from zero
    case 'trunc': return Math.trunc(x);
    case 'sqrt': if (x < 0) throw new SimError('sqrt of a negative real'); return Math.sqrt(x);
    case 'log2': if (x <= 0) throw new SimError('log2 of a real <= 0'); return Math.log2(x);
    case 'log10': if (x <= 0) throw new SimError('log10 of a real <= 0'); return Math.log10(x);
    case 'log': if (x <= 0) throw new SimError('log of a real <= 0'); return y === undefined ? Math.log(x) : Math.log(x) / Math.log(y);
    case 'exp': return Math.exp(x);
    case 'sign': return Math.sign(x);
    case 'realmax': return Math.max(x, y);
    case 'realmin': return Math.min(x, y);
    default: throw new SimError(`math_real function ${f} not supported`);
  }
}
