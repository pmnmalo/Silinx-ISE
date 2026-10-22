// The viewers of the design (#405: out of app.js): the RTL and technology schematics, the simulation in ISim (the
// behavioural model or a netlist model, with its test bench and data files) and the Board Emulator.
import { api } from './api.js';
import { h, dialog, alertDlg, confirmDlg, promptDlg, toast } from './ui.js';
import { compile, elaborate } from '/core/compile.js';
import { primitiveSources } from '/core/unisim.js';
import { Simulator } from '/core/simulator.js';
import { ENGINE_KEY, defaultEngine } from '/core/emulate-engine.js';
import { modulesFromLibrary } from '/core/schdoc.js';
import * as wiz from './wizards.js';
import { countEvent } from './analytics.js';
import { S, closeDoc, findDoc, moduleInfo, openDoc, openFile, projectBoard, status, withPrimitives } from './app.js';
import { log, showConsolePage, setDiagnostics } from './console.js';
import { reloadProject } from './project.js';
import { generateSimModel, readBuildFile, runImpl } from './implement.js';
import { ucfPort } from './drawings.js';
import { EXTRA_STEPS, ISE_ONLY, SIM_MODEL_NAMES, checkSyntax, diagsFor, loadUcfText, openMode, saveAll, setStatus } from './processes.js';
import { inView, saveProjectJson } from './design.js';

