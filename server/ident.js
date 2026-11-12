// A project's module names (its top and its simulation top, #1431): a plain HDL identifier, as XST takes it
// (VHDL extended identifiers are not used). The names go into run.sh and name the build's files
// (build/<top>.bit, <top>.ncd…): one that is not an identifier would name a path outside the project.
import { IDENT_RE } from '../core/ident.js';
export const IDENT = IDENT_RE;

/** The error of a project description whose `top` or `simTop` is not an identifier (an empty one is
 *  "no top yet": fine), or null. */
export function topNameError(pj) {
  for (const key of ['top', 'simTop']) {
    const v = pj?.[key];
    if (v == null || v === '') continue;
    if (typeof v !== 'string' || !IDENT.test(v)) return `invalid ${key === 'top' ? 'top' : 'simulation top'} module name '${v}' (a letter or _, then letters, digits and _)`;
  }
  return null;
}
