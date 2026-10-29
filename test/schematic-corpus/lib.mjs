// The schematic corpus's stages (#1687, run.mjs and test/schematic-corpus.test.js): one schematic through each of
//   load   the document read and saved the same (normalizeDoc keeps it as it is); an ISE schematic: its import
//   check  the schematic's own checks (netlist) and its HDL generation, in VHDL and Verilog
//   hdl    Check Syntax of the generated VHDL and Verilog: parsed, elaborated, the design checks (lint)
//   sim    the generated VHDL and Verilog simulated against the reference (an HDL design: the schematic's own behaviour
//          written independently, or the HDL it was generated from), under the same stimulus, cycle by cycle
//   ise    exported as an ISE schematic (.sch, .sym), imported again: its HDL simulated against the schematic's
//   synth  Yosys's synthesis of the generated VHDL (its LUTs and flip-flops)
//   flow   the Silinx toolchain to a .bit on each Silinx-toolchain device
// Each stage gives 'pass' (the flow: 'complete') or the first reason it does not, and its exact warnings.
import { normalizeDoc, netlist, generateHdl, modulesFromLibrary } from '../../core/schdoc.js';
import { importIseSch, exportIseSch } from '../../core/isesch.js';
import { compile, elaborate } from '../../core/compile.js';
import { primitiveSources } from '../../core/unisim.js';
import { designChecks } from '../../core/lint.js';
import { frontEnd, stimulus, runSilinx, compareRuns, rng } from '../diff-synth.js';

export const STAGES = ['load', 'check', 'hdl', 'sim', 'ise', 'synth', 'flow'];
export const FAST_STAGES = ['load', 'check', 'hdl', 'sim', 'ise'];
export const LANGS = ['vhdl', 'verilog'];
// the Silinx toolchain's devices: Basys2-100 / 250, Nexys2-500 / 1200
export const PARTS = ['xc3s100ecp132-4', 'xc3s250ecp132-4', 'xc3s500efg320-4', 'xc3s1200efg320-4'];
// an input of at most this many bits in all is simulated exhaustively; a wider one (or a clocked design) RANDOM cycles
const EXHAUSTIVE_BITS = 12;
const RANDOM_CYCLES = 300;

export const isGood = s => s === 'pass' || s === 'complete';
const ext = lang => (lang === 'vhdl' ? 'vhd' : 'v');
const first = (diags, sev = 'error') => diags.find(d => d.severity === sev);
const diagText = d => `${d.file ? `${String(d.file).split(/[\\/]/).pop()}:${d.line ?? ''}: ` : ''}${d.message}`;
const uniq = list => [...new Set(list)];
// a stage's status from its first error
const status = err => (err ? `fail: ${String(err).replace(/\s+/g, ' ').slice(0, 200)}` : 'pass');

/** The HDL of the modules a schematic instantiates (schematics `uses`, HDL sources `hdl`): { sources: [{ path, text }],
 *  modules } for a language. */
export function modulesOf(uses = [], lang, hdl = []) {
  const sources = [...uses.map(u => ({ path: `${u.name}.${ext(lang)}`, text: generateHdl(normalizeDoc({ ...u.doc, lang }), { lang }).code })), ...hdl];
  if (!sources.length) return { sources, modules: {} };
  return { sources, modules: modulesFromLibrary(compile(sources), { sources: Object.fromEntries(sources.map(s => [s.path, s.text])) }) };
}

/** The schematic's HDL in a language: { path, code, diagnostics }. */
export function hdlOf(doc, lang, modules = {}) {
  const g = generateHdl(normalizeDoc({ ...doc, lang }, { modules }), { lang, modules });
  return { path: `${doc.name}.${ext(lang)}`, code: g.code, diagnostics: g.diagnostics };
}

