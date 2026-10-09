// Live schematic simulation (Logisim style): the schematic is turned into HDL (generateHdl), elaborated
// with the project sources (for module symbols) and run in the event-driven Simulator; every net of the
// drawing is mapped to the elaborated signal that carries its value.
//
//   const r = buildLiveSim(doc, { modules, sources, lang });
//   if (!r.ok) show(r.errors);
//   const live = r.live;
//   live.set(portId, 1n);            // input I/O marker = value (forced), the circuit settles
//   live.cycle(portId);              // one full clock cycle on a clock input (0 -> 1 -> 0)
//   live.drive(portId, 5n | null);   // bidirectional (inout) marker: drive the bus from outside, or
//                                    // release it (null = Z, the default) so that the circuit drives it
//   live.netValue(net) / live.pinValue(symId, pin) / live.portValue(portId) / live.stored(symId)
//   live.reset();                    // power cycle: back to time 0, registers to their INIT values
//
// Values are core/values.js 4-state values ({ w, v, x, s }); level(v) classifies one for drawing.
import { netlist, generateHdl, normalizeDoc, normModules, symbolDef, SYMBOLS } from './schdoc.js';
import { compile, elaborate } from './compile.js';
import { Simulator } from './simulator.js';
import { clocksOf } from './schematic.js';
import * as V from './values.js';

// simulated time of one input change / clock half period (ps): long enough for `after` delays in
// HDL modules to mature, the value itself is not shown as a time scale
export const LIVE_STEP = 50_000;

const isVal = v => v && !Array.isArray(v) && typeof v.w === 'number' && typeof v.v === 'bigint';

/** '1' | '0' | 'x' | 'z' | null (no value): the colour class of a value (a bus: '1' = non-zero). */
export function level(v) {
  if (!isVal(v)) return null;
  const M = V.mask(v.w);
  if (v.x) return (v.x & M) === M && (v.v & M) === M ? 'z' : 'x';
  return v.v ? '1' : '0';
}

/** Text of a value: 1 bit as 0/1/X/Z, a bus in hex / dec / bin (X / Z digits kept). */
export function fmtValue(v, radix = 'hex') {
  if (v == null) return '';
  if (Array.isArray(v)) return '…';
  if (!isVal(v)) return String(v.str ?? '');
  if (v.w === 1 && radix !== 'dec') return V.toBin(v).toUpperCase();
  if (radix === 'bin') return V.toBin(v).toUpperCase();
  if (radix === 'dec') { const d = V.toDec(v, false); return d === 'x' || d === 'X' ? (level(v) === 'z' ? 'Z' : 'X') : d; }
  return `${V.toHex(v)}`;
}

/** Parse a typed bus value: 0x1F / 1Fh / #1F (hex), 0b101 / 101b (binary), decimal; null if invalid. */
export function parseValue(text, width, radix = 'dec') {
  let s = String(text ?? '').trim().replace(/_/g, '');
  if (!s) return null;
  let base = radix === 'hex' ? 16 : radix === 'bin' ? 2 : 10;
  if (/^0x/i.test(s) || /^#/.test(s)) { base = 16; s = s.replace(/^0x|^#/i, ''); }
  else if (/^0b/i.test(s)) { base = 2; s = s.slice(2); }
  else if (/^[0-9a-f]+h$/i.test(s)) { base = 16; s = s.slice(0, -1); }
  else if (/^[01]+b$/i.test(s) && base !== 16) { base = 2; s = s.slice(0, -1); }
  else if (/^-?\d+d$/i.test(s)) { base = 10; s = s.slice(0, -1); }
  let n;
  try {
    if (base === 16) { if (!/^[0-9a-f]+$/i.test(s)) return null; n = BigInt(`0x${s}`); }
    else if (base === 2) { if (!/^[01]+$/.test(s)) return null; n = BigInt(`0b${s}`); }
    else { if (!/^-?\d+$/.test(s)) return null; n = BigInt(s); }
  } catch { return null; }
  return BigInt.asUintN(width, n);
}

// a module defined by a source file (so the copy the schematic replaces can be left out)
function definesModule(text, lang, name) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return lang === 'vhdl' ? new RegExp(`\\bentity\\s+${n}\\s+is\\b`, 'i').test(text) : new RegExp(`\\bmodule\\s+${n}\\b`).test(text);
}
const langOf = s => s.lang || (/\.(vhd|vhdl)$/i.test(s.path) ? 'vhdl' : /\.(v|vh|sv)$/i.test(s.path) ? 'verilog' : null);

