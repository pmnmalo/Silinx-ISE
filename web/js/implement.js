// The implementation processes (#405: out of app.js): ISE's flow run step by step with its live status
// (synthesis to bitstream), Check Constraints and the UCF made from the board, the open synthesis (Yosys in
// the browser), the optional processes (simulation models, timing, power, pin back-annotation) and Stop.
import { constraintsExt, pcfDiagnostics } from './constraints-format.js';
import { api, followJob } from './api.js';
import { h, alertDlg, confirmDlg, toast } from './ui.js';
import { compile, elaborate } from '/core/compile.js';
import { primitiveSources } from '/core/unisim.js';
import { countEvent } from './analytics.js';
import { S, closeDoc, findDoc, moduleInfo, openDoc, openSummary, projectBoard, refreshSummary, setDirty, status } from './app.js';
import { log, logLine, showConsolePage, setDiagnostics } from './console.js';
import { reloadProject } from './project.js';
import { refreshOpenEditor, topUcfPorts, ucfPort } from './drawings.js';
import { EXTRA_STEPS, IMPL_IDS, SIM_MODEL_NAMES, checkSyntax, loadUcfText, openMode, renderProcesses,
  saveAll, saveImplStatus, setStatus, synthFingerprint } from './processes.js';
import { inView, saveProjectJson, setTop } from './design.js';
import { OPEN_SYNTH, SYNTH_OPEN } from './tool-descriptors.js';

// Live per-step status from run.sh's "=== SILINX STEP <step> ===" markers and ISE WARNING/ERROR lines.
const STEP_PROC = { synth: 'synth', translate: 'translate', map: 'map', par: 'par', trce: 'par', bitgen: 'bitgen', prombit: 'bitgen',
  postsynth: 'postsynth', posttrans: 'posttrans', postmap: 'postmap', postpar: 'postpar', pin2ucf: 'pin2ucf', xpwr: 'xpwr', fpgaview: 'fpgaview', fpgadevice: 'fpgaview' };
const RANK = { ok: 0, warn: 1, err: 2 };
export const worst = (...xs) => xs.filter(Boolean).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok');

// ISE writes many warnings only to its report files (XST's .syr, MAP's .mrp): use their counts too.
async function applyReportWarnings(track) {
  let rep = null;
  try { rep = await api.reports(S.project.name); } catch { return; }
  if (!rep || rep.available === false) return;
  const mapWarn = (rep.map?.utilization || []).find(u => /warnings/i.test(u.name))?.used;
  const bump = (id, n) => { if (n > 0 && (S.status[id] === 'ok')) { S.status[id] = 'warn'; track.result[id] = 'warn'; } };
  bump('synth', rep.synthesis?.warnings);
  bump('map', mapWarn);
  if (S.status.impl && S.status.impl !== 'running') S.status.impl = worst(S.status.translate, S.status.map, S.status.par);
  renderProcesses();
}

