// Silinx toolchain - the timing checks (#405: out of core/fpga/timing.js): the clocks (ports, switches, DCM outputs)
// and their requirements, the periods, cross-clock paths, OFFSET IN / OUT and switching limits checked against the
// constraints, and the timing report.
import { CLOCK_PIN } from './timing.js';

/**
 * The port a clock net comes from: its driver is followed back through the clock buffers (BUFGMUX,
 * BUFG, the input buffer) to the I/O site, which the packer names after the port. null when the net
 * does not come from a pad (a clock made by logic).
 */
export function clockPort(design, netName) {
  const driverOf = new Map();
  for (const n of design.nets) for (const p of n.outpins || []) driverOf.set(n.name, p.inst);
  const inst = new Map(design.insts.map(i => [i.name, i]));
  const inNet = new Map();   // buffer instance -> the net on its data input (I0 / I, not the select S)
  for (const n of design.nets) for (const p of n.inpins || []) if (/^I0?$/.test(p.pin)) inNet.set(p.inst, n.name);
  let net = netName;
  for (let k = 0; k < 6 && net; k++) {
    const i = inst.get(driverOf.get(net));
    if (!i) return null;
    if (/^(IOB|IBUF|IBUFG|IOBS|IOBM|DIFFM|DIFFS)$/.test(i.type)) return i.name;
    if (!/^BUFG/.test(i.type)) return null;
    net = inNet.get(i.name);
  }
  return null;
}

// The clocks of the clock switches (#846): Map net driven by a BUFGMUX with I1 -> the ports (lower case) of its I1
function switchPorts(design) {
  const out = new Map(), i1 = new Map();
  for (const n of design.nets) for (const p of n.inpins || []) if (p.pin === 'I1') i1.set(p.inst, n.name);
  const type = new Map(design.insts.map(i => [i.name, i.type]));
  for (const n of design.nets) {
    const d = n.outpins?.[0];
    if (!d || type.get(d.inst) !== 'BUFGMUX' || !i1.has(d.inst)) continue;
    const port = clockPort(design, i1.get(d.inst));
    if (port) out.set(n.name, [String(port).toLowerCase()]);
  }
  return out;
}

// A DCM's outputs (#601): [period, the first rising edge], in its input clock's periods (CLKIN's, halved first when
// CLKIN_DIVIDE_BY_2), as trce derives their PERIOD constraints from the input's; CLKDV and CLKFX from the settings
const DCM_OUT = { CLK0: [1, 0], CLK90: [1, 0.25], CLK180: [1, 0.5], CLK270: [1, 0.75], CLK2X: [0.5, 0], CLK2X180: [0.5, 0.25] };
function dcmOutput(inst, pin) {
  const cfg = a => inst.cfg?.find(c => c.attr === a)?.value;
  const div2 = cfg('CLKIN_DIVIDE_BY_2') ? 2 : 1;
  let f, o;
  if (DCM_OUT[pin]) [f, o] = DCM_OUT[pin];
  else if (pin === 'CLKDV') [f, o] = [parseFloat(String(cfg('CLKDV_DIVIDE') || '2').replace('_', '.')), 0];   // (2.5 written 2_5, #847)
  else if (pin === 'CLKFX' || pin === 'CLKFX180') { f = (parseInt(cfg('CLKFX_DIVIDE') || '1', 10) || 1) / (parseInt(cfg('CLKFX_MULTIPLY') || '4', 10) || 4); o = pin === 'CLKFX' ? 0 : f / 2; }
  else return null;
  // a fixed phase shift: every output, PHASE_SHIFT / 256 of CLKIN's period later
  const shift = cfg('CLKOUT_PHASE_SHIFT') === 'FIXED' ? (parseInt(cfg('PHASE_SHIFT') || '0', 10) || 0) / 256 : 0;
  return { f: f * div2, o: o * div2 + shift };
}

/**
 * Where each clock of the design comes from (#601): Map clock net -> { port, f, o, via } or no entry for a clock made by
 * logic. port: the input pad's (as clockPort); f: its period, o: its first rising edge, in the port's periods; via:
 * [{ dcm, pin }] the DCM outputs on the way (none: the port's own clock). Through the clock buffers (BUFG, BUFGMUX's I0)
 * and DCMs (CLKIN), as trce derives a DCM's outputs' PERIOD constraints from its input's.
 */
