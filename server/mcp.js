// Silinx as an MCP server (Model Context Protocol, #134): an AI assistant (Claude Desktop, Claude Code,
// any MCP client) opens and inspects the projects of the Silinx workspace, reads and writes their
// files, checks their syntax, simulates them and runs the processes (synthesis, implementation,
// bitstream, timing, power, pins), then reads their reports, warnings and errors.
//   silinx-ise mcp        (bin/silinx-ise.js): JSON-RPC 2.0 over stdin / stdout, one message a line
// A thin layer over the server's own functions (server/projects.js, impl-routes.js
// startImplementation / projectReports, ise.js viewSources) and core/ (compile, elaborate, the design
// checks of core/lint.js, the simulator): the results are the application's. The projects are the
// workspace's (SILINX_WORKSPACE, as for `silinx-ise serve`): every path stays inside its project
// (symbolic links included); nothing runs but Silinx's own processes; programming a board is left out.
// The ISE machine's address never appears in a result (the logs are redacted).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import * as P from './projects.js';
import { VERSION } from '../core/version.js';
import { orderExamples } from '../core/examples.js';
import { TEST_DESIGNS, orderTestDesigns } from '../core/test-designs.js';

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'silinx-ise', title: 'Silinx ISE', version: VERSION };
const INSTRUCTIONS = 'Silinx ISE: FPGA design for teaching (Spartan-3E; Basys2, Nexys2). Projects live in the Silinx workspace: '
  + 'list_projects, new_project_from_example, or new_project (empty) then write_file and set_top; then read_file / write_file, check_syntax, simulate (the project\'s test bench), '
  + 'run_process (synthesize, implement, bitstream, timing, power, pins) and get_report. The Silinx toolchain needs no Xilinx ISE.';

// ------------------------------------------------------------------ helpers
const toolError = (message) => Object.assign(new Error(message), { toolError: true });
const MAX_TEXT = 20000;
const clip = (text, max = MAX_TEXT) => (text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more characters)` : text);

// the ISE machine's address (ssh mode of Toolchain Settings) never in a result
let secrets = null;
async function redactor() {
  if (!secrets) {
    secrets = [];
    try {
      const { loadConfig } = await import('./toolchain.js');
      const ssh = (await loadConfig()).ssh || {};
      if (ssh.user && ssh.host) secrets.push(`${ssh.user}@${ssh.host}`);
      if (ssh.host) secrets.push(ssh.host);
      if (process.env.SILINX_ISE_HOST && process.env.SILINX_ISE_HOST !== 'local') secrets.push(process.env.SILINX_ISE_HOST, process.env.SILINX_ISE_HOST.replace(/^.*@/, ''));
    } catch { /* no configuration */ }
    secrets = [...new Set(secrets.filter(s => s && s.length > 2))].sort((a, b) => b.length - a.length);
  }
  return text => secrets.reduce((t, s) => t.split(s).join('<ISE host>'), String(text));
}

// a file of a project: inside its folder, also once its symbolic links are followed
async function projectPath(name, rel) {
  const dir = P.projectDir(name);
  const full = P.safeJoin(dir, rel);
  const root = await fsp.realpath(dir).catch(() => { throw toolError(`no project '${name}' in the workspace`); });
  // (the deepest part of the path that exists, resolved)
  let probe = full;
  while (!fs.existsSync(probe) && probe !== dir) probe = path.dirname(probe);
  const real = await fsp.realpath(probe);
  if (real !== root && !real.startsWith(root + path.sep)) throw toolError(`'${rel}' is outside the project '${name}'`);
  return full;
}

async function readProject(name) {
  if (typeof name !== 'string' || !name) throw toolError('project: the name of a project of the workspace (list_projects)');
  try { return await P.readProject(name); } catch (e) { throw toolError(e.status === 404 || /not found|ENOENT/.test(e.message) ? `no project '${name}' in the workspace` : e.message); }
}

// the HDL of a view (the project's sources of that view and the HDL of its drawings), as the
// application's Check Syntax and simulation take it; sim: the simulation view
async function viewSourcesOf(name, project, sim) {
  const { viewSources } = await import('./ise.js');
  const inView = role => (role === 'sim' ? sim : role === 'impl' ? !sim : true);
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role || 'design'));
  let drawn = [];
  try { drawn = (await viewSources(project, P.projectDir(name), hdl)).filter(v => v.text); } catch { /* none */ }
  return [...hdl, ...drawn.map(v => ({ path: v.path, lang: v.lang, text: v.text, role: 'design' }))];
}

const diagLine = d => `${d.severity === 'error' ? 'ERROR' : d.severity === 'info' ? 'INFO' : 'WARNING'}:${d.tool || 'HDLCompiler'} - "${d.file}" Line ${d.line}: ${d.message}`;
const diagJson = d => ({ severity: d.severity, file: d.file, line: d.line, col: d.col ?? null, tool: d.tool || 'HDLCompiler', message: d.message, ...(d.check ? { check: d.check } : {}) });

// compile and elaborate a view of a project: { lib, design, top, diags } (the design checks included)
async function elaborateView(name, { top, sim = false } = {}) {
  const project = await readProject(name);
  const mod = top || (sim ? project.simTop : project.top);
  if (!mod) throw toolError(sim ? `the project '${name}' has no simulation top (a test bench): give top` : `the project '${name}' has no top module: give top`);
  const { compile, elaborate } = await import('../core/compile.js');
  const { primitiveSources } = await import('../core/unisim.js');
  const { designChecks } = await import('../core/lint.js');
  const srcs = await viewSourcesOf(name, project, sim);
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  let design = null, extra = [];
  try { design = elaborate(lib, mod); } catch (e) { extra = [{ severity: 'error', file: srcs[0]?.path || '', line: 1, col: 1, message: e.message }]; }
  if (design) { try { extra = designChecks(lib, design, { lint: true }); } catch { /* no checks */ } }
  const seen = new Set();
  const diags = [...lib.errors, ...(design?.diags || []), ...extra]
    .filter(d => { const k = `${d.file}:${d.line}:${d.message}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(d => ({ ...d, tool: d.tool || 'HDLCompiler' }));
  return { project, srcs, lib, design, top: mod, diags };
}