/** Check Syntax of sources with `top`: { errors, warnings } as the application shows them. */
export function checkSyntax(sources, top) {
  const lib = compile([...primitiveSources(sources), ...sources]);
  let design = null;
  const extra = [];
  try { design = elaborate(lib, top); } catch (e) { extra.push({ severity: 'error', message: e.message }); }
  if (design?.top) { try { extra.push(...designChecks(lib, design, { lint: true })); } catch { /* no checks */ } }
  const all = uniq([...lib.errors, ...(design?.diags || []), ...extra].map(d => `${d.severity}|${diagText(d)}`)).map(s => s.split('|'));
  return { errors: all.filter(([s]) => s === 'error').map(([, m]) => m), warnings: all.filter(([s]) => s !== 'error').map(([, m]) => m), design };
}

/** The stimulus of a design's inputs: exhaustive for a small combinational one, else seeded random cycles. */
export function stimulusOf(design, name) {
  const ports = design.top.ports;
  const clocks = ports.filter(p => p.dir === 'in' && p.sig.t.w === 1 && /^(clk|clock)/i.test(p.name)).map(p => p.name.toLowerCase());
  const inputs = ports.filter(p => p.dir === 'in' && !clocks.includes(p.name.toLowerCase())).map(p => ({ name: p.name.toLowerCase(), w: p.sig.t.w }));
  const bits = inputs.reduce((n, p) => n + p.w, 0);
  if (!clocks.length && bits <= EXHAUSTIVE_BITS) {
    const stim = [];
    for (let v = 0; v < 2 ** bits; v++) {
      const c = {};
      let off = 0;
      for (const p of inputs) { c[p.name] = BigInt((v >> off) & (2 ** p.w - 1)); off += p.w; }
      stim.push(c);
    }
    return { clocks, stim, how: `exhaustive (${2 ** bits})` };
  }
  return { clocks, stim: stimulus(rng(name), {}, inputs, RANDOM_CYCLES), how: `random (${RANDOM_CYCLES})` };
}

/**
 * Two designs under the same stimulus: null when every output agrees (the reference's X bits not compared), else
 * the first difference 'cycle k: port, …'. ref, dut: { sources, top }.
 */
export function compareBehaviour(ref, dut, name) {
  const a = frontEnd(ref.sources, ref.top);
  if (!a.design) return `the reference does not elaborate: ${a.reason}`;
  const b = frontEnd(dut.sources, dut.top);
  if (!b.design) return `does not elaborate: ${b.reason}`;
  const outs = a.design.top.ports.filter(p => p.dir !== 'in').map(p => p.name.toLowerCase());
  const mine = new Set(b.design.top.ports.map(p => `${p.name.toLowerCase()}:${p.dir}:${p.sig.t.w}`));
  const missing = a.design.top.ports.filter(p => !mine.has(`${p.name.toLowerCase()}:${p.dir}:${p.sig.t.w}`)).map(p => p.name);
  if (missing.length) return `its ports differ from the reference's (${missing.join(', ')})`;
  const { clocks, stim } = stimulusOf(a.design, name);
  const widths = a.design.top.ports.filter(p => p.dir !== 'in').map(p => [p.name.toLowerCase(), p.sig.t.w]);
  let ra, rb;
  try { ra = runSilinx(a.design, { clocks, sim: {}, stim, outs }); } catch (e) { return `the reference's simulation: ${e.message}`; }
  try { rb = runSilinx(b.design, { clocks, sim: {}, stim, outs }); } catch (e) { return `simulation: ${e.message}`; }
  const d = compareRuns(ra, rb, widths);
  return d ? `cycle ${d.cycle}: ${d.ports.join(', ')}` : null;
}

/**
 * The fast stages of a schematic. item: { name, doc (the drawing as saved, or null), ise (an ISE .sch's text, imported
 * as the drawing), ref: [{ path, text }] | null, refTop, uses: [{ name, doc }] }.
 * Returns { name, <stage>: status, warnings: { stage: [..] } }.
 */