// ---- schematic
// Netlist written by netgen for `step` (postsynth / posttrans / postmap / postpar) with the
// Silinx primitive models, ready to compile. When it is not generated yet, the user is offered to
// generate it (the process of the Processes pane, with the steps before it) and the caller goes on
// with it (#490); null when it is not generated (cancelled, failed, or it cannot run here).
// `action`: what the caller does with it ('Simulate', 'Emulate', 'Show'), `title` its dialog's title.
async function netlistSources(step, { hier = false, action = 'Simulate', title = `${action} ${SIM_MODEL_NAMES[step]} Model` } = {}) {
  const name = SIM_MODEL_NAMES[step];
  const modelOf = async () => {
    const rep = await api.reports(S.project.name).catch(() => null);
    return rep?.simModels?.[step] && rep.top === S.project.top ? rep.simModels[step] : null;
  };
  let m = await modelOf();
  if (!m) {
    if (!await offerSimModel(step, action, title)) return null;
    m = await modelOf();
    if (!m) return null;
  }
  const stage = { postsynth: 'synth', posttrans: 'translate', postmap: 'map', postpar: 'par' }[step];
  if (S.status[stage] === 'stale' || S.status[step] === 'stale') log(`WARNING: the ${name.toLowerCase()} model is older than the sources (run "${EXTRA_STEPS[step]}" again to update it).`, 'warn');
  // the Board Emulator runs the design's own model when the simulation's has the test bench's generics (#622:
  // blinky's divider of 2 would make it blink millions of times a second)
  const file = action === 'Emulate' && m.board?.path ? m.board.path : m.path;
  if (file !== m.path) log(`The board runs the ${name.toLowerCase()} model with the design's own generics (${file}); the simulation's has ${m.testbench ? `the test bench '${m.testbench}''s` : "the test bench's"}.`);
  let raw = await api.readFile(S.project.name, file);
  // the post-place & route model simulated with its timing (#122; ISE's, with netgen's SDF: #558): the delays and
  // setup checks of its SDF built in (core/sdf.js); the emulator runs it without
  if (m.sdf && action === 'Simulate') {
    try {
      const { parseSdf, annotateSdf } = await import('/core/sdf.js');
      const a = annotateSdf(raw, 'vhdl', parseSdf(await api.readFile(S.project.name, m.sdf)));
      raw = a.text;
      log(`Timing: ${m.sdf} (${a.annotated} instances with their delays).`);
    } catch (e) { log(`WARNING: the model is simulated without its timing (${m.sdf}: ${e.message}).`, 'warn'); }
  }
  const { scalarizeNetlist, regroupNetlist } = await import('/core/netlist-hier.js');
  // single-bit nets simulate several times faster than netgen's vector signals (same behaviour);
  // the technology schematic regroups the flat netlist by the design's own instances
  let text = scalarizeNetlist(raw);
  if (hier) {
    try {
      const design = elaborate(compile(S.sources.filter(x => inView(x.role, false) && (x.lang === 'vhdl' || x.lang === 'verilog'))), S.project.top);
      text = regroupNetlist(raw, (design.top?.children || []).map(c => c.name)).text;
    } catch (e) { log(`WARNING: technology schematic shown flat (${e.message})`, 'warn'); }
  }
  const net = { path: file, lang: 'vhdl', text, role: 'design', netlist: step };
  return [...primitiveSources([net]), net];
}
// The dialog of a model not generated yet (#490): "Generate and <action>" runs its process when the
// toolchain can (the Silinx toolchain, or ISE in an ISE mode), else it
// says why. true when the process ran and ended without errors.
const SIM_MODEL_THEN = { Simulate: 'the simulation starts', Emulate: 'the emulator opens', Show: 'the technology schematic opens' };
async function offerSimModel(step, action, title) {
  const proc = EXTRA_STEPS[step];
  let why = null;
  if (openMode()) {
    if (ISE_ONLY.has(step)) why = `"${proc}" needs the Xilinx ISE toolchain: it is not available with the Silinx toolchain (choose an ISE mode in Toolchain Settings).`;
  } else {
    const tc = S.toolchain || await api.toolchain().catch(() => null);
    if (!tc?.ise?.available) why = `"${proc}" needs the Xilinx ISE toolchain, which is not available (configure it in Tools ▸ Toolchain Settings).`;
  }
  const p = (text, first) => h('div', { style: first ? {} : { marginTop: '8px' } }, text);
  const text = h('div', { class: 'msg-text' }, p(`There is no ${SIM_MODEL_NAMES[step].toLowerCase()} simulation model of '${S.project.top}' yet.`, true),
    p(why || `Generate it now with "${proc}"? When it ends without errors, ${SIM_MODEL_THEN[action]}.`));
  const go = await dialog({
    title, width: 440, className: 'sim-model-dlg',
    body: h('div', { class: `msg msg-${why ? 'info' : 'question'}` }, h('div', { class: 'msg-icon' }, why ? 'i' : '?'), text),
    buttons: why ? [{ label: 'OK', value: null, primary: true }] : [{ label: `Generate and ${action}`, value: true, primary: true }, { label: 'Cancel', value: null }],
  });
  if (!go) return false;
  return !!await generateSimModel(S.project.top, step);
}
const isPrimitive = inst => /^<silinx>\//.test(inst?.mod?.file || inst?.file || '');

// View Technology Schematic: the post-synthesis netlist (LUTs, flip-flops, carry chain…)
export async function openTechSchematic(mod) {
  if (openMode()) return openSilinxTechSchematic(mod);
  const srcs = await netlistSources('postsynth', { hier: true, action: 'Show', title: 'View Technology Schematic' });
  if (srcs) return openSchematic(mod, { netlist: srcs });
}

// …in the Silinx toolchain: the netlist of its synthesis (Yosys's JSON, build/open/<top>.json; Synthesize
// runs first when there is none or the sources changed since), drawn by core/fpga/techview.js
async function openSilinxTechSchematic(mod) {
  let top = S.project.top;
  const netlistOf = async () => {
    const rep = await api.reports(S.project.name).catch(() => null);
    return rep && rep.top === top && rep.files?.netlist ? rep.files.netlist : null;
  };
  let file = ['ok', 'warn'].includes(S.status.synth) && mod === top ? await netlistOf() : null;
  if (!file) {
    if (!await runImpl(mod, ['synth'])) return;
    top = S.project.top;
    file = await netlistOf();
  }
  let json;
  try { json = await readBuildFile(file || `build/open/${top}.json`); } catch (e) { log(`ERROR: Technology Schematic: no netlist of '${top}' (${e.message}): run Synthesize.`, 'err'); return; }
  setStatus('tech', 'running');
  status(`Reading the netlist of ${top}…`);
  let groups;
  try {
    const design = elaborate(compile(S.sources.filter(x => inView(x.role, false) && (x.lang === 'vhdl' || x.lang === 'verilog'))), top);
    groups = (design.top?.children || []).map(c => c.name);
  } catch { /* the instances from the netlist's names */ }
  const { technologyNetlist } = await import('/core/fpga/techview.js');
  let r;
  try { r = technologyNetlist(json, { groups }); } catch (e) { setStatus('tech', 'err'); log(`ERROR: Technology Schematic: ${e.message}`, 'err'); status('Ready'); return; }
  const blocks = Object.entries(r.groups);
  log(`Technology Schematic of '${top}': the netlist of the Silinx toolchain's synthesis (${file || `build/open/${top}.json`}), ${r.cells} cells${blocks.length ? ` in ${blocks.length} block(s): ${blocks.map(([g, n]) => `${g} (${n})`).join(', ')}` : ''}.`, 'info');
  const net = { path: (file || `build/open/${top}.json`).replace(/\.json$/, '_tech.vhd'), lang: 'vhdl', text: r.text, role: 'design', netlist: 'open' };
  return openSchematic(r.name, { netlist: [...primitiveSources([net]), net] });
}

export async function openSchematic(mod, { netlist = null } = {}) {
  await saveAll();
  const sim = S.view === 'sim';
  const srcs = netlist || S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, sim));
  const all = withPrimitives(srcs);
  const lib = compile(all);
  const design = elaborate(lib, mod);
  const diags = diagsFor(lib, design);
  setDiagnostics(diags);
  if (!design.top) { log(`ERROR: cannot elaborate '${mod}'`, 'err'); showConsolePage('errors'); return; }
  if (diags.some(d => d.severity === 'error')) log(`Schematic of '${mod}' generated with errors (see Errors tab).`, 'warn');
  setStatus(netlist ? 'tech' : sim ? 'rtl-sim' : 'rtl', diags.some(d => d.severity === 'error') ? 'warn' : 'ok');
  const kindName = netlist ? 'Technology' : 'RTL';
  const { mountSchEditor } = await import('./sch-editor.js');
  const { schematicFromHdl, modulesFromLibrary } = await import('/core/schdoc.js');
  const sources = Object.fromEntries(srcs.map(x => [x.path, x.text]));
  // the names as written in the sources (VHDL is lower-cased by the elaborator, #131), the primitives' too (LUT4, FDRE)
  const modules = modulesFromLibrary(lib, { sources: Object.fromEntries(all.map(x => [x.path, x.text])), asWritten: true });
  const modName = name => Object.values(modules).find(m => m.name.toLowerCase() === String(name).toLowerCase())?.name || name;
  const elk = window.ELK ? new window.ELK() : null;
  const id = `${netlist ? 'tech' : 'rtl'}:${mod}`;
  const existing = findDoc(id);
  if (existing) await closeDoc(existing);
  openDoc({
    id, title: `${mod} (${kindName})`, icon: 'schematic',
    create(el, docRef) {
      const bar = h('div', { class: 'doc-toolbar rtl-crumbs' });
      const host = h('div', { class: 'doc-body' });
      el.append(bar, host);
      let ed = null, cur = null;
      const crumbs = inst => { const out = []; for (let i = inst; i; i = i.parent) out.unshift(i); return out; };
      // an instance or a module by its name in the schematic (as written: VHDL names match in any case)
      const sameName = (a, b, vhdl) => a === b || (vhdl && String(a).toLowerCase() === String(b).toLowerCase());
      const shown = new Map();    // instance -> its name as the schematic writes it
      const label = i => `${shown.get(i) || (i.parent ? i.name : modName(i.name))} : ${modName(i.module)}`;
      // ISE-style hierarchy navigation: up to the parent, push into the selected instance
      const upBtn = h('button', { class: 'btn rtl-nav', title: 'Up to the parent module (Backspace)', onclick: () => cur?.parent && show(cur.parent) }, '⬆ Up');
      const intoBtn = h('button', { class: 'btn rtl-nav', title: 'Push into the selected instance (Enter, or double-click it)', onclick: () => ed?.openSelected() }, '⬇ Push into');
      const canEnter = s => !!(s && cur?.children.some(c => (sameName(c.name, s.name, cur.mod?.lang === 'vhdl') || sameName(c.module, s.params.module, c.mod?.lang === 'vhdl')) && !c.blackbox && !isPrimitive(c)));
      // the bar (Up, the crumbs) says the instance drawn: it changes with the drawing, once that is laid
      // out, not before (a click meanwhile went to the drawing left, its properties then replaced, #346)
      const drawBar = (inst, info) => {
        bar.innerHTML = '';
        upBtn.disabled = !inst.parent; intoBtn.disabled = true;
        bar.append(upBtn, intoBtn, h('span', { class: 'rtl-ro' }, netlist ? 'Technology Schematic (read-only): the post-synthesis netlist' : 'RTL Schematic (read-only)'));
        crumbs(inst).forEach((i, k, all) => {
          bar.append(h('span', { class: 'sep' }, k ? ' › ' : ' — '));
          bar.append(k === all.length - 1 ? h('b', {}, label(i)) : h('a', { onclick: () => show(i) }, label(i)));
        });
        if (info) bar.append(h('span', { class: 'spacer' }), h('a', { onclick: () => openFile(info.file, info.line) }, `Open ${info.file.split('/').pop()}`));
      };
      let want = null;   // the instance asked for last (its drawing being laid out)
      const show = async inst => {
        want = inst;
        const info = moduleInfo(inst.module);
        status(`Drawing ${kindName} schematic of ${inst.module}…`);
        try {
          const doc = await schematicFromHdl(inst, { sources, modules, layout: elk ? g => elk.layout(g) : undefined, lang: info?.lang || 'vhdl' });
          if (want !== inst || docRef.closed) return;
          cur = inst;
          if (!ed) {
            ed = mountSchEditor(host, {
              doc, modules, readOnly: true,
              onSelect: s => { intoBtn.disabled = !canEnter(s); },
              onUp: () => cur?.parent && show(cur.parent),
              onOpenModule: (name, { instance } = {}) => {
                const child = cur.children.find(c => sameName(c.name, instance, cur.mod?.lang === 'vhdl')) || cur.children.find(c => sameName(c.module, name, c.mod?.lang === 'vhdl'));
                if (child && !child.blackbox && !isPrimitive(child)) { if (instance) shown.set(child, instance); show(child); }
              },
            });
            docRef.viewer = ed;   // (the read-only editor of the view: tests)
          } else ed.setDoc(doc);
          drawBar(inst, info);
          setTimeout(() => ed.fit?.(), 50);
        } catch (e) { log(`ERROR: ${kindName} schematic of ${inst.module}: ${e.message}`, 'err'); }
        finally { status('Ready'); }
      };
      show(design.top);
      return { destroy: () => ed?.destroy?.() };
    },
  });
}