// ------------------------------------------------------------------ the tools
const STR = (description) => ({ type: 'string', description });
const PROJECT = STR('The project\'s name in the Silinx workspace (list_projects).');
const PROCESSES = {
  synthesize: ['synth'],
  implement: ['synth', 'translate', 'map', 'par'],
  bitstream: ['synth', 'translate', 'map', 'par', 'bitgen'],
  timing: ['synth', 'translate', 'map', 'par', 'trce'],
  power: ['synth', 'translate', 'map', 'par', 'xpwr'],
  pins: ['synth', 'translate', 'map', 'par', 'pin2ucf'],
};
// a report of the build folder: its file, by the toolchain of the last run (#460: the Silinx toolchain
// writes Yosys's statistics, no map or par report: those two are made from its Design Summary)
const REPORT_FILES = {
  open: {
    power: top => `build/${top}.pwr`,
    timing: () => 'build/open/timing.txt',
    synthesis: top => `build/open/${top}_stat.txt`,
    map: null,
    par: null,
    pins: top => `build/${top}_pins.ucf`,
  },
  ise: {
    power: top => `build/${top}.pwr`,
    timing: top => `build/${top}.twr`,
    synthesis: top => `build/${top}.syr`,
    map: top => `build/${top}_map.mrp`,
    par: top => `build/${top}.par`,
    pins: top => `build/${top}_pins.ucf`,
  },
};
// the map and par reports of a Silinx toolchain run, from its Design Summary (build/reports.json); the router's passes
// only when the engine counts them (nextpnr's do not, #2420)
export const OPEN_REPORTS = {
  map: r => r.map && [`Design summary (pack, Silinx toolchain) of ${r.top}:`, ...(r.map.utilization || []).map(u => `  ${u.name}: ${u.used}${u.total ? ` out of ${u.total} ${u.percent}%` : ''}`),
    `${r.map.errors ?? 0} error(s), ${r.map.warnings ?? 0} warning(s).`].join('\n'),
  par: r => r.par && [`Place and route (Silinx toolchain) of ${r.top}: ${r.par.routed ? 'all signals are completely routed' : `${r.par.unroutedSignals} signal(s) not routed`} (${r.par.nets} nets, ${r.par.pips} PIPs${r.par.iterations != null ? `, ${r.par.iterations} passes` : ''}).`,
    ...(r.timing ? [`Timing constraints: ${r.timing.met === false ? `not met (${r.timing.timingErrors})` : 'all met'}${r.timing.minPeriodNs ? `; minimum period ${r.timing.minPeriodNs} ns (${r.timing.maxFreqMHz} MHz)` : ''}.`] : [])].join('\n'),
};
const deviceName = d => (d ? `${d.part}${d.package}${d.speed}` : 'no device');

