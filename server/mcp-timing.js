// The MCP server's tool of the timing paths (#3178, server/mcp.js, #2674), as the Static Timing Report's Paths panel:
// the slowest paths of the Silinx toolchain's timing analysis (build/open/paths.json, written by the timing process),
// and one path's stages with their delays and what its Show Path highlights (the source lines, the sites, the nets, and
// the elements of the drawings the lines are generated from: web/js/drawing-path.js's, core/path-drawing.js).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { toolError, readProject, projectPath, PROJECT } from './mcp-util.js';
import * as P from './projects.js';
import { betweenPaths, pathHighlight, pathsText } from '../packages/silinx-fpga/src/index.js';
import { drawingPath, pathNames } from '../core/path-drawing.js';
import { iseTimingPaths } from '../core/twr-paths.js';
import { join } from 'node:path';

export const PATHS_FILE = 'build/open/paths.json';
const DRAWING = /\.(fsm|asm|sch)\.json$/i;

// the drawings (state diagrams, ASM charts, schematics) whose HDL files a path's lines are in: their elements on it
async function drawingsOf(name, p, files) {
  const out = {};
  for (const f of (await P.fileTree(name)).filter(x => DRAWING.test(x)).sort()) {
    let m;
    try { m = JSON.parse(await P.readFile(name, f)); } catch { continue; }
    if (files.includes(m?.generatedFile)) out[f] = drawingPath(DRAWING.exec(f)[1].toLowerCase(), m, pathNames(p, m.generatedFile));
  }
  return out;
}
// a register of the analysis (one of its points) by its name, or by its last part when that is one register's
function register({ points, toolchain }, arg, value, name) {
  if (!points && toolchain === 'ise') throw toolError(`${arg}: Xilinx ISE's timing paths name no registers: the paths between two are the Silinx toolchain's (run_process timing with toolchain silinx)`);
  if (!points) throw toolError(`${arg}: the timing paths of '${name}' name no registers (an older analysis): run_process timing again`);
  if (points.includes(value)) return value;
  const want = String(value).toLowerCase();
  const by = points.filter(x => x.toLowerCase() === want || x.split('.').pop().toLowerCase() === want);
  if (by.length === 1) return by[0];
  if (by.length > 1) throw toolError(`${arg}: '${value}' is several registers: ${by.join(', ')}`);
  throw toolError(`${arg}: no register '${value}' (the registers: ${points.join(', ')})`);
}
// the toolchain of the project's last timing analysis: of the Silinx toolchain's paths and ISE's trce report, the newer;
// else the build folder's (an ISE synthesis report, a Vivado run)
function lastToolchain(name, pj) {
  const build = join(P.projectDir(name), 'build'), top = pj.top || 'top';
  const at = f => { try { return fs.statSync(join(build, f)).mtimeMs; } catch { return null; } };
  const open = at('open/paths.json'), ise = at(`${top}.twr`);
  if (open != null || ise != null) return (ise ?? -1) > (open ?? -1) ? 'ise' : 'silinx';
  return at('run.tcl') != null ? 'vivado' : at(`${top}.syr`) != null ? 'ise' : 'silinx';
}
// the last timing analysis's paths: the Silinx toolchain's (build/open/paths.json), ISE's (its trce report, back to the
// project's HDL: core/twr-paths.js); null when there are none
async function analysisOf(name, pj, tc) {
  if (tc === 'silinx') {
    const full = await projectPath(name, PATHS_FILE);
    return fs.existsSync(full) ? JSON.parse(await fsp.readFile(full, 'utf8')) : null;
  }
  if (tc !== 'ise') return null;
  const top = pj.top || 'top', full = await projectPath(name, `build/${top}.twr`);
  if (!fs.existsSync(full)) return null;
  const sources = (await P.readSources(name)).filter(x => !x.missing && x.role !== 'sim');
  return iseTimingPaths(await fsp.readFile(full, 'latin1'), sources, top);
}
const ITEM = { state: 'state', trans: 'transition', node: 'box', edge: 'arrow', sym: 'symbol', wire: 'wire' };