export function clockSources(design) {
  const inst = new Map(design.insts.map(i => [i.name, i]));
  const driver = new Map(), inNet = new Map();   // net -> its driver { inst, pin }; 'inst\0pin' -> the net on it
  for (const n of design.nets) {
    if (n.outpins?.[0]) driver.set(n.name, n.outpins[0]);
    for (const p of n.inpins || []) inNet.set(`${p.inst}\u0000${p.pin}`, n.name);
  }
  const memo = new Map();
  const of = (net, depth = 0) => {
    if (memo.has(net)) return memo.get(net);
    memo.set(net, null);
    let r = null;
    const d = driver.get(net), i = d && inst.get(d.inst);
    if (i && depth < 8) {
      if (/^(IOB|IBUF|IBUFG|IOBS|IOBM|DIFFM|DIFFS)$/.test(i.type)) r = { port: i.name, f: 1, o: 0, via: [] };
      else if (/^BUFG/.test(i.type)) { const n = inNet.get(`${i.name}\u0000I0`) || inNet.get(`${i.name}\u0000I`); r = n ? of(n, depth + 1) : null; }
      else if (/^DCM/.test(i.type)) {
        const n = inNet.get(`${i.name}\u0000CLKIN`), src = n ? of(n, depth + 1) : null, out = dcmOutput(i, d.pin);
        if (src && out) r = { port: src.port, f: src.f * out.f, o: src.o + src.f * out.o, via: [...src.via, { dcm: i.name, pin: d.pin }] };
      }
    }
    memo.set(net, r);
    return r;
  };
  const out = new Map();
  for (const n of design.nets) if (n.inpins?.some(p => CLOCK_PIN.test(p.pin))) { const r = of(n.name); if (r) out.set(n.name, r); }
  return out;
}

/**
 * The time a path from a clock's edge to another clock's edge has (#601), as trce's requirement between two related
 * clocks: from each launching edge to the first capturing edge after it, the shortest over the clocks' common
 * period. a, b: { period, first } (ns: the period, the first edge of the kind the flip-flops use); null when the
 * edges never line up within 100 000 launches (no common period: as trce, the clocks are then left unrelated).
 */
export function clockRequirement(a, b) {
  const ta = a.period, tb = b.period, eps = 1e-6;
  if (!(ta > 0) || !(tb > 0)) return null;
  let req = Infinity;
  for (let k = 0; k < 1e5; k++) {
    const l = a.first + k * ta;
    const c = b.first + (Math.floor((l - b.first + eps) / tb) + 1) * tb;   // the first capture after it
    req = Math.min(req, c - l);
    // (the common period: k launches, a whole number of captures)
    const q = ((k + 1) * ta) / tb;
    if (Math.abs(q - Math.round(q)) < 1e-7) return Math.round(req * 1e6) / 1e6;
  }
  return null;
}

/**
 * The clocks' periods against the PERIOD constraints of the UCF (core/ucf.js parseUcf().clocks:
 * [{ net, period }], the net being the clock's port): [{ clock, port, required, period, slack, met }]
 * for each constrained clock found; a clock from the port with no path between two of its flip-flops (one register
 * stage) { clock, port, required, period: 0, slack, met: true, noPaths: true } (trce's 0 paths analyzed, #1103); and
 * { port, required, missing: true } for a constraint on a port that clocks nothing. A clock from a DCM (#601) has the
 * constraint trce derives from its input's:
 * { …, via: 'CLKFX of u_dcm' (the DCM outputs on the way), constraint: the port's PERIOD, required: that x its
 * periods (CLK2X half of it, CLKDV the divider times, CLKFX D / M times) }.
 */
