// The templates of the Schematic Wizard that are circuits of several blocks (#2231; their list: core/chart-templates.js,
// the others and the sheet they draw on: core/sch-templates.js): CIRCUITS[id] = { ports(params), draw(d, params, top) },
// draw returning the lowest row it used. Isomorphic (no DOM).

import { symbolDef } from './schdoc.js';

const IN = 'in', OUT = 'out';
const port = (role, dir, width = 1) => ({ role, name: role, dir, width });
const bitsFor = n => Math.max(1, Math.ceil(Math.log2(n)));
const GATE = { width: 1, bits: false };
const COUNTER = (width, reset, en = false) => ({ width, en, reset, dir: 'up', bits: false });

// a constant is as wide as its value is long
const CONST = (value, width) => ({ value, width });
const constW = c => symbolDef({ type: 'constant', params: c, x: 0, y: 0, rot: 0, mirror: false }).w;

// a marker and its wire to the first point, along the points
function input(d, role, width, y, ...pts) {
  d.marker(role, IN, width, d.xIn, y);
  d.wire({ x: d.xIn, y }, ...pts);
}
function output(d, role, width, x, from) {
  d.marker(role, OUT, width, x, from.y);
  d.wire(from, { x, y: from.y });
}

// the tick generator: a counter of N states, cleared by a comparator with N-1 (or by the OR's other input, rst). The
// row y-10 is free above it, for the clock; its feedback runs along the row y+70, under it
function tickGenerator(d, ox, y, modulus) {
  const w = bitsFor(modulus), k = CONST(String(modulus - 1), w), cx = ox + 120, mx = cx + 130 + constW(k) + 20, xf = mx + 120;
  const R = d.sym('or2', GATE, ox, y + 10);
  const C = d.sym('counter', COUNTER(w, 'sync'), cx, y);
  const K = d.sym('constant', k, mx - 20 - constW(k), y + 20);
  const M = d.sym('compare', { width: w, op: 'eq', signed: false }, mx, y);
  d.wire(R.pin('O'), C.pin('R'));
  d.wire(C.pin('Q'), M.pin('A'));
  d.wire(K.pin('O'), M.pin('B'));
  const eq = M.pin('O'), i1 = R.pin('I1');
  d.wire(eq, { x: xf, y: eq.y });
  d.wire({ x: xf, y: eq.y }, { x: xf, y: y + 70 }, { x: ox - 20, y: y + 70 }, { x: ox - 20, y: i1.y }, i1);
  return { clk: C.pin('C'), rst: R.pin('I0'), tick: { x: xf, y: eq.y }, cx };
}

// the counter modulo N: its own synchronous reset when it reaches N-1 and is counting (tc, to chain another one)
function drawModCounter(d, p, top) {
  const n = Number(p.n), w = bitsFor(n), k = CONST(String(n - 1), w), ox = d.xIn + 60, y = top + 30, cx = ox + 120, mx = cx + 140 + constW(k) + 20, ax = mx + 140, xf = ax + 100, xOut = xf + 60;
  const R = d.sym('or2', GATE, ox, y + 40);
  const C = d.sym('counter', COUNTER(w, 'sync', true), cx, y);
  const K = d.sym('constant', k, mx - 20 - constW(k), y + 20);
  const M = d.sym('compare', { width: w, op: 'eq', signed: false }, mx, y);
  const A = d.sym('and2', GATE, ax, y);
  input(d, 'ce', 1, C.pin('CE').y, C.pin('CE'));
  d.wire({ x: ox - 20, y: y + 10 }, { x: ox - 20, y: y - 30 }, { x: ax - 40, y: y - 30 }, { x: ax - 40, y: y + 10 }, A.pin('I0'));
  input(d, 'clk', 1, C.pin('C').y, C.pin('C'));
  input(d, 'rst', 1, R.pin('I0').y, R.pin('I0'));
  d.wire(R.pin('O'), { x: cx - 20, y: R.pin('O').y }, { x: cx - 20, y: C.pin('R').y }, C.pin('R'));
  d.wire(C.pin('Q'), M.pin('A'));
  d.wire(K.pin('O'), M.pin('B'));
  const eq = M.pin('O');
  d.wire(eq, { x: ax - 20, y: eq.y }, { x: ax - 20, y: A.pin('I1').y }, A.pin('I1'));
  const tc = A.pin('O');
  output(d, 'tc', 1, xOut, tc);
  d.wire({ x: xf, y: tc.y }, { x: xf, y: y + 110 }, { x: ox - 20, y: y + 110 }, { x: ox - 20, y: R.pin('I1').y }, R.pin('I1'));
  const qx = cx + 110, q = { x: qx, y: y + 90 };
  d.wire({ x: qx, y: C.pin('Q').y }, q);
  output(d, 'q', w, xOut, q);
  return y + 110;
}

