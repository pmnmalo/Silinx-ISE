// A document's related views (#2834): what it generates and what it comes from or shows, each an entry of its tab's
// menu and of View, Show … Beside (web/js/split-view.js showBeside). Only the views that exist or can be made now:
//   a drawing: what it converts to (Boolean algebra: its schematic; a state diagram: its ASM chart; an ASM chart: its
//     state diagram; a Petri net: its state machine), its HDL and the HDL's translation;
//   a view made from a drawing (the generated HDL, the table's schematic, a converted drawing): the drawing, its HDL;
//   a C source: its HDL, its ASM chart (sequential), its synthesis report; the views made from it: the C, the others;
//   an HDL source: its translation (#2711); a test bench: its unit under test; a translation: its source;
//   a waveform: the module it shows (a test bench: the bench and its unit under test); the RTL / technology schematic,
//     the C model, the power report and the Design Summary: their module (the summary's and the report's, the top).
// An entry: { label, id: its document's id, find(): that document when open, open(): makes or opens it }.
import { S, findDoc, instancesOf, moduleInfo, openFile } from './app.js';
import { cSequential, isC, openCAsm, openCHdl } from './c-source.js';
import { openTranslation } from './translation.js';
import { openTtSchematic } from './drawings-tt.js';
import { openPetriFsm } from './petri-fsm-doc.js';
import { openAsmFsm, openCReportDoc, openFsmAsm } from './related-docs.js';

const KINDS = { sch: 'Show Schematic Beside', asm: 'Show ASM Chart Beside', fsm: 'Show State Diagram Beside', tt: 'Show Boolean Algebra Beside', pn: 'Show Petri Net Beside' };
const DRAWING = /\.(sch|asm|tt|bool|fsm|pn)\.json$/i;
/** A drawing's kind (sch, asm, fsm, tt, pn), by its file's name, or null. */
export const drawingKind = (p) => { const k = DRAWING.exec(p || '')?.[1].toLowerCase(); return k === 'bool' ? 'tt' : k || null; };
const hdlLabel = (p) => (/\.vhdl?$/i.test(p) ? 'Show VHDL Beside' : 'Show Verilog Beside');
const cLabel = (p) => (/\.c$/i.test(p) ? 'Show C Source Beside' : 'Show C++ Source Beside');
const projectSource = (p) => S.sources?.some((s) => s.path === p && !s.view);
const cSource = (p) => isC(p) && S.sources?.find((s) => s.view && s.path === p);
// (each label written out whole: web/js/i18n.js translates it, test/web-i18n.test.js finds it here)
const entry = (label, id, open, find = () => findDoc(id)) => ({ label, id, open, find });