// a board (basys2, nexys2) and its variant: { board, device } for a new project
async function boardDevice(board, variant) {
  const { resolveBoard } = await import('./devices.js');
  const r = resolveBoard(board, { variant });
  if (!r) throw toolError(`unknown board '${board}' (basys2, nexys2)`);
  if (variant && r.variant?.id !== variant) throw toolError(`the ${r.board.name} has no variant '${variant}'`);
  return { board: r.board.id, device: { family: 'spartan3e', part: r.device.part, package: r.device.package, speed: r.device.speed } };
}

export const TOOLS = [
  {
    name: 'list_examples', title: 'List the example projects',
    description: 'The example projects a new project can start from (new_project_from_example), in the order of the interface, with their top module, device and board; '
      + 'then the test designs (the designs Silinx is tested with: schematics, state diagrams, C programs for Silinx HLS, each with its test), which a new project can start from too.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run() {
      const about = (dir, n) => {
        const pj = JSON.parse(fs.readFileSync(path.join(dir, n, 'silinx.json'), 'utf8'));
        return { name: n, top: pj.top, simTop: pj.simTop || null, board: pj.board || null, device: pj.device ? `${pj.device.part}${pj.device.package}${pj.device.speed}` : null, files: (pj.files || []).length };
      };
      const examples = orderExamples(P.templateNames(P.EXAMPLES_DIR)).map(n => about(P.EXAMPLES_DIR, n));
      // the test designs (#1746): their kind and what each shows (core/test-designs.js); the sources of a drawing or a C
      // program are not in the project's list of HDL files
      const testDesigns = orderTestDesigns(P.templateNames(P.TEST_DESIGNS_DIR)).map(n => {
        const { kind = null, about: shows = null } = TEST_DESIGNS.find(d => d.name === n) || {};
        const { files, ...rest } = about(P.TEST_DESIGNS_DIR, n);
        return { ...rest, kind, about: shows };
      });
      const text = [...examples.map(e => `${e.name}: top ${e.top}${e.simTop ? `, test bench ${e.simTop}` : ''}, ${e.board || 'no board'} (${e.device}), ${e.files} file(s)`),
        '', 'Test designs (the designs Silinx is tested with; its own, with their test):',
        ...testDesigns.map(d => `${d.name} (${d.kind}): ${d.about}; top ${d.top}${d.simTop ? `, test bench ${d.simTop}` : ', its test the C\'s main()'}`)];
      return { text: text.join('\n'), data: { examples, testDesigns } };
    },
  },
  {
    name: 'list_projects', title: 'List the projects',
    description: 'The projects of the Silinx workspace (the folder the Project Navigator uses), with their top module, device and board.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run() {
      const projects = (await P.listProjects()).map(p => ({ name: p.name, top: p.top || null, board: p.board || null, device: p.device ? `${p.device.part}${p.device.package}${p.device.speed}` : null }));
      return { text: projects.length ? projects.map(p => `${p.name}: top ${p.top || '(none)'}, ${p.board || 'no board'} (${p.device})`).join('\n') : 'No project in the workspace (new_project_from_example makes one).', data: { workspace: P.workspaceDir(), projects } };
    },
  },
  {
    name: 'new_project_from_example', title: 'New project from an example',
    description: 'Make a new project in the workspace from an example or a test design (list_examples), optionally for another board (basys2, nexys2): its pins are then the board\'s.',
    inputSchema: { type: 'object', properties: { name: STR('The new project\'s name (letters, digits, - and _).'), example: STR('The example, or test design (list_examples).'), board: STR('The board: basys2 or nexys2 (default: the example\'s).'), variant: STR('The board\'s variant: 100 or 250 for the Basys2, 500 or 1200 for the Nexys2.') }, required: ['name', 'example'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ name, example, board, variant }) {
      // (an example, or a test design: #1746)
      const dir = [P.EXAMPLES_DIR, P.TEST_DESIGNS_DIR].find(d => /^[a-z0-9_-]+$/i.test(String(example || '')) && fs.existsSync(path.join(d, example, 'silinx.json')));
      if (!dir) throw toolError(`unknown example '${example}' (list_examples)`);
      let device;
      if (board || variant) {
        const ex = JSON.parse(fs.readFileSync(path.join(dir, example, 'silinx.json'), 'utf8'));
        ({ board, device } = await boardDevice(board || ex.board, variant));
      }
      try { await P.createProject({ name, template: example, device, board }); } catch (e) { throw toolError(e.message); }
      const pj = await P.readProject(name);
      return { text: `Project '${name}' made from the ${dir === P.EXAMPLES_DIR ? 'example' : 'test design'} ${example}: top ${pj.top}, ${pj.board || 'no board'} (${pj.device.part}${pj.device.package}${pj.device.speed}).`, data: { project: name, top: pj.top, simTop: pj.simTop || null, board: pj.board, device: pj.device } };
    },
  },
  {
    name: 'new_project', title: 'New empty project',
    description: 'Make a new empty project in the workspace for a board (basys2, nexys2; default: the Basys2-250\'s device, no board). Then write its sources with write_file (a test bench in sim/) and choose its top module and test bench with set_top.',
    inputSchema: { type: 'object', properties: { name: STR('The new project\'s name (letters, digits, - and _).'), board: STR('The board: basys2 or nexys2.'), variant: STR('The board\'s variant: 100 or 250 for the Basys2, 500 or 1200 for the Nexys2.') }, required: ['name'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ name, board, variant }) {
      let device;
      if (board || variant) ({ board, device } = await boardDevice(board, variant));
      try { await P.createProject({ name, device, board }); } catch (e) { throw toolError(e.message); }
      const pj = await P.readProject(name);
      return { text: `Empty project '${name}' made: ${pj.board || 'no board'} (${deviceName(pj.device)}). Write its sources with write_file, then set_top.`, data: { project: name, board: pj.board || null, device: pj.device } };
    },
  },
  {
    name: 'set_top', title: 'Set the top module and the test bench',
    description: 'Choose a project\'s top module (what run_process synthesizes and implements) and / or its test bench (what simulate runs), as Set as Top Module does; each must elaborate. With update_constraints, the constraints file is written again from the board\'s pins for the new top\'s ports (clk, led, sw, btn, seg, an…), as Update Constraints does: its pin locations are replaced.',
    inputSchema: { type: 'object', properties: { project: PROJECT, top: STR('The top module (an entity or module of the project\'s design sources).'), sim_top: STR('The test bench (a simulation source\'s entity or module).'), update_constraints: { type: 'boolean', description: 'Write the constraints file again from the board\'s pins (default false).' } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async run({ project: name, top, sim_top: simTop, update_constraints: constraints = false }) {
      const before = await readProject(name);
      if (!top && !simTop) throw toolError('give top, sim_top or both');
      // each must elaborate in its view (the test bench with the new top's sources)
      for (const [mod, sim] of [[top, false], [simTop, true]]) {
        if (!mod) continue;
        const { design, diags } = await elaborateView(name, { top: mod, sim });
        const errors = diags.filter(d => d.severity === 'error');
        if (errors.length === 1 && /^top module '.*' not found$/.test(errors[0].message)) throw toolError(`no entity or module '${mod}' in the project's ${sim ? 'simulation' : 'design'} sources (project_info)`);
        if (errors.length || !design?.top) throw toolError(`<${mod}> does not elaborate${sim ? ' as a test bench' : ''}: ${errors.map(diagLine).join('; ') || 'not found'}`);
      }
      if (constraints && !before.board) throw toolError(`the project '${name}' has no board: its constraints cannot come from a board's pins`);
      await P.updateProject(name, pj => ({ ...pj, ...(top ? { top } : {}), ...(simTop ? { simTop } : {}) }));
      const pj = await P.readProject(name);
      if (constraints) await P.boardConstraints(P.projectDir(name), pj);
      return { text: `${name}: top ${pj.top || '(none)'}, test bench ${pj.simTop || '(none)'}${constraints ? `; ${pj.constraints} written from the ${pj.board}'s pins` : ''}.`, data: { project: name, top: pj.top || null, simTop: pj.simTop || null, constraintsUpdated: constraints } };
    },
  },
  {
    name: 'project_info', title: 'A project\'s settings and files',
    description: 'A project\'s top module, test bench (simulation top), device, board, constraints file and its files (path, language, role: design, sim or impl).',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name }) {
      const pj = await readProject(name);
      const files = (pj.files || []).map(f => ({ path: f.path, lang: f.lang, role: f.role || 'design' }));
      const all = (await P.fileTree(name)).filter(f => !/^build\//.test(f));
      const data = { project: name, top: pj.top || null, simTop: pj.simTop || null, device: pj.device || null, board: pj.board || null, constraints: pj.constraints || null, synthTool: pj.synthTool || null, files, otherFiles: all.filter(f => !files.some(x => x.path === f) && f !== 'silinx.json') };
      return { text: [`${name}: top ${data.top || '(none)'}, test bench ${data.simTop || '(none)'}, ${data.board || 'no board'} (${data.device ? `${data.device.part}${data.device.package}${data.device.speed}` : 'no device'}), constraints ${data.constraints || '(none)'}`,
        ...files.map(f => `  ${f.path} (${f.lang}, ${f.role})`), ...(data.otherFiles.length ? [`  other files: ${data.otherFiles.join(', ')}`] : [])].join('\n'), data };
    },
  },
  {
    name: 'read_file', title: 'Read a file of a project',
    description: 'The text of a file of a project (a source, the constraints, a drawing\'s JSON, a report of build/…).',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s path in the project, e.g. src/top.vhd.') }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, path: rel }) {
      await readProject(name);
      const full = await projectPath(name, rel);
      let text;
      try { text = await fsp.readFile(full, 'utf8'); } catch { throw toolError(`no file '${rel}' in the project '${name}'`); }
      return { text: clip(text), data: { project: name, path: rel, length: text.length } };
    },
  },
  {
    name: 'write_file', title: 'Write a file of a project',
    description: 'Write (create or replace) a file of a project. A new VHDL or Verilog file is added to the project (a test bench in sim/ or named tb_… as a simulation source). The application\'s open editor of that file keeps its own text until it is reopened.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s path in the project, e.g. src/counter.vhd.'), text: STR('The whole text of the file.') }, required: ['project', 'path', 'text'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async run({ project: name, path: rel, text }) {
      await readProject(name);
      if (typeof text !== 'string') throw toolError('text: the whole text of the file');
      // the path as the project lists it: ./silinx.json is silinx.json (#1233)
      const key = P.relKey(P.projectDir(name), await projectPath(name, rel));
      const low = key.toLowerCase();
      if (low === P.PROJECT_FILE || low === 'build' || low.startsWith('build/')) throw toolError(`'${rel}' is written by Silinx itself`);
      if (key.split('/').some(s => s.startsWith('.'))) throw toolError(`'${rel}': a hidden file or folder cannot be written`);
      rel = key;
      const existed = (await P.fileTree(name)).includes(rel);
      try { await P.writeFile(name, rel, text); } catch (e) { throw toolError(e.message); }
      const added = !existed && (await P.readProject(name)).files.some(f => f.path === rel);
      return { text: `${existed ? 'Wrote' : 'Created'} ${rel} (${text.length} characters)${added ? ', added to the project' : ''}.`, data: { project: name, path: rel, created: !existed, addedToProject: added } };
    },
  },
  {
    name: 'check_syntax', title: 'Check Syntax',
    description: 'Parse and elaborate the design (or, with simulation, the test bench) as the application\'s Check Syntax does: the errors and warnings with their file and line, the design checks (latches, sensitivity lists, unused signals…) included.',
    inputSchema: { type: 'object', properties: { project: PROJECT, top: STR('The module to elaborate (default: the project\'s top, or its test bench with simulation).'), simulation: { type: 'boolean', description: 'Check the simulation view (the test bench and the design).' } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, top, simulation = false }) {
      const { design, top: mod, diags } = await elaborateView(name, { top, sim: simulation });
      const errors = diags.filter(d => d.severity === 'error'), warnings = diags.filter(d => d.severity !== 'error');
      const ok = !errors.length && !!design?.top;
      const lines = [...diags.map(diagLine),
        ok ? `Process "Check Syntax" of <${mod}> completed successfully${warnings.length ? ` with ${warnings.length} warning(s)` : ''} (${design.signals.length} signals, ${design.procs.length} processes).`
          : `Process "Check Syntax" of <${mod}> failed (${errors.length} error(s), ${warnings.length} warning(s)).`];
      return { text: lines.join('\n'), data: { project: name, top: mod, ok, errors: errors.map(diagJson), warnings: warnings.map(diagJson) }, isError: false };
    },
  },
  {
    name: 'simulate', title: 'Simulate Behavioral Model',
    description: 'Run the behavioural simulation of the project\'s test bench (or another top) for a time: its messages (report / $display, assertions), where it stopped, and the values of signals (the test bench\'s by default; hierarchical names as tb/uut/count) with their changes.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, top: STR('The simulation top (default: the project\'s test bench).'),
      time_ns: { type: 'number', description: 'How long to simulate, in ns (default 1000; at most 1e9).' },
      signals: { type: 'array', items: { type: 'string' }, description: 'The signals to return (names of the top, or paths through instances: uut/count).' },
      max_changes: { type: 'integer', description: 'The changes of each signal returned at most (default 20, the last ones).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, top, time_ns: timeNs = 1000, signals, max_changes: maxChanges = 20 }) {
      if (!(timeNs > 0) || timeNs > 1e9) throw toolError('time_ns: from 0 to 1e9 ns');
      const { srcs, design, top: mod, diags } = await elaborateView(name, { top, sim: true });
      const errors = diags.filter(d => d.severity === 'error');
      if (errors.length || !design?.top) return { text: [...errors.map(diagLine), `The simulation of <${mod}> did not start: ${errors.length} error(s) (check_syntax with simulation).`].join('\n'), data: { project: name, top: mod, started: false, errors: errors.map(diagJson) }, isError: true };
      const { Simulator } = await import('../core/simulator.js');
      const V = await import('../core/values.js');
      const log = [];
      const sim = new Simulator(design, { files: new Map(srcs.map(s => [s.path, s.text])), onLog: e => { if (log.length < 500) log.push({ timeNs: e.time / 1000, kind: e.kind, text: e.text }); } });
      // the signals by name: the top's, then through its instances (uut/count)
      const byPath = new Map();
      const walk = (inst, prefix) => {
        for (const p of inst.ports || []) if (!byPath.has(prefix + p.name)) byPath.set(prefix + p.name, p.sig);
        for (const s of inst.signals || []) if (!byPath.has(prefix + s.name)) byPath.set(prefix + s.name, s);
        for (const c of inst.children || []) walk(c, `${prefix}${c.name}/`);
      };
      walk(design.top, '');
      const wanted = signals?.length ? signals : [...byPath.keys()].filter(k => !k.includes('/'));
      const unknown = wanted.filter(n => !byPath.has(n) && !byPath.has(String(n).toLowerCase()));
      if (unknown.length) throw toolError(`no signal ${unknown.map(n => `'${n}'`).join(', ')} in <${mod}> (names of the top, or paths as uut/count)`);
      const st = sim.run(timeNs * 1000);
      const fmt = (s, v) => (s.t?.w === 1 ? V.toBin(v) : `${V.toBin(v).length <= 16 ? `"${V.toBin(v)}"` : `x"${V.format(v, 'hex')}"`}`);
      const sigs = {};
      for (const n of wanted) {
        const s = byPath.get(n) ?? byPath.get(String(n).toLowerCase());
        const w = s.wave;
        const changes = w ? w.t.map((t, i) => [t / 1000, fmt(s, w.v[i])]) : [];
        sigs[n] = { width: s.t?.w ?? null, final: changes.length ? changes.at(-1)[1] : null, changes: changes.slice(-Math.max(1, maxChanges)), totalChanges: changes.length };
      }
      const failed = st.finished === 'error' || log.some(l => l.kind === 'error' || l.kind === 'failure');
      const stopped = `Simulation of <${mod}> stopped at ${st.now / 1000} ns${st.finished ? ` (${st.finished})` : ''}.`;
      const text = [...diags.filter(d => d.severity !== 'error').map(diagLine), ...log.map(l => `[${l.timeNs.toFixed(3)} ns] ${l.kind === 'print' ? '' : `${l.kind.toUpperCase()}: `}${l.text}`), stopped,
        ...Object.entries(sigs).map(([n, s]) => `${n} = ${s.final ?? '(no value)'}${s.totalChanges > 1 ? ` (${s.totalChanges} changes)` : ''}`)].join('\n');
      return { text: clip(text), data: { project: name, top: mod, started: true, stoppedAtNs: st.now / 1000, finished: st.finished || null, failed, log, signals: sigs, warnings: diags.filter(d => d.severity !== 'error').map(diagJson) }, isError: false };
    },
  },
  {
    name: 'run_process', title: 'Run a process',
    description: 'Run a process of the project\'s top module and wait for it: synthesize, implement (translate, map, place & route), bitstream (Generate Programming File), timing (static timing), power (an estimate in the Silinx toolchain), pins (Back-annotate Pin Locations). With the Silinx toolchain (no ISE) by default when it is the configured one; toolchain: ise to use Xilinx ISE when it is configured. Returns the errors, the warnings and the end of the log.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, process: { type: 'string', enum: Object.keys(PROCESSES), description: 'The process.' },
      toolchain: { type: 'string', enum: ['silinx', 'ise'], description: 'The toolchain (default: the project\'s synthesis tool, else Toolchain Settings).' },
      log_lines: { type: 'integer', description: 'The lines of the end of the log returned (default 40).' },
      timeout_s: { type: 'integer', description: 'How long to wait, in seconds (default 1800).' },
    }, required: ['project', 'process'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async run({ project: name, process: proc, toolchain, log_lines: logLines = 40, timeout_s: timeoutS = 1800 }) {
      const pj = await readProject(name);
      const steps = PROCESSES[proc];
      if (!steps) throw toolError(`process: one of ${Object.keys(PROCESSES).join(', ')}`);
      if (!pj.top) throw toolError(`the project '${name}' has no top module`);
      const { startImplementation } = await import('./impl-routes.js');
      let job;
      try { job = await startImplementation(name, { steps, ...(toolchain ? { toolchain } : {}) }); } catch (e) { throw toolError(e.message); }
      const end = Date.now() + timeoutS * 1000;
      while (job.status === 'running' && Date.now() < end) await new Promise(r => setTimeout(r, 250));
      if (job.status === 'running') {
        const { cancelJob } = await import('./jobs.js');
        cancelJob(job.id);
        throw toolError(`the process ${proc} did not end in ${timeoutS} s: stopped`);
      }
      const redact = await redactor();
      const lines = job.lines.map(redact);
      const errors = lines.filter(l => /^ERROR/.test(l)), warnings = lines.filter(l => /^WARNING/.test(l));
      const ok = job.status === 'ok';
      const head = `Process "${proc}" of <${pj.top}> ${ok ? `completed successfully${warnings.length ? ` with ${warnings.length} warning(s)` : ''}` : `failed (${errors.length} error(s), ${warnings.length} warning(s))`}${job.meta?.toolchain === 'silinx' ? ' (Silinx toolchain)' : ' (Xilinx ISE)'}.`;
      return { text: clip([...errors, ...warnings, '…', ...lines.slice(-Math.max(1, logLines)), head].join('\n')),
        data: { project: name, process: proc, toolchain: job.meta?.toolchain === 'silinx' ? 'silinx' : 'ise', ok, errors, warnings, log: lines.slice(-Math.max(1, logLines)) }, isError: !ok };
    },
  },
  {
    name: 'get_report', title: 'Read a report',
    description: 'The Design Summary of the last run (summary: the utilization, the timing, the files, as JSON), or the text of a report of the last run: synthesis, map, par, timing, power, pins (with the Silinx toolchain: Yosys\'s statistics for synthesis, the pack and route summaries for map and par).',
    inputSchema: { type: 'object', properties: { project: PROJECT, report: { type: 'string', enum: ['summary', ...Object.keys(REPORT_FILES)], description: 'The report (default summary).' } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, report = 'summary' }) {
      const pj = await readProject(name);
      const redact = await redactor();
      if (report === 'summary') {
        const { projectReports } = await import('./impl-routes.js');
        const r = JSON.parse(redact(JSON.stringify(await projectReports(name))));
        if (r.available === false) return { text: `No report yet for '${name}': run a process (run_process).`, data: { project: name, report, available: false } };
        return { text: clip(JSON.stringify(r, null, 1)), data: { project: name, report, available: true, summary: r } };
      }
      if (!Object.hasOwn(REPORT_FILES.ise, report)) throw toolError(`report: summary or one of ${Object.keys(REPORT_FILES.ise).join(', ')}`);
      // the toolchain of the last run (its Design Summary), else the files there are
      const { projectReports } = await import('./impl-routes.js');
      const summary = await projectReports(name).catch(() => ({ available: false }));
      const top = pj.top || 'top';
      const open = summary.available !== false ? summary.source === 'open' : !fs.existsSync(path.join(P.projectDir(name), 'build', `${top}.syr`));
      const who = open ? 'Silinx toolchain' : 'Xilinx ISE';
      const file = REPORT_FILES[open ? 'open' : 'ise'][report]?.(top);
      if (!file) {
        const text = summary.available !== false && OPEN_REPORTS[report](summary);
        if (text) return { text: redact(text), data: { project: name, report, toolchain: 'silinx', path: 'build/reports.json', available: true } };
      } else {
        const full = await projectPath(name, file);
        if (fs.existsSync(full)) { const text = redact(await fsp.readFile(full, 'latin1')); return { text: clip(text), data: { project: name, report, toolchain: open ? 'silinx' : 'ise', path: file, available: true } }; }
      }
      const proc = { synthesis: 'synthesize', map: 'implement', par: 'implement', timing: 'timing', power: 'power', pins: 'pins' }[report];
      return { text: summary.available === false && !fs.existsSync(path.join(P.projectDir(name), 'build')) ? `No ${report} report for '${name}': no process has run yet (run_process ${proc}).`
        : `No ${report} report for '${name}' from its last run (${who}${file ? `: ${file}` : ''}): run_process ${proc} first.`, data: { project: name, report, toolchain: open ? 'silinx' : 'ise', available: false } };
    },
  },
];