export function runFast(item, { stages = FAST_STAGES } = {}) {
  const res = { name: item.name, warnings: {} };
  const warn = (st, list) => { const w = uniq(list).sort(); if (w.length) res.warnings[st] = w; };
  const want = new Set(stages);
  let doc = item.doc;
  // ---- load
  if (item.ise != null) {
    try {
      const r = importIseSch(item.ise, { name: item.docName || item.name, lang: 'vhdl' });
      doc = r.doc;
      warn('load', r.warnings.map(w => (typeof w === 'string' ? w : w.message)));
      res.load = JSON.stringify(normalizeDoc(doc)) === JSON.stringify(normalizeDoc(normalizeDoc(doc))) ? 'pass' : 'fail: not saved the same once imported';
    } catch (e) { res.load = status(`import: ${e.message}`); return res; }
  } else {
    const again = normalizeDoc(doc);
    res.load = JSON.stringify(again) === JSON.stringify(doc) ? 'pass' : `fail: not saved as it was read (${diffKey(doc, again)})`;
  }
  // (a schematic made from HDL keeps HDL blocks in its language: generated in that one only)
  const langs = item.langs || LANGS, L0 = langs[0];
  const mods = Object.fromEntries(langs.map(l => [l, modulesOf(item.uses, l, item.hdlUses)]));
  const hdl = Object.fromEntries(langs.map(l => [l, hdlOf(doc, l, mods[l].modules)]));
  // ---- the schematic's checks and its HDL generation
  if (want.has('check')) {
    const nl = netlist(normalizeDoc(doc, { modules: mods[L0].modules }), { modules: mods[L0].modules });
    const own = new Set(nl.diagnostics.map(d => `${d.severity}: ${d.message}`));
    const gen = langs.flatMap(l => hdl[l].diagnostics.filter(d => !own.has(`${d.severity}: ${d.message}`)).map(d => ({ ...d, message: `${l}: ${d.message}` })));
    const all = [...nl.diagnostics, ...gen];
    res.check = status(first(all)?.message);
    warn('check', all.filter(d => d.severity !== 'error').map(d => d.message));
  }
  // ---- Check Syntax of the generated HDL
  const top = doc.name;
  if (want.has('hdl')) {
    const errs = [], ws = [];
    // (a schematic made from HDL: the messages its HDL had already are not its own, by their text)
    const text = m => m.replace(/^[^:\s]*:\d*: /, '');
    const before = item.generated ? new Set(Object.values(checkSyntax(item.ref, item.refTop)).filter(Array.isArray).flat().map(text)) : new Set();
    for (const l of langs) {
      const c = checkSyntax([...mods[l].sources, { path: hdl[l].path, text: hdl[l].code }], top);
      errs.push(...c.errors.filter(e => !before.has(text(e))).map(e => `${l}: ${e}`));
      ws.push(...c.warnings.filter(w => !before.has(text(w))).map(w => `${l}: ${w}`));
    }
    res.hdl = status(errs[0]);
    warn('hdl', ws);
  }
  // ---- the generated HDL against the reference
  if (want.has('sim')) {
    if (!item.ref) res.sim = 'skip: no reference';
    else {
      const why = langs.map(l => {
        const d = compareBehaviour({ sources: item.ref, top: item.refTop || top }, { sources: [...mods[l].sources, { path: hdl[l].path, text: hdl[l].code }], top }, item.name);
        return d && `${l}: ${d}`;
      }).filter(Boolean);
      res.sim = why.length ? `mismatch: ${why[0]}` : 'pass';
    }
  }
  // ---- the ISE export and its import: the same behaviour
  if (want.has('ise')) {
    try {
      const M = mods[L0];
      const ex = exportIseSch(doc, { modules: M.modules, lang: L0, timestamp: '2026-1-1T00:00:00' });
      // (as a user takes them into the ISE project and back: the symbols, and the HDL files of the blocks and symbols
      // that are not ISE's, as the project's modules)
      const symbols = Object.fromEntries((ex.files || []).filter(f => /\.sym$/i.test(f.path)).map(f => [f.path, f.text]));
      const extra = (ex.files || []).filter(f => /\.(vhdl?|s?v)$/i.test(f.path)).map(f => ({ path: f.path, text: f.text }));
      const B = extra.length ? modulesOf(item.uses, L0, [...(item.hdlUses || []), ...extra]) : M;
      const back = importIseSch(ex.xml, { name: doc.name, lang: L0, modules: B.modules, symbols });
      const again = hdlOf(back.doc, L0, B.modules);
      const why = compareBehaviour({ sources: [...M.sources, { path: hdl[L0].path, text: hdl[L0].code }], top },
        { sources: [...B.sources, { path: again.path, text: again.code }], top }, item.name);
      res.ise = why ? `mismatch: ${why}` : 'pass';
      warn('ise', [...ex.warnings.map(w => `export: ${w}`), ...back.warnings.map(w => `import: ${typeof w === 'string' ? w : w.message}`)]);
    } catch (e) { res.ise = status(e.message); }
  }
  res.doc = doc;
  return res;
}

