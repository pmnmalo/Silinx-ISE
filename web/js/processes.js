// The Processes panel (#405: out of app.js): the processes of the selected source and what runs them, Check Syntax
// and the elaboration's diagnostics, and the processes' status kept in the project's build folder.
import { api } from './api.js';
import { icons, icon } from './icons.js';
import { h, dialog, popupMenu, toast, longPressMenu } from './ui.js';
import { compile, elaborate } from '/core/compile.js';
import { reservedModuleDiags } from '/core/reserved.js';
import * as wiz from './wizards.js';
import { designDiags, sevWord } from './diaghelp.js';
import { S, flushDoc, openFile, openFpgaView, openImpact, openPinPlanner, openSummary, openUcf,
  status, withPrimitives } from './app.js';
import { log, showConsolePage, setDiagnostics } from './console.js';
import { SYNTH_OPEN, backAnnotatePins, checkUcfFile, generateSimModel, postParTiming, runImpl, stopProcesses,
  synthOpen, textPowerReport, worst } from './implement.js';
import { isAsm, isFsm, isPn, isTt, openAsm, openFsm, openPetri, openSch, openTt } from './drawings.js';
import { inView, testBench } from './design.js';
import { openWizardModule, wizardProcessOf } from './wizard-modules.js';
import { openEmulator, openSchematic, openTechSchematic, runSimulation } from './viewers.js';

const $ = id => document.getElementById(id);

const STATUS_ICON = { ok: 'ok', warn: 'warn', err: 'err', running: 'running', stale: 'stale' };