// the clock divider: a tick of one clock period, every N clocks
function drawClockDiv(d, p, top) {
  const y = top + 20, T = tickGenerator(d, d.xIn + 60, y, Number(p.n));
  input(d, 'clk', 1, y - 10, { x: T.cx - 20, y: y - 10 }, { x: T.cx - 20, y: T.clk.y }, T.clk);
  input(d, 'rst', 1, T.rst.y, T.rst);
  output(d, 'tick', 1, T.tick.x + 60, T.tick);
  return y + 70;
}

// PWM: a free counter compared with the duty kept in a register
function drawPwm(d, p, top) {
  const n = Number(p.n), y = top, rx = d.xIn + 100, mx = rx + 150, xOut = mx + 140;
  const F = d.sym('fdce', { width: n }, rx, y);
  const C = d.sym('counter', COUNTER(n, 'async'), rx, y + 110);
  const M = d.sym('compare', { width: n, op: 'gt', signed: false }, mx, y + 50);
  input(d, 'duty', n, F.pin('D').y, F.pin('D'));
  input(d, 'load', 1, F.pin('CE').y, F.pin('CE'));
  input(d, 'clk', 1, F.pin('C').y, F.pin('C'));
  input(d, 'rst', 1, F.pin('CLR').y, F.pin('CLR'));
  d.wire({ x: rx - 20, y: F.pin('C').y }, { x: rx - 20, y: C.pin('C').y }, C.pin('C'));
  d.wire({ x: rx - 40, y: F.pin('CLR').y }, { x: rx - 40, y: C.pin('CLR').y }, C.pin('CLR'));
  d.wire(F.pin('Q'), { x: mx - 40, y: F.pin('Q').y }, { x: mx - 40, y: M.pin('A').y }, M.pin('A'));
  d.wire(C.pin('Q'), { x: mx - 40, y: C.pin('Q').y }, { x: mx - 40, y: M.pin('B').y }, M.pin('B'));
  output(d, 'pwm', 1, xOut, M.pin('O'));
  return C.pin('CLR').y;
}

// the edge detector: the input and its value one clock ago, the gate seeing them differ
function drawEdge(d, p, top) {
  const y = top + 20, fx = d.xIn + 80, gx = fx + 190, xOut = gx + 140, kind = p.kind;
  const F = d.sym('fdc', { width: 1 }, fx, y);
  const G = d.sym(kind === 'both' ? 'xor2' : 'and2b1', GATE, gx, y);
  // (the upper and the lower input of the gate: and2b1's lower one, I0, is the inverted one)
  const [upper, lower] = kind === 'both' ? ['I0', 'I1'] : ['I1', 'I0'];
  const d0 = F.pin('D'), q = F.pin('Q');
  input(d, 'd', 1, d0.y, d0);
  input(d, 'clk', 1, F.pin('C').y, F.pin('C'));
  input(d, 'rst', 1, F.pin('CLR').y, F.pin('CLR'));
  if (kind === 'fall') {
    // the old value at the upper input; the input, around, at the inverted one
    d.wire(q, G.pin(upper));
    d.wire({ x: fx - 20, y: d0.y }, { x: fx - 20, y: y - 10 }, { x: gx - 40, y: y - 10 }, { x: gx - 40, y: G.pin(lower).y }, G.pin(lower));
  } else {
    d.wire({ x: fx - 20, y: d0.y }, { x: fx - 20, y: y - 10 }, { x: gx - 20, y: y - 10 }, { x: gx - 20, y: G.pin(upper).y }, G.pin(upper));
    d.wire(q, { x: gx - 40, y: q.y }, { x: gx - 40, y: G.pin(lower).y }, G.pin(lower));
  }
  output(d, 'pulse', 1, xOut, G.pin('O'));
  return F.pin('CLR').y;
}

