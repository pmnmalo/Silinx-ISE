// Silinx HLS in the app (#1531): a C source is a module of the project whose HDL is made in memory from its top function
// (core/view-hdl.js); its Design row has the C as its base and its HDL, generated from it, shown read-only here.
import { h } from './dom.js';
import { S, findDoc, closeDoc, openDoc, openFile } from './app.js';
import { createEditor } from './editor.js';
import { icons } from './icons.js';
import { log, showConsolePage } from './console.js';
import { showCommandLines } from './messages.js';
import { cReportLines, hlsClockOf, hlsFamilyOf, hlsMultsOf } from '/core/c-report.js';
import { blackboxModels } from '/core/c-blackbox.js';

export const isC = (p) => /\.(c|cpp|cc|cxx)$/i.test(p || '');
// (its badge: C or C++, #1590)
export const cBadge = (p) => (/\.c$/i.test(p || '') ? 'C' : 'C++');

/** The HDL made from a C source, read-only, in a document of its own (made again when it is opened again). */
export async function openCHdl(path) {
  const src = S.sources.find((s) => s.view && s.path === path);
  const id = `chdl:${path}`;
  const old = findDoc(id);
  if (old) await closeDoc(old);
  const lang = src?.lang === 'verilog' ? 'verilog' : 'vhdl';
  const name = `${src?.module || path.split('/').pop().replace(/\.(c|cpp|cc|cxx)$/i, '')}.${lang === 'verilog' ? 'v' : 'vhd'}`;
  return openDoc({
    id, title: name, tooltip: `${name}, generated from ${path}`, icon: lang,
    create(el, d) {
      const link = h('a', { onclick: () => openFile(path) }, path.split('/').pop());
      const bar = h('div', { class: 'editor-bar' }, h('span', { class: 'gen-banner read-only' }, 'Read-only, generated from ', link));   // (no name: the tab's, #2710)
      const host = h('div', { class: 'editor-host' });
      el.append(bar, host);
      d.editor = createEditor(host, { text: src?.text || '', lang, path: name, readOnly: true });
      el.append(d.editor.status);   // (its status line, #2763)
      // (the C saved: its HDL made again, shown here, e.g. beside the C, #1619)
      const follow = () => { const t = S.sources.find((s) => s.view && s.path === path)?.text; if (t != null && t !== d.editor.getValue()) d.editor.setValue(t); };
      addEventListener('silinx:design-changed', follow);
      return { lang, destroy: () => { removeEventListener('silinx:design-changed', follow); d.editor.destroy(); } };
    },
  });
}

/** Whether a C source's module is sequential (a state machine: its ASM chart, #1575). */
export const cSequential = (path) => !!S.sources.find((s) => s.view && s.path === path)?.sequential;

/** A sequential C module's machine as an ASM chart (core/c-asm.js), read-only, in a document of its own (#1575). */
export async function openCAsm(path) {
  const id = `casm:${path}`;
  const old = findDoc(id);
  if (old) await closeDoc(old);
  const { cAsm } = await import('/core/c-asm.js');
  const r = cAsm(await text(path), { file: path, lang: hdlLang(), clock: hlsClock(), family: hlsFamily(), mults: hlsMults(), ...(S.hls || {}) });
  if (!r.ok) { log(`ERROR:SilinxC - "${path}" ${r.diagnostics.filter((d) => d.severity === 'error').map((d) => `line ${d.line}: ${d.message}`).join('; ')}`, 'err'); return null; }
  const { mountAsmEditor } = await import('./asm-editor.js');
  const name = `${r.model.name}.asm`;
  return openDoc({
    id, title: name, tooltip: `${name}, the state machine made from ${path}`, icon: 'asm',
    create(el, d) {
      const link = h('a', { onclick: () => openFile(path) }, path.split('/').pop());
      // (its notice at the right end of the chart's toolbar, no bar of its own: the name is the tab's, #2710)
      const banner = h('span', { class: 'gen-banner read-only' }, 'Read-only, the state machine made from ', link);
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      d.asmEditor = mountAsmEditor(host, { model: r.model, readOnly: true, banner });
      return { destroy: () => d.asmEditor.destroy?.() };
    },
  });
}

/** A C module's badges on its Design row: the C (its base, opened), a sequential one's ASM chart, its HDL (generated from
 *  it, read-only). */
export function cBadges(file, lang, context) {
  return [
    { text: cBadge(file), base: true, title: 'Open', open: () => openFile(file), context },
    ...(cSequential(file) ? [{ text: 'ASM', base: false, title: 'The state machine made from the C (read-only)', open: () => openCAsm(file), context }] : []),
    { text: lang === 'verilog' ? 'Verilog' : 'VHDL', base: false, title: 'Generated from the C', open: () => openCHdl(file), context },
  ];
}

