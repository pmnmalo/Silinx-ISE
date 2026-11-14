// The MCP server in a design and simulation project (#3780, core/project-kind.js): what the interface hides there, its
// tools refuse, with the interface's messages: the flow (implementation, its reports, the board, the logic analyzer, the
// constraints, the device's wizards, Silinx HLS) and the HDL (an HDL, C, constraints or memory file added, read or
// written; an HDL test bench's skeleton, a module's language, a translation). server/mcp.js asks before every call.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { DESIGN_ONLY_MESSAGES as M, DESIGN_KIND, hdlSideFile, isDesignOnly, asDesignProject, toDesignProject } from '../core/project-kind.js';
import { toolError } from './mcp-util.js';
import { naturalCompare } from '../core/natural-order.js';

// the tools of the flow: none runs in a design project
const FLOW_TOOLS = new Set(['run_process', 'get_report', 'timing_paths', 'program_board', 'capture_settings', 'capture', 'check_constraints',
  'constraints_wizard', 'clock_manager', 'block_memory', 'set_process_properties', 'c_simulation', 'c_cosimulation', 'c_synthesis_report', 'c_generated']);
// new_source's types of the HDL side (the drawings, the labs are the design project's)
const HDL_TYPES = new Set(['module', 'test_bench', 'package', 'constraints', 'mem', 'c', 'cpp']);

/** Why the call of `tool` with `args` is refused in a design project (a message), or null: the project is not one, or
 *  the call is one of its tools. */
function designOnlyRefusal(tool, args, pj) {
  if (!isDesignOnly(pj)) return null;
  const hdl = p => (hdlSideFile(p) ? p : null);
  if (FLOW_TOOLS.has(tool)) return M.flow(pj.name);
  switch (tool) {
    case 'new_source': return HDL_TYPES.has(args.type) ? M.hdl(args.name || args.type) : null;
    case 'write_file': case 'add_to_project': return hdl(args.path) ? M.hdl(args.path) : null;
    case 'import_source': { const f = (args.files || []).find(hdl); return f ? M.hdl(f) : null; }
    case 'read_file': return hdl(args.path) ? M.hidden(args.path) : null;
    case 'set_source_properties': case 'convert_module': return M.hidden(args.path || args.module);
    case 'related_view': return args.view === 'translation' ? M.hidden(args.path) : null;
    default: return null;
  }
}

/** Throws the refusal of a call in a design project (designOnlyRefusal): the project named by its `project` argument. */
export async function checkDesignOnly(tool, args) {
  if (typeof args?.project !== 'string' || tool === 'set_design_properties') return;
  let pj;
  try { pj = await P.readProject(args.project); } catch { return; }   // (no such project: the tool says so)
  const why = designOnlyRefusal(tool, args, pj);
  if (why) throw toolError(why);
}

/** The HDL files a project's drawings generate (their `generatedFile`): the HDL that is no source of the user's own. */
async function generatedFiles(name) {
  const out = [];
  for (const f of (await P.fileTree(name)).filter(f => /\.(sch|asm|tt|bool|fsm|pn)\.json$/.test(f))) {
    try {
      const d = JSON.parse(await fs.readFile(path.join(P.projectDir(name), f), 'utf8'));
      if (typeof d.generatedFile === 'string') out.push(d.generatedFile);
    } catch { /* unreadable: none */ }
  }
  return out;
}

/** project_info of a design project: its top and test bench, its drawings and other files, no HDL, no device, board or
 *  constraints (what its Design pane and Files tab show). */
export function designProjectInfo(name, pj, tree) {
  const files = tree.filter(f => !/^build\//.test(f) && f !== 'silinx.json' && !hdlSideFile(f)).sort(naturalCompare);   // (#3819)
  const data = { project: name, kind: DESIGN_KIND, top: pj.top || null, simTop: pj.simTop || null, device: null, board: null, constraints: null, files };
  return { text: [`${name}: a design and simulation project (no FPGA), top ${data.top || '(none)'}, test bench ${data.simTop || '(none)'}`, ...files.map(f => `  ${f}`)].join('\n'), data,
    untrusted: 'the project\'s settings and files\' names' };
}

/** set_design_properties' design_only (Design Properties' "Design and simulation only (no FPGA)"): the project made a
 *  design project, refused when it has HDL or C sources of its own (core/project-kind.js toDesignProject). */
export async function makeDesignProject(name, pj, args) {
  if (isDesignOnly(pj)) throw toolError(`the project '${name}' is a design and simulation project already`);
  const other = ['board', 'variant', 'part', 'package', 'speed', 'synth_tool', 'preferred_language', 'update_constraints'].filter(k => args[k] !== undefined);
  if (other.length) throw toolError(`design_only: a design and simulation project has no ${other.join(', ')}`);
  const r = toDesignProject(pj, await generatedFiles(name));
  if (r.error) throw toolError(r.error);
  await P.updateProject(name, cur => asDesignProject(cur));
  const kept = pj.constraints && await fs.stat(path.join(P.projectDir(name), pj.constraints)).then(() => true, () => false) ? ` (${pj.constraints} left on the disk, out of the project)` : '';
  return { text: `${name}: a design and simulation project now (no FPGA): no board, no constraints${kept}; its HDL is not shown.`, data: { project: name, kind: DESIGN_KIND, board: null, device: null, constraints: null } };
}