// ---- simulation (ISim)
async function readDataFiles() {
  const map = new Map(S.sources.map(s => [s.path, s.text]));
  for (const f of S.fileTree.filter(f => /\.(mem|hex|txt|dat|coe|bin)$/i.test(f))) {
    try { map.set(f, await api.readFile(S.project.name, f)); } catch { /* ignore */ }
  }
  return map;
}

// model: undefined = behavioural (the HDL sources); postsynth / posttrans / postmap / postpar =
// the testbench against that netgen netlist (compiled after the sources: its entity replaces the RTL one).
// stale(): true when another simulation was asked for meanwhile (the Tasks interface's choices, #1018): this one
// opens no window, so that the last choice's is the one shown.
export async function runSimulation(mod, model, { stale } = {}) {
  countEvent('simulate');
  try { return await runSimulationInner(mod, model, stale); }
  catch (e) { setStatus(model ? `sim-${model}` : 'sim-run', 'err'); log(`ERROR: simulation: ${e.message}`, 'err'); }
}
async function runSimulationInner(mod, model, stale) {
  await saveAll();
  if (!await checkSyntax(mod, true)) return;
  const net = model ? await netlistSources(model) : null;
  if (model && !net) return;
  const procId = model ? `sim-${model}` : 'sim-run';
  const title = model ? `Simulate ${SIM_MODEL_NAMES[model]} Model` : 'Simulate Behavioral Model';
  setStatus(procId, 'running');
  log(`\nStarted : "${title}".\n\nBuilding simulation model for top '${mod}'${model ? ` with the ${SIM_MODEL_NAMES[model].toLowerCase()} netlist of '${S.project.top}'` : ''}...`, 'hdr');
  const srcs = [...S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, true)), ...(net || [])];   // no implementation-only files
  const lib = compile(withPrimitives(srcs));
  if (model) lib.errors = lib.errors.filter(e => !/redefined/.test(e.message));
  const design = elaborate(lib, mod);
  const files = await readDataFiles();
  const sim = new Simulator(design, { files });
  if (!design.top) { setStatus(procId, 'err'); log(`ERROR: cannot elaborate '${mod}': ${design.diags.map(d => d.message).join('; ')}`, 'err'); return; }
  if (!await confirmElabErrors(title, lib, design)) { setStatus(procId, 'err'); return; }
  log(`Simulation model ready: ${design.signals.length} signals, ${design.procs.length} processes. Launching SSim view.`, 'ok');
  setStatus(procId, 'ok');
  const { mountISim } = await import('./isim.js');
  if (stale?.()) return;
  const id = 'isim';
  const old = findDoc(id);
  if (old) await closeDoc(old);
  openDoc({
    id, title: `SSim (${mod}${model ? `, ${SIM_MODEL_NAMES[model]}` : ''})`, icon: 'wave', reopen: `isim:${mod}${model ? `@${model}` : ''}`,
    create(el) {
      // ISim runs 1000 ns at start-up, or the module's drawn stimuli (#336), saved in the project: of the module's
      // inputs, or (a test bench, no ports) of its unit under test's, forced over what the bench drives them with
      const inst = (design.top.ports || []).some(p => p.dir === 'in') ? design.top
        : (design.top.children || []).find(c => (c.ports || []).some(p => p.dir === 'in')) || design.top;
      const stimuli = {
        model: S.project.stimuli?.[mod] || null, inst,
        ports: (inst.ports || []).map(p => ({ name: p.name, dir: p.dir, width: p.sig.t.w || 1 })),
        onChange: m => { S.project.stimuli = { ...(S.project.stimuli || {}), [mod]: m }; saveProjectJson().catch(e => toast(`Cannot save the stimuli: ${e.message}`, 'error')); },
        onSaveTestbench: m => saveStimTestbench(inst === design.top ? mod : inst.module, inst, m),
      };
      const view = mountISim(el, { design, sim, title: mod, initialRun: 1_000_000, stimuli, onOpenSource: ref => ref?.file && openFile(ref.file, ref.line) });
      return { destroy: () => view.destroy?.(), view, onActivate: () => setTimeout(() => view.refresh?.(), 0) };
    },
  });
}

