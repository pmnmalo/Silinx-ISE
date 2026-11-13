// A project's kind (#3780): an FPGA project (every project before, `kind` absent), or a design and simulation project
// (`kind: 'design'`) for the classes that never touch an FPGA: drawings and simulation only, no board, no constraints, no
// implementation, emulation or programming, and no HDL shown. The core stays HDL-based: every drawing still makes its HDL
// file, checked and simulated as in any project; the project keeps an internal device (the default) for the core's
// checks, never shown. One set of rules and messages for the interface, the local server, the browser edition and the
// MCP server. Isomorphic module (browser + Node).

export const DESIGN_KIND = 'design';
/** The New Project and Design Properties choice. */
export const DESIGN_ONLY_LABEL = 'Design and simulation only (no FPGA)';

/** Whether a project (its silinx.json) is a design and simulation project. */
export const isDesignOnly = pj => pj?.kind === DESIGN_KIND;

// the files that belong to the HDL side of a project: HDL, C / C++ (Silinx HLS), constraints, memory images
const HDL_SIDE = /\.(vhdl?|v|sv|vh|svh|c|cc|cpp|cxx|h|hh|hpp|ucf|pcf|xdc|lpf|cst|mem|hex|coe)$/i;
const HDL_FILE = /\.(vhdl?|v|sv)$/i;
/** Whether `path` is a file of the HDL side (an HDL, C, constraints or memory file): none is added to a design project. */
export const hdlSideFile = path => HDL_SIDE.test(String(path || ''));
/** Whether `path` is an HDL file (generated from a drawing or a test bench in a design project: never shown). */
export const hdlFile = path => HDL_FILE.test(String(path || ''));

/** The messages (the interface's console and dialogs and the MCP server's results say the same). */
export const DESIGN_ONLY_MESSAGES = {
  hdl: path => `${path}: a design and simulation project has drawings only: choose a board in Design Properties to add HDL sources`,
  hidden: path => `${path}: a design and simulation project does not show its HDL (its drawings are its sources)`,
  flow: name => `the project '${name}' is a design and simulation project (no FPGA): choose a board in Design Properties to implement, emulate or program it`,
  toDesign: (name, files) => `the project '${name}' cannot become a design and simulation project: its HDL and C sources are not drawings (${files.join(', ')})`,
};

/** Why `path` cannot be added to the project `pj` (an HDL-side file in a design project), or null. */
export const addRefusal = (pj, path) => (isDesignOnly(pj) && hdlSideFile(path) ? DESIGN_ONLY_MESSAGES.hdl(path) : null);

/** A new project's silinx.json made a design project: no board, no constraints (the device kept, internal). */
export const asDesignProject = json => ({ ...json, kind: DESIGN_KIND, board: null, constraints: null });

/**
 * The project made an FPGA project for `board` and `device` (Design Properties' board, #3780): the kind dropped, the
 * board's device, its constraints file to be written (`constraints` the path, by the device's format: `ext`).
 */
export function asFpgaProject(pj, { board, device, ext = '.ucf' }) {
  const out = { ...pj, board: board ?? null, device: device || pj.device, constraints: pj.constraints || `constraints/top${ext}` };
  delete out.kind;
  return out;
}

/**
 * The design sources that keep an FPGA project from becoming a design project: its HDL and C sources that no drawing
 * makes (`generated`: the paths the project's drawings generate). Its test benches (simulation sources) are kept, as
 * the Test Bench Wizard's are: hidden.
 */
export function ownSources(pj, generated = []) {
  const gen = new Set(generated);
  return (pj.files || []).filter(f => f.role !== 'sim' && hdlSideFile(f.path) && !/\.(ucf|pcf|xdc|lpf|cst)$/i.test(f.path) && !gen.has(f.path)).map(f => f.path);
}

/** The project made a design project, or { error } (its own HDL or C sources, `ownSources`): no board, no constraints
 *  (the file left on the disk, out of the project). */
export function toDesignProject(pj, generated = []) {
  const own = ownSources(pj, generated);
  if (own.length) return { error: DESIGN_ONLY_MESSAGES.toDesign(pj.name, own) };
  return { project: asDesignProject(pj) };
}
