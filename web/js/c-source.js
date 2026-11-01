// Silinx HLS in the app (#1531): a C source is a module of the project whose HDL is made in memory from its top function
// (core/view-hdl.js); its Design row has the C as its base and its HDL, generated from it, shown read-only here.
import { h } from './dom.js';
import { S, findDoc, closeDoc, openDoc, openFile } from './app.js';
import { createEditor } from './editor.js';
import { icons } from './icons.js';
import { log, showConsolePage } from './console.js';
import { showCommandLines } from './messages.js';
import { periodNs, deviceFamily, resourceCount } from '/packages/silinx-fpga/src/parts.js';
import { familyOf } from '/core/c-timing.js';

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
      const bar = h('div', { class: 'editor-bar' }, h('span', { class: 'path' }, name), h('span', { class: 'gen-banner read-only' }, 'Read-only, generated from ', link));
      const host = h('div', { class: 'editor-host' });
      el.append(bar, host);
      d.editor = createEditor(host, { text: src?.text || '', lang, path: name, readOnly: true });
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
      const bar = h('div', { class: 'editor-bar' }, h('span', { class: 'path' }, name), h('span', { class: 'gen-banner read-only' }, 'Read-only, the state machine made from ', link));
      const host = h('div', { class: 'doc-body' });
      el.append(bar, host);
      d.asmEditor = mountAsmEditor(host, { model: r.model, readOnly: true });
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
 *  20 ns (50 MHz). */
export function hlsClock() {
  const b = S.devices?.boards?.find((x) => x.id === S.project?.board);
  const r = b?.resources?.find((x) => x.group === 'Clock' && x.extra?.period);
  return (r && periodNs(r.extra.period)) || 20;
}

/** The delays Silinx HLS schedules with (#2080): those of the project's device family (core/c-timing.js), else the
 *  Artix-7's. */
export function hlsFamily() {
  return familyOf(S.project?.device ? deviceFamily(S.project.device) : null);
}