// the first key where two documents differ (the load stage's reason)
function diffKey(a, b, at = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = diffKey(a[k], b[k], `${at}.${k}`); if (d) return d; }
  }
  return at || '(root)';
}

/** Yosys's synthesis of the schematic's VHDL: { synth, quality: { luts, ffs }, warnings }. */
export async function runSynth(doc, uses = [], hdlUses = [], lang = 'vhdl') {
  const { synthesizeOpen } = await import('../../core/synth-open.js');
  const { yosysNode } = await import('../../core/synth-open-node.js');
  const m = modulesOf(uses, lang, hdlUses);
  const h = hdlOf(doc, lang, m.modules);
  const fe = frontEnd([...m.sources, { path: h.path, text: h.code }], doc.name);
  if (!fe.design) return { synth: status(fe.reason), quality: null, warnings: [] };
  try {
    const r = await synthesizeOpen(fe.design, { family: 'spartan3e', run: yosysNode, effort: 'normal' });
    return { synth: 'pass', quality: { luts: r.util.luts || 0, ffs: r.util.flipFlops || 0 }, warnings: uniq(r.warnings.map(w => w.replace(/\$\w+\$[^\s']*/g, '$…'))).sort() };
  } catch (e) { return { synth: status(e.message), quality: null, warnings: [] }; }
}

/** The Silinx toolchain to a .bit on each part: { flow: 'complete' | reason (the first part's that fails), parts: { part: status } }. */
export async function runFlow(doc, uses = [], hdlUses = [], lang = 'vhdl', parts = PARTS) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const zlib = await import('node:zlib');
  const { fileURLToPath } = await import('node:url');
  const { runOpenFlow } = await import('../../core/open-flow-core.js');
  const { loadDevice } = await import('../../core/fpga/device.js');
  const { dbFileNames, dbFilesFrom, makeBitDb } = await import('../../core/fpga/bitdb.js');
  const { yosysNode } = await import('../../core/synth-open-node.js');
  const { shippedDevicePath } = await import('../../core/fpga/device-node.js');
  const { boardClockUcf } = await import('../designs-corpus/lib.mjs');
  const DB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../packages/silinx-fpga/bitdb');
  const m = modulesOf(uses, lang, hdlUses);
  const h = hdlOf(doc, lang, m.modules);
  const sources = [...m.sources, { path: h.path, text: h.code }].map(s => ({ ...s, lang: /\.s?v$/i.test(s.path) ? 'verilog' : 'vhdl' }));
  const clock = doc.ports.find(p => p.dir === 'in' && p.width === 1 && /^(clk|clock)/i.test(p.name));
  const out = {};
  for (const part of parts) {
    const [, dev, pkg] = /^(xc3s\d+e)(cp132|fg320)-\d$/.exec(part);
    const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(shippedDevicePath(part))).toString('utf8')));
    const json = {};
    for (const [k, f] of Object.entries(dbFileNames(dev, pkg))) { const p = path.join(DB, f); json[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
    const db = makeBitDb(dbFilesFrom(json, pkg), device, part);
    const lines = [], store = {};
    const spec = { top: doc.name, part, device: dev, pkg, family: 'spartan3e', steps: ['synth', 'translate', 'map', 'par', 'bitgen'], seed: 1, effort: 1, synthEffort: 'normal', startupClk: 'JtagClk' };
    const io = { log: l => lines.push(l), sources: () => sources, ucf: clock ? boardClockUcf(clock.name) : null, ucfName: 'corpus.ucf',
      device: () => device, bitDb: () => db, yosys: yosysNode, write: (n, d) => { store[n] = d; return `build/${n}`; }, read: n => (typeof store[n] === 'string' ? store[n] : null), save: () => {} };
    try {
      const r = await runOpenFlow(spec, io);
      out[part] = r.ok && Object.keys(store).some(k => /\.bit$/.test(k)) ? 'complete' : status(r.error || lines.find(l => /ERROR/.test(l)) || 'no bitstream');
    } catch (e) { out[part] = status(e.message); }
  }
  const bad = Object.entries(out).find(([, s]) => !isGood(s));
  return { flow: bad ? `${bad[0]}: ${bad[1]}` : 'complete', parts: out };
}

/** The differences between results and expectations: [{ name, stage, expected, got }] (statuses and warnings). */
export function compareExpectations(results, expected, stages = STAGES) {
  const out = [];
  for (const [name, r] of Object.entries(results)) {
    const e = expected[name];
    if (!e) { out.push({ name, stage: '*', expected: 'none', got: 'new schematic' }); continue; }
    for (const s of stages) {
      if (r[s] === undefined) continue;
      if (e[s] !== r[s]) out.push({ name, stage: s, expected: e[s], got: r[s] });
      const ew = JSON.stringify(e.warnings?.[s] || []), rw = JSON.stringify(r.warnings?.[s] || []);
      if (ew !== rw) out.push({ name, stage: `${s} warnings`, expected: ew, got: rw });
    }
    if (r.quality && e.quality && JSON.stringify(r.quality) !== JSON.stringify(e.quality)) out.push({ name, stage: 'quality', expected: JSON.stringify(e.quality), got: JSON.stringify(r.quality) });
  }
  return out;
}

/** The expectations with these results recorded (the stages that did not run keep theirs). */
export function updatedExpectations(expected, results) {
  const all = { ...expected };
  for (const [name, r] of Object.entries(results)) {
    const e = { ...(expected[name] || {}) };
    const w = { ...(e.warnings || {}) };
    for (const s of STAGES) if (r[s] !== undefined) { e[s] = r[s]; if (r.warnings?.[s]) w[s] = r.warnings[s]; else delete w[s]; }
    if (r.quality !== undefined) e.quality = r.quality;
    if (r.parts) e.parts = r.parts;
    e.warnings = Object.fromEntries(STAGES.filter(s => w[s]).map(s => [s, w[s]]));
    if (!Object.keys(e.warnings).length) delete e.warnings;
    all[name] = Object.fromEntries([...STAGES, 'quality', 'parts', 'warnings'].filter(k => e[k] !== undefined).map(k => [k, e[k]]));
  }
  return Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)));
}

