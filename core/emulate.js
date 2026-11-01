// Silinx - board emulator core: wires the top-level ports of a design to the resources of a
// board (through the UCF pin assignments) and turns recorded output activity into what the
// board would show (LED brightness, 7-segment digits with persistence of vision).
//
// Isomorphic ES module (browser + Node), no DOM.

/** Index of bit `i` of a port (as written in the UCF, e.g. opcode<3>) inside its value (bit 0 = LSB). */
export function bitPos(t, i) {
  if (!t || t.left === undefined) return 0;
  return t.desc ? i - t.right : t.right - i;
}

/** Bits of a port: [{ name: 'opcode<3>', index: 3, pos }] (a scalar port has one bit, name = port name). */
export function portBits(port) {
  const t = port.sig.t;
  if (!t || t.left === undefined || (t.w <= 1 && (t.scalar || t.kind !== 'logic'))) return [{ name: port.name, index: null, pos: 0 }];
  const out = [];
  const step = t.desc ? -1 : 1;
  for (let i = t.left; ; i += step) {
    out.push({ name: `${port.name}<${i}>`, index: i, pos: bitPos(t, i) });
    if (i === t.right) break;
  }
  return out;
}

const KIND = { led: 'led', sw: 'sw', btn: 'btn', seg: 'seg', dp: 'dp', an: 'an', rot_center: 'btn', rot_a: 'rot', rot_b: 'rot' };
function kindOf(res) {
  if (res.group === 'Clock') return 'clk';
  if (/^btn_/.test(res.name)) return 'btn';       // e.g. btn_north on the Spartan-3E Starter Kit
  if (res.group === 'LEDs' && res.dir === 'out') return 'led';   // e.g. the iCEBreaker's red and green LEDs (#2511)
  return KIND[res.name] || 'other';
}
/** The number of each LED resource's first LED among the board's LEDs: led's from 0, then the others (the iCEBreaker's
 *  LEDR_N, LEDG_N) after it in the board's order (#2511): { led: 0, ledr_n: 5, ledg_n: 6 }. */
export function ledNumbers(board) {
  const out = {};
  let n = 0;
  for (const r of [...(board?.resources || [])].sort((a, b) => (b.name === 'led') - (a.name === 'led'))) {
    if (kindOf(r) !== 'led') continue;
    out[r.name] = n;
    n += r.pins.length;
  }
  return out;
}
const periodPs = (p) => {
  const m = /([\d.]+)\s*(ps|ns|us)?/i.exec(String(p || ''));
  if (!m) return 20000;
  const v = parseFloat(m[1]);
  return Math.round(v * ({ ps: 1, ns: 1000, us: 1e6 }[(m[2] || 'ns').toLowerCase()]));
};

/**
 * Connect the ports of the top module to the board.
 * @param ports        design.top.ports ({ name, dir, sig })
 * @param assignments  parseUcf(...).assignments: { 'opcode<3>': { loc: 'B4' }, ... }
 * @param board        board definition with `resources` ({ name, group, pins, dir, extra })
 * @returns {{ bits: Array, clocks: Array, unmapped: Array, resources: Array }}
 *   bits: every port bit on a board resource { port, sig, pos, bit, res, kind, idx, loc } (an LED's: its number, led)
 */
