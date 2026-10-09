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
  if (!t || t.w <= 1 || t.left === undefined) return [{ name: port.name, index: null, pos: 0 }];
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
  return KIND[res.name] || 'other';
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
 *   bits: every port bit on a board resource { port, sig, pos, bit, res, kind, idx, loc }
 */
export function boardWiring({ ports, assignments = {}, board }) {
  const byPin = new Map();
  for (const r of board?.resources || []) r.pins.forEach((pin, idx) => byPin.set(String(pin).toUpperCase(), { res: r, idx }));
  const asg = new Map(Object.entries(assignments).map(([k, v]) => [k.toLowerCase(), v]));
  const bits = [], unmapped = [], clocks = [];
  for (const port of ports || []) {
    for (const b of portBits(port)) {
      const a = asg.get(b.name.toLowerCase()) || (b.index === 0 && port.sig.t.w === 1 ? asg.get(`${port.name}<0>`.toLowerCase()) : null);
      const loc = a?.loc ? String(a.loc).toUpperCase() : null;
      const hit = loc ? byPin.get(loc) : null;
      if (!hit) { unmapped.push({ port: port.name, bit: b.name, dir: port.dir, loc }); continue; }
      const entry = { port: port.name, dir: port.dir, sig: port.sig, pos: b.pos, bit: b.name, res: hit.res, idx: hit.idx, kind: kindOf(hit.res), loc };
      bits.push(entry);
      if (entry.kind === 'clk' && port.dir === 'in') clocks.push({ ...entry, period: periodPs(hit.res.extra?.period) });
    }
  }
  return { bits, clocks, unmapped };
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
 *   digits: [{ seg: [a..g brightness], dp }] per anode index, or null when the digit was not
 *           lit in the window (the caller keeps the previous pattern: persistence of vision)
 * Active levels come from the board resources (extra.activeLow).
 */
export function boardOutputs(wiring, t0, t1, prev = null) {
  const span = Math.max(1, t1 - t0);
  const on = (b) => (b.res.extra?.activeLow ? 0 : 1);
  const leds = [], digits = [];
  const segBits = [], dpBits = [], anBits = [];
  for (const b of wiring.bits) {
    if (b.dir !== 'out' && b.dir !== 'inout') continue;
    if (b.kind === 'led') leds[b.idx] = timeWhere([bitTrack(b.sig, b.pos, t0, t1)], t0, t1, ([v]) => v === on(b)) / span;
    else if (b.kind === 'seg') segBits[b.idx] = b;
    else if (b.kind === 'dp') dpBits[b.idx] = b;
    else if (b.kind === 'an') anBits[b.idx] = b;
  }
  anBits.forEach((an, k) => {
    if (!an) return;
    const at = bitTrack(an.sig, an.pos, t0, t1);
    const lit = timeWhere([at], t0, t1, ([v]) => v === on(an));
    if (lit <= 0) { digits[k] = prev?.digits?.[k] ?? null; return; }
    const frac = (b) => (b ? timeWhere([at, bitTrack(b.sig, b.pos, t0, t1)], t0, t1, ([a, s]) => a === on(an) && s === on(b)) / lit : 0);
    digits[k] = { seg: Array.from({ length: 7 }, (_, j) => frac(segBits[j])), dp: frac(dpBits[0]) };
  });
  return { leds, digits };
}