// The Design Summary can always be (re)opened from the Processes panel: whatever is selected, in both views
const SUMMARY_PROC = { id: 'summary', label: 'Design Summary/Reports', ico: 'summary', run: () => openSummary() };
// The Silinx toolchain (Toolchain Settings: "Silinx toolchain (no ISE)"): Synthesize,
// Implement Design and Generate Programming File run Silinx's own flow on the server; the processes
// that need Xilinx ISE are disabled (their tooltip says why).
// the project's synthesis tool (Design Properties: Silinx or XST), else Toolchain Settings' mode; never
// in the single-file edition (no server: the Silinx toolchain runs on it)
// (the browser edition: the Silinx toolchain, unless the project chose XST)
export const openMode = () => (S.project?.synthTool ? S.project.synthTool === 'silinx' : api.standalone || S.toolchain?.config?.mode === 'silinx');
export const OPEN_SYNTH = 'Synthesize - Yosys';
// (Back-annotate Pin Locations, View Technology Schematic and the simulation models are the Silinx toolchain's
// own: the pads its placer chose, the netlist of its synthesis, its packed and its routed design, #120-#122;
// none needs ISE any more, the mechanism stays for the processes to come)
export const ISE_ONLY = new Set([]);
const ISE_ONLY_TIP = 'Needs Xilinx ISE: not available with the Silinx toolchain (choose an ISE mode in Toolchain Settings)';
function forOpenMode(defs) {
  const conv = p => {
    if (p.id === 'synth-open') return null;   // Synthesize is the open synthesis already
    const q = { ...p };
    if (ISE_ONLY.has(p.id)) Object.assign(q, { disabled: true, title: ISE_ONLY_TIP });
    if (p.id === 'synth') q.label = OPEN_SYNTH;
    if (['synth', 'impl', 'bitgen'].includes(p.id)) q.title = 'Silinx toolchain (no ISE)';
    if (p.children) q.children = p.children.map(conv).filter(Boolean);
    return q;
  };
  return defs.map(conv).filter(Boolean);
}
function processDefs() {
  const defs = processDefsAll();
  return openMode() ? forOpenMode(defs) : defs;
}
function processDefsAll() {
  if (!S.project) return [];
  const defs = selectionProcesses();
  return defs.some(p => p.id === 'summary') ? defs : [SUMMARY_PROC, ...defs.filter(p => p.id !== 'none')];
}
function selectionProcesses() {
  const sel = S.sel || {};
  // a drawing without its HDL file (it has errors, #207): it gets it as soon as it has none (#220)
  if (sel.type === 'asm') return [{ id: 'asm-open', label: 'View/Edit State Diagram (ASM)', ico: 'asm', run: () => openAsm(sel.file) }];
  if (sel.type === 'pn') return [{ id: 'pn-open', label: 'View/Edit Petri Net', ico: 'petri', run: () => openPetri(sel.file) }];
  if (sel.type === 'fsm') return [{ id: 'fsm-open', label: 'View/Edit State Diagram (FSM)', ico: 'fsm', run: () => openFsm(sel.file) }];
  if (sel.type === 'tt') return [{ id: 'tt-open', label: 'View/Edit Truth Table', ico: 'truthtable', run: () => openTt(sel.file) }];
  if (sel.type === 'sch') return [{ id: 'sch-open', label: 'View/Edit Schematic', ico: 'schematic', run: () => openSch(sel.file) }];
  if (sel.type === 'ucf') return [
    { id: 'ucf-edit', label: 'Edit Constraints (Text)', ico: 'ucf', run: () => openFile(sel.file) },
    { id: 'ucf-check', label: 'Check Constraints', ico: 'process', run: () => checkUcfFile(sel.file) },
    { id: 'pins', label: 'I/O Pin Planning', ico: 'pins', run: () => openPinPlanner() },
  ];
  if (sel.type !== 'module') return [{ id: 'none', label: 'No processes for the selected item', ico: 'process', disabled: true }];
  const mod = sel.module;
  if (S.view === 'sim') return [
    { id: 'isim', label: 'SSim Simulator', ico: 'sim', children: [
      { id: 'sim-check', label: 'Behavioral Check Syntax', ico: 'process', run: () => checkSyntax(mod, true) },
      { id: 'sim-run', label: 'Simulate Behavioral Model', ico: 'wave', run: () => runSimulation(mod) },
      ...Object.entries(SIM_MODEL_NAMES).map(([step, name]) => ({ id: `sim-${step}`, label: `Simulate ${name} Model`, ico: 'wave', run: () => runSimulation(mod, step) })),
    ] },
    { id: 'rtl-sim', label: 'View RTL Schematic', ico: 'schematic', run: () => openSchematic(mod) },
    { id: 'tb-wiz', label: 'Create Test Bench (Wizard)…', ico: 'template', run: () => testBench(mod) },
  ];
  // synthesis, implementation and emulation work on the project's top module (onTop: what they do to
  // it, said before running when another module is selected, #223)
  const top = S.project.top || mod;
  return [
    ...(sel.sch ? [
      isAsm(sel.sch) ? { id: 'sch-open', label: 'View/Edit State Diagram (ASM)', ico: 'asm', run: () => openAsm(sel.sch) }
        : isTt(sel.sch) ? { id: 'sch-open', label: 'View/Edit Truth Table', ico: 'truthtable', run: () => openTt(sel.sch) }
        : isFsm(sel.sch) ? { id: 'sch-open', label: 'View/Edit State Diagram (FSM)', ico: 'fsm', run: () => openFsm(sel.sch) }
        : isPn(sel.sch) ? { id: 'sch-open', label: 'View/Edit Petri Net', ico: 'petri', run: () => openPetri(sel.sch) }
                     : { id: 'sch-open', label: 'View/Edit Schematic', ico: 'schematic', run: () => openSch(sel.sch) },
    ] : []),
    ...(sel.wizard ? [{ id: 'wiz-open', label: wizardProcessOf(sel.file), ico: 'template', run: () => openWizardModule(sel.file) }] : []),
    SUMMARY_PROC,
    { id: 'constraints', label: 'User Constraints', ico: 'procGroup', children: [
      { id: 'pins', label: 'I/O Pin Planning', ico: 'pins', run: () => openPinPlanner(mod) },
      { id: 'ucf-edit', label: 'Edit Constraints (Text)', ico: 'ucf', run: () => openUcf() },
      { id: 'ucf-check', label: 'Check Constraints', ico: 'process', run: () => checkUcfFile() },
    ] },
    { id: 'synth', label: 'Synthesize - XST', ico: 'process', onTop: 'synthesizes', run: () => runImpl(top, ['synth']), children: [
      { id: 'rtl', label: 'View RTL Schematic', ico: 'schematic', run: () => openSchematic(mod) },
      { id: 'tech', label: 'View Technology Schematic', ico: 'schematic', onTop: 'synthesizes', run: () => openTechSchematic(top) },
      { id: 'check', label: 'Check Syntax', ico: 'process', run: () => checkSyntax(mod) },
      { id: 'postsynth', label: EXTRA_STEPS.postsynth, ico: 'process', onTop: 'synthesizes', run: () => generateSimModel(top, 'postsynth') },
    ] },
    { id: 'synth-open', label: SYNTH_OPEN, ico: 'process', onTop: 'synthesizes', run: () => synthOpen(top) },
    { id: 'impl', label: 'Implement Design', ico: 'process', onTop: 'implements', run: () => runImpl(top, ['synth', 'translate', 'map', 'par']), children: [
      { id: 'translate', label: 'Translate', ico: 'process', onTop: 'implements', run: () => runImpl(top, ['synth', 'translate']), children: [
        { id: 'posttrans', label: EXTRA_STEPS.posttrans, ico: 'process', onTop: 'implements', run: () => generateSimModel(top, 'posttrans') },
      ] },
      { id: 'map', label: 'Map', ico: 'process', onTop: 'implements', run: () => runImpl(top, ['synth', 'translate', 'map']), children: [
        { id: 'postmap', label: EXTRA_STEPS.postmap, ico: 'process', onTop: 'implements', run: () => generateSimModel(top, 'postmap') },
      ] },
      { id: 'par', label: 'Place & Route', ico: 'process', onTop: 'implements', run: () => runImpl(top, ['synth', 'translate', 'map', 'par']), children: [
        { id: 'trce', label: EXTRA_STEPS.trce, ico: 'process', onTop: 'implements', run: () => postParTiming(top) },
        { id: 'xpwr', label: EXTRA_STEPS.xpwr, ico: 'process', onTop: 'implements', run: () => textPowerReport(top) },
        { id: 'postpar', label: EXTRA_STEPS.postpar, ico: 'process', onTop: 'implements', run: () => generateSimModel(top, 'postpar') },
        { id: 'pin2ucf', label: EXTRA_STEPS.pin2ucf, ico: 'process', onTop: 'implements', run: () => backAnnotatePins(top) },
        { id: 'fpgaview', label: EXTRA_STEPS.fpgaview, ico: 'chip', onTop: 'implements', run: () => openFpgaView(top) },
      ] },
    ] },
    { id: 'bitgen', label: 'Generate Programming File', ico: 'process', onTop: 'implements', run: () => runImpl(top, ['synth', 'translate', 'map', 'par', 'bitgen']) },
    { id: 'emulate', label: 'Emulate on Board', ico: 'board', onTop: 'emulates', run: () => openEmulator(top), children: [
      { id: 'emulate-rtl', label: 'Emulate Behavioral Model (RTL)', ico: 'board', onTop: 'emulates', run: () => openEmulator(top) },
      ...Object.entries(SIM_MODEL_NAMES).map(([step, name]) => ({ id: `emulate-${step}`, label: `Emulate ${name} Model`, ico: 'board', onTop: 'emulates', run: () => openEmulator(top, { model: step }) })),
    ] },
    { id: 'config', label: 'Configure Target Device', ico: 'impact', run: () => openImpact(), children: [
      { id: 'impact', label: 'Manage Configuration Project (iMPACT)', ico: 'impact', run: () => openImpact() },
    ] },
  ];
}