// (steps: the run's; a warning of the constraints counts in Translate's icon when the run has it,
// else in the first step's: #129)
export function stepTracker(steps) {
  const result = {};              // process id -> ok | warn | err (this run)
  let cur = null, warns = 0;
  const early = {};               // warnings printed before the step they concern has started
  const t = { warnings: 0, failed: false, diags: [], result, get current() { return cur; } };
  const setProc = (id, st) => { result[id] = st === 'running' ? result[id] : worst(result[id], st); S.status[id] = st === 'running' ? 'running' : result[id]; };
  const refreshGroups = () => {
    if (['translate', 'map', 'par'].some(k => result[k] || S.status[k] === 'running')) {
      const done = result.par && S.status.par !== 'running';
      S.status.impl = done || t.failed ? worst(result.translate, result.map, result.par) : 'running';
    }
  };
  const finish = (ok = true) => {
    if (!cur) return;
    const id = STEP_PROC[cur];
    setProc(id, ok ? (warns ? 'warn' : 'ok') : 'err');
    cur = null;
  };
  // (opts: log()'s, e.g. { diag: false } for a line already in the Warnings tab)
  t.line = (line, opts) => {
    logLine(line, opts);
    let m;
    if ((m = /^=== SILINX STEP (\w+) ===/.exec(line))) {
      finish();
      cur = m[1]; warns = early[cur] || 0;
      if (cur === 'synth' && early['*']) warns += early['*'];
      if (STEP_PROC[cur]) setProc(STEP_PROC[cur], 'running');
    } else if ((m = /^=== SILINX FAILED (\w+)/.exec(line))) {
      cur = cur || m[1];
      t.failed = true;
      finish(false);
    } else if (/^=== SILINX DONE ===/.test(line)) {
      finish();
    } else if (/^\s*(CRITICAL )?WARNING\b/i.test(line)) {
      // any warning line counts (ISE "WARNING:Tool:N - ..." and Silinx "WARNING: ..."); the line
      // itself reaches the Warnings tab through log()
      t.warnings++;
      if (cur) warns++;
      else { const step = /constraints file|\.ucf\b|LOC/i.test(line) && (!steps || steps.includes('translate')) ? 'translate' : '*'; early[step] = (early[step] || 0) + 1; }
    }
    refreshGroups();
    renderProcesses();
  };
  t.end = ok => {
    if (cur) finish(ok);
    refreshGroups();
    renderProcesses();
  };
  return t;
}

// Catch board/device/UCF mismatches before spending minutes in ISE.
// ---- UCF check (nets that do not exist, bus bits, duplicate pins, I/O standards, syntax…)
export async function ucfDiagnostics(text, file) {
  const { checkUcf } = await import('/packages/silinx-fpga/src/parts.js');
  const pj = S.project;
  let ports = [], lang = 'vhdl';
  if (pj.top && S.lib) {
    try {
      const design = elaborate(S.lib, pj.top);
      if (design.top) ports = design.top.ports.map(ucfPort);
      lang = moduleInfo(pj.top)?.lang || 'vhdl';
    } catch { /* no port data */ }
  }
  if (/\.pcf$/i.test(file)) return pcfDiagnostics(text, ports).map(d => ({ ...d, file, tool: 'ConstraintSystem' }));
  const db = S.devices;
  const famId = db?.parts?.find(x => x.part === pj.device?.part)?.family || pj.device?.family;
  const iostandards = db?.families?.find(f => f.id === famId)?.ioStandards || null;
  return checkUcf(text, { top: pj.top, ports, lang, iostandards, board: projectBoard(pj), package: pj.device?.package })
    .map(d => ({ ...d, file, tool: 'ConstraintSystem' }));
}

// (warnings: in quiet mode, an array that gets the warning lines instead of the console when there is
// no error: the process that checks the constraints before it runs prints them as its own, counted
// in its "completed successfully with N warning(s)" (#129); their entries are added to the Warnings
// tab's, Check Syntax's kept)
export async function checkUcfFile(path = S.project?.constraints, { quiet = false, warnings = null } = {}) {
  if (!path) return true;
  await saveAll();
  let text;
  try { text = await api.readFile(S.project.name, path); } catch { return true; }
  const diags = await ucfDiagnostics(text, path);
  const ne = diags.filter(d => d.severity === 'error').length, nw = diags.length - ne;
  if (quiet && !diags.length) return true;
  const line = d => `${d.severity === 'error' ? 'ERROR' : 'WARNING'}:ConstraintSystem - "${d.file}" Line ${d.line}: ${d.message}`;
  if (quiet && warnings && !ne) {
    setDiagnostics([...S.diags.filter(d => d.source !== 'console' && d.tool !== 'ConstraintSystem'), ...diags]);
    warnings.push(...diags.map(line));
    return true;
  }
  setDiagnostics(diags);
  if (!quiet) log(`\nStarted : "Check Constraints" of ${path}.\n`, 'hdr');
  for (const d of diags) log(line(d), d.severity === 'error' ? 'err' : 'warn', { diag: false });
  if (ne) { log(`\nProcess "Check Constraints" failed (${ne} error(s), ${nw} warning(s))`, 'err', { diag: false }); showConsolePage('errors'); status(`${path.split('/').pop()}: ${ne} error(s)`); return false; }
  if (!quiet) log(`\nProcess "Check Constraints" completed successfully${nw ? ` with ${nw} warning(s)` : ''}`, 'ok');
  status(`Check Constraints: ${path.split('/').pop()} OK${nw ? ` (${nw} warning(s))` : ''}`);
  return true;
}