// The stimuli drawn in ISim saved as a self-checking test bench (#336, core/stimuli.js -> core/testbench.js): next
// to the module's file, in the project's language, a simulation source
async function saveStimTestbench(mod, inst, m) {
  const { tbPorts, generateTestbench } = await import('/core/testbench.js');
  const { testbenchOptions } = await import('/core/stimuli.js');
  const title = 'Save as Test Bench';
  const info = moduleInfo(mod);
  // (tb_<module>, or tb_<module>_2… when the project has that test bench already)
  let dft = `tb_${mod}`;
  for (let k = 2; moduleInfo(dft); k++) dft = `tb_${mod}_${k}`;
  const name = String(await promptDlg(title, 'Test bench name:', dft) ?? '').trim();
  if (!name) return;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return alertDlg(title, `'${name}' is not a valid name (a letter, then letters, digits or _).`, 'error');
  const lang = (S.project.preferredLanguage || info?.lang) === 'verilog' ? 'verilog' : 'vhdl';
  const dir = String(info?.file || 'src/x').replace(/\/[^/]*$/, '');
  const path = `${dir}/${name}.${lang === 'verilog' ? 'v' : 'vhd'}`;
  const other = wiz.moduleElsewhere(name, path);
  if (other) return alertDlg(title, `The project already has a module '${other.name}' (${other.file}).`, 'error');
  if (S.fileTree?.includes(path) && !await confirmDlg(title, `${path} exists. Replace it?`)) return;
  let text;
  try {
    const types = Object.fromEntries((info?.portList || []).map(p => [p.name, p.type]));
    text = generateTestbench(testbenchOptions(m, { name, lang, uut: { name: mod }, ports: tbPorts({ top: inst }, types) }));
  } catch (e) { return alertDlg(title, e.message, 'error'); }
  await wiz.closeBeforeReplace(path);
  await api.writeFile(S.project.name, path, text);
  await reloadProject();
  // (a simulation source, whatever its name)
  const f = S.project.files?.find(x => x.path === path);
  if (f && f.role !== 'sim') { f.role = 'sim'; await saveProjectJson(); await reloadProject(); }
  log(`Save as Test Bench: created ${path} from the stimuli of '${mod}' (${m.cycles} cycle(s)); run Simulate Behavioral Model on ${name} to check the design.`, 'ok');
  toast(`Test bench ${path} created`, 'ok');
}