/** The C sources whose HDL cannot be made (#2995: a C error, a blackbox refused): S.cFailed[path] = { module, diagnostics }
 *  (failed: [[path, viewHdl's result]] of compileProject), each said in the Console once for its errors; their Design rows
 *  marked (web/js/design.js), their errors Check Syntax's. A blackbox's C model is not a module (#2854): not one. */
export function noteFailedC(failed) {
  const models = blackboxModels(S.hls);
  S.cFailed = {};
  for (const [f, r] of failed) if (r?.errors?.length && !models.has(f)) S.cFailed[f] = { module: r.module || null, diagnostics: r.diagnostics || [] };
  const said = (S.cFailedSaid ||= new Map());
  for (const f of [...said.keys()]) if (!S.cFailed[f]) said.delete(f);
  for (const [f, c] of Object.entries(S.cFailed)) {
    const key = c.diagnostics.map((d) => `${d.file}:${d.line}:${d.message}`).join('\n');
    if (said.get(f) === key) continue;
    said.set(f, key);
    log(`The HDL of ${f} cannot be made${c.module ? ` (its module ${c.module} is not in the design)` : ''}:`, 'err', { diag: false });
    for (const d of c.diagnostics) log(`ERROR:SilinxC - "${d.file}" Line ${d.line}: ${d.message}`, 'err', { diag: false });   // (the Errors tab: Check Syntax's)
  }
}
/** The errors of the C sources whose HDL cannot be made, as Check Syntax's diagnostics. */
export const failedCDiags = () => Object.values(S.cFailed || {}).flatMap((c) => c.diagnostics.map((d) => ({ ...d, tool: 'SilinxC' })));

