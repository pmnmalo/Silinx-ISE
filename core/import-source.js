// Import Source / Add Copy of Source / Import Test Bench (#1385, #1501; out of web/js/wizards.js addSourceDialog for the
// MCP's import_source, #3546): where a file copied into a project goes, its passage through the import gate (#2830)
// and the check of a drawing's name (#679), and the project's description after the copies (their association, the
// constraints file). No DOM and no disk: the dialog's and the MCP tool's.
import { gateFile, GateError } from './import-gate.js';
import { reservedError } from './reserved.js';

/** The files Import Source takes (the dialog's `accept`). */
export const IMPORT_SOURCE_ACCEPT = '.v,.vhd,.vhdl,.ucf,.pcf,.lpf,.cst,.mem,.hex,.asm.json,.json';
/** The associations of a copy: All, Implementation only, Simulation only (Import Test Bench's). */
export const IMPORT_SOURCE_ROLES = [['design', 'All (Implementation + Simulation)'], ['impl', 'Implementation only'], ['sim', 'Simulation only']];
const CONSTRAINTS = ['ucf', 'pcf', 'lpf', 'cst', 'xdc'];

const extOf = name => String(name).split('.').pop().toLowerCase();
/** A constraints file (it goes to constraints/, and may become the project's constraints). */
export const isConstraintsFile = name => CONSTRAINTS.includes(extOf(name));
/** A file Import Source takes, by its name. */
export const importSourceTakes = name => IMPORT_SOURCE_ACCEPT.split(',').some(e => String(name).toLowerCase().endsWith(e));

/** The path in the project of the copy of a file named `name`: constraints/, sim/ (association sim), else src/. */
export function importSourcePath(name, role) {
  const dir = isConstraintsFile(name) ? 'constraints' : role === 'sim' ? 'sim' : 'src';
  return `${dir}/${name}`;
}

/** One file's copy (`name` its name, `data` its bytes): { path, text, warning } to write (`warning`: the gate's, or
 *  null), or { path, refused: 'gate' | 'reserved', message } (the console's warning, or the alert's text). */
export function importSourceFile(name, data, role) {
  const path = importSourcePath(name, role);
  let text, warning = null;
  try {
    const g = gateFile(path, data);
    warning = g.warning || null;
    text = g.text ?? new TextDecoder().decode(g.data);
  } catch (e) {
    if (!(e instanceof GateError)) throw e;
    return { path: e.path, refused: 'gate', message: `${e.path}: not imported: ${e.reason}` };
  }
  // a drawing named with a reserved word of VHDL or Verilog (its HDL is generated): refused (#679); an HDL file's
  // module, written in its own language, is said once the project is read again
  if (/\.json$/i.test(name)) {
    let bad = null;
    try { bad = reservedError(JSON.parse(text)?.name); } catch { /* not a drawing */ }
    if (bad) return { path, refused: 'reserved', message: `${name}: ${bad}: rename the module in the file first.` };
  }
  return { path, text, warning };
}

/** The project's description (`pj`, changed) after the copies (`written`: their paths, in order; `tree`: the project's
 *  files before them): their association, and a constraints file copied the project's constraints when the project's
 *  own is not among its files. */
export function assignImported(pj, written, role, tree) {
  for (const path of written) {
    if (isConstraintsFile(path) && !tree.includes(pj.constraints)) pj.constraints = path;
    const e = (pj.files || []).find(x => x.path === path);
    if (e) e.role = role;
  }
  return pj;
}