export function renderProcesses() {
  const host = $('procs');
  host.innerHTML = '';
  const sel = S.sel || {};
  $('proc-caption').textContent = `Processes: ${sel.module || (sel.file ? sel.file.split('/').pop() : '')}`;
  const tree = h('ul', { class: 'tree' });
  const add = (ul, p) => {
    const li = h('li', { 'data-proc': p.id || null });   // (the Tasks interface leaves other tasks' groups out of Implement: #923)
    const st = S.status[p.id];
    // collapsed groups are remembered: the panel is redrawn on every status change
    const key = p.id || p.label;
    const collapsed = S.procCollapsed.has(key);
    const group = !!p.children?.length;
    const tw = h('span', { class: 'twisty' }, group ? (collapsed ? '▸' : '▾') : '');
    const isSel = S.selProc?.id === p.id && S.selProc?.label === p.label;
    const row = h('div', { class: `row${p.disabled ? ' disabled' : ''}${isSel ? ' sel' : ''}`, ...(p.title ? { title: p.title } : {}) }, tw, h('span', { class: 'status', html: st ? icons[STATUS_ICON[st]] : '' }), icon(p.ico || 'process'), h('span', { class: 'lbl' }, p.label));
    const sub = h('ul');
    if (collapsed) sub.style.display = 'none';
    li.append(row, sub);
    const toggle = () => {
      if (!p.children?.length) return;
      if (S.procCollapsed.has(key)) S.procCollapsed.delete(key); else S.procCollapsed.add(key);
      const c = S.procCollapsed.has(key);
      sub.style.display = c ? 'none' : '';
      tw.textContent = c ? '▸' : '▾';
    };
    tw.addEventListener('click', e => { e.stopPropagation(); toggle(); });
    tw.addEventListener('dblclick', e => e.stopPropagation());
    // the icon of a group also expands / collapses it (single click; double-click on the name runs it)
    const ico = row.children[2];
    if (group && ico) { ico.style.cursor = 'pointer'; ico.addEventListener('click', e => { e.stopPropagation(); toggle(); }); ico.addEventListener('dblclick', e => e.stopPropagation()); }
    row.addEventListener('click', () => { host.querySelectorAll('.row.sel').forEach(r => r.classList.remove('sel')); row.classList.add('sel'); S.selProc = p; });
    row.addEventListener('dblclick', () => { if (p.disabled && p.title) toast(p.title); else if (p.run && !p.disabled) runProcess(p); });
    row.addEventListener('contextmenu', e => {
      e.preventDefault(); row.click();
      popupMenu([
        { label: 'Run', action: () => runProcess(p), disabled: !p.run || p.disabled || (S.busy && ISE_PROCS.includes(p.id)) },
        { label: 'Rerun', action: () => runProcess(p), disabled: !p.run || p.disabled || (S.busy && ISE_PROCS.includes(p.id)) },
        { label: 'Stop', icon: icon('stop'), action: () => stopProcesses(), disabled: !S.currentJob },
        '-',
        { label: 'Process Properties…', action: () => wiz.implProperties(), disabled: !['synth', 'impl', 'bitgen', 'map', 'par', 'translate'].includes(p.id) },
      ], e.clientX, e.clientY);
    });
    longPressMenu(row);
    ul.append(li);
    for (const c of p.children || []) add(sub, c);
  };
  for (const p of processDefs()) add(tree, p);
  host.append(tree);
}