// ------------------------------------------------------------------ C simulation and C/RTL co-simulation (#1528)
const text = async (path) => { const d = findDoc(`file:${path}`); if (d?.editor) return d.editor.getValue(); return (await import('./api.js')).api.readFile(S.project.name, path); };
const hdlLang = () => (S.project?.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
/** The test bench's files (#1897): the project's files its strings name (core/c-interp-lib.js), read from the project
 *  only, the C simulation's in-memory files (in the browser edition too). */
async function tbFiles(src) {
  const { testBenchFiles } = await import('/core/c-interp-lib.js');
  const paths = testBenchFiles(src, S.diskTree || S.fileTree || []);
  return Object.fromEntries(await Promise.all(paths.map(async (p) => [p, await text(p)])));
}

/** C Simulation: the C source's main() run (core/c-interp.js), its output in the Console. */
export async function runCSimulation(path) {
  const { simulateC } = await import('/core/c-interp.js');
  log(`\nStarted : "C Simulation" of ${path}.\n`, 'hdr');
  showConsolePage('console');
  showCommandLines('sim');   // (in the Edit task too, #2262)
  const src = await text(path);
  const r = simulateC(src, { file: path, files: await tbFiles(src), ...(S.hls || {}) });
  if (r.output) for (const l of r.output.replace(/\n$/, '').split('\n')) log(l);
  // (the files it wrote: in memory, the project's left as they are)
  const wrote = Object.keys(r.files || {});
  if (wrote.length) log(`${wrote.length} file(s) written by the test bench, in memory (not saved to the project): ${wrote.slice(0, 5).join(', ')}${wrote.length > 5 ? ', …' : ''}`);
  if (!r.ok) {
    const why = r.error ? `line ${r.error.line}: ${r.error.message}` : r.diagnostics.filter((d) => d.severity === 'error').map((d) => `line ${d.line}: ${d.message}`).join('; ');
    log(`ERROR:SilinxC - "${path}" ${why}`, 'err');
    log('\nProcess "C Simulation" failed', 'err', { diag: false });
    return false;
  }
  log(`main() returned ${r.exitCode}; ${r.calls.length} call(s) of '${r.top || '?'}'.`);
  log('\nProcess "C Simulation" completed successfully', 'ok');
  return true;
}

/** C/RTL Co-simulation: the test bench's calls of the top function replayed on its HDL (core/c-cosim.js), compared. */
export async function runCosimulation(path) {
  const { cosimulate } = await import('/core/c-cosim.js');
  const lang = hdlLang();
  log(`\nStarted : "C/RTL Co-simulation" of ${path} (${lang === 'vhdl' ? 'VHDL' : 'Verilog'}).\n`, 'hdr');
  showConsolePage('console');
  showCommandLines('sim');
  const src = await text(path);
  const r = cosimulate(src, { file: path, lang, files: await tbFiles(src), clock: hlsClock(), family: hlsFamily(), mults: hlsMults(), ...(S.hls || {}) });
  for (const e of r.errors) log(`ERROR:SilinxC - "${path}" ${e}`, 'err');
  if (!r.ok || r.errors.length) { log('\nProcess "C/RTL Co-simulation" failed', 'err', { diag: false }); return false; }
  log(`C simulation: ${r.calls} call(s) of '${r.gen.top}' replayed on its ${lang === 'vhdl' ? 'VHDL' : 'Verilog'}.`);
  if (r.latency) log(`Latency: ${r.latency.min} to ${r.latency.max} cycles (average ${r.latency.avg.toFixed(1)}).`);
  for (const m of r.mismatches.slice(0, 20)) log(`ERROR:SilinxC - call ${m.call ?? '-'}, ${m.port}: the C gives ${m.expected}, the HDL ${m.got ?? 'X'}`, 'err');
  if (r.mismatches.length > 20) log(`… ${r.mismatches.length - 20} more mismatch(es)`, 'err');
  if (!r.pass) { log(`\nC/RTL co-simulation FAIL: ${r.mismatches.length} mismatch(es)`, 'err'); log('\nProcess "C/RTL Co-simulation" failed', 'err', { diag: false }); return false; }
  log(`\nC/RTL co-simulation PASS: ${r.calls} call(s), the same results`, 'ok');
  log('\nProcess "C/RTL Co-simulation" completed successfully', 'ok');
  return true;
}

/** The clock Silinx HLS schedules a C function for (#1924): the period, in ns, of the project's board's oscillator, else
 *  20 ns (50 MHz). (core/c-report.js, #2674) */
export function hlsClock() {
  return hlsClockOf(S.devices?.boards?.find((x) => x.id === S.project?.board));
}

/** The delays Silinx HLS schedules with (#2080): those of the project's device family (core/c-timing.js), else the
 *  Artix-7's. */
export function hlsFamily() {
  return hlsFamilyOf(S.project?.device);
}

/** The multiplier blocks a cycle may take (#2125): the project's device's, else no limit. */
export function hlsMults() {
  const d = S.project?.device;
  return hlsMultsOf(d, d && S.devices?.parts?.find((p) => p.part === d.part));
}

/** View C Synthesis Report (#1531): what the C was made into (core/c-hdl.js's report): the module, its ports, its
 *  states and registers, its memories, each loop's pragmas, II and cycles. */
export async function runCReport(path) {
  const { cToHdl } = await import('/core/c-hdl.js');
  const lang = hdlLang();
  log(`\nStarted : "View C Synthesis Report" of ${path}.\n`, 'hdr');
  showConsolePage('console');
  showCommandLines('impl');
  const clock = hlsClock();
  const r = cToHdl(await text(path), { file: path, lang, clock, family: hlsFamily(), mults: hlsMults(), ...(S.hls || {}) });
  for (const d of r.diagnostics) log(`${d.severity === 'error' ? 'ERROR' : 'WARNING'}:SilinxC - "${path}" line ${d.line}: ${d.message}`, d.severity === 'error' ? 'err' : 'warn');
  if (!r.ok) { log('\nProcess "View C Synthesis Report" failed', 'err', { diag: false }); return false; }
  // (its lines and its warnings: core/c-report.js, #2674)
  const { lines, warnings } = cReportLines(r, { path, lang, clock });
  for (const l of lines) log(l);
  for (const w of warnings) log(w, 'warn');
  log('\nProcess "View C Synthesis Report" completed successfully', 'ok');
  return true;
}

/** The processes of a C module (#1531): the Processes panel's group, in both views. */
export function cProcesses(path) {
  return [{ id: 'c-hls', label: 'C Synthesis (HLS)', ico: 'procGroup', children: [
    { id: 'c-open', label: 'View/Edit C Source', ico: 'template', run: () => openFile(path) },
    { id: 'c-sim', label: 'C Simulation', ico: 'wave', run: () => runCSimulation(path) },
    { id: 'c-cosim', label: 'C/RTL Co-simulation', ico: 'wave', run: () => runCosimulation(path) },
    { id: 'c-report', label: 'View C Synthesis Report', ico: 'summary', run: () => runCReport(path) },
    { id: 'c-hdl', label: 'View Generated HDL', ico: 'process', run: () => openCHdl(path) },
    ...(cSequential(path) ? [{ id: 'c-asm', label: 'View State Machine (ASM)', ico: 'asm', run: () => openCAsm(path) }] : []),
  ] }];
}

/** The C editor's buttons: C Simulation, C/RTL Co-simulation. */
export function cRunButtons(path) {
  const b = (label, title, fn) => h('button', { class: 'btn', style: { minWidth: '0' }, title, onclick: () => fn(path) }, h('span', { class: 'ico-inline', html: icons.wave }), ` ${label}`);
  return [b('C Simulation', "Run the test bench, main()", runCSimulation), b('C/RTL Co-simulation', "Replay main()'s calls of the top function on its HDL and compare", runCosimulation)];
}
