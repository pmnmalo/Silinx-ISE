// The MCP server's tool of the timing paths (#3178, server/mcp.js, #2674), as the Static Timing Report's Paths panel:
// the slowest paths of the Silinx toolchain's timing analysis (build/open/paths.json, written by the timing process),
// and one path's stages with their delays and what its Show Path highlights (the source lines, the sites, the nets, and
// the elements of the drawings the lines are generated from: web/js/drawing-path.js's, core/path-drawing.js).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { toolError, readProject, projectPath, PROJECT } from './mcp-util.js';
import * as P from './projects.js';
import { pathHighlight, pathsText } from '../packages/silinx-fpga/src/index.js';
import { drawingPath, pathNames } from '../core/path-drawing.js';

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
const ITEM = { state: 'state', trans: 'transition', node: 'box', edge: 'arrow', sym: 'symbol', wire: 'wire' };

export const TIMING_TOOLS = [
  {
    name: 'timing_paths', title: 'Timing paths (Show Path)',
    description: 'The slowest paths of the last timing analysis of the Silinx toolchain (run_process timing), as the Static Timing Report\'s Paths panel: the worst path into each flip-flop, slowest first, with its clock, its delay, its PERIOD and its slack. With path (1 = the slowest), that path\'s stages (clock-to-out, net, logic, setup: each one\'s delay and arrival, its instance, site and net, and the source lines of its logic) and what Show Path highlights: the source lines by file, the sites and the nets, and the elements of the drawings those lines are generated from (a state diagram\'s states and transitions, an ASM chart\'s boxes and arrows, a schematic\'s symbols and wires).',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      count: { type: 'integer', description: 'How many paths to list (default 10, at most the 20 the analysis keeps).' },
      path: { type: 'integer', description: 'A path\'s number in the list (1 = the slowest): its stages and its highlight.' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, count = 10, path }) {
      await readProject(name);
      const full = await projectPath(name, PATHS_FILE);
      if (!fs.existsSync(full)) return { text: `No timing paths for '${name}': run_process timing first (the Silinx toolchain's timing analysis).`, data: { project: name, available: false } };
      const r = JSON.parse(await fsp.readFile(full, 'utf8'));
      if (!Number.isInteger(count) || count < 1) throw toolError('count: a whole number from 1');
      if (path !== undefined && (!Number.isInteger(path) || path < 1 || path > r.paths.length)) throw toolError(r.paths.length ? `path: from 1 to ${r.paths.length}` : `path: '${name}' has no path between two flip-flops to time`);
      if (!r.paths.length) return { text: `No path between two flip-flops of a clock to time in '${name}'.`, data: { project: name, available: true, paths: [] } };
      const list = { ...r, paths: r.paths.slice(0, count) };
      if (path === undefined) {
        return { text: pathsText(list).join('\n'), data: { project: name, available: true, paths: list.paths.map(({ stages, ...p }) => ({ ...p, from: `${stages[0].inst}.${stages[0].pin}`, to: `${stages.at(-1).inst}.${stages.at(-1).pin}` })) } };
      }
      const p = r.paths[path - 1];
      const highlight = pathHighlight(p);
      highlight.drawings = await drawingsOf(name, p, Object.keys(highlight.files));
      const text = [...pathsText(r, path - 1), ...Object.entries(highlight.drawings).map(([f, items]) => `  in ${f}: ${items.length ? items.map(x => `${ITEM[x.type]} ${x.label}`).join('; ') : 'none of its elements by name'}`)];
      return { text: text.join('\n'), data: { project: name, available: true, path: { number: path, ...p }, highlight } };
    },
  },
];