// Only the ISE implementation runs are exclusive (one build directory); simulation, check syntax,
// schematics, editors and programming run in the browser or independently and stay available.
const ISE_PROCS = ['synth', 'impl', 'translate', 'map', 'par', 'bitgen'];
export async function runProcess(p) {
  if (S.busy && ISE_PROCS.includes(p.id)) { toast('An implementation is already running (use Stop to cancel it)', 'error'); return; }
  if (p.onTop && !await topConfirmed(p.label, p.onTop)) return;
  try { await p.run(); }
  catch (e) { log(`ERROR: ${e.message}`, 'err'); console.error(e); }
}

// Synthesis, implementation and emulation work on the project's top module (#223): when the module
// selected in the Design pane is another one, the user is told first (OK runs it on the top, Cancel
// does nothing). title: the process; verb: what it does to the top ('implements', 'synthesizes', 'emulates').
export async function topConfirmed(title, verb) {
  const top = S.project?.top, sel = S.sel?.module;
  if (!top || !sel || sel.toLowerCase() === top.toLowerCase()) return true;
  return !!await dialog({
    title, width: 460,
    body: h('div', { class: 'msg msg-warn' }, h('div', { class: 'msg-icon' }, '!'), h('div', { class: 'msg-text' },
      h('div', {}, `${title} ${verb} the top module '${top}', not the selected module '${sel}'.`),
      h('div', { class: 'hint' }, 'Another module becomes the top with Set as Top Module (its right-click menu).'))),
    buttons: [{ label: 'OK', value: true, primary: true }, { label: 'Cancel', value: null }],
  });
}

