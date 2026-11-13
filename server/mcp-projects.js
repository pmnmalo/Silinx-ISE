// The MCP server's tools of the projects and their files (server/mcp.js, #134): the examples, the projects,
// a new project, its top module and test bench, its settings and files, reading and writing a file.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { orderExamples } from '../core/examples.js';
import { TEST_DESIGNS, orderTestDesigns } from '../core/test-designs.js';
import { nameUnnamed } from '../core/schname.js';
import { DESIGN_KIND, isDesignOnly } from '../core/project-kind.js';
import { designProjectInfo } from './mcp-design-only.js';
import { toolError, clip, projectPath, readProject, elaborateView, diagLine, STR, PROJECT, deviceName, boardDevice, redactor } from './mcp-util.js';

// a project the MCP server makes is untrusted (#2981): its tools' results say so
const UNTRUSTED = ' It is untrusted, as every project an assistant makes: Xilinx ISE and programming a board or a PROM wait until the user trusts it in the interface (Trust Project); the Silinx toolchain runs.';

// a schematic's text with its unnamed instances named (#3300): { text, names }, or null when none is (or not JSON)
function nameInstances(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (!m || !Array.isArray(m.symbols)) return null;
  const names = nameUnnamed(m);
  return names.length ? { text: JSON.stringify(m, null, 1), names } : null;
}

