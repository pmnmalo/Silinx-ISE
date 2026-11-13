// The MCP server's tools of a project's settings (server/mcp.js, #2674): the devices and boards to choose from,
// Design Properties (the board, the device, the synthesis tool, the Preferred Language), Process Properties (the
// Optimization, the FPGA's start-up clock) and a drawing's Source Properties (its
// language), as the interface's dialogs (web/js/wizards.js projectProperties, implProperties, sourceProperties)
// set them: the same checks of a new device (web/js/device-change.js), the constraints file of its format
// (web/js/constraints-format.js), Update Constraints from the new board's pins, the drawings' HDL made again in
// their language (server/drawing-sync.js).
import fs from 'node:fs';
import path from 'node:path';
import * as P from './projects.js';
import { topForBoardText } from '../core/board-generics.js';
import { toolError, readProject, viewSourcesOf, STR, PROJECT, deviceName } from './mcp-util.js';
import { DESIGN_ONLY_MESSAGES, isDesignOnly } from '../core/project-kind.js';
import { makeDesignProject } from './mcp-design-only.js';

// the project's kind dropped when a design and simulation project is given a board or a device (#3780)
const withoutKind = (pj, drop) => { if (drop) delete pj.kind; return pj; };

// the device database (server/devices.js) and the toolchain package's checks, loaded on first use
const devices = () => import('./devices.js');
const parts = () => import('../packages/silinx-fpga/src/parts.js');

const SYNTH_TOOLS = ['silinx', 'xst', 'vivado'];   // (vivado: the Artix-7's, #3146)
const OPTIMIZATIONS = ['fast', 'area', 'speed'];
const STARTUP_CLOCKS = { jtag: 'JtagClk', cclk: 'CCLK', user: 'UserClk' };
// the Spartan-6's Map (#3138): Silinx's, or nextpnr's packer (on trial until its parity, #3139)
const S6_MAPS = ['silinx', 'nextpnr'];

// the issues of the design on a new device (web/js/device-change.js deviceChangeMessages): the primitives its
// family lacks, the resources the design needs more of than the part has
async function deviceChangeMessages(name, pj, next) {
  const D = await devices(), R = await parts();
  const to = D.findPart(next.part);
  if (!to) return [];
  const fromPart = D.findPart(pj.device?.part);
  const from = fromPart?.family || pj.device?.family;
  let instances = [], ports = 0;
  if (pj.top) {
    try {
      const { compile, elaborate } = await import('../core/compile.js');
      const { primitiveSources } = await import('../core/unisim.js');
      const srcs = await viewSourcesOf(name, pj, false);
      const top = elaborate(compile([...primitiveSources(srcs), ...srcs]), pj.top).top;
      instances = R.primitiveInstances(top);
      ports = (top?.ports || []).reduce((n, p) => n + (p.sig?.t?.w || 1), 0);
    } catch { /* a design that does not elaborate: its report only */ }
  }
  let used = {};
  try {
    const { projectReports } = await import('./impl-routes.js');
    if (fromPart) used = R.usedOfReport(await projectReports(name), R.resourcesOf(fromPart, pj.device.package));
  } catch { /* no report */ }
  const familyName = D.findFamily(to.family)?.displayName || to.family;
  return R.deviceChangeIssues({ from, to, pkg: next.package, familyName, instances, used, ports }).messages;
}