/** The README's table of the expectations. */
export function table(manifest, expected) {
  const L = ['| Schematic | Source | load | check | hdl | sim | ise | synth (LUTs / FFs) | flow | Warnings |', '|---|---|---|---|---|---|---|---|---|---|'];
  const cell = s => (s === undefined ? '-' : String(s).replace(/\|/g, '\\|'));
  for (const it of manifest.schematics) {
    const e = expected[it.name];
    if (!e) continue;
    const q = e.quality ? `${e.synth} (${e.quality.luts} / ${e.quality.ffs})` : cell(e.synth);
    const nw = Object.values(e.warnings || {}).reduce((n, l) => n + l.length, 0);
    L.push(`| ${it.name} | ${it.source} | ${cell(e.load)} | ${cell(e.check)} | ${cell(e.hdl)} | ${cell(e.sim)} | ${cell(e.ise)} | ${q} | ${cell(e.flow)} | ${nw || ''} |`);
  }
  const gen = Object.keys(expected).filter(n => n.startsWith('gen-'));
  if (gen.length) {
    const ok = s => gen.filter(n => isGood(expected[n][s])).length;
    L.push('', `Generated from the design corpus: ${gen.length} designs; load ${ok('load')}, check ${ok('check')}, hdl ${ok('hdl')}, sim ${ok('sim')}, ise ${ok('ise')} pass (each design's stages in expected.json).`);
  }
  return L.join('\n');
}