// ------------------------------------------------------------------ the protocol
/** One request (or notification) of a client: its answer, or null for a notification. */
export async function handle(msg, state = {}) {
  const reply = result => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'invalid request');
  const isNotification = msg.id === undefined;
  if (isNotification) return null;   // notifications/initialized, notifications/cancelled…: nothing to answer
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      state.initialized = true;
      return reply({ protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS.map(({ run, ...t }) => t) });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === msg.params?.name);
      if (!tool) return fail(-32602, `unknown tool '${msg.params?.name}'`);
      const args = msg.params?.arguments || {};
      const known = Object.keys(tool.inputSchema.properties);
      const extra = Object.keys(args).filter(k => !known.includes(k));
      const missing = (tool.inputSchema.required || []).filter(k => args[k] === undefined);
      if (extra.length || missing.length) return reply({ content: [{ type: 'text', text: `${tool.name}: ${[missing.length ? `missing ${missing.join(', ')}` : '', extra.length ? `unknown ${extra.join(', ')}` : ''].filter(Boolean).join('; ')}` }], isError: true });
      try {
        const r = await tool.run(args);
        return reply({ content: [{ type: 'text', text: r.text }], structuredContent: r.data, isError: !!r.isError });
      } catch (e) {
        // a tool's failure is the tool's result (the model reads it), not a protocol error
        const redact = await redactor();
        return reply({ content: [{ type: 'text', text: redact(`${tool.name}: ${e.message || e}`) }], isError: true });
      }
    }
    default: return fail(-32601, `method not found: ${msg.method}`);
  }
}

/** Serve MCP on a pair of streams (stdin / stdout): one JSON-RPC message a line; the log on stderr. */
export function serveMcp({ input = process.stdin, output = process.stdout } = {}) {
  const state = {};
  const send = m => output.write(`${JSON.stringify(m)}\n`);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let pending = Promise.resolve();
  rl.on('line', line => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); return; }
    // (one at a time, in order: a process and a read of its report do not overlap)
    pending = pending.then(async () => {
      const batch = Array.isArray(msg) ? msg : [msg];
      const out = (await Promise.all(batch.map(m => handle(m, state)))).filter(Boolean);
      if (out.length) send(Array.isArray(msg) ? out : out[0]);
    }).catch(e => process.stderr.write(`silinx-ise mcp: ${e?.stack || e}\n`));
  });
  return new Promise(resolve => rl.on('close', () => pending.then(resolve)));
}