/**
 * Build the live simulation of a schematic.
 * @param doc       schematic document (core/schdoc.js format)
 * @param modules   module port lists of the module symbols ({ name: { name, ports, … } })
 * @param sources   project HDL sources [{ path, text, lang? }] (bodies of the module symbols); the file the
 *                  schematic is linked to (or any other definition of its module) is replaced by the schematic
 * @param lang      HDL language to generate (default: the schematic's; HDL blocks force their own)
 * @returns { ok, errors: [string], warnings: [string], live: LiveSim | null, code, filename }
 */
export function buildLiveSim(docIn, { modules = {}, sources = [], lang } = {}) {
  const doc = normalizeDoc(JSON.parse(JSON.stringify(docIn)));
  modules = normModules(modules);
  const out = { ok: false, errors: [], warnings: [], diagnostics: [], live: null, code: '', filename: '' };
  const err = (message, d = {}) => { out.errors.push(message); out.diagnostics.push({ ...d, severity: 'error', message }); };
  const hasBlocks = doc.symbols.some(s => s.type === 'hdlblock' && String(s.hdl || '').trim());
  const L = hasBlocks ? (doc.hdl?.lang || doc.lang) : (lang === 'vhdl' || lang === 'verilog' ? lang : doc.lang);
  if (!doc.symbols.length && !doc.ports.length) { err('The schematic is empty: nothing to simulate.'); return out; }
  let g;
  try { g = generateHdl(doc, { lang: L, modules }); } catch (e) { err(`HDL generation failed: ${e.message}`); return out; }
  out.code = g.code; out.filename = g.filename;
  for (const d of g.diagnostics) {
    if (d.severity === 'error') err(d.message, d);
    else { out.warnings.push(d.message); out.diagnostics.push({ ...d }); }
  }
  if (out.errors.length) return out;
  const top = /^\s*(?:entity|module)\s+([A-Za-z_][\w$]*)/m.exec(g.code)?.[1] || doc.name;
  const genPath = `<schematic>/${g.filename}`;
  const srcs = sources.filter(s => {
    const sl = langOf(s);
    if (sl !== 'vhdl' && sl !== 'verilog') return false;
    if (doc.generatedFile && s.path === doc.generatedFile) return false;
    return !definesModule(String(s.text || ''), sl, top);
  });
  srcs.push({ path: genPath, text: g.code, lang: L });
  let lib, design;
  try {
    lib = compile(srcs);
    design = elaborate(lib, top);
  } catch (e) { err(`Cannot build the simulation model: ${e.message}`); return out; }
  // errors that matter: in the generated HDL and the files of the modules it uses
  const files = new Set([genPath]);
  const walk = inst => { if (!inst) return; files.add(inst.file); if (inst.mod?.file) files.add(inst.mod.file); (inst.children || []).forEach(walk); };
  walk(design.top);
  const where = d => (d.file && d.file !== genPath ? `${d.file}${d.line ? `:${d.line}` : ''}: ` : d.file === genPath ? `generated ${g.filename}${d.line ? `:${d.line}` : ''}: ` : '');
  for (const d of [...lib.errors.filter(e => files.has(e.file)), ...design.diags]) {
    if ((d.severity || 'error') === 'error') err(`${where(d)}${d.message}`);
  }
  if (!design.top && !out.errors.length) err(`cannot elaborate '${top}'`);
  if (out.errors.length) return out;
  out.live = new LiveSim(doc, modules, design, L);
  if (out.live.error) { err(out.live.error); out.live = null; return out; }
  out.ok = true;
  return out;
}