// the debouncer: two flip-flops bring the input into the clock's domain, the third one samples it at each tick
function drawDebounce(d, p, top) {
  const y = top, ox = d.xIn + 60, yt = y + 110, yc = y + 80;
  const T = tickGenerator(d, ox, yt, Number(p.n));
  const f3 = T.tick.x + 60;
  const A = d.sym('fd', { width: 1 }, ox, y), B = d.sym('fd', { width: 1 }, ox + 180, y), S = d.sym('fdce', { width: 1 }, f3, y);
  input(d, 'd', 1, A.pin('D').y, A.pin('D'));
  d.wire(A.pin('Q'), B.pin('D'));
  d.wire(B.pin('Q'), S.pin('D'));
  // the clock, a row under the flip-flops
  input(d, 'clk', 1, yc, { x: f3 - 40, y: yc }, { x: f3 - 40, y: S.pin('C').y }, S.pin('C'));
  for (const F of [A, B]) { const c = F.pin('C'); d.wire({ x: c.x - 20, y: yc }, { x: c.x - 20, y: c.y }, c); }
  d.wire({ x: T.cx - 20, y: yc }, { x: T.cx - 20, y: T.clk.y }, T.clk);
  // the tick to the clock enable, the reset around, under the tick generator
  d.wire(T.tick, { x: T.tick.x, y: S.pin('CE').y }, S.pin('CE'));
  const low = yt + 90;
  input(d, 'rst', 1, T.rst.y, T.rst);
  d.wire({ x: ox - 40, y: T.rst.y }, { x: ox - 40, y: low }, { x: f3 - 20, y: low }, { x: f3 - 20, y: S.pin('CLR').y }, S.pin('CLR'));
  output(d, 'q', 1, f3 + 150, S.pin('Q'));
  return low;
}

// the adder-subtractor: the second operand, or its complement, chosen by sub, which is also the carry in; the overflow
// from the top bits of the operands and of the result
function drawAddSub(d, p, top) {
  const n = Number(p.n), m = n - 1, msb = { msb: m, lsb: m }, y = top + 60;
  const ix = d.xIn + 60, mx = ix + 120, ax = mx + 200, tx = ax + 100, gx = tx + 80, hx = gx + 120, xOut = hx + 140;
  const I = d.sym('inv', { width: n, bits: false }, ix, y + 60);
  const X = d.sym('mux2', { width: n, en: false }, mx, y + 30);
  const S = d.sym('add', { width: n, cin: true, cout: true }, ax, y + 30);
  // a: above the multiplexer, to the adder; its top bit on along the same row
  const ya = y - 60, sa = d.sym('slice', msb, ax + 10, ya);
  input(d, 'a', n, ya, { x: ax - 20, y: ya }, { x: ax - 20, y: S.pin('A').y }, S.pin('A'));
  d.wire({ x: ax - 20, y: ya }, sa.pin('I'));
  // b, and its complement
  const d0 = X.pin('D0');
  input(d, 'b', n, d0.y, d0);
  d.wire({ x: ix - 20, y: d0.y }, { x: ix - 20, y: I.pin('I').y }, I.pin('I'));
  d.wire(I.pin('O'), X.pin('D1'));
  const o = X.pin('O');
  d.wire(o, S.pin('B'));
  // sub: the select and the carry in
  const ysub = y + 130, s0 = X.pin('S0'), ci = S.pin('CI');
  input(d, 'sub', 1, ysub, { x: ax - 20, y: ysub }, { x: ax - 20, y: ci.y }, ci);
  d.wire({ x: s0.x, y: ysub }, s0);
  // the top bits: of the operand chosen, of the sum
  const sbx = mx + 120, sb = d.sym('slice', msb, sbx, y);
  d.wire({ x: sbx, y: o.y }, sb.pin('I'));
  const s = S.pin('S'), ss = d.sym('slice', msb, tx, s.y - 20);
  d.wire({ x: tx, y: s.y }, ss.pin('I'));
  output(d, 's', n, xOut, s);
  output(d, 'co', 1, xOut, S.pin('CO'));
  // the operands' signs equal, the sum's another: (a xor s) and (b xor s)
  const X1 = d.sym('xor2', GATE, gx, y - 60), X2 = d.sym('xor2', GATE, gx, y), A = d.sym('and2', GATE, hx, y - 30);
  d.wire(sa.pin('O'), X1.pin('I0'));
  d.wire(sb.pin('O'), X2.pin('I0'));
  const sm = ss.pin('O');
  d.wire(sm, { x: gx - 20, y: sm.y }, { x: gx - 20, y: X2.pin('I1').y }, X2.pin('I1'));
  d.wire({ x: gx - 20, y: X2.pin('I1').y }, { x: gx - 20, y: X1.pin('I1').y }, X1.pin('I1'));
  d.wire(X1.pin('O'), { x: hx - 20, y: X1.pin('O').y }, { x: hx - 20, y: A.pin('I0').y }, A.pin('I0'));
  d.wire(X2.pin('O'), { x: hx - 20, y: X2.pin('O').y }, { x: hx - 20, y: A.pin('I1').y }, A.pin('I1'));
  output(d, 'ov', 1, xOut, A.pin('O'));
  return ysub;
}

