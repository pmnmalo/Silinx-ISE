// The HDL of a source drawn as a schematic (.sch.json), an ASM chart (.asm.json), a state diagram
// (.fsm.json), a Boolean algebra (.bool.json, .tt.json before #2065) or a Petri net (.pn.json) that has no HDL file of its own (#177): made in memory when
// the project is compiled, simulated or implemented, so that such a source is a module of the
// project like an HDL one (it can be the top, be instanced, be synthesized) without a file.
// A source kept in sync with an HDL file (its generatedFile) is that file: nothing here, unless that
// file is gone (deleted, or removed from the project, #231): then it is a source without one again.
// Every drawn source normally has that file (#207: the app writes it from the HDL made here, drawnHdlPath); this
// is for one that cannot have it yet (errors, a file of that name in the way) and for implementing.
import { generateHdl } from './schdoc.js';
import { generate as generateAsm, validate as validateAsm } from './asm.js';
import { generateFsm, fsmErrors, normalizeFsm } from './fsm.js';
import { generateTableHdl, validateTable, normalizeTable } from './logic.js';
import { generatePetri, petriErrors, normalizePetri } from './petri.js';
import { cToHdl } from './c-hdl.js';

export const VIEW_RE = /\.(sch|asm|fsm|tt|bool|pn)\.json$/i;
export const isView = path => VIEW_RE.test(String(path || ''));
// a C source (Silinx HLS, #1531): its HDL made here from its top function (core/c-hdl.js), as a drawn source's
// (C++ too, #1590: .cpp, .cc, .cxx)
export const isCSource = path => /\.(c|cpp|cc|cxx)$/i.test(String(path || ''));
/** A source whose HDL is made here: a drawing or a C source. */
export const isGeneratedSource = path => isView(path) || isCSource(path);

/**
 * One source's HDL: { path, lang, text, module, errors: [message] } (path: the source's own, so that the
 * messages point at it), or null when it is kept in sync with an HDL file, or not a drawn source.
 * modules: the project's modules (the schematics' module symbols). linked(file): whether its HDL file
 * (generatedFile) is there, in the project (default: always); when it is not (#231), the HDL is made
 * here as for a source without one, and `lost` names that file.
 */
export function viewHdl(path, text, { modules = {}, linked = null, lang = 'vhdl', clock, family, mults } = {}) {
  if (isCSource(path)) return cHdl(path, text, lang, clock, family, mults);
  if (!isView(path)) return null;
  let m;
  try { m = JSON.parse(text); } catch (e) { return { path, lang: 'vhdl', text: '', module: null, errors: [`${path}: ${e.message}`] }; }
  if (m.generatedFile && (!linked || linked(m.generatedFile))) return null;
  // (its language that file's when the drawing does not say)
  const r = drawnHdl(path, m.generatedFile && !m.lang ? { ...m, lang: /\.s?v$/i.test(m.generatedFile) ? 'verilog' : 'vhdl' } : m, modules);
  if (m.generatedFile) r.lost = m.generatedFile;
  return r;
}

// a C source's HDL: its top function's module, in the project's language, scheduled for the clock (ns, #1924) with the
// device family's delays (#2080) and its multiplier blocks (#2125); its errors as a drawing's
function cHdl(path, text, lang, clock, family, mults) {
  const r = cToHdl(String(text ?? ''), { file: path, lang: lang === 'verilog' ? 'verilog' : 'vhdl', clock, family, mults });
  const errors = r.diagnostics.filter((d) => d.severity === 'error').map((d) => `${path}: line ${d.line}: ${d.message}`);
  return { path, lang: lang === 'verilog' ? 'verilog' : 'vhdl', text: r.ok ? r.hdl : '', module: r.top, errors, sequential: !!r.sequential };
}

function drawnHdl(path, m, modules) {
  const kind = VIEW_RE.exec(path)[1].toLowerCase();
  const lang = m.lang === 'verilog' ? 'verilog' : 'vhdl';
  const out = (code, errors = []) => {
    const module = /^\s*(?:entity|module)\s+([A-Za-z_][\w$]*)/m.exec(String(code).replace(/^(?:--|\/\/) silinx-symbol[\s\S]*?\n(?=\s*(?:--|\/\/) Generated)/, ''))?.[1] || m.name || null;
    return { path, lang, text: code, module, errors };
  };
  try {
    if (kind === 'sch') {
      const g = generateHdl(m, { lang, modules });
      const top = g.filename.replace(/\.(vhd|v)$/, '');
      return { path, lang, text: g.code, module: top, errors: g.diagnostics.filter(d => d.severity === 'error').map(d => `${path}: ${d.message}`) };
    }
    if (kind === 'asm') {
      const errs = (validateAsm(m) || []).filter(x => x.severity === 'error').map(x => `${path}: ${x.message}`);
      if (errs.length) return { path, lang, text: '', module: m.name || null, errors: errs };
      return out(generateAsm(m, lang).code);
    }
    if (kind === 'fsm') {
      const f = normalizeFsm(m);
      const errs = fsmErrors(f).map(x => `${path}: ${x.message}`);
      if (errs.length) return { path, lang, text: '', module: f.name || null, errors: errs };
      return out(generateFsm({ ...f, lang }, lang, { source: path.split('/').pop() }).code);
    }
    if (kind === 'pn') {
      const n = normalizePetri(m);
      const errs = petriErrors(n).map(x => `${path}: ${x.message}`);
      if (errs.length) return { path, lang, text: '', module: n.name || null, errors: errs };
      return out(generatePetri(n, lang, { source: path.split('/').pop() }).code);
    }
    const t = normalizeTable(m);
    const errs = (validateTable(t) || []).filter(x => x.severity !== 'warning').map(x => `${path}: ${x.message}`);
    if (errs.length) return { path, lang, text: '', module: t.name || null, errors: errs };
    return out(generateTableHdl({ ...t, lang }, lang, { source: path.split('/').pop() }).code);
  } catch (e) {
    return { path, lang, text: '', module: m.name || null, errors: [`${path}: ${e.message}`] };
  }
}