export function setStatus(id, st) { S.status[id] = st; renderProcesses(); }
export function markStale() {
  for (const k of Object.keys(S.status)) if (S.status[k] && S.status[k] !== 'running') S.status[k] = 'stale';
  renderProcesses();
}

// ------------------------------------------------------------------ check syntax / elaboration
// The modules named with a reserved word of VHDL or Verilog (a project made before #679, or imported): a
// warning each, the drawing first (the HDL generated from it follows its name)
export function reservedNameDiags() {
  const drawn = Object.entries(S.viewTexts || {}).map(([file, t]) => { try { return { name: JSON.parse(t).name, file }; } catch { return null; } });
  return reservedModuleDiags([...drawn.filter(m => m?.name), ...S.modules.map(m => ({ name: m.name, file: m.file, line: m.line }))]);
}

export function diagsFor(lib, design, extra = []) {
  const all = [...lib.errors, ...(design ? design.diags : []), ...extra];
  const seen = new Set();
  return all.filter(d => { const k = `${d.file}:${d.line}:${d.message}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(d => ({ ...d, tool: d.tool || 'HDLCompiler' }));
}

export async function saveAll() {
  for (const d of S.docs) await flushDoc(d);
}

export async function checkSyntax(mod, sim = false) {
  const id = sim ? 'sim-check' : 'check';
  try { return await checkSyntaxInner(mod, sim, id); }
  catch (e) { setStatus(id, 'err'); log(`ERROR: ${e.message}`, 'err'); return false; }
}
async function checkSyntaxInner(mod, sim, id) {
  await saveAll();
  setStatus(id, 'running');
  log(`\nStarted : "${sim ? 'Behavioral Check Syntax' : 'Check Syntax'}".\n`, 'hdr');
  const srcs = S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, sim));
  for (const s of srcs) log(`${s.lang === 'vhdl' ? 'Parsing VHDL' : 'Analyzing Verilog'} file "${s.path}" into library work`);
  const lib = compile(withPrimitives(srcs));
  const design = elaborate(lib, mod);
  // (an HDL file its drawing could not generate again, #303: an error of the file, the drawing's errors in it)
  const stale = srcs.filter(s => S.staleHdl?.[s.path]).map(s => {
    const { from, why } = S.staleHdl[s.path];
    return { severity: 'error', file: s.path, line: 1, col: 1, tool: 'Silinx', message: `${s.path} is not up to date: ${from} cannot generate it, ${why}. Fix ${from} (its HDL is then generated again).` };
  });
  // (+ the modules named with a reserved word, #679)
  const diags = diagsFor(lib, design, [...designDiags(lib, design), ...stale, ...reservedNameDiags()]);   // + design checks (core/lint.js)
  setDiagnostics(diags);
  const ne = diags.filter(d => d.severity === 'error').length, nw = diags.length - ne;
  for (const d of diags) log(`${sevWord(d)}:${d.tool || 'HDLCompiler'} - "${d.file}" Line ${d.line}: ${d.message}`, d.severity === 'error' ? 'err' : 'warn', { diag: false });
  if (ne) { log(`\nProcess "Check Syntax" failed (${ne} error(s), ${nw} warning(s))`, 'err', { diag: false }); setStatus(id, 'err'); showConsolePage('errors'); return false; }
  log(`Elaborating top module <${mod}>: ${design.signals.length} signals, ${design.procs.length} processes.`);
  log(`\nProcess "Check Syntax" completed successfully${nw ? ` with ${nw} warning(s)` : ''}`, 'ok');
  setStatus(id, nw ? 'warn' : 'ok');
  return true;
}

// Check Syntax of one HDL file (editor toolbar / right-click): parses the project, elaborates every
// module the file defines and reports the diagnostics.
// Diagnostics of one HDL file in the context of the project (text: the editor's current text).
export function hdlDiagnostics(path, text, info = []) {
  const fi = S.project.files.find(f => f.path === path);
  const sim = fi?.role === 'sim';
  const srcs = S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && (inView(s.role, sim) || s.path === path))
    .map(s => (s.path === path && text != null ? { ...s, text } : s));
  const lib = compile(withPrimitives(srcs));
  const units = (lib.parsed.find(p => p.file === path)?.units || []).filter(u => u.kind === 'module');
  // (+ its modules named with a reserved word, #679)
  let diags = [...lib.errors, ...reservedModuleDiags(units.map(u => ({ name: u.name, file: path, line: u.loc?.line })))];
  for (const u of units) {
    let design;
    try { design = elaborate(lib, u.name); } catch (e) { diags.push({ file: path, line: u.loc?.line || 1, col: 1, severity: 'error', message: e.message }); continue; }
    diags.push(...design.diags, ...designDiags(lib, design));
    if (design.top) info.push(`Elaborating module <${u.name}>: ${design.signals.length} signals, ${design.procs.length} processes.`);
  }
  return diagsFor({ errors: diags }, null);
}

export async function checkFileSyntax(path) {
  await saveAll();
  log(`\nStarted : "Check Syntax" of ${path}.\n`, 'hdr');
  log(`${/\.vhdl?$/i.test(path) ? 'Parsing VHDL' : 'Analyzing Verilog'} file "${path}" into library work`);
  const info = [];
  const diags = hdlDiagnostics(path, null, info);
  for (const l of info) log(l);
  setDiagnostics(diags);
  const ne = diags.filter(d => d.severity === 'error').length, nw = diags.length - ne;
  for (const d of diags) log(`${sevWord(d)}:${d.tool || 'HDLCompiler'} - "${d.file}" Line ${d.line}: ${d.message}`, d.severity === 'error' ? 'err' : 'warn', { diag: false });
  if (ne) { log(`\nProcess "Check Syntax" failed (${ne} error(s), ${nw} warning(s))`, 'err', { diag: false }); showConsolePage('errors'); status(`Check Syntax: ${ne} error(s)`); return false; }
  log(`\nProcess "Check Syntax" completed successfully${nw ? ` with ${nw} warning(s)` : ''}`, 'ok');
  status(`Check Syntax: ${path.split('/').pop()} OK${nw ? ` (${nw} warning(s))` : ''}`);
  return true;
}

// ------------------------------------------------------------------ process status persistence
// The implementation process marks (synth / translate / map / par / impl / bitgen) are saved in
// build/silinx-status.json with a fingerprint of the sources + constraints, and restored when the
// project is opened (marked out of date if the sources changed since). Older builds without that
// file get their marks from ISE's reports and output files.
export const IMPL_IDS = ['synth', 'translate', 'map', 'par', 'impl', 'bitgen', 'postsynth', 'posttrans', 'postmap', 'postpar', 'pin2ucf', 'xpwr', 'trce', 'fpgaview'];
// optional steps of the ISE flow: process label (ISE names) and what they produce
export const EXTRA_STEPS = {
  postsynth: 'Generate Post-Synthesis Simulation Model', posttrans: 'Generate Post-Translate Simulation Model',
  postmap: 'Generate Post-Map Simulation Model', postpar: 'Generate Post-Place & Route Simulation Model',
  pin2ucf: 'Back-annotate Pin Locations', xpwr: 'Generate Text Power Report', trce: 'Generate Post-Place & Route Static Timing',
  fpgaview: 'View Implemented Design (FPGA)',
};
export const SIM_MODEL_NAMES = { postsynth: 'Post-Synthesis', posttrans: 'Post-Translate', postmap: 'Post-Map', postpar: 'Post-Place & Route' };
const STATUS_FILE = 'build/silinx-status.json';

function sourcesFingerprint() {
  const parts = S.sources.filter(f => f.role !== 'sim').map(f => `${f.path}\n${f.text}`).sort();
  parts.push(`ucf\n${S.project.constraints}\n${S.ucfText ?? ''}`, `top\n${S.project.top}`, `dev\n${JSON.stringify(S.project.device)}`);
  let h = 2166136261;                                    // FNV-1a, enough to detect changes
  for (const c of parts.join('\0')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

// the synthesis's own inputs (#280): the design sources (not the test benches, not the constraints), the
// top, the device, the synthesis tool and its effort (#282); the run that synthesized them ok is kept
// (S.synthDone: { fingerprint, status }), so that Implement Design with the Silinx toolchain starts at
// Translate while they are the same
export function synthFingerprint(sources) {
  const ucf = S.project.constraints;
  const parts = sources.filter(f => f.role !== 'sim' && f.path !== ucf && !/\.ucf$/i.test(f.path)).map(f => `${f.path}\n${f.text}`).sort();
  parts.push(`top\n${S.project.top}`, `dev\n${JSON.stringify(S.project.device)}`, `tool\n${S.project.synthTool || ''}\n${openMode()}`, `effort\n${S.project.impl?.optLevel ?? ''}`);
  let h = 2166136261;
  for (const c of parts.join('\0')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

export async function loadUcfText() {
  let text = null;
  if (S.project?.constraints && S.fileTree?.includes(S.project.constraints)) {
    try { text = await api.readFile(S.project.name, S.project.constraints); } catch { /* none */ }
  }
  S.ucfText = text;
  return text;
}

export async function saveImplStatus() {
  try {
    await loadUcfText();
    const status = Object.fromEntries(IMPL_IDS.filter(id => S.status[id] && S.status[id] !== 'running').map(id => [id, S.status[id]]));
    await api.writeFile(S.project.name, STATUS_FILE, JSON.stringify({ top: S.project.top, fingerprint: sourcesFingerprint(), time: new Date().toISOString(), status, ...(S.synthDone && { synth: S.synthDone }) }, null, 2));
  } catch { /* best effort */ }
}

export async function restoreImplStatus() {
  S.synthDone = null;
  await loadUcfText();
  if (!S.project?.top) return;
  let saved = null;
  try { saved = JSON.parse(await api.readFile(S.project.name, STATUS_FILE)); } catch { /* none */ }
  await loadUcfText();
  let status = {};
  S.synthDone = saved?.top === S.project.top && saved.synth?.fingerprint ? saved.synth : null;
  if (saved && saved.top === S.project.top) status = saved.status || {};
  else {
    // derive from ISE's reports (builds made before status saving, or by run.sh elsewhere)
    let rep = null;
    try { rep = await api.reports(S.project.name); } catch { /* none */ }
    const sum = rep?.summary;
    if (!sum || rep.top !== S.project.top) return;
    const w = (n) => (n ? 'warn' : 'ok');
    const mapWarn = (rep.map?.utilization || []).find(u => /warnings/i.test(u.name))?.used;
    if (sum.synthesized) status.synth = w(rep.synthesis?.warnings);
    if (sum.mapped) { status.translate = 'ok'; status.map = w(mapWarn); }
    if (sum.routed) { status.par = sum.timingMet === false ? 'warn' : 'ok'; status.impl = worst(status.translate, status.map, status.par); }
    if (sum.bitstream) status.bitgen = 'ok';
  }
  const fresh = !saved || saved.fingerprint === sourcesFingerprint();
  for (const id of IMPL_IDS) if (status[id]) S.status[id] = fresh || status[id] === 'err' ? status[id] : 'stale';
  if (!fresh) log('Sources changed since the last implementation run: processes marked out of date.', 'info');
  renderProcesses();
}