export const SETTINGS_TOOLS = [
  {
    name: 'list_devices', title: 'The devices and boards',
    description: 'The boards (with their variants and devices) and the devices (part, packages, speed grades, by family) a project can target, as Design Properties and New Project offer them; family narrows the devices to one family (spartan3e, spartan6, ice40…).',
    inputSchema: { type: 'object', properties: { family: STR('Only the devices of this family (its id, e.g. spartan3e).') }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ family }) {
      const D = await devices();
      const fams = family ? [D.findFamily(family)].filter(Boolean) : D.FAMILIES;
      if (family && !fams.length) throw toolError(`unknown family '${family}' (${D.FAMILIES.map(f => f.id).join(', ')})`);
      // (an experimental family's boards and devices, #3142: listed and marked, as the dialogs show them; no flow runs them yet)
      const R = await parts(), exp = o => (o ? { experimental: true } : {}), mark = o => (o.experimental ? ' [experimental: no implementation flow yet]' : '');
      const boards = D.BOARDS.map(b => ({ id: b.id, name: b.name, device: deviceName(D.resolveBoard(b.id).device), ...exp(R.experimentalDevice(b.device)),
        variants: (b.variants || []).map(v => ({ id: v.id, label: v.label, device: deviceName(v.device), ...(v.default ? { default: true } : {}) })) }));
      const families = fams.map(f => ({ id: f.id, name: f.displayName || f.name, ...exp(f.experimental),
        parts: D.partsOfFamily(f.id).map(p => ({ part: p.part, packages: Object.fromEntries(Object.entries(p.packages).map(([k, v]) => [k, v.speeds || p.speeds])) })) }));
      const text = [...(family ? [] : ['Boards:', ...boards.map(b => `  ${b.id}: ${b.name} (${b.variants.length ? b.variants.map(v => `${v.id} ${v.device}${v.default ? ', the default' : ''}`).join('; ') : b.device})${mark(b)}`), '']),
        'Devices:', ...families.flatMap(f => [`  ${f.name} (${f.id})${mark(f)}:`, ...f.parts.map(p => `    ${p.part}: ${Object.entries(p.packages).map(([k, s]) => `${k}${s.length ? ` ${s.join(' ')}` : ''}`).join(', ')}`)])];
      return { text: text.join('\n'), data: { ...(family ? {} : { boards }), families } };
    },
  },
  {
    name: 'set_design_properties', title: 'Design Properties',
    description: 'Change a project\'s target as Design Properties does: its board (its device then the board\'s; none: no board) or its device (part, package, speed), its synthesis tool (silinx: the Silinx toolchain; xst: Xilinx ISE; vivado: AMD Vivado, the Artix-7\'s default, its Silinx toolchain on trial) and its Preferred Language (the drawings\' HDL made again in it). A new device is checked against the design first (the primitives its family lacks, the resources it has too few of: warnings). With update_constraints, a new board\'s pins are written into the constraints file for the top\'s ports, as Update Constraints does: its pin locations are replaced.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, board: STR('The board (list_devices), or none for no board.'), variant: STR('The board\'s variant (list_devices; default: the board\'s default).'),
      part: STR('The device (list_devices), e.g. xc3s500e; with no board.'), package: STR('The device\'s package, e.g. fg320.'), speed: STR('The speed grade, e.g. -4.'),
      synth_tool: { type: 'string', enum: SYNTH_TOOLS, description: 'The synthesis tool.' },
      preferred_language: { type: 'string', enum: ['vhdl', 'verilog'], description: 'The Preferred Language: the drawings\' HDL (the drawings with no language of their own) made again in it.' },
      update_constraints: { type: 'boolean', description: 'With a new board: write its pins into the constraints file (default false).' },
      design_only: { type: 'boolean', description: 'true: make the project a design and simulation project (no board, no constraints, its HDL hidden), as Design Properties\' "Design and simulation only (no FPGA)"; refused when it has HDL or C sources of its own. A design and simulation project becomes an FPGA project with a board (or a device).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async run(args) {
      const { project: name, board, variant, part, package: pkg, speed, synth_tool: synthTool, preferred_language: language, update_constraints: constraints = false } = args;
      let pj = await readProject(name);
      // (a design and simulation project, #3780: made one; or one given a board or a device, an FPGA project then)
      if (args.design_only === true) return makeDesignProject(name, pj, args);
      const fromDesign = isDesignOnly(pj);
      if (fromDesign) {
        if (args.design_only === false && !(board && board !== 'none') && !part) throw toolError(`the project '${name}' is a design and simulation project: give a board (or a device) to make it an FPGA project`);
        if (!(board && board !== 'none') && !part) throw toolError(DESIGN_ONLY_MESSAGES.flow(name));
        pj = { ...pj, board: null, constraints: null };
      }
      const D = await devices(), R = await parts();
      if (board === undefined && variant === undefined && part === undefined && pkg === undefined && speed === undefined && synthTool === undefined && language === undefined) throw toolError('give board, part, package, speed, synth_tool or preferred_language');
      if (language !== undefined && !['vhdl', 'verilog'].includes(language)) throw toolError('preferred_language: vhdl or verilog');
      if (board && board !== 'none' && (part || pkg || speed)) throw toolError('give a board or a device (part, package, speed), not both: a board\'s device is its own');
      let nextBoard = pj.board || null, next = { ...pj.device };
      if (board === 'none' || board === '') nextBoard = null;
      else if (board || variant) {
        const id = board || pj.board;
        if (!id) throw toolError('variant: the project has no board (give board)');
        const r = D.resolveBoard(id, { variant });
        if (!r) throw toolError(`unknown board '${id}' (list_devices)`);
        if (variant && r.variant?.id !== variant) throw toolError(`the ${r.board.name} has no variant '${variant}'`);
        nextBoard = r.board.id;
        next = r.device;
      }
      if (part || pkg || speed) {
        if (nextBoard) throw toolError(`the project's device is its board's (${nextBoard}): give board none to choose a device`);
        // (a new part's package and speed: given, or its only one)
        const p = D.findPart(part || next.part);
        if (part && !p) throw toolError(`${D.validateDevice({ part }).join('; ')} (list_devices)`);
        const only = (list, what) => {
          if (list.length === 1) return list[0];
          throw toolError(`${what}: the ${p.part.toUpperCase()} has ${list.length ? list.join(', ') : 'none'}`);
        };
        const newPart = part && p.part !== next.part;
        const pk = String(pkg || (newPart ? only(Object.keys(p.packages), 'package') : next.package)).toLowerCase();
        const speeds = p.packages[pk]?.speeds || p.speeds;
        const sp = speed !== undefined ? String(speed) : newPart || pkg ? (speeds.length ? only(speeds, 'speed') : '') : next.speed;
        next = { family: p.family, part: p.part, package: pk, speed: sp && !sp.startsWith('-') ? `-${sp}` : sp };
      }
      const errs = D.validateDevice(next);
      if (errs.length) throw toolError(`${errs.join('; ')} (list_devices)`);
      // a family ISE does not implement: the Silinx toolchain's only (as the dialog locks it)
      const tool = synthTool || pj.synthTool || null;
      if (R.openOnlyDevice(next) && tool === 'xst') throw toolError(`the ${next.part.toUpperCase()} is the Silinx toolchain's only: no XST`);
      // (an experimental family, #3142: no flow runs it yet, the synthesis tool locked as the dialog locks it)
      const experimental = R.experimentalDevice(next);
      // (the Artix-7: AMD Vivado's on this server, #1649)
      const vivado = R.vivadoDevice(next);
      if (experimental && synthTool === 'xst') throw toolError(vivado ? `the ${next.part.toUpperCase()} is implemented by AMD Vivado: no XST` : `${R.noFlowMessage(next)}: no XST`);
      if (synthTool === 'vivado' && !vivado) throw toolError(`AMD Vivado implements the Artix-7 devices, not the ${next.part.toUpperCase()}`);
      // (#3146) the Artix-7's synthesis tool: the one given, else the project's when it was one of the Artix-7's, else AMD Vivado;
      // another family's never Vivado (the project's, from an Artix-7: Silinx)
      const synthOf = () => (vivado ? { synthTool: synthTool || (R.vivadoDevice(pj.device) && ['vivado', 'silinx'].includes(pj.synthTool) ? pj.synthTool : 'vivado') }
        : R.openOnlyDevice(next) || experimental ? { synthTool: 'silinx' } : synthTool ? { synthTool } : pj.synthTool === 'vivado' ? { synthTool: 'silinx' } : {});
      const warnings = [];
      const deviceChanged = next.part !== pj.device?.part || next.package !== pj.device?.package;
      if (deviceChanged) for (const m of await deviceChangeMessages(name, pj, next)) warnings.push(`WARNING: ${next.part.toUpperCase()}: ${m}`);
      const changed = nextBoard !== (pj.board || null) || deviceChanged;
      if (constraints && !(changed && nextBoard && pj.top)) throw toolError(nextBoard ? (pj.top ? 'update_constraints: the board did not change' : `the project '${name}' has no top module: its constraints cannot come from a board's pins`) : 'update_constraints: the project has no board');
      // the constraints of the new device's format (UCF, the iCE40's PCF, the ECP5's LPF, the Gowin's CST, the 7-series' XDC)
      const ext = R.constraintsExtOf(next);
      let constraintsFile = fromDesign ? `constraints/top${ext}` : pj.constraints;
      if (constraintsFile && !constraintsFile.toLowerCase().endsWith(ext)) {
        const old = constraintsFile;
        constraintsFile = old.replace(/\.[^./]*$/, '') + ext;
        if (fs.existsSync(path.join(P.projectDir(name), old))) warnings.push(`WARNING: this device's constraints are ${ext.slice(1).toUpperCase()}: ${constraintsFile} is the project's now, ${old} was not converted.`);
      }
      const oldLang = pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl';
      await P.updateProject(name, p => withoutKind({ ...p, board: nextBoard, device: next, constraints: constraintsFile, ...synthOf(), ...(language ? { preferredLanguage: language } : {}) }, fromDesign));
      // every drawing in the new language, its HDL file made again in it (#1477)
      const languageLines = [];
      if (language && language !== oldLang) {
        const { drawingsInLanguage } = await import('./drawing-sync.js');
        const r = await drawingsInLanguage(P, name, language);
        languageLines.push(`Preferred Language: ${language === 'verilog' ? 'Verilog' : 'VHDL'}${r.changed.length ? ` (${r.changed.length} drawing(s) now in it, their HDL made again in it)` : ''}.`, ...r.messages);
        warnings.push(...r.messages.filter(m => /^WARNING/.test(m)));
      }
      const after = await P.readProject(name);
      // another board: its clock and its inputs' levels as the defaults of the top's generics (#3710), as the dialog does
      const generics = changed && nextBoard && nextBoard !== (pj.board || null) ? await P.boardGenerics(P.projectDir(name), after) : null;
      if (generics) languageLines.push(topForBoardText(generics, generics.board));
      const pins = [];
      if (constraints) await P.boardConstraints(P.projectDir(name), after);
      else if (changed && !nextBoard && after.constraints && fs.existsSync(path.join(P.projectDir(name), after.constraints))) pins.push(`WARNING: check the pin locations in ${after.constraints} — they must exist on the ${next.package.toUpperCase()} package.`);
      warnings.push(...pins);
      // (after the device, as the dialog's console says it)
      const noFlow = experimental && !vivado ? [`WARNING: ${R.noFlowMessage(next)}.`] : [];
      warnings.push(...noFlow);
      const text = [...warnings.filter(w => !pins.includes(w) && !languageLines.includes(w) && !noFlow.includes(w)), ...languageLines, ...(fromDesign ? [`${name}: an FPGA project now: its HDL and its implementation shown.`] : []), `Device set to ${next.part}${next.speed}-${next.package}${nextBoard ? ` (board ${nextBoard})` : ''}; synthesis tool ${after.synthTool || 'of Toolchain Settings'}${constraints ? `; ${after.constraints} written from the ${nextBoard}'s pins` : ''}.`, ...pins, ...noFlow];
      return { text: text.join('\n'), data: { project: name, board: nextBoard, device: next, synthTool: after.synthTool || null, preferredLanguage: after.preferredLanguage || 'vhdl', constraints: after.constraints || null, constraintsUpdated: constraints, generics: generics ? { file: generics.path, ...generics.values } : null, warnings } };
    },
  },
  {
    name: 'set_process_properties', title: 'Process Properties',
    description: 'Change a project\'s Process Properties: the Optimization (fast: one mapping and one placement, the quickest build; area: the smallest circuit; speed: the fastest circuit, several placements tried), and the FPGA start-up clock (jtag when programming over JTAG; cclk when booting from the PROM or flash; user); on a Spartan-6, its Map (s6_map: silinx, Silinx\'s own, the default; nextpnr, on trial: nextpnr packs Yosys\'s netlist too). The Silinx toolchain places and routes with nextpnr.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      optimization: { type: 'string', enum: OPTIMIZATIONS, description: 'The Optimization.' },
      startup_clock: { type: 'string', enum: Object.keys(STARTUP_CLOCKS), description: 'The FPGA start-up clock.' },
      s6_map: { type: 'string', enum: S6_MAPS, description: 'A Spartan-6\'s Map: silinx (the default) or nextpnr (on trial).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, optimization, startup_clock: clock, s6_map: map }) {
      const pj = await readProject(name);
      if (!optimization && !clock && !map) throw toolError('give optimization, startup_clock or s6_map');
      const { familyProfile } = await import('../core/family-profile.js');
      const s6 = !!familyProfile((await parts()).deviceFamily(pj.device)).mapChoice;   // (a Spartan-6's Map, as Process Properties shows it)
      if (map && !S6_MAPS.includes(map)) throw toolError(`s6_map: one of ${S6_MAPS.join(', ')}`);
      if (map && !s6) throw toolError(`s6_map: the project's device (${deviceName(pj.device)}) is not a Spartan-6`);
      if (optimization && !OPTIMIZATIONS.includes(optimization)) throw toolError(`optimization: one of ${OPTIMIZATIONS.join(', ')}`);
      if (clock && !STARTUP_CLOCKS[clock]) throw toolError(`startup_clock: one of ${Object.keys(STARTUP_CLOCKS).join(', ')}`);
      const { synthGoal, GOAL_IMPL } = await import('../packages/silinx-fpga/src/index.js');
      const { s6MapOf } = await parts();
      // (a place and route engine saved by an earlier version, #2136: dropped, nextpnr the one engine since #2137)
      await P.updateProject(name, p => {
        const { engine, s6Map, ...impl } = p.impl || {};
        return { ...p, impl: { ...impl, ...(optimization ? GOAL_IMPL[optimization] : {}), ...(clock ? { startupClk: STARTUP_CLOCKS[clock] } : {}), ...(s6MapOf({ s6Map: map ?? s6Map }) === 'nextpnr' ? { s6Map: 'nextpnr' } : {}) } };
      });
      const impl = (await P.readProject(name)).impl || {};
      const data = { project: name, optimization: synthGoal(impl), startupClock: Object.keys(STARTUP_CLOCKS).find(k => STARTUP_CLOCKS[k] === (impl.startupClk || 'JtagClk')), ...(s6 ? { s6Map: s6MapOf(impl) } : {}) };
      return { text: `${name}: Optimization ${data.optimization}, FPGA start-up clock ${data.startupClock}${s6 ? `, Map ${data.s6Map === 'nextpnr' ? 'nextpnr (on trial)' : 'Silinx'}` : ''}.`, data };
    },
  },
  {
    name: 'set_source_properties', title: 'Source Properties',
    description: 'Choose a drawing\'s language, as Source Properties does: vhdl or verilog (its own: it keeps it when the Preferred Language changes), or project (the project\'s Preferred Language, following it). Its HDL file is then made in that language, the one in the other language removed. A drawing (or its HDL file); HDL written by hand, or a drawing made from its HDL, has no choice.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The drawing (e.g. src/traffic.fsm.json) or its HDL file.'), language: { type: 'string', enum: ['vhdl', 'verilog', 'project'], description: 'Its language, or project (the Preferred Language).' } }, required: ['project', 'path', 'language'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async run({ project: name, path: rel, language }) {
      await readProject(name);
      if (!['vhdl', 'verilog', 'project'].includes(language)) throw toolError('language: vhdl, verilog or project');
      const S = await import('./drawing-sync.js');
      // the drawing, or the drawing of an HDL file (its generatedFile)
      const tree = await P.fileTree(name);
      let drawing = null;
      if (tree.includes(rel) && await S.drawingLanguage(P, name, rel)) drawing = rel;
      else for (const f of tree.filter(f => /\.(sch|asm|tt|bool|fsm|pn)\.json$/i.test(f))) {
        try { if (JSON.parse(await P.readFile(name, f)).generatedFile === rel && await S.drawingLanguage(P, name, f)) { drawing = f; break; } } catch { /* not a drawing */ }
      }
      if (!drawing) throw toolError(tree.includes(rel) ? `'${rel}' has no language to choose: HDL written by hand, or a drawing made from its HDL` : `no file '${rel}' in the project '${name}'`);
      const r = await S.setSourceLanguage(P, name, drawing, language === 'project' ? '' : language);
      const L = r.language === 'verilog' ? 'Verilog' : 'VHDL';
      return { text: [...r.messages, `${drawing}: ${L}${language === 'project' ? ' (the project\'s Preferred Language)' : ''}${r.changed ? '' : ', as it was'}.`].join('\n'), data: { project: name, drawing, language: r.language, own: language !== 'project', changed: r.changed, messages: r.messages } };
    },
  },
];