export function boardWiring({ ports, assignments = {}, board }) {
  const byPin = new Map();
  for (const r of board?.resources || []) r.pins.forEach((pin, idx) => byPin.set(String(pin).toUpperCase(), { res: r, idx }));
  const asg = new Map(Object.entries(assignments).map(([k, v]) => [k.toLowerCase(), v]));
  const leds = ledNumbers(board);
  const bits = [], unmapped = [], clocks = [];
  for (const port of ports || []) {
    for (const b of portBits(port)) {
      // a 1-bit port also matches the other spelling (x / x<0>), as older UCFs may have it
      const a = asg.get(b.name.toLowerCase()) || (port.sig.t.w === 1 ? asg.get((b.index == null ? `${port.name}<0>` : port.name).toLowerCase()) : null);
      const loc = a?.loc ? String(a.loc).toUpperCase() : null;
      const hit = loc ? byPin.get(loc) : null;
      if (!hit) { unmapped.push({ port: port.name, bit: b.name, dir: port.dir, loc }); continue; }
      const entry = { port: port.name, dir: port.dir, sig: port.sig, pos: b.pos, bit: b.name, res: hit.res, idx: hit.idx, kind: kindOf(hit.res), loc };
      if (entry.kind === 'led') entry.led = leds[hit.res.name] + hit.idx;   // (its number among the board's LEDs)
      bits.push(entry);
      if (entry.kind === 'clk' && port.dir === 'in') clocks.push({ ...entry, period: periodPs(hit.res.extra?.period) });
    }
  }
  return { bits, clocks, unmapped };
}

/**
 * The clocks the emulator drives: the ports on a board clock pin; with none, a 1-bit input named clk… (clock, mclk)
 * that the UCF does not wire to the board, driven at 50 MHz (guessed). A clock port on a button or a switch is a
 * manual clock (one edge per press, #347): the board drives it, the emulator does not.
 */
export function emulatorClocks(wiring, ports) {
  if (wiring.clocks.length) return wiring.clocks;
  const wired = new Set(wiring.bits.filter(b => b.dir === 'in').map(b => b.sig));
  const c = (ports || []).find(p => p.dir === 'in' && /^(clk|clock|mclk)/i.test(p.name) && p.sig.t.w === 1 && !wired.has(p.sig));
  return c ? [{ sig: c.sig, port: c.name, period: 20000, guessed: true }] : [];
}
/** The manual clocks: 1-bit inputs named clk… on a button or a switch of the board ([{ port, res }]). */
export function manualClocks(wiring) {
  return wiring.bits.filter(b => b.dir === 'in' && /^(clk|clock|mclk)/i.test(b.port) && b.sig.t.w === 1 && (b.kind === 'btn' || b.kind === 'sw'));
}

// ---------------------------------------------------------------------------------------------
// Activity of output bits over a time window, from the waveforms the simulator recorded
// ---------------------------------------------------------------------------------------------

/** 0/1/null (unknown) of bit `pos` of a simulator value. */
export function bitValue(v, pos) {
  if (v == null || Array.isArray(v)) return null;
  const P = BigInt(pos);
  if (v.x && ((v.x >> P) & 1n)) return null;
  return Number((v.v >> P) & 1n);
}

/** Changes of one bit in [t0, t1]: [[t, 0|1|null], ...], first entry at t0. */
export function bitTrack(sig, pos, t0, t1) {
  const w = sig.wave;
  if (!w || !w.t.length) return [[t0, bitValue(sig.val, pos)]];
  let i = 0;
  while (i + 1 < w.t.length && w.t[i + 1] <= t0) i++;
  const out = [[t0, bitValue(w.v[i], pos)]];
  for (i++; i < w.t.length && w.t[i] < t1; i++) {
    const b = bitValue(w.v[i], pos);
    if (b !== out[out.length - 1][1]) out.push([w.t[i], b]);
  }
  return out;
}

/** Time in [t0, t1] during which pred(values of the tracks) holds. */
export function timeWhere(tracks, t0, t1, pred) {
  const idx = tracks.map(() => 0);
  const cur = tracks.map((tr) => tr[0][1]);
  let t = t0, total = 0;
  for (;;) {
    let next = t1;
    tracks.forEach((tr, k) => { const j = idx[k] + 1; if (j < tr.length && tr[j][0] < next) next = tr[j][0]; });
    if (pred(cur)) total += next - t;
    if (next >= t1) break;
    tracks.forEach((tr, k) => { while (idx[k] + 1 < tr.length && tr[idx[k] + 1][0] <= next) { idx[k]++; cur[k] = tr[idx[k]][1]; } });
    t = next;
  }
  return total;
}