/**
 * The module a drawn source is synchronized with, among the modules of its HDL file
 * ([{ name, instances: [module name] }]): the one named as the drawing (its `name`), else the one no
 * other module of the file instances. The other modules of the file (a schematic's blocks: its MUX,
 * decoders, registers…, entities of their own, #175) are plain HDL modules, not the drawing (#207).
 */
export function drawnModule(mods, name) {
  const lc = s => String(s ?? '').toLowerCase();
  const named = mods.find(m => lc(m.name) === lc(name));
  if (named) return named.name;
  const used = new Set(mods.flatMap(m => (m.instances || []).map(lc)));
  const roots = mods.filter(m => !used.has(lc(m.name)));
  return roots.length === 1 ? roots[0].name : null;
}

/** The HDL file a drawn source gets (#207): next to it, named after its module. */
export function drawnHdlPath(path, module, lang) {
  const dir = String(path).includes('/') ? String(path).replace(/\/[^/]*$/, '') : 'src';
  return `${dir}/${module}.${lang === 'verilog' ? 'v' : 'vhd'}`;
}

const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether the HDL `text` (of the file `file`: VHDL unless .v / .sv) defines the module `module`. */
export function definesModule(text, module, file) {
  if (!module) return false;
  const verilog = /\.s?v$/i.test(String(file));
  const code = String(text ?? '').replace(verilog ? /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g : /--[^\n]*/g, '');
  return (verilog ? new RegExp(`^\\s*(?:macro)?module\\s+${reEsc(module)}\\b`, 'm') : new RegExp(`^\\s*entity\\s+${reEsc(module)}\\s+is\\b`, 'im')).test(code);
}

/**
 * The free file name for a drawing's HDL when the one it gets (drawnHdlPath) holds something else
 * (#230): next to it, <module>_<kind>.vhd / .v (kind: sch, asm, fsm, tt or pn, as the drawing's
 * extension), then <module>_<kind>_2, _3… while that name is taken too. exists(path): on the disk.
 */
export function freeHdlPath(path, module, lang, exists) {
  const kind = (VIEW_RE.exec(String(path))?.[1] || 'sch').toLowerCase();
  for (let i = 1; ; i++) {
    const p = drawnHdlPath(path, `${module}_${kind}${i > 1 ? `_${i}` : ''}`, lang);
    if (!exists(p)) return p;
  }
}

/**
 * Why a drawn source (no errors, its module `module`) has no HDL file of its own (#230), or null when
 * it can have it (drawnHdlPath free and no HDL file of the project defines its module):
 * - { kind: 'same', path, module, target, file }: `file` defines its module already (the file of its
 *   name, or `definedIn`, another HDL file of the project): it may be replaced by the HDL generated
 *   from the drawing and linked, once the user says so (its contents are lost);
 * - { kind: 'other', path, module, target, file, free }: the file of its name holds something else:
 *   the drawing's HDL goes to the free name `free` (freeHdlPath).
 * exists(path): on the disk; read(path): the text of a file (null if unknown).
 */
export function drawnHdlClash({ path, module, lang, exists, read, definedIn = null }) {
  if (!module) return null;
  const target = drawnHdlPath(path, module, lang);
  if (definedIn) return { kind: 'same', path, module, target, file: definedIn };
  if (!exists(target)) return null;
  if (definesModule(read(target), module, target)) return { kind: 'same', path, module, target, file: target };
  return { kind: 'other', path, module, target, file: target, free: freeHdlPath(path, module, lang, exists) };
}

/**
 * A drawing (`path`, its JSON `text`) in the language `lang` (#220: its editor's HDL language; #1477: the
 * project's Preferred Language): { model, text: the drawing in that language, its link (generatedFile) renamed
 * .vhd <-> .v when it makes its HDL with no errors; from: its HDL file until now (null when it has none); target:
 * its HDL file in that language (null when it has none); hdl, module, errors: the HDL it makes in it }, or null
 * when it is in that language already (the drawing and its HDL file). modules: the project's modules (the
 * schematics' module symbols).
 */
export function drawingInLanguage(path, text, lang, { modules = {} } = {}) {
  const m = JSON.parse(text);
  const L = lang === 'verilog' ? 'verilog' : 'vhdl';
  const from = m.generatedFile || null;
  const was = m.lang ? (m.lang === 'verilog' ? 'verilog' : 'vhdl') : from && /\.s?v$/i.test(from) ? 'verilog' : 'vhdl';
  if (was === L && (!from || /\.s?v$/i.test(from) === (L === 'verilog'))) return null;
  const model = { ...m, lang: L };
  const r = drawnHdl(path, { ...model, generatedFile: undefined }, modules);
  const target = from && from.replace(/\.[^./]+$/, L === 'verilog' ? '.v' : '.vhd');
  if (from && !r.errors.length) model.generatedFile = target;
  return { model, text: JSON.stringify(model, null, /\.sch\.json$/i.test(path) ? 1 : 2), from, target, hdl: r.text, module: r.module, errors: r.errors };
}