// (warnings: gets the constraints' warning lines, for the process to print: checkUcfFile)
async function checkConstraints(warnings = null) {
  const pj = S.project;
  const board = projectBoard(pj);
  if (pj.constraints && S.fileTree.includes(pj.constraints) && !await checkUcfFile(pj.constraints, { quiet: true, warnings })) {
    log(`ERROR: fix the errors in ${pj.constraints} before implementing (see the Errors tab).`, 'err');
    return false;
  }
  if (!board) return true;
  const devStr = d => `${d.part}${d.speed}-${d.package}`;
  if (board.device.part !== pj.device.part || board.device.package !== pj.device.package) {
    log(`ERROR: the project device ${devStr(pj.device)} does not match the board ${board.name} (${devStr(board.device)}). Fix it in Project > Design Properties.`, 'err');
    showConsolePage('console');
    return false;
  }
  if (!pj.constraints || !S.fileTree.includes(pj.constraints)) return true;
  const { parseUcf, locsNotOnBoard } = await import('/packages/silinx-fpga/src/parts.js');
  let bad = [];
  try { bad = locsNotOnBoard(parseUcf(await api.readFile(pj.name, pj.constraints), { ports: topUcfPorts() }).assignments, board); } catch { return true; }
  if (!bad.length) return true;
  const list = bad.slice(0, 8).map(b => `${b.net}=${b.loc}`).join(', ') + (bad.length > 8 ? ', …' : '');
  log(`ERROR: ${pj.constraints} uses ${bad.length} pin(s) that are not on the ${board.name}: ${list}`, 'err');
  const fix = await confirmDlg('Constraints do not match the board',
    `${pj.constraints} assigns ${bad.length} pin(s) that do not exist on the ${board.name} (${list}).\n\nRegenerate the constraints from the ${board.name} pin table now? (ports are matched by name: clk, led, sw, btn, seg, an…)`);
  if (!fix) return false;
  return regenerateUcf(board);
}

export async function regenerateUcf(board = projectBoard()) {
  const pj = S.project;
  if (!board || !pj.top) return false;
  const { boardAutoAssign, boardConstraintsText } = await import('/packages/silinx-fpga/src/parts.js');
  const design = elaborate(S.lib, pj.top);
  if (!design.top) return false;
  const ports = design.top.ports.map(ucfPort);
  const { assignments, clocks, matched, unmatched } = boardAutoAssign(ports, board, { byDirection: true });
  const text = boardConstraintsText({ device: board.device, ports, assignments, clocks, header: `UCF for top '${pj.top}' on ${board.name} (${board.device.part}${board.device.speed}-${board.device.package}), generated by Silinx` });
  pj.constraints ||= `constraints/top${constraintsExt(board.device)}`;
  await api.writeFile(pj.name, pj.constraints, text);
  await saveProjectJson();
  await reloadProject(false);
  const d = findDoc(`file:${pj.constraints}`);
  if (d) { d.editor.setValue(text); d.editor.markClean(); setDirty(d, false); }
  log(`${pj.constraints} regenerated for ${board.name}: ${matched.join(', ') || 'no ports matched'}${unmatched.length ? `; NOT assigned (use I/O Pin Planning): ${unmatched.join(', ')}` : ''}`, unmatched.length ? 'warn' : 'ok');
  return unmatched.length === 0;
}
/** The UCF of a new project from an example on another board (the browser edition; the server writes it, #36): made
 *  from the board's pin table when its pins are not on the board (#2430). */