// Elaboration errors of a design about to be simulated (e.g. a netlist cell without a model, which
// would run as an empty black box): listed in the console and the Errors tab; true = run anyway.
async function confirmElabErrors(title, lib, design) {
  const errs = diagsFor(lib, design).filter(d => (d.severity || 'error') === 'error');
  if (!errs.length) return true;
  setDiagnostics(diagsFor(lib, design));
  for (const d of errs.slice(0, 20)) log(`ERROR: ${d.file ? `${d.file}${d.line ? `:${d.line}` : ''}: ` : ''}${d.message}`, 'err');
  if (errs.length > 20) log(`… ${errs.length - 20} more error(s) in the Errors tab.`, 'err');
  const missing = errs.filter(d => /not found/.test(d.message)).length;
  return !!await confirmDlg(title, `The design has ${errs.length} elaboration error(s)${missing ? `, ${missing} of them instances of cells or entities that have no model (they would do nothing)` : ''}:\n\n`
    + `${errs.slice(0, 5).map(d => `• ${d.message}`).join('\n')}${errs.length > 5 ? '\n• …' : ''}\n\nThe results will not match the hardware. Run anyway?`);
}

// ---- Board emulator: the design (behavioural RTL) on a virtual board, wired by the UCF
// the engine the user chose last (#952: remembered, it wins over the default)
const enginePref = () => { try { return localStorage.getItem(ENGINE_KEY); } catch { return null; } };
const setEnginePref = (e) => { try { localStorage.setItem(ENGINE_KEY, e); } catch { /* ignore */ } };
export async function openEmulator(mod, { scale, model = null, engine = null } = {}) {
  if (!mod) { toast('Select the top module first'); return; }
  await saveAll();
  const board = projectBoard();
  if (!board) { alertDlg('Board Emulator', 'The project has no board. Choose one in Project ▸ Design Properties (e.g. Digilent Basys2).'); return; }
  if (!await checkSyntax(mod)) return;
  await loadUcfText();   // the pins as they are now (pin planner / editor changes)
  // the design to run: the HDL (RTL) or a netlist generated by netgen (post-synthesis …)
  // (the model first: it may be generated now, #490)
  const net = model ? await netlistSources(model, { action: 'Emulate' }) : null;
  if (model && !net) return;
  let rep = null;
  try { rep = await api.reports(S.project.name); } catch { /* standalone / no build */ }
  const models = Object.keys(SIM_MODEL_NAMES).filter(k => rep?.simModels?.[k] && rep.top === mod);
  const srcs = net || S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, false));   // the implemented design
  const { timingGenerics, autoTimeScale, scaledGenerics } = await import('/core/emulate.js');
  let design, lib, gens = [];
  try {
    lib = compile(withPrimitives(srcs));
    design = elaborate(lib, mod);
    if (!design.top) throw new Error(design.diags.map(d => d.message).join('; ') || `cannot elaborate '${mod}'`);
    gens = model ? [] : timingGenerics(design.top?.params);   // a netlist has its constants built in
  } catch (e) { alertDlg('Board Emulator', `Cannot build the design: ${e.message}`, 'error'); return; }
  if (!await confirmElabErrors('Board Emulator', lib, design)) return;
  const { parseUcf } = await import('/core/ucf.js');
  const assignments = S.ucfText ? parseUcf(S.ucfText, { ports: design.top.ports.map(ucfPort) }).assignments : {};
  if (!S.ucfText) log('WARNING: the project has no UCF: the ports are not connected to the board (use I/O Pin Planning).', 'warn');
  const files = await readDataFiles();
  const { mountEmulator, emulatorYosys } = await import('./emulator.js');
  // the engine: the one asked for (the Engine selector), else the user's last choice, else the compiled one,
  // or on a slow device (a phone, a tablet, few cores: #952) the event-driven one, which starts at once
  const chosen = engine ? { engine, auto: null } : defaultEngine({ saved: enginePref() });
  // the engine (#418): the design compiled (its netlist by Yosys, at the timing generics' real values unless
  // divided), else (it cannot be, or the event-driven engine is chosen) the event-driven simulator, with the
  // large timing generics (dividers, debouncers) divided so that the design visibly runs. The document opens
  // at once, the board once the design is compiled (Yosys may take seconds to load the first time).
  async function start() {
    let netlist = null, reason = null, d = design, k = scale;
    if (chosen.engine !== 'event') {
      const s1 = k ?? 1;
      const d1 = s1 > 1 && gens.length ? elaborate(lib, mod, { generics: scaledGenerics(gens, s1) }) : design;
      try {
        const { netlistOf } = await import('/core/compiled-sim.js');
        netlist = await netlistOf(d1, { run: await emulatorYosys(api.standalone) });
        d = d1;
        k = s1;
      } catch (e) { reason = e.message; }
    }
    k ??= autoTimeScale(gens);
    if (!netlist && k > 1 && gens.length) d = elaborate(lib, mod, { generics: scaledGenerics(gens, k) });
    return { netlist, reason, design: d, scale: k };
  }
  const id = 'emulator';
  const old = findDoc(id);
  if (old) await closeDoc(old);
  openDoc({
    id, title: `Board Emulator (${mod}${model ? `, ${SIM_MODEL_NAMES[model]}` : ''})`, icon: 'board', reopen: `emulator:${mod}${model ? `@${model}` : ''}`,
    create(el, doc) {
      let closed = false;
      const wait = document.createElement('div');
      wait.className = 'emu-hint';
      wait.style.padding = '12px';
      wait.textContent = chosen.engine === 'event' ? 'Starting the Board Emulator…' : 'Compiling the design for the Board Emulator (Yosys)…';
      el.append(wait);
      start().then((r) => {
        if (closed) return;
        wait.remove();
        const view = mountEmulator(el, { design: r.design, board, assignments, title: `${mod}${model ? ` — ${SIM_MODEL_NAMES[model]} netlist` : ''}`, files,
          timing: { gens, scale: r.scale, onChange: (k) => setTimeout(() => openEmulator(mod, { scale: k, model, engine }), 0) },
          model: { current: model, available: models, names: SIM_MODEL_NAMES,
            onChange: (m) => setTimeout(() => openEmulator(mod, { model: m || null, engine }), 0) },
          engine: { netlist: r.netlist, reason: r.reason, auto: chosen.auto, onChange: (e) => { setEnginePref(e); setTimeout(() => openEmulator(mod, { model, engine: e }), 0); } } });
        doc.view = view;
        log(`Board Emulator: '${mod}' (${model ? `${SIM_MODEL_NAMES[model]} netlist` : 'RTL'}, ${view.engine === 'compiled' ? 'compiled' : 'event-driven'}) on ${board.name} — ${view.wiring.bits.length} port bit(s) on board resources${view.wiring.unmapped.length ? `, ${view.wiring.unmapped.length} not connected` : ''}.`, 'ok');
      }).catch((e) => { if (!closed) { wait.textContent = `Cannot build the design: ${e.message}`; log(`ERROR: Board Emulator: ${e.message}`, 'err'); } });
      return { destroy: () => { closed = true; doc.view?.destroy(); } };
    },
  });
}