const drawingEntry = (p, label = KINDS[drawingKind(p)]) => entry(label, `${drawingKind(p)}:${p}`, () => openFile(p));
const fileEntry = (p, label = hdlLabel(p)) => entry(label, `file:${p}`, () => openFile(p));
// an HDL source in the other language (its translation, #2711): VHDL ↔ Verilog
function translationEntry(p) {
  if (!projectSource(p) || !/\.(vhdl?|s?v)$/i.test(p)) return null;
  const to = /\.vhdl?$/i.test(p) ? 'verilog' : 'vhdl';
  return entry(to === 'vhdl' ? 'Show VHDL Beside' : 'Show Verilog Beside', `tr:${p}`, () => openTranslation(p, to), () => { const d = findDoc(`tr:${p}`); return d?.translation?.lang === to ? d : null; });
}
// an HDL file and its translation
const hdlEntries = (p) => (p ? [fileEntry(p), translationEntry(p)] : []);
// a C source's views: its HDL, its ASM chart (a sequential module), its synthesis report
function cViews(p) {
  const src = cSource(p);
  if (!src) return [];
  return [
    entry(src.lang === 'verilog' ? 'Show Verilog Beside' : 'Show VHDL Beside', `chdl:${p}`, () => openCHdl(p)),
    cSequential(p) ? entry('Show ASM Chart Beside', `casm:${p}`, () => openCAsm(p)) : null,
    entry('Show C Synthesis Report Beside', `crep:${p}`, () => openCReportDoc(p)),
  ];
}
// a drawing's views: what it converts to, its HDL and the HDL's translation
function drawingViews(p) {
  const k = drawingKind(p);
  return [
    k === 'tt' ? entry('Show Schematic Beside', `ttsch:${p}`, () => openTtSchematic(p)) : null,
    k === 'fsm' ? entry('Show ASM Chart Beside', `fsmasm:${p}`, () => openFsmAsm(p)) : null,
    k === 'asm' ? entry('Show State Diagram Beside', `asmfsm:${p}`, () => openAsmFsm(p)) : null,
    k === 'pn' ? entry('Show State Diagram Beside', `pnfsm:${p}`, () => openPetriFsm(p)) : null,
    ...hdlEntries(S.schOwners?.[p]),
  ];
}
// a module's base (its drawing, its C, its HDL file), under `label` (the kind's when not given)
function baseEntry(name, label) {
  const f = moduleInfo(name)?.file;
  if (!f) return null;
  const drawing = S.hdlToSch?.[f];
  if (drawing) return drawingEntry(drawing, label);
  if (isC(f)) return entry(label || cLabel(f), `file:${f}`, () => openFile(f));
  return fileEntry(f, label);
}
// a module's source: its base, and its HDL (a drawing's) or its views (a C source's) or its translation
function moduleViews(name) {
  const f = moduleInfo(name)?.file;
  if (!f) return [];
  const drawing = S.hdlToSch?.[f];
  if (drawing) return [drawingEntry(drawing), ...hdlEntries(f)];
  if (isC(f)) return [baseEntry(name), ...cViews(f)];
  return hdlEntries(f);
}
// a test bench's unit under test: the first project module it instantiates
function uutOf(name) {
  const m = moduleInfo(name)?.mod;
  const i = m && instancesOf(m).find((x) => moduleInfo(x.module));
  return i ? moduleInfo(i.module).name : null;
}
const isBench = (name) => moduleInfo(name)?.role === 'sim';
function benchViews(name) {
  const uut = uutOf(name);
  return [baseEntry(name, 'Show Test Bench Beside'), uut ? baseEntry(uut, 'Show Unit Under Test Beside') : null];
}

/** The views related to a document: [{ label, id, find, open }], its own left out, each once. */
export function relatedViews(doc) {
  if (!doc || !S.project) return [];
  const [, kind, rest] = /^([a-z]+):(.*)$/.exec(String(doc.id)) || [null, doc.id, ''];
  let list = [];
  if (KINDS[kind]) list = drawingViews(rest);
  else if (['ttsch', 'fsmasm', 'asmfsm', 'pnfsm'].includes(kind)) list = [drawingEntry(rest), ...drawingViews(rest)];
  else if (['chdl', 'casm', 'crep'].includes(kind)) list = [entry(cLabel(rest), `file:${rest}`, () => openFile(rest)), ...cViews(rest)];
  else if (kind === 'tr') list = [S.hdlToSch?.[rest] ? drawingEntry(S.hdlToSch[rest]) : null, fileEntry(rest)];
  else if (kind === 'file') {
    if (cSource(rest)) list = cViews(rest);
    else if (S.hdlToSch?.[rest]) list = [drawingEntry(S.hdlToSch[rest]), translationEntry(rest)];
    else {
      const mods = (S.modules || []).filter((m) => m.file === rest && m.kind !== 'package');
      const bench = mods.find((m) => m.role === 'sim');
      const uut = bench && uutOf(bench.name);
      list = [translationEntry(rest), uut ? baseEntry(uut, 'Show Unit Under Test Beside') : null];
    }
  } else if (kind === 'isim') {
    const name = rest.replace(/@.*$/, '');
    list = isBench(name) ? benchViews(name) : moduleViews(name);
  } else if (['rtl', 'tech', 'cmodel'].includes(kind)) list = moduleViews(rest);
  else if (doc.id === 'summary' || /^text:.*\.pwr$/.test(doc.id)) list = S.project.top ? moduleViews(S.project.top) : [];
  const seen = new Set([doc.id]);
  return list.filter((e) => e && !seen.has(e.id) && seen.add(e.id));
}