export async function boardUcf() {
  const pj = S.project, board = projectBoard(pj);
  if (!board || !pj.top || !pj.constraints || !S.fileTree.includes(pj.constraints)) return false;
  const { parseUcf, locsNotOnBoard } = await import('/packages/silinx-fpga/src/parts.js');
  let bad = [];
  try { bad = locsNotOnBoard(parseUcf(await api.readFile(pj.name, pj.constraints), { ports: topUcfPorts() }).assignments, board); } catch { return false; }
  return bad.length ? regenerateUcf(board) : false;
}
export async function runImpl(mod, steps, opts = {}) {
  // one ISE run at a time (one build directory): checked and taken before any await
  if (S.busy) { toast('An implementation is already running (use Stop to cancel it)', 'error'); return false; }
  S.busy = true;
  const pjName = S.project.name;
  try { return await runImplInner(mod, steps, opts, pjName); }
  finally { S.busy = false; }
}
async function runImplInner(mod, steps, opts, pjName) {
  let ok = false;
  if (S.project.top !== mod) {
    if (!await confirmDlg('Set Top Module', `'${mod}' is not the top-level module of the implementation.\nSet it as top and continue?`)) return;
    await setTop(mod, false);
  }
  S.diags = S.diags.filter(d => d.source !== 'console');   // new run: drop the previous run's messages
  const extra = [...steps].reverse().find(st => EXTRA_STEPS[st] && st !== 'trce') || (opts.timing ? 'trce' : null);
  const procId = extra || (steps.includes('bitgen') ? 'bitgen' : steps.includes('translate') ? 'impl' : 'synth');
  const procName = EXTRA_STEPS[procId] || { synth: openMode() ? OPEN_SYNTH : 'Synthesize - XST', impl: 'Implement Design', bitgen: 'Generate Programming File' }[procId];
  // Synthesize - XST always starts with Check Syntax (same messages as the Check Syntax process)
  if (!await checkSyntax(mod)) {
    setStatus('synth', 'err');
    log(`Process "${procName}" stopped: Check Syntax found errors (see the Errors tab).`, 'err');
    return;
  }
  // the constraints' warnings: printed as the process's own once it has started, and counted (#129)
  const ucfWarnings = [];
  if (!await checkConstraints(ucfWarnings)) {
    for (const l of ucfWarnings) log(l, 'warn', { diag: false });
    setStatus(steps.includes('translate') ? 'translate' : 'synth', 'err');
    log(`Process "${procName}" stopped: the constraints have errors.`, 'err');
    return;
  }
  // the Silinx toolchain: is the project's device supported (a device description and a bit database)?
  if (openMode()) {
    const st = await api.openStatus(S.project.name).catch(e => ({ available: false, reason: e.message }));
    if (!st.available) {
      setStatus(procId, 'err');
      log(`\nStarted : "${procName}" (Silinx toolchain).\n`, 'hdr');
      for (const l of ucfWarnings) log(l, 'warn', { diag: false });
      log(`ERROR: the Silinx toolchain cannot implement this design: ${st.reason}.`, 'err');
      log(`\nProcess "${procName}" failed`, 'err');
      return;
    }
  }
  // the Silinx toolchain: the synthesis up to date (its inputs those it synthesized ok) is not run again
  // (#280); Synthesize itself, and a run with the Post-Synthesis Simulation Model, still run it
  let synthFp = null, synthUpToDate = false;
  if (openMode() && steps.includes('synth')) {
    try { synthFp = synthFingerprint(await api.sources(S.project.name)); } catch { /* run it */ }
    if (synthFp && steps.includes('translate') && !steps.includes('postsynth') && S.synthDone?.fingerprint === synthFp) {
      steps = steps.filter(st => st !== 'synth');
      synthUpToDate = true;
    }
  }
  // Clear the icons of the processes this run will redo (they get running/ok/warn/err as it goes).
  const runs = new Set([...(steps.includes('synth') ? ['synth'] : []), ...(steps.includes('translate') ? ['translate', 'impl'] : []), ...(steps.includes('map') ? ['map'] : []), ...(steps.includes('par') ? ['par'] : []), ...(steps.includes('bitgen') ? ['bitgen'] : [])]);
  for (const id of runs) S.status[id] = null;
  setStatus(procId, 'running');
  status(`Running ${procId}…`);
  log(`\nStarted : "${procName}".\n`, 'hdr');
  const track = stepTracker(steps);
  for (const l of ucfWarnings) track.line(l, { diag: false });
  try {
    const tc = S.toolchain || await api.toolchain();
    // (the Silinx toolchain runs without ISE: a project whose synthesis is Silinx's, or a family ISE does not implement)
    const ran = openMode() || tc.ise.available;
    if (!ran) {
      log(`Xilinx ISE toolchain not available (${tc.ise.mode} mode): ${tc.ise.reason}`, 'warn');
      log('The build directory and run.sh are still generated so they can be run on a machine with ISE 14.7. Configure it in Toolchain Settings (the gear in the toolbar).', 'info');
    }
    if (synthUpToDate) { S.status.synth = S.synthDone.status; renderProcesses(); }
    const { job } = await api.implement(S.project.name, { steps, generateOnly: !ran, ...(synthUpToDate && { synthUpToDate }) });
    S.currentJob = job;
    S.stopRequested = false;
    renderProcesses();
    const res = await followJob(job, track.line);
    const stopped = S.stopRequested;
    track.end(res.status === 'ok');
    if (stopped) {
      // stopped by the user: the interrupted step and the ones not reached are left unmarked
      for (const id of IMPL_IDS) if (S.status[id] === 'running') S.status[id] = null;
      if (track.current) S.status[STEP_PROC[track.current]] = null;
      for (const [id, st] of Object.entries(track.result)) if (st === 'err') S.status[id] = null;
      renderProcesses();
      log('\nProcess stopped by the user.', 'warn');
      return;
    }
    if (S.project?.name !== pjName) { log(`Implementation of '${pjName}' finished (another project is open now).`, 'info'); return res.status === 'ok'; }
    // the synthesis this run made: kept as up to date when it ended ok (#280)
    if (synthFp && ['ok', 'warn'].includes(track.result.synth)) S.synthDone = { fingerprint: synthFp, status: track.result.synth };
    else if (track.result.synth === 'err') S.synthDone = null;
    if (ran) { await applyReportWarnings(track); await saveImplStatus(); }
    if (res.status === 'ok' && ran) {
      log(`\nProcess "${procName}" completed successfully${track.warnings ? ` with ${track.warnings} warning(s)` : ''}`, 'ok');
      if (extra) setStatus(procId, track.warnings ? 'warn' : 'ok');
      ok = true;
      // the browser edition: the bitstream is downloaded (there is no build folder to find it in)
      if (res.download && steps.includes('bitgen')) {
        const a = h('a', { href: res.download.url, download: res.download.filename });
        document.body.append(a); a.click(); a.remove();
        log(`Bitstream downloaded: ${res.download.filename} (Configure Target Device programs the board with it).`, 'info');
      }
      countEvent(steps.includes('bitgen') ? 'bitstream' : 'implement');
    } else if (res.status === 'ok') {
      setStatus(procId, 'warn');
      log(`\nScripts generated in ${S.project.name}/build (ISE not run).`, 'warn');
    } else {
      if (!track.failed) setStatus(procId, 'err');
      log(`\nProcess failed: ${res.error || 'see log'}`, 'err');
    }
    if (track.failed) showConsolePage('errors');
    refreshSummary();
  } catch (e) {
    setStatus(procId, 'err');
    log(`ERROR: ${e.message}`, 'err');
  } finally {
    // processes that never got to run in this execution must not keep the "running" spinner
    for (const id of IMPL_IDS) if (S.status[id] === 'running') S.status[id] = null;
    S.busy = false;
    S.currentJob = null;
    status('Ready');
    renderProcesses();
  }
  return ok;
}