export class LiveSim {
  constructor(doc, modules, design, lang) {
    this.doc = doc;
    this.modules = modules;
    this.design = design;
    this.lang = lang;
    this.nl = netlist(doc, { modules });
    this.sim = new Simulator(design, { maxWaveEvents: 0 });
    const top = design.top;
    const ci = lang === 'vhdl';
    const nk = s => (ci ? String(s).toLowerCase() : String(s));
    const byName = new Map();
    for (const s of top.signals) if (!byName.has(nk(s.name))) byName.set(nk(s.name), s);
    for (const p of top.ports) if (!byName.has(nk(p.name))) byName.set(nk(p.name), p.sig);
    const find = nm => byName.get(nk(nm)) || (ci ? null : byName.get(String(nm).toLowerCase())) || null;
    // net -> signal: an I/O marker on the net names it (generateHdl), else the net name
    this.netSig = new Map();
    for (const net of this.nl.nets) {
      let sig = null;
      for (const pid of net.ports) { const p = doc.ports.find(q => q.id === pid); sig = p && find(p.name); if (sig) break; }
      if (!sig && net.endpoints.length) sig = find(net.name);
      this.netSig.set(net.id, sig);
    }
    this.portSig = new Map(doc.ports.map(p => [p.id, find(p.name)]));
    // instances of module symbols (their port values; pins left open have no net)
    this.instOf = new Map();
    for (const s of doc.symbols) if (s.type === 'module') {
      const c = (top.children || []).find(x => nk(x.name) === nk(s.name));
      if (c) this.instOf.set(s.id, c);
    }
    // clock inputs: read on an edge by some process, or wired to a clock pin (C of a flip-flop…)
    const clockSigs = new Set();
    for (const p of design.procs) { try { for (const c of clocksOf(p).clocks) clockSigs.add(c); } catch { /* not a clocked process */ } }
    const clockPin = net => net.endpoints.some(e => e.kind === 'pin' && (() => {
      const s = doc.symbols.find(x => x.id === e.sym);
      try { return !!symbolDef(s, modules).pins.find(q => q.name === e.pin)?.clock; } catch { return false; }
    })());
    this.inputs = [];
    for (const p of doc.ports) {
      if (p.dir !== 'in') continue;
      const sig = this.portSig.get(p.id);
      if (!sig || !isVal(sig.val)) continue;
      const net = this.nl.portNet.get(p.id);
      const clock = sig.t.w === 1 && (clockSigs.has(sig) || (!!net && clockPin(net)));
      this.inputs.push({ id: p.id, name: p.name, sig, width: sig.t.w, clock, value: 0n });
    }
    // bidirectional (inout) markers: the outside world is one more driver of the (resolved) bus,
    // released (Z) until the user drives a value; the marker shows the resolved value
    this.bidirs = [];
    for (const p of doc.ports) {
      if (p.dir !== 'inout') continue;
      const sig = this.portSig.get(p.id);
      if (!sig || !isVal(sig.val) || sig.t.kind !== 'logic') continue;
      this.bidirs.push({ id: p.id, name: p.name, sig, width: sig.t.w, value: null });
    }
    this.error = null;
    this.start();
  }