export function checkPeriods(r, design, constraints = []) {
  const out = [];
  const src = clockSources(design);
  const portOf = c => String(src.get(c.clock)?.port || clockPort(design, c.clock) || c.clock).toLowerCase();
  // (a clock switch, a BUFGMUX with I1, #846: its clock also comes from the port of its I1, whose PERIOD trce applies to it too)
  const switched = switchPorts(design);
  const ports = c => [portOf(c), ...(switched.get(c.clock) || [])];
  for (const k of constraints) {
    const hit = r.clocks.filter(c => ports(c).includes(String(k.net).toLowerCase()));
    if (!hit.length) {
      // a clock from the port with no path between its flip-flops (one register stage, #1103): no path to time, as trce's
      // "0 paths analyzed", not missing
      const clk = [...src].find(([, s]) => String(s.port).toLowerCase() === String(k.net).toLowerCase() && !s.via.length);
      out.push(clk ? { clock: clk[0], port: k.net, required: k.period, period: 0, slack: k.period, met: true, noPaths: true } : { port: k.net, required: k.period, missing: true });
      continue;
    }
    // (the port's own clock first, the slowest of its nets, then the DCMs')
    const own = hit.filter(c => !src.get(c.clock)?.via.length).sort((a, b) => b.period - a.period).slice(0, 1);
    for (const c of [...own, ...hit.filter(c => src.get(c.clock)?.via.length)]) {
      const s = src.get(c.clock), via = s?.via.length ? s.via.map(v => `${v.pin} of ${v.dcm}`).join(', ') : null;
      const required = via ? Math.round(k.period * s.f * 1e6) / 1e6 : k.period;
      out.push({ clock: c.clock, port: k.net, ...(via && { via, constraint: k.period }), required, period: c.period, slack: required - c.period, met: c.period <= required });
    }
  }
  return out;
}

/**
 * The paths between two clocks (#601: analyzeTiming's cross) against the time their edges leave, as trce times them:
 * two clocks of the same port (its own, a DCM's outputs) with a PERIOD constraint on it are related, the requirement
 * from each launching edge to the first capturing edge after it (clockRequirement); others are unrelated, not timed.
 * [{ kind: 'cross', from, to, launch, capture (0 rising, 1 falling), delay, path, related, required, slack, met }]
 * (the clocks' global lines reaching the flip-flops at once: no clock skew counted; trce's between two outputs of a DCM
 * is within ±0.02 ns, its clock uncertainty 0 on the Spartan-3E: research/s3e-route/dcm-timing.mjs).
 */
export function checkCross(r, design, constraints = []) {
  const src = clockSources(design);
  const periodOf = new Map(constraints.map(k => [String(k.net).toLowerCase(), k.period]));
  return (r.cross || []).map(x => {
    const a = src.get(x.from), b = src.get(x.to);
    const T = a && b && a.port === b.port ? periodOf.get(String(a.port).toLowerCase()) : undefined;
    const edge = (s, e) => ({ period: T * s.f, first: T * (s.o + (e ? s.f / 2 : 0)) });
    const required = T ? clockRequirement(edge(a, x.launch), edge(b, x.capture)) : null;
    if (required === null) return { kind: 'cross', ...x, related: false };
    return { kind: 'cross', ...x, related: true, required, slack: required - x.delay, met: x.delay <= required };
  });
}

/**
 * The OFFSET constraints of a UCF (#26; core/ucf.js parseUcf().other keeps them): `OFFSET = IN 5 ns BEFORE "clk"`
 * (every input of that clock), `NET "sw<0>" OFFSET = IN …`, `… OFFSET = OUT 9 ns AFTER "clk"`; a VALID window and
 * RISING / FALLING are read past. [{ dir: 'in' | 'out', port (null: every pad of the clock), required (ns), clock
 * (the name after BEFORE / AFTER: a clock's port, or its TNM_NET), text }]; a TIMEGRP's is { unsupported: true }.
 */