/** The multiplier blocks a cycle may take (#2125): the project's device's, else no limit. */
export function hlsMults() {
  const part = S.project?.device?.part;
  if (!part) return null;
  try { return resourceCount(part, deviceFamily(S.project.device) === 'spartan6' ? 'dsp48a1' : 'mult18x18') || null; } catch { return null; }
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
  const rep = r.report;
  const L = [`C Synthesis Report of '${r.top}' (${path}, ${lang === 'vhdl' ? 'VHDL' : 'Verilog'})`, ''];
  // (ap_ctrl_none: no ap_start / ap_done / ap_idle / ap_ready, #1900)
  const ctrl = r.ports.some((p) => p.name === 'ap_continue') ? 'ap_ctrl_chain (ap_clk, ap_rst, ap_start / ap_done / ap_continue / ap_idle / ap_ready)' : r.ports.some((p) => p.name === 'ap_start') ? 'ap_ctrl_hs (ap_clk, ap_rst, ap_start / ap_done / ap_idle / ap_ready)' : 'ap_ctrl_none (ap_clk, ap_rst: running by itself)';
  if (rep.dataflow) L.push(`Module: DATAFLOW, ${ctrl}, ${rep.processes.length} processes running at once`);
  else L.push(rep.sequential ? `Module: sequential, ${ctrl}, ${rep.states} states, ${rep.registerBits} register bits` : r.ports.some((p) => p.name === 'ap_continue') ? `Module: combinational, ${ctrl}` : 'Module: combinational');
  // (the clock it was scheduled for: the board's, #1924)
  L.push(`Target clock: ${clock} ns (the board's oscillator)`);
  for (const b of r.blackboxes || []) L.push(`RTL blackbox: ${b.name} is the module ${b.module} (${b.rtl.map((f) => f.path.split('/').pop()).join(', ')})`);
  L.push('', 'Ports:');
  for (const p of r.ports) L.push(`  ${p.name.padEnd(16)} ${p.dir === 'in' ? 'in ' : 'out'} ${String(p.w).padStart(3)} bit${p.w > 1 ? 's' : ''}`);
  const cycles = (x) => (x.max === null ? `at least ${x.min} cycles` : x.min === x.max ? `${x.max} cycles` : `${x.min}-${x.max} cycles`);
  // (DATAFLOW, #1707: each process a module, the FIFOs between them)
  if (rep.dataflow) {
    L.push('', 'Processes:');
    // (the region's latency and interval, each process's, #1706)
    L[L.length - 1] = `Processes (the region's latency: ${cycles(rep.latency)}; its interval: ${cycles(rep.interval)}):`;
    for (const p of rep.processes) L.push(`  ${p.instance.padEnd(16)} ${p.name}: ${p.states} states, ${p.registerBits} register bits${p.latency ? `, latency ${cycles(p.latency)}` : ''}${p.after.length ? `; starts once ${p.after.join(', ')} ${p.after.length > 1 ? 'are' : 'is'} done` : ''}`);
    if (rep.fifos.length) { L.push('', 'FIFOs:'); for (const f of rep.fifos) L.push(`  ${f.name.padEnd(16)} ${f.depth} words`); }
  }
  // (a function not inlined, a sub-module: its calls, its latency and resources, #1960)
  if (rep.functions?.length) {
    L.push('', `Functions (the module's latency: ${cycles(rep.latency)}):`);
    for (const f of rep.functions) L.push(`  ${f.instance.padEnd(16)} ${f.name}${f.of ? `, in ${f.of}` : ''}: ${f.calls} call${f.calls > 1 ? 's' : ''}; ${f.sequential ? `latency ${cycles(f.latency)}, ${f.states} states, ${f.registerBits} register bits${f.memories ? `, ${f.memories} memor${f.memories > 1 ? 'ies' : 'y'}` : ''}` : 'combinational'}`);
  }
  if (rep.memories?.length) { L.push('', 'Memories:'); for (const m of rep.memories) L.push(`  ${m.name.padEnd(16)} ${m.words} x ${m.bits} bits, ${m.kind === 'ap_memory' ? 'ap_memory (outside the module)' : m.kind === 'ROM' ? 'a ROM (block RAM)' : m.kind === 'RAM (PIPO)' ? 'a buffer between processes (block RAM)' : 'a RAM (block RAM)'}`); }
  if (rep.loops?.length) {
    L.push('', 'Loops:');
    for (const l of rep.loops) {
      const made = [l.unroll === 'whole' ? 'unrolled' : l.unroll ? `unrolled by ${l.unroll}` : null, l.pipeline ? (l.auto ? 'pipelined automatically, as Vitis HLS does' : `pipelined, II=${l.pipeline} asked`) : null].filter(Boolean).join(', ');
      const count = l.trip !== null ? `${l.trip} iterations` : l.max !== null ? `up to ${l.max} iterations` : 'iterations unknown';
      L.push(`  ${l.name ? `${l.name} (line ${l.line})` : `line ${String(l.line).padEnd(4)}`} ${count}; ${l.unroll === 'whole' ? 'in the state it is in' : `II=${l.ii}`}${l.cycles !== null ? `, ${l.cycles} cycles` : ''}${made ? `; ${made}` : ''}`);
    }
  }
  if (rep.units?.length) {
    // (the multiplications of different states bound to one unit, #2125)
    L.push('', `Multipliers: ${rep.units.length} unit${rep.units.length > 1 ? 's' : ''}, ${rep.blocks} multiplier block${rep.blocks > 1 ? 's' : ''}`);
    for (const [k, u] of rep.units.entries()) L.push(`  mul_${k}`.padEnd(18) + `${u.a} x ${u.b} bits, ${u.blocks} block${u.blocks > 1 ? 's' : ''}; ${u.uses} use${u.uses > 1 ? 's' : ''}, ${u.inputs} input${u.inputs > 1 ? 's' : ''} multiplexed`);
  }
  for (const l of L) log(l);
  if (rep.unitsNs > clock) log(`WARNING:SilinxC - "${path}": the multipliers' multiplexers make a path of about ${rep.unitsNs.toFixed(1)} ns, over the ${clock} ns clock (Silinx adds no registers on them): a slower clock makes it fit`, 'warn');
  // (a pipelined loop too slow for the clock: its II kept, no pipeline stages, #2080)
  for (const l of rep.slowLoops || []) log(`WARNING:SilinxC - "${path}" line ${l.line}: this pipelined loop's iteration does not fit the ${clock} ns clock: a path of about ${l.ns.toFixed(1)} ns in one cycle (Silinx adds no pipeline stages); a slower clock, or #pragma HLS PIPELINE off, makes it fit`, 'warn');
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