// the accumulator: the adder's sum kept in the register, the register back into the adder
function drawAccumulator(d, p, top) {
  const n = Number(p.n), y = top + 30, ax = d.xIn + 100, rx = ax + 160, xq = rx + 130, xOut = xq + 60;
  const A = d.sym('add', { width: n, cin: false, cout: false }, ax, y);
  const F = d.sym('fdce', { width: n }, rx, y + 60);
  input(d, 'd', n, A.pin('B').y, A.pin('B'));
  input(d, 'ce', 1, F.pin('CE').y, F.pin('CE'));
  input(d, 'clk', 1, F.pin('C').y, F.pin('C'));
  input(d, 'rst', 1, F.pin('CLR').y, F.pin('CLR'));
  d.wire(A.pin('S'), { x: rx - 20, y: A.pin('S').y }, { x: rx - 20, y: F.pin('D').y }, F.pin('D'));
  const q = F.pin('Q');
  output(d, 'q', n, xOut, q);
  d.wire({ x: xq, y: q.y }, { x: xq, y: y - 20 }, { x: ax - 20, y: y - 20 }, { x: ax - 20, y: A.pin('A').y }, A.pin('A'));
  return F.pin('CLR').y;
}

// the seven segments of a hexadecimal digit, active low: gfedcba (the same as examples/stopwatch/src/sevenseg.vhd)
export const HEX_SEGMENTS = ['1000000', '1111001', '0100100', '0110000', '0011001', '0010010', '0000010', '1111000',
  '0000000', '0010000', '0001000', '0000011', '1000110', '0100001', '0000110', '0001110'];