/**
 * What the board shows after the window [t0, t1]:
 *   leds: [brightness 0..1 per LED index]  (fraction of time on)
 *   digits: [{ seg: [a..g brightness], dp }] per anode index, or null (blank)
 * A digit that is not lit in the window keeps its previous pattern (persistence of vision: a
 * multiplexed display lights one digit at a time) until another digit has been refreshed twice
 * since it was last lit (the scan went past it: it is blanked, e.g. leading-zero suppression).
 * When no digit is lit at all (display turned off) a digit goes dark after 4x the longest dark
 * gap seen between its refreshes (at least two windows).
 * Active levels come from the board resources (extra.activeLow).
 */
export function boardOutputs(wiring, t0, t1, prev = null) {
  // the times measured on the waveforms the simulator recorded
  const tracks = new Map();
  const track = (b) => { if (!tracks.has(b)) tracks.set(b, bitTrack(b.sig, b.pos, t0, t1)); return tracks.get(b); };
  return outputsOf(wiring, t0, t1, prev, {
    level: (b, v) => timeWhere([track(b)], t0, t1, ([x]) => x === v),
    both: (a, va, b, vb) => timeWhere([track(a), track(b)], t0, t1, ([x, y]) => x === va && y === vb),
  });
}

const onLevel = (b) => (b.res.extra?.activeLow ? 0 : 1);
// the output bits of the board's LEDs and display: { leds: [b], segs, dps, ans } (by resource index; an LED by its
// number among the board's LEDs, ledNumbers)
function displayBits(wiring) {
  const leds = [], segs = [], dps = [], ans = [];
  for (const b of wiring.bits) {
    if (b.dir !== 'out' && b.dir !== 'inout') continue;
    if (b.kind === 'led') leds[b.led ?? b.idx] = b;
    else if (b.kind === 'seg') segs[b.idx] = b;
    else if (b.kind === 'dp') dps[b.idx] = b;
    else if (b.kind === 'an') ans[b.idx] = b;
  }
  return { leds, segs, dps, ans };
}

// boardOutputs from the times measure gives: level(b, v), the time bit b is at v in the window; both(a, va, b, vb)
function outputsOf(wiring, t0, t1, prev, measure) {
  const span = Math.max(1, t1 - t0);
  const on = onLevel;
  const leds = [], digits = [], lit = [];
  const { leds: ledBits, segs: segBits, dps: dpBits, ans: anBits } = displayBits(wiring);
  ledBits.forEach((b, k) => { if (b) leds[k] = measure.level(b, on(b)) / span; });
  // refresh episodes: a digit starts one when it is lit in this window and was not in the previous one
  const episodes = [...(prev?.episodes || [])];
  const times = anBits.map((an) => (an ? measure.level(an, on(an)) : 0));
  times.forEach((time, k) => { if (time > 0 && !prev?.lit?.[k]?.on) episodes[k] = (episodes[k] || 0) + 1; });
  const anyLit = times.some((x) => x > 0);
  anBits.forEach((an, k) => {
    if (!an) return;
    const time = times[k];
    const p = prev?.lit?.[k];   // { last: end of the last window the digit was lit in, gap, snap: episodes then, on }
    if (time <= 0) {
      const passed = p && episodes.some((e, j) => j !== k && (e || 0) - (p.snap[j] || 0) >= 2);
      const keep = p && prev?.digits?.[k] && !passed && (anyLit || t1 - p.last <= Math.max(4 * p.gap, 2 * span));
      digits[k] = keep ? prev.digits[k] : null;
      lit[k] = p ? { ...p, on: false } : null;   // the history stays: the next refresh measures the real gap
      return;
    }
    const frac = (b) => (b ? measure.both(an, on(an), b, on(b)) / time : 0);
    digits[k] = { seg: Array.from({ length: 7 }, (_, j) => frac(segBits[j])), dp: frac(dpBits[0]) };
    // dark time in this window (the anode is multiplexed within it) or since the last window
    const gap = Math.max(span - time, p && prev?.digits?.[k] ? t0 - p.last : 0);   // a faded spell is not a refresh gap
    lit[k] = { last: t1, gap: Math.max(gap, p ? p.gap : 0), snap: [...episodes], on: true };
  });
  return { leds, digits, lit, episodes };
}