export const PROJECT_TOOLS = [
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
    inputSchema: { type: 'object', properties: { name: STR('The new project\'s name: a letter, then up to 63 letters, digits, - and _.'), example: STR('The example, or test design (list_examples).'), board: STR('The board: basys2 or nexys2 (default: the example\'s).'), variant: STR('The board\'s variant: 100 or 250 for the Basys2, 500 or 1200 for the Nexys2.') }, required: ['name', 'example'], additionalProperties: false },
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
      try { await P.createProject({ name, template: example, device, board, madeBy: 'mcp' }); } catch (e) { throw toolError(e.message); }
      const pj = await P.readProject(name);
      return { text: `Project '${name}' made from the ${dir === P.EXAMPLES_DIR ? 'example' : 'test design'} ${example}: top ${pj.top}, ${pj.board || 'no board'} (${pj.device.part}${pj.device.package}${pj.device.speed}).${UNTRUSTED}`, data: { project: name, top: pj.top, simTop: pj.simTop || null, board: pj.board, device: pj.device, trusted: false } };
    },
  },
  {
    name: 'new_project', title: 'New empty project',
    description: 'Make a new empty project in the workspace for a board (basys2, nexys2; default: the Basys2-250\'s device, no board). Then write its sources with write_file (a test bench in sim/) and choose its top module and test bench with set_top. With design_only, a design and simulation project, as New Project\'s "Design and simulation only (no FPGA)": no board, no device, no constraints; its sources are drawings (new_source), simulated with test_bench_wizard and simulate; no implementation, emulation or programming, and its HDL is not shown (set_design_properties with a board makes it an FPGA project).',
    inputSchema: { type: 'object', properties: { name: STR('The new project\'s name: a letter, then up to 63 letters, digits, - and _.'), board: STR('The board: basys2 or nexys2.'), variant: STR('The board\'s variant: 100 or 250 for the Basys2, 500 or 1200 for the Nexys2.'), design_only: { type: 'boolean', description: 'A design and simulation project: drawings and simulation only, no board (default false).' } }, required: ['name'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ name, board, variant, design_only: designOnly = false }) {
      if (designOnly && (board || variant)) throw toolError('a design and simulation project has no board: give design_only or a board, not both');
      let device;
      if (board || variant) ({ board, device } = await boardDevice(board, variant));
      try { await P.createProject({ name, device, board, kind: designOnly ? DESIGN_KIND : null, madeBy: 'mcp' }); } catch (e) { throw toolError(e.message); }
      const pj = await P.readProject(name);
      if (designOnly) return { text: `Empty design and simulation project '${name}' made (no FPGA). Add its drawings with new_source, then set_top.`, data: { project: name, kind: DESIGN_KIND, board: null, device: null, trusted: false } };
      return { text: `Empty project '${name}' made: ${pj.board || 'no board'} (${deviceName(pj.device)}). Write its sources with write_file, then set_top.${UNTRUSTED}`, data: { project: name, board: pj.board || null, device: pj.device, trusted: false } };
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
      // (a design and simulation project, #3780: its HDL not shown, nor its internal device)
      if (isDesignOnly(pj)) return designProjectInfo(name, pj, await P.fileTree(name));
      const files = (pj.files || []).map(f => ({ path: f.path, lang: f.lang, role: f.role || 'design' }));
      const all = (await P.fileTree(name)).filter(f => !/^build\//.test(f));
      const data = { project: name, top: pj.top || null, simTop: pj.simTop || null, device: pj.device || null, board: pj.board || null, constraints: pj.constraints || null, synthTool: pj.synthTool || null, files, otherFiles: all.filter(f => !files.some(x => x.path === f) && f !== 'silinx.json') };
      return { text: [`${name}: top ${data.top || '(none)'}, test bench ${data.simTop || '(none)'}, ${data.board || 'no board'} (${data.device ? `${data.device.part}${data.device.package}${data.device.speed}` : 'no device'}), constraints ${data.constraints || '(none)'}`,
        ...files.map(f => `  ${f.path} (${f.lang}, ${f.role})`), ...(data.otherFiles.length ? [`  other files: ${data.otherFiles.join(', ')}`] : [])].join('\n'), data,
      // (its silinx.json's fields and its files' names: the project's own text, #3528)
      untrusted: 'the project\'s settings and files\' names' };
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
      // (a report or a log of build/ redacted as get_report's: the ISE machine's address never in a result, #3418)
      if (/^build\//i.test(P.relKey(P.projectDir(name), full))) text = (await redactor())(text);
      return { text: clip(text), data: { project: name, path: rel, length: text.length }, untrusted: `the file ${rel}` };
    },
  },
  {
    name: 'write_file', title: 'Write a file of a project',
    description: 'Write (create or replace) a file of a project. A new VHDL or Verilog file is added to the project (a test bench in sim/ or named tb_… as a simulation source). A drawing (a .sch, .asm, .fsm, .tt, .bool or .pn .json) makes its HDL file again, as its editor does when it is saved; one with errors leaves it as it was (Check Syntax then stops on it). A truth table\'s view options are in it too: "kmapOrder": "rows" lays its Karnaugh maps\' variables out MSB → LSB by rows, then columns (left out: by columns, then rows). A state diagram\'s transition is drawn as its editor draws a stroke (#3286): "bend" (px: its arc\'s bow from the straight line, signed; left out: straight, or beside a transition the other way) and a self-loop\'s "angle" (degrees: the direction of its loop from the state; left out: away from the other arrows); neither changes its HDL. A schematic\'s instance with an empty "name" is given its automatic name, inst_n (the next free one, not drawn), as its editor gives it when its name is cleared. The application\'s open editor of that file keeps its own text until it is reopened.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s path in the project, e.g. src/counter.vhd.'), text: STR('The whole text of the file.') }, required: ['project', 'path', 'text'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async run({ project: name, path: rel, text }) {
      await readProject(name);
      if (typeof text !== 'string') throw toolError('text: the whole text of the file');
      // the path as the project lists it: ./silinx.json is silinx.json (#1233)
      const full = await projectPath(name, rel, 'written');
      const key = P.relKey(P.projectDir(name), full);
      const low = P.foldName(key);   // (ſilinx.json is silinx.json on a case-insensitive file system, #2956)
      if (await P.isProjectFileAt(P.projectDir(name), full) || low === 'build' || low.startsWith('build/')) throw toolError(`'${rel}' is written by Silinx itself`);
      // what an assistant writes comes from outside: through the import gate (#2830), as a file added to a project
      const { GateError, gateFile } = await import('../core/import-gate.js');
      let gated;
      try { gated = gateFile(key, text); } catch (e) { throw e instanceof GateError ? toolError(`${e.path}: not written: ${e.reason}`) : e; }
      rel = key;
      // a schematic's instance with an empty name: its automatic name, inst_n, as the editor gives it (#3300)
      const named = /\.sch\.json$/i.test(rel) ? nameInstances(text) : null;
      if (named) text = named.text;
      const existed = (await P.fileTree(name)).includes(rel);
      try { await P.writeFile(name, rel, text); } catch (e) { throw toolError(e.message); }
      const added = !existed && (await P.readProject(name)).files.some(f => f.path === rel);
      // a drawing: its HDL file made again from it (#2674), as its editor does when it is saved
      const { adoptDrawing, syncDrawing } = await import('./drawing-sync.js');
      // (one with no HDL file yet gets it, #3184)
      const sync = await syncDrawing(P, name, rel) || await adoptDrawing(P, name, rel);
      return { text: [...(gated.warning ? [`WARNING: ${gated.warning}`] : []), `${existed ? 'Wrote' : 'Created'} ${rel} (${text.length} characters)${added ? ', added to the project' : ''}.`,
        ...(named?.names || []).map(n => `The instance ${n.id}, its name empty, named ${n.name} (an automatic name, not drawn).`), ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, created: !existed, addedToProject: added, ...(named ? { named: named.names } : {}), ...(sync ? { hdl: { file: sync.target, written: !!sync.written, removed: sync.removed, stale: sync.stale } } : {}) } };
    },
  },
];