// the display: a tick moves a counter from digit to digit; the counter chooses the digit (a multiplexer), whose segments
// a 16:1 multiplexer of constants looks up, and lights its anode (a decoder, inverted: active low)
function drawDisplay(d, p, top) {
  const k = Number(p.k), sel = bitsFor(k), ox = d.xIn + 60, y = top + 20;
  const T = tickGenerator(d, ox, y, Number(p.n));
  const sx = T.tick.x + 60, xq = sx + 110, dx = sx + 130, ix = dx + 160, xv = sx + 210;
  const kw = Math.max(...HEX_SEGMENTS.map(b => constW(CONST(`0b${b}`, 7)))), tx = xv + 20 + kw + 20;
  const C = d.sym('counter', COUNTER(sel, 'async', true), sx, y);
  // the tick generator's own, then the digit counter's
  input(d, 'clk', 1, y - 10, { x: sx - 20, y: y - 10 }, { x: sx - 20, y: C.pin('C').y }, C.pin('C'));
  d.wire({ x: T.cx - 20, y: y - 10 }, { x: T.cx - 20, y: T.clk.y }, T.clk);
  input(d, 'rst', 1, T.rst.y, T.rst);
  const low = y + 90;
  d.wire({ x: ox - 40, y: T.rst.y }, { x: ox - 40, y: low }, { x: sx - 40, y: low }, { x: sx - 40, y: C.pin('CLR').y }, C.pin('CLR'));
  d.wire(T.tick, { x: sx - 40, y: T.tick.y }, { x: sx - 40, y: C.pin('CE').y }, C.pin('CE'));
  // the anode of the digit
  const q = C.pin('Q');
  const D = d.sym('decoder', { n: sel, en: false, bus: true }, dx, q.y - 40);
  const I = d.sym('inv', { width: k, bits: false }, ix, q.y - 10);
  d.wire(q, D.pin('A'));
  d.wire(D.pin('D'), I.pin('I'));
  output(d, 'an', k, tx + 200, I.pin('O'));
  // the digit: a slice of d each, to the multiplexer
  const my = y + 130, bx = ox, mx = bx + 100;
  const M = d.sym(`mux${k}`, { width: 4, en: false, ...(k > 2 ? { selBus: true } : {}) }, mx, my);
  for (let i = 0; i < k; i++) {
    const pin = M.pin(`D${i}`), s = d.sym('slice', { msb: 4 * i + 3, lsb: 4 * i }, bx, pin.y - 10);
    d.wire(s.pin('O'), pin);
    if (!i) input(d, 'd', 4 * k, s.pin('I').y, s.pin('I'));
    else d.wire({ x: bx, y: pin.y - 30 }, s.pin('I'));
  }
  const s = M.pin(k > 2 ? 'S' : 'S0'), ys = s.y + 20;
  d.wire({ x: xq, y: q.y }, { x: xq, y: ys }, { x: s.x, y: ys }, s);
  // the segments of the digit: a constant for each value
  const ty = y + 110, H = d.sym('mux16', { width: 7, en: false, selBus: true }, tx, ty);
  HEX_SEGMENTS.forEach((bits, i) => {
    const pin = H.pin(`D${i}`), K = d.sym('constant', CONST(`0b${bits}`, 7), tx - 20 - kw, pin.y - 10);
    d.wire(K.pin('O'), pin);
  });
  const o = M.pin('O'), sv = H.pin('S'), yv = sv.y + 20;
  d.wire(o, { x: xv, y: o.y }, { x: xv, y: yv }, { x: sv.x, y: yv }, sv);
  output(d, 'seg', 7, tx + 200, H.pin('O'));
  return Math.max(yv, ys);
}

export const CIRCUITS = {
  modcounter: {
    ports: p => [port('ce', IN), port('clk', IN), port('rst', IN), port('q', OUT, bitsFor(Number(p.n))), port('tc', OUT)],
    draw: drawModCounter,
  },
  clockdiv: { ports: () => [port('clk', IN), port('rst', IN), port('tick', OUT)], draw: drawClockDiv },
  pwm: {
    ports: p => [port('duty', IN, Number(p.n)), port('load', IN), port('clk', IN), port('rst', IN), port('pwm', OUT)],
    draw: drawPwm,
  },
  edge: { ports: () => [port('d', IN), port('clk', IN), port('rst', IN), port('pulse', OUT)], draw: drawEdge },
  debounce: { ports: () => [port('d', IN), port('clk', IN), port('rst', IN), port('q', OUT)], draw: drawDebounce },
  addsub: {
    ports: p => { const n = Number(p.n); return [port('a', IN, n), port('b', IN, n), port('sub', IN), port('s', OUT, n), port('co', OUT), port('ov', OUT)]; },
    draw: drawAddSub,
  },
  accumulator: {
    ports: p => { const n = Number(p.n); return [port('d', IN, n), port('ce', IN), port('clk', IN), port('rst', IN), port('q', OUT, n)]; },
    draw: drawAccumulator,
  },
  display: {
    ports: p => { const k = Number(p.k); return [port('d', IN, 4 * k), port('clk', IN), port('rst', IN), port('seg', OUT, 7), port('an', OUT, k)]; },
    draw: drawDisplay,
  },
};