export const TIMING_TOOLS = [
  {
    name: 'timing_paths', title: 'Timing paths (Show Path)',
    description: 'The slowest paths of the last timing analysis (run_process timing: the Silinx toolchain\'s, or Xilinx ISE\'s trce, each stage back to the project\'s HDL by XST\'s names), as the Static Timing Report\'s Paths panel: the worst path into each flip-flop, slowest first, with its clock, its delay, its PERIOD and its slack; or, with from and / or to, the worst path between two registers. With path (1 = the slowest), that path\'s stages (clock-to-out, net, logic, setup: each one\'s delay and arrival, its instance, site and net, and the source lines of its logic) and what Show Path highlights: the source lines by file, the sites and the nets, and the elements of the drawings those lines are generated from (a state diagram\'s states and transitions, an ASM chart\'s boxes and arrows, a schematic\'s symbols and wires).',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      count: { type: 'integer', description: 'How many paths to list (default 10, at most the 20 the analysis keeps).' },
      path: { type: 'integer', description: 'A path\'s number in the list (1 = the slowest): its stages and its highlight.' },
      from: { type: 'string', description: 'Between two registers: the register the paths start from (a flip-flop\'s signal, as the list\'s registers name it, or its last part: level for u_speed.level). The list is then the worst path from it into each register it reaches (with to: into that one).' },
      to: { type: 'string', description: 'Between two registers: the register the paths end in (the worst path into it from each register that reaches it; with from: from that one).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, count = 10, path, from, to }) {
      const pj = await readProject(name);
      const tc = lastToolchain(name, pj);
      const r = await analysisOf(name, pj, tc);
      if (!r) {
        return { text: tc === 'vivado' ? `No timing paths for '${name}' from AMD Vivado yet: its timing summary is get_report timing.`
          : `No timing paths for '${name}': run_process timing first (${tc === 'ise' ? 'Xilinx ISE\'s trce' : 'the Silinx toolchain\'s timing analysis'}).`, data: { project: name, toolchain: tc, available: false } };
      }
      if (!Number.isInteger(count) || count < 1) throw toolError('count: a whole number from 1');
      // (between two registers: the worst path of each pair, from and / or to the ones chosen)
      const a = from === undefined || from === '' ? '' : register(r, 'from', from, name);
      const b = to === undefined || to === '' ? '' : register(r, 'to', to, name);
      const all = a || b ? betweenPaths(r, a, b) : r.paths;
      const head = { project: name, toolchain: tc, available: true, ...(r.points ? { registers: r.points } : {}), ...(a ? { from: a } : {}), ...(b ? { to: b } : {}) };
      if (path !== undefined && (!Number.isInteger(path) || path < 1 || path > all.length)) {
        throw toolError(all.length ? `path: from 1 to ${all.length}` : a || b ? `path: no path ${[a && `from ${a}`, b && `to ${b}`].filter(Boolean).join(' ')}` : `path: '${name}' has no path between two flip-flops to time`);
      }
      if (!all.length) return { text: a || b ? `No path ${[a && `from ${a}`, b && `to ${b}`].filter(Boolean).join(' ')} in '${name}'.` : `No path between two flip-flops of a clock to time in '${name}'.`, data: { ...head, paths: [] } };
      const list = { ...r, paths: all.slice(0, count) };
      if (path === undefined) {
        return { text: pathsText(list).join('\n'), data: { ...head, paths: list.paths.map(({ stages, from: fr, to: t, ...p }) => ({ ...p, ...(fr ? { fromRegister: fr, toRegister: t } : {}), from: `${stages[0].inst}.${stages[0].pin}`, to: `${stages.at(-1).inst}.${stages.at(-1).pin}` })) } };
      }
      const p = all[path - 1];
      const highlight = pathHighlight(p);
      highlight.drawings = await drawingsOf(name, p, Object.keys(highlight.files));
      const text = [...pathsText({ ...r, paths: all }, path - 1), ...Object.entries(highlight.drawings).map(([f, items]) => `  in ${f}: ${items.length ? items.map(x => `${ITEM[x.type]} ${x.label}`).join('; ') : 'none of its elements by name'}`)];
      return { text: text.join('\n'), data: { ...head, path: { number: path, ...p }, highlight } };
    },
  },
];