// ---------------------------------------------------------------------------------------------
// The same from what a cycle simulator counts (core/compiled-sim.js watch), cycle by cycle
// ---------------------------------------------------------------------------------------------

/**
 * What a cycle simulator has to count for boardOutputsFromCounts and lcdFeedEdges: { levels: [{ b, on }],
 * pairs: [[{ b, on }, { b, on }]], edges: [{ b, capture: [b] }] } (b: a bit of the wiring), and, to read the
 * counts back, index(b, v) / pairIndex(a, va, b, vb).
 */
export function outputWatch(wiring) {
  const { leds, segs, dps, ans } = displayBits(wiring);
  const levels = [], pairs = [], li = new Map(), pi = new Map();
  const level = (b) => { if (b && !li.has(b)) { li.set(b, levels.length); levels.push({ b, on: onLevel(b) }); } };
  leds.forEach(level);
  ans.forEach(level);
  for (const an of ans) {
    if (!an) continue;
    for (const b of [...segs.slice(0, 7), dps[0]]) {
      if (!b) continue;
      pi.set(`${wiring.bits.indexOf(an)},${wiring.bits.indexOf(b)}`, pairs.length);
      pairs.push([{ b: an, on: onLevel(an) }, { b, on: onLevel(b) }]);
    }
  }
  // the LCD's transfers: each falling edge of E, with RS, RW and the data bus (DB0..DB7, or the 4-bit D0..D3)
  const pin = (res, idx = 0) => wiring.bits.find((x) => x.res.name === res && x.idx === idx && x.dir !== 'in');
  const edges = [];
  const e = pin('lcd_e');
  if (e) {
    const wide = wiring.bits.some((x) => x.res.name === 'lcd_db');
    const data = wide ? Array.from({ length: 8 }, (_, i) => pin('lcd_db', i)) : Array.from({ length: 4 }, (_, i) => pin('lcd_d', i));
    edges.push({ b: e, capture: [pin('lcd_rs'), pin('lcd_rw'), ...data], width: wide ? 8 : 4 });
  }
  return {
    levels, pairs, edges,
    index: (b) => li.get(b),
    pairIndex: (a, b) => pi.get(`${wiring.bits.indexOf(a)},${wiring.bits.indexOf(b)}`),
  };
}

/**
 * boardOutputs for the window [t0, t1] from the cycles counted in it (outputWatch's levels then pairs, as
 * core/compiled-sim.js take() gives them), each cycle `period` long.
 */
export function boardOutputsFromCounts(wiring, watch, counts, period, t0, t1, prev = null) {
  return outputsOf(wiring, t0, t1, prev, {
    level: (b) => (counts[watch.index(b)] || 0) * period,
    both: (a, va, b) => (counts[watch.levels.length + watch.pairIndex(a, b)] || 0) * period,
  });
}