export function parseOffsets(statements = []) {
  const out = [];
  for (const st of statements) {
    const m = /^(?:(NET|TIMEGRP|INST)\s+"?([^"\s]+)"?\s+)?OFFSET\s*=\s*(IN|OUT)\s+(-?[\d.]+)\s*(ns|ps)?\s+(?:VALID\s+[\d.]+\s*(?:ns|ps)?\s+)?(BEFORE|AFTER)\s+"?([^"\s;]+)"?/i.exec(String(st).trim());
    if (!m) continue;
    const text = String(st).trim().replace(/\s+/g, ' ');
    if (m[1] && !/^NET$/i.test(m[1])) { out.push({ text, unsupported: true }); continue; }
    out.push({ dir: m[3].toLowerCase(), port: m[2] || null, required: +m[4] / (/^ps$/i.test(m[5] || '') ? 1000 : 1), clock: m[7], text });
  }
  return out;
}

/**
 * The OFFSET constraints (parseOffsets) against the pads' paths (analyzeTiming's pads): [{ kind: 'offset', text,
 * dir, port, clock, required, value, slack, met }] for each constraint and pad it bounds (an IN: the pad to setup;
 * an OUT: the clock to pad), { kind: 'offset', text, missing: true } when nothing of the design is bounded by it
 * (no such clock or pad), { kind: 'offset', text, unsupported: true } for a TIMEGRP's. ucfClocks: parseUcf().clocks
 * (a TNM_NET name for its clock's port).
 */
export function checkOffsets(r, design, offsets = [], ucfClocks = []) {
  const out = [];
  // (a DCM's clock: the port of its input, #601)
  const src = clockSources(design);
  const portOf = clk => String(src.get(clk)?.port || clockPort(design, clk) || clk).toLowerCase();
  const clockMatches = (clk, name) => {
    const n = String(name).toLowerCase(), port = portOf(clk);
    return port === n || String(clk).toLowerCase() === n || ucfClocks.some(u => String(u.tnm || '').toLowerCase() === n && String(u.net).toLowerCase() === port);
  };
  for (const o of offsets) {
    if (o.unsupported) { out.push({ kind: 'offset', text: o.text, unsupported: true }); continue; }
    const rows = (o.dir === 'in' ? r.pads?.inputs : r.pads?.outputs) || [];
    const hit = rows.filter(x => clockMatches(x.clock, o.clock) && (!o.port || x.pad.toLowerCase() === o.port.toLowerCase()));
    if (!hit.length) { out.push({ kind: 'offset', text: o.text, missing: true }); continue; }
    for (const x of hit) {
      const value = o.dir === 'in' ? x.setup : x.delay;
      out.push({ kind: 'offset', text: o.text, dir: o.dir, port: x.pad, clock: x.clock, required: o.required, value, slack: o.required - value, met: value <= o.required });
    }
  }
  return out;
}

// A DCM's switching limits (#661): [name, min period, max period] (ns) of each pin as trce 14.7 checks them on the
// Spartan-3E -4 (measured on 24 designs, research/s3e-route/README.md). CLKIN's are the DLL's when the DLL is used
// (CLK_FEEDBACK 1X / 2X), the DFS's when it is not; with CLKIN_DIVIDE_BY_2, trce halves every limit of the DCM, its
// outputs' too (a CLKFX of 200 ns, 5 MHz, is then over its 100 ns): the second row.
const DCM_LIMITS = [{
  CLKIN_DLL: ['Tdcmpc', 4.166, 200], CLKIN_DFS: ['Tdcmpc', 3.002, 5000], CLK0: ['Tdcmpco', 4.166, 200], CLK2X: ['Tdcmpco', 3.214, 100],
  CLKDV: ['Tdcmpdv', 6.249, 3225.8], CLKFX: ['Tdcmpfx', 3.067, 200],
}, {
  CLKIN_DLL: ['Tdcmpc', 2.082, 100], CLKIN_DFS: ['Tdcmpc', 1.501, 2500], CLK0: ['Tdcmpco', 2.083, 100], CLK2X: ['Tdcmpco', 1.607, 50],
  CLKDV: ['Tdcmpdv', 3.125, 1612.9], CLKFX: ['Tdcmpfx', 1.533, 100],
}];
const DCM_LIMIT_OF = { CLK90: 'CLK0', CLK180: 'CLK0', CLK270: 'CLK0', CLK2X180: 'CLK2X', CLKFX180: 'CLKFX' };

/**
 * The Component Switching Limit checks of trce on the DCMs (#661): the period of each DCM's CLKIN and of each output
 * it drives, derived from the PERIOD constraint of the pad its CLKIN comes from (as checkPeriods), against the pin's
 * minimum and maximum period (DCM_LIMITS). [{ kind: 'switching', resource: 'u_dcm/CLKFX', port, limit: 'Tdcmpfx',
 * period, min, max, bound: 'min' | 'max' (the nearer), slack (to it), met }]; a DCM whose input has no constraint is
 * not checked (as trce).
 */
export function checkSwitching(design, constraints = []) {
  const periodOf = new Map(constraints.map(k => [String(k.net).toLowerCase(), k.period]));
  const inst = new Map(design.insts.map(i => [i.name, i]));
  const driver = new Map(), inNet = new Map();
  for (const n of design.nets) {
    if (n.outpins?.[0]) driver.set(n.name, n.outpins[0]);
    for (const p of n.inpins || []) inNet.set(`${p.inst}\u0000${p.pin}`, n.name);
  }
  // a net's period (ns) and port: through the clock buffers and the DCMs, as clockSources
  const periodAt = (net, depth = 0) => {
    const d = driver.get(net), i = d && inst.get(d.inst);
    if (!i || depth > 8) return null;
    if (/^(IOB|IBUF|IBUFG|IOBS|IOBM|DIFFM|DIFFS)$/.test(i.type)) { const T = periodOf.get(i.name.toLowerCase()); return T ? { T, port: i.name } : null; }
    if (/^BUFG/.test(i.type)) { const n = inNet.get(`${i.name}\u0000I0`) || inNet.get(`${i.name}\u0000I`); return n ? periodAt(n, depth + 1) : null; }
    if (/^DCM/.test(i.type)) {
      const n = inNet.get(`${i.name}\u0000CLKIN`), src = n ? periodAt(n, depth + 1) : null, out = dcmOutput(i, d.pin);
      return src && out ? { T: src.T * out.f, port: src.port } : null;
    }
    return null;
  };
  const out = [];
  for (const i of design.insts) {
    if (!/^DCM/.test(i.type)) continue;
    const n = inNet.get(`${i.name}\u0000CLKIN`), src = n && periodAt(n);
    if (!src) continue;
    const cfg = a => i.cfg?.find(c => c.attr === a)?.value;
    const lim = DCM_LIMITS[cfg('CLKIN_DIVIDE_BY_2') && cfg('CLKIN_DIVIDE_BY_2') !== '#OFF' ? 1 : 0];
    const pins = [['CLKIN', src.T, lim[/^(1X|2X)$/.test(cfg('CLK_FEEDBACK') || '1X') ? 'CLKIN_DLL' : 'CLKIN_DFS']]];
    for (const m of design.nets) {
      const p = m.outpins?.[0];
      if (p?.inst !== i.name || !m.inpins?.length) continue;
      const l = lim[DCM_LIMIT_OF[p.pin] || p.pin], o = l && dcmOutput(i, p.pin);
      if (o) pins.push([p.pin, src.T * o.f, l]);
    }
    for (const [pin, T, [limit, min, max]] of pins) {
      const period = Math.round(T * 1e6) / 1e6, sMin = period - min, sMax = max - period;
      const bound = sMax < sMin ? 'max' : 'min', slack = Math.round(Math.min(sMin, sMax) * 1e6) / 1e6;
      out.push({ kind: 'switching', resource: `${i.name}/${pin}`, port: src.port, limit, period, min, max, bound, slack, met: slack >= 0 });
    }
  }
  return out;
}

/** A switching limit check (checkSwitching) in a line, as trce's: the nearer of the pin's two limits. */
export function switchingLine(k) {
  const lim = k.bound === 'max' ? k.max : k.min;
  return `switching limit of ${k.resource} (${k.limit}): ${k.met ? 'met' : 'NOT MET'}, period ${k.period.toFixed(3)} ns, ${k.bound} period limit ${lim.toFixed(3)} ns (${(1000 / lim).toFixed(3)} MHz), slack ${k.slack.toFixed(3)} ns`;
}

/** A readable report of the critical path of each clock (lines of text), with the PERIOD checks
 *  (checkPeriods), the switching limits (checkSwitching, #661) and the OFFSET checks (checkOffsets) when given; the
 *  paths between two clocks (checkCross, #601); then the pads' paths and the hold check (#26). */
export function timingReport(r, checks = []) {
  const lines = [];
  const step = s => `  ${s.kind.padEnd(12)} ${s.delay.toFixed(3).padStart(7)} ${s.arrival.toFixed(3).padStart(8)}  ${s.inst}.${s.pin}`;
  const edgeName = e => (e ? 'falling' : 'rising');
  // (a pad bounded on two clocks or more, a DCM's: each line names its clock, #601)
  const clocksOf = new Map();
  for (const k of checks) if (k.kind === 'offset' && k.clock) clocksOf.set(`${k.text}\u0000${k.port}`, (clocksOf.get(`${k.text}\u0000${k.port}`) || 0) + 1);
  for (const k of checks) {
    if (k.kind === 'cross') continue;
    if (k.kind === 'switching') { lines.push(switchingLine(k)); continue; }
    if (k.via) {
      lines.push(`constraint PERIOD ${k.constraint} ns on ${k.port}, ${k.via}: ${+k.required.toFixed(3)} ns, ${k.met ? 'met' : 'NOT MET'} (period ${k.period.toFixed(3)} ns, slack ${k.slack.toFixed(3)} ns)`);
      continue;
    }
    if (k.kind === 'offset') {
      lines.push(k.unsupported ? `constraint ${k.text}: not analyzed (only OFFSET on a NET or on all pads)`
        : k.missing ? `constraint ${k.text}: no pad of the design is bounded by it`
          : `constraint ${k.text}: ${k.met ? 'met' : 'NOT MET'} on ${k.port}${clocksOf.get(`${k.text}\u0000${k.port}`) > 1 ? `, clock ${k.clock}` : ''} (${k.dir === 'in' ? 'pad to setup' : 'clock to pad'} ${k.value.toFixed(3)} ns, slack ${k.slack.toFixed(3)} ns)`);
      continue;
    }
    if (k.noPaths) { lines.push(`constraint PERIOD ${k.required} ns on ${k.port}: met (no path between two flip-flops of its clock to time)`); continue; }
    lines.push(k.missing ? `constraint PERIOD ${k.required} ns on ${k.port}: no clock of the design comes from this port`
      : `constraint PERIOD ${k.required} ns on ${k.port}: ${k.met ? 'met' : 'NOT MET'} (period ${k.period.toFixed(3)} ns, slack ${k.slack.toFixed(3)} ns)`);
  }
  for (const c of r.clocks) {
    lines.push(`clock ${c.clock}: minimum period ${c.period.toFixed(3)} ns (${(1000 / c.period).toFixed(1)} MHz)`);
    for (const s of c.path) lines.push(step(s));
  }
  // (#601: as trce, against the time between the clocks' edges; unrelated clocks not timed)
  for (const x of checks.filter(k => k.kind === 'cross')) {
    const what = `paths from clock ${x.from} (${edgeName(x.launch)}) to clock ${x.to} (${edgeName(x.capture)})`;
    if (!x.related) { lines.push(`${what}: not timed (unrelated clocks: not from one port with a PERIOD constraint)`); continue; }
    lines.push(`${what}: ${x.met ? 'met' : 'NOT MET'}, requirement ${x.required.toFixed(3)} ns between the clocks' edges (delay ${x.delay.toFixed(3)} ns, slack ${x.slack.toFixed(3)} ns)`);
    for (const s of x.path) lines.push(step(s));
  }
  const p = r.pads;
  if (!p) return lines;
  // (as trce's data sheet report, #26)
  const table = (title, rows, fmt) => { if (rows.length) lines.push('', title, ...rows.map(fmt)); };
  const w = Math.max(8, ...[...p.inputs, ...p.outputs].map(x => x.pad.length), ...p.padToPad.map(x => x.from.length));
  for (const clk of [...new Set([...p.inputs, ...p.outputs].map(x => x.clock))]) {
    table(`OFFSET IN (pad to setup; hold), clock ${clk}:`, p.inputs.filter(x => x.clock === clk), x => `  ${x.pad.padEnd(w)} ${x.setup.toFixed(3).padStart(7)} ns; hold ${x.hold.toFixed(3).padStart(7)} ns`);
    table(`OFFSET OUT (clock to pad), clock ${clk}:`, p.outputs.filter(x => x.clock === clk), x => `  ${x.pad.padEnd(w)} ${x.delay.toFixed(3).padStart(7)} ns`);
  }
  table('pad to pad:', p.padToPad, x => `  ${x.from.padEnd(w)} -> ${x.to.padEnd(w)} ${x.delay.toFixed(3).padStart(7)} ns`);
  for (const h of p.hold) {
    lines.push('', `hold, clock ${h.clock}: ${h.slack >= 0 ? 'met' : 'NOT MET'}, worst slack ${h.slack.toFixed(3)} ns (the shortest path at its earliest; the global clock reaches both flip-flops at once)`);
    for (const s of h.path) lines.push(step(s));
  }
  return lines;
}