  // ---------------------------------------------------------------- running
  start() {
    const sim = this.sim;
    for (const s of this.design.signals) s.wave = null;      // no waveform: the sheet shows the present only
    for (const i of this.inputs) sim.force(i.sig, V.mk(i.width, i.value));
    for (const b of this.bidirs) { b.sig.res ||= new Map(); this.driveExt(b); }   // resolved: the circuit's drivers + the outside
    this.settle();
  }
  // the outside driver of a bidirectional marker: its value, or all Z (released)
  driveExt(b) {
    const M = V.mask(b.width);
    this.sim.write({ sig: b.sig, whole: true }, b.value == null ? V.mk(b.width, M, M) : V.mk(b.width, b.value), null);
  }
  /** Power cycle: time 0, every signal back to its initial value, the inputs keep their values (clocks 0). */
  reset() {
    this.sim.reset();
    this.error = null;
    for (const i of this.inputs) if (i.clock) i.value = 0n;
    this.start();
  }
  settle() {
    if (this.sim.finished) return;
    this.sim.run(this.sim.now + LIVE_STEP);
    if (this.sim.finished) {
      const err = this.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure').map(l => l.text);
      this.error = err.length ? err.join('\n') : `simulation stopped (${this.sim.finished})`;
    }
  }
  get now() { return this.sim.now; }
  input(id) { return this.inputs.find(i => i.id === id) || null; }
  /** Set an input I/O marker to a value (BigInt) and let the circuit settle. */
  set(id, value) {
    const i = this.input(id);
    if (!i) return false;
    i.value = BigInt.asUintN(i.width, BigInt(value));
    this.sim.force(i.sig, V.mk(i.width, i.value));
    this.settle();
    return true;
  }
  toggle(id) { const i = this.input(id); return i ? this.set(id, i.width === 1 ? (i.value ? 0n : 1n) : i.value + 1n) : false; }
  bidir(id) { return this.bidirs.find(b => b.id === id) || null; }
  /** Drive a bidirectional marker from outside with a value (BigInt), or release it (null: Z), and settle. */
  drive(id, value) {
    const b = this.bidir(id);
    if (!b) return false;
    b.value = value == null ? null : BigInt.asUintN(b.width, BigInt(value));
    this.driveExt(b);
    this.settle();
    return true;
  }
  /** One full clock cycle on a (1-bit) input: rising edge, settle, falling edge, settle. */
  cycle(id) { return this.cycles([id], 1); }
  /** n full cycles of one or more clock inputs ticking together (they end low). */
  cycles(ids, n = 1) {
    const ins = ids.map(id => this.input(id)).filter(Boolean);
    if (!ins.length) return false;
    const drive = b => { for (const i of ins) { i.value = b; this.sim.force(i.sig, V.mk(1, b)); } this.settle(); };
    if (ins.some(i => i.value)) drive(0n);
    for (let k = 0; k < n && !this.sim.finished; k++) { drive(1n); drive(0n); }
    return true;
  }

  // ---------------------------------------------------------------- values
  sigValue(sig) { return sig ? sig.val : null; }
  netValue(net) {
    if (!net) return null;
    return this.sigValue(this.netSig.get(net.id) ?? null);
  }
  netById(id) { return (this.netMap ||= new Map(this.nl.nets.map(n => [n.id, n]))).get(id) || null; }
  /** Value at a symbol pin: its net, or (a module pin left open) the instance port. */
  pinValue(symId, pin) {
    const net = this.nl.pinNet.get(`${symId}/${pin}`);
    const sig = net ? this.netSig.get(net.id) : null;
    if (sig) return this.sigValue(sig);
    const inst = this.instOf.get(symId);
    const p = inst?.ports.find(q => q.name.toLowerCase() === String(pin).toLowerCase());
    return p ? this.sigValue(p.sig) : null;
  }
  portValue(portId) { return this.sigValue(this.portSig.get(portId) ?? null); }
  /** Stored value of a flip-flop / register / counter symbol (its Q), or null. */
  stored(symId) {
    const s = this.doc.symbols.find(x => x.id === symId);
    if (!s || !(SYMBOLS[s.type]?.ff || s.type === 'register' || s.type === 'counter')) return null;
    return this.pinValue(symId, 'Q');
  }
  /** Ports of a module instance with their values: [{ name, dir, value }]. */
  instancePorts(symId) {
    const inst = this.instOf.get(symId);
    if (!inst) return [];
    return inst.ports.map(p => ({ name: p.name, dir: p.dir, value: this.sigValue(p.sig) }));
  }
  /** Signature of every net value (for repainting only what changed): Map(net id -> 'level:text'). */
  snapshot(radix = 'hex') {
    const m = new Map();
    for (const net of this.nl.nets) { const v = this.netValue(net); m.set(net.id, v == null ? '' : `${level(v)}:${fmtValue(v, radix)}`); }
    return m;
  }
}