/** lcdFeed from the LCD's falling edges of E a cycle simulator captured (the values of outputWatch's capture bits). */
export function lcdFeedEdges(st, watch, captured) {
  const w = watch.edges[0];
  if (!w || !captured.length) return false;
  for (const v of captured) {
    let bus = 0;
    for (let k = 0; k < w.width; k++) bus |= ((v >>> (2 + k)) & 1) << k;
    lcdTransfer(st, v & 1, (v >>> 1) & 1, bus, w.width);
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Timing scale: designs count millions of clock cycles (dividers, debouncers); the emulator runs
// ~10^5 cycles/s, so the large integer generics of the top are divided to make them visible.
// ---------------------------------------------------------------------------------------------

// Integer generics that are sizes, not cycle counts: never divided
const SIZE_NAME = /WIDTH|DEPTH|SIZE|BITS|ADDR|WORDS|ENTRIES|BAUD|^N_|^(W|NB|AW|DW)$|_W$/i;

/** Timing generics of a top module ({ name, value }): its integer generics >= 1000 that are not sizes. */
export function timingGenerics(params) {
  return (params || []).filter((p) => p.t?.kind === 'int' && !SIZE_NAME.test(p.name))
    .map((p) => ({ name: p.name, value: Number(p.value?.v ?? p.value) }))
    .filter((p) => Number.isFinite(p.value) && Number.isInteger(p.value) && p.value >= 1000);
}

/** Automatic factor: the largest timing generic becomes ~1000 (1 when none is large). */
export function autoTimeScale(gens) {
  const max = Math.max(0, ...gens.map((g) => g.value));
  return max >= 100000 ? 10 ** (Math.floor(Math.log10(max)) - 3) : 1;
}

/** Overrides for elaborate(): every timing generic divided by `scale` (at least 1). */
export function scaledGenerics(gens, scale) {
  if (!scale || scale <= 1) return {};
  return Object.fromEntries(gens.map((g) => [g.name, Math.max(1, Math.round(g.value / scale))]));
}

// ---------------------------------------------------------------------------------------------
// Character LCD (HD44780 controller), as on the Spartan-3E / 3A Starter Kits.
// The controller latches RS, R/W and the data bus on each falling edge of E. After power-up it is
// in 8-bit mode (one transfer per command, DB7..DB4); a function set with DL = 0 switches it to
// 4-bit mode, where every byte is two transfers (high nibble first).
// ---------------------------------------------------------------------------------------------

/** New controller state (after power-up). */
export function lcdState() {
  return { mode8: true, half: null, ddram: new Array(128).fill(0x20), cgram: new Array(64).fill(0), addr: 0, cg: false,
    inc: true, shift: false, on: false, cursor: false, blink: false, dshift: 0, lines2: true, writes: 0, lastE: null };
}

/** Move the address counter one position (`fwd`: increment), wrapping like the HD44780. */
function lcdStep(st, fwd) {
  if (st.cg) { st.addr = (st.addr + (fwd ? 1 : 63)) & 63; return; }
  let a = (st.addr & 0x7f) + (fwd ? 1 : -1);
  if (st.lines2) {
    // 2-line mode: DDRAM 0x00..0x27 and 0x40..0x67
    if (a === 0x28) a = 0x40; else if (a >= 0x68) a = 0x00; else if (a === 0x3f) a = 0x27; else if (a < 0) a = 0x67;
  } else if (a >= 0x50) a = 0x00;   // 1-line mode: DDRAM 0x00..0x4F
  else if (a < 0) a = 0x4f;
  st.addr = a;
}

/** Execute one byte (RS = 0: instruction, RS = 1: data). */
export function lcdExec(st, byte, rs) {
  if (rs) {
    st.writes++;
    if (st.cg) st.cgram[st.addr & 63] = byte; else st.ddram[st.addr & 127] = byte;
    lcdStep(st, st.inc);
    if (st.shift && !st.cg) st.dshift += st.inc ? 1 : -1;
    return;
  }
  if (byte & 0x80) { st.addr = byte & 0x7f; st.cg = false; }
  else if (byte & 0x40) { st.addr = byte & 0x3f; st.cg = true; }
  else if (byte & 0x20) { st.mode8 = !!(byte & 0x10); st.half = null; st.lines2 = !!(byte & 0x08); }
  else if (byte & 0x10) {
    const right = !!(byte & 0x04);
    if (byte & 0x08) st.dshift += right ? -1 : 1;          // display shift
    else lcdStep(st, right);                                // cursor move
  } else if (byte & 0x08) { st.on = !!(byte & 0x04); st.cursor = !!(byte & 0x02); st.blink = !!(byte & 0x01); }
  else if (byte & 0x04) { st.inc = !!(byte & 0x02); st.shift = !!(byte & 0x01); }
  else if (byte & 0x02) { st.addr = 0; st.dshift = 0; st.cg = false; }
  else if (byte & 0x01) { st.ddram.fill(0x20); st.addr = 0; st.dshift = 0; st.inc = true; st.cg = false; }
}

/** One transfer on the bus: `bus` = DB7..DB4 (4-bit wiring) or DB7..DB0 (`width` 8). */
export function lcdTransfer(st, rs, rw, bus, width = 4) {
  const nib = width === 8 ? (bus >> 4) & 15 : bus & 15;
  if (rw) {
    // reads: busy flag / address (RS = 0) or data (RS = 1, the address counter advances as after a write)
    let done = st.mode8;
    if (!st.mode8) { done = st.half !== null; st.half = done ? null : 0; }
    if (done && rs) lcdStep(st, st.inc);
    return;
  }
  if (st.mode8) { lcdExec(st, width === 8 ? bus & 255 : nib << 4, rs); return; }
  if (st.half === null) { st.half = nib; return; }
  const byte = (st.half << 4) | nib;
  st.half = null;
  lcdExec(st, byte, rs);
}

/** The two lines shown (character codes, 16 each), or null when the display is off. */
export function lcdText(st) {
  if (!st.on) return null;
  const line = (base) => Array.from({ length: 16 }, (_, i) => st.ddram[base + (((i + st.dshift) % 40) + 40) % 40]);
  return [line(0x00), line(0x40)];
}

/**
 * Feed the LCD with the bus activity recorded in [t0, t1] (the falling edges of E). The LCD's
 * port bits are found on the board resources lcd_e, lcd_rs, lcd_rw and lcd_d (DB4..DB7) or lcd_db
 * (DB0..DB7). Windows must follow each other (t0 = previous t1): the state remembers E between them.
 */
export function lcdFeed(st, wiring, t0, t1) {
  const pin = (res, idx = 0) => wiring.bits.find((b) => b.res.name === res && b.idx === idx);
  const e = pin('lcd_e');
  if (!e) return false;
  const wide = wiring.bits.some((b) => b.res.name === 'lcd_db');
  const dbits = wide ? Array.from({ length: 8 }, (_, i) => pin('lcd_db', i)) : Array.from({ length: 4 }, (_, i) => pin('lcd_d', i));
  const et = bitTrack(e.sig, e.pos, t0, t1);
  const tracks = new Map();
  const tr = (b) => { if (!b) return null; if (!tracks.has(b)) tracks.set(b, bitTrack(b.sig, b.pos, t0, t1)); return tracks.get(b); };
  const before = (track, t) => { if (!track) return 0; let v = track[0][1]; for (const [tt, x] of track) { if (tt >= t) break; v = x; } return v === 1 ? 1 : 0; };
  const rs = pin('lcd_rs'), rw = pin('lcd_rw');
  let fed = false;
  // E as it was at the end of the previous window: a falling edge exactly on the boundary shows
  // up only as the first value of this window
  const lastE = st.lastE;
  st.lastE = et[et.length - 1][1];
  for (let i = 0; i < et.length; i++) {
    if (!((i ? et[i - 1][1] : lastE) === 1 && et[i][1] === 0)) continue;
    const t = et[i][0];
    let bus = 0;
    dbits.forEach((b, k) => { bus |= before(tr(b), t + 1) << k; });
    lcdTransfer(st, before(tr(rs), t + 1), before(tr(rw), t + 1), bus, wide ? 8 : 4);
    fed = true;
  }
  return fed;
}