// ---- optional ISE processes: simulation models, timing, power, pins
// Synthesize - Yosys (open): the open synthesis in the browser, without Xilinx ISE (packages/silinx-fpga/src/synth-open.js):
// Silinx's front end writes the design as one flat module, Yosys compiled to WebAssembly maps it
// onto the cells of the device family in a Web Worker; the netlist goes to build/open/
export { SYNTH_OPEN };
let synthOpenRunning = false;
export async function synthOpen(mod) {
  if (!S.project || !mod) return;
  if (api.standalone) { alertDlg(SYNTH_OPEN, 'In the browser edition, choose Silinx as the synthesis tool (Project > Design Properties): Synthesize then runs Yosys in the browser, and so does Implement Design.'); return; }
  if (synthOpenRunning) return;
  synthOpenRunning = true;
  try {
    if (!await checkSyntax(mod)) {
      setStatus('synth-open', 'err');
      log(`Process "${SYNTH_OPEN}" stopped: Check Syntax found errors (see the Errors tab).`, 'err');
      return;
    }
    S.diags = S.diags.filter(d => d.source !== 'console');
    setStatus('synth-open', 'running');
    log(`\nStarted : "${SYNTH_OPEN}".\n`, 'hdr');
    const family = S.project.device?.family || 'spartan3e';
    const srcs = S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, false));
    const design = elaborate(compile([...primitiveSources(srcs), ...srcs]), mod);
    const [{ synthesizeOpen, synthesisInput }, { synthEffort, synthGoal, synthesizeArea, FAST_SYNTH }] = await Promise.all([import('/core/synth-front.js'), import('/packages/silinx-fpga/src/index.js')]);
    const { yosysBrowser } = await import('./yosys-client.js');
    log(`Writing <${mod}> as one flat module for Yosys; Yosys (WebAssembly) maps it onto the ${family} cells.`);
    const t0 = performance.now();
    let shown = -1;
    const run = Object.assign((args, files, onLine) => yosysBrowser(args, files, onLine, p => { if (p - shown >= 0.1 || p === 1) { shown = p; status(`Loading Yosys… ${Math.round(p * 100)}%`); } }),
      { parallel: yosysBrowser.parallel });
    const goal = synthGoal(S.project.impl), opts = { family, run, onLine: logLine, effort: synthEffort(S.project.impl), ...(goal === 'fast' && FAST_SYNTH) };
    const res = goal === 'area' ? await synthesizeArea(synthesisInput(design), opts) : await synthesizeOpen(design, opts);
    status(`Saving the netlist of ${mod}…`);
    for (const [name, text] of Object.entries(res.files)) await api.writeFile(S.project.name, `build/open/${name}`, text);
    const u = res.util;
    log(`\nDevice utilization (open synthesis, ${family}):`);
    for (const [k, label] of [['luts', 'LUTs'], ['flipFlops', 'Flip-flops'], ['latches', 'Latches'], ['muxes', 'F5-F8 multiplexers'], ['carry', 'Carry logic'],
      ['shiftRegisters', 'Shift registers'], ['distributedRam', 'Distributed RAM'], ['blockRam', 'Block RAMs'], ['multipliers', 'Multipliers'],
      ['clockBuffers', 'Global clock buffers'], ['dcms', 'DCMs'], ['ios', 'I/O buffers']]) if (u[k]) log(`  ${label}: ${u[k]}`);
    log(`  Cells: ${u.cells}`);
    log(`Netlist: build/open/${res.top}.json (and ${res.top}_yosys.v, ${res.top}_stat.txt) in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
    const nw = res.warnings.length;
    log(`\nProcess "${SYNTH_OPEN}" completed successfully${nw ? ` with ${nw} warning(s)` : ''}`, 'ok');
    setStatus('synth-open', nw ? 'warn' : 'ok');
  } catch (e) {
    for (const l of e.lines || []) logLine(l);
    log(`ERROR: ${e.message}`, 'err');
    log(`\nProcess "${SYNTH_OPEN}" failed`, 'err');
    setStatus('synth-open', 'err');
  } finally {
    synthOpenRunning = false;
    status('Ready');
  }
}

export const FLOW_UP_TO = { synth: ['synth'], translate: ['synth', 'translate'], map: ['synth', 'translate', 'map'], par: ['synth', 'translate', 'map', 'par'] };
export async function generateSimModel(mod, step) {
  const stage = { postsynth: 'synth', posttrans: 'translate', postmap: 'map', postpar: 'par' }[step];
  if (!await runImpl(mod, [...FLOW_UP_TO[stage], step])) return false;
  const rel = (await api.reports(S.project.name).catch(() => null))?.simModels?.[step]?.path;
  if (rel) log(`${SIM_MODEL_NAMES[step]} simulation model: ${rel} (simulate it in the Simulation view, or emulate it on the board).`, 'ok');
  return true;
}
export async function postParTiming(mod) {
  if (await runImpl(mod, FLOW_UP_TO.par, { timing: true })) openSummary();
}
export async function textPowerReport(mod) {
  if (!await runImpl(mod, [...FLOW_UP_TO.par, 'xpwr'])) return;
  const rel = `build/${S.project.top}.pwr`;
  try { await showTextDoc(`${S.project.top}.pwr`, await api.readFile(S.project.name, rel)); } catch (e) { log(`WARNING: cannot read ${rel}: ${e.message}`, 'warn'); }
}
// Back-annotate Pin Locations: the pins chosen by the tools (ISE's pin2ucf; in the Silinx toolchain,
// the pads its placer chose, written as pin2ucf writes them) are added to the project's UCF for the
// ports that have no LOC yet (existing LOCs are never changed).
export async function backAnnotatePins(mod) {
  if (!await runImpl(mod, [...FLOW_UP_TO.par, 'pin2ucf'])) return;
  await loadUcfText();
  const { backAnnotateUcf } = await import('/packages/silinx-fpga/src/parts.js');
  let r;
  try { r = backAnnotateUcf(S.ucfText, await readBuildFile(`build/${S.project.top}_pins.ucf`), { ports: topUcfPorts(), tool: openMode() ? 'Silinx toolchain' : 'pin2ucf' }); } catch (e) { log(`WARNING: no pin file: ${e.message}`, 'warn'); return; }
  const { added: add, lines, text } = r;
  if (!add.length) { log('Back-annotate Pin Locations: every port already has a LOC in the UCF (nothing to add).', 'ok'); return; }
  if (!await confirmDlg('Back-annotate Pin Locations', `Add the ${add.length} pin location(s) chosen by the tools to ${S.project.constraints || 'the UCF'}?\n\n${lines.slice(0, 12).join('\n')}${add.length > 12 ? '\n…' : ''}`)) return;
  const file = S.project.constraints || `${S.project.top}.ucf`;
  await api.writeFile(S.project.name, file, text);
  S.ucfText = text;
  refreshOpenEditor(file, text);
  if (!S.project.constraints) { S.project.constraints = file; await saveProjectJson(); }
  await reloadProject(false);
  log(`Back-annotated ${add.length} pin location(s) into ${file}.`, 'ok');
}
// A file of the build: in the project's build/ folder (the server), or in the browser edition's memory
// (its builds are not kept with the project)
export async function readBuildFile(rel) {
  const t = api.buildFile ? await api.buildFile(S.project.name, rel) : await api.readFile(S.project.name, rel);
  if (t == null) throw new Error(`file '${rel}' not found`);
  return typeof t === 'string' ? t : new TextDecoder().decode(t);
}
/** A read-only text in a document of its own (the power report), made again when it is shown again (#1621). */
export async function showTextDoc(title, text) {
  const id = `text:${title}`;
  const old = findDoc(id);
  if (old) await closeDoc(old);
  openDoc({ id, title, icon: 'report', create(el) { el.append(h('pre', { class: 'report-text', style: { margin: 0, padding: '8px', overflow: 'auto', height: '100%', boxSizing: 'border-box', font: '12px var(--mono)' } }, text)); } });
}

// Stop the running implementation (kills the ISE tool / container run.sh via the job manager).
export async function stopProcesses() {
  if (!S.currentJob) { toast('No process is running'); return; }
  S.stopRequested = true;
  log('Stopping…', 'warn');
  try { await api.cancelJob(S.currentJob); } catch (e) { log(`ERROR: cannot stop the process: ${e.message}`, 'err'); }
}
