// Silinx - the project's kind in New Project and Design Properties (#3780, core/project-kind.js): an FPGA project (a
// board and a device), or a design and simulation project (no board, no device, no flow, no HDL shown). New Project
// asks it first on its Project Settings page; Design Properties offers it as the first choice of its board list, both
// ways: a board (or None Specified and a device) makes a design project an FPGA project, the reverse is refused while
// the project has HDL or C sources of its own (the console says which).
import { DESIGN_KIND, DESIGN_ONLY_LABEL, toDesignProject } from '/core/project-kind.js';
import { S, app } from './app.js';
import { logError } from './console.js';

/** New Project's Project Kind choices. */
export const KIND_OPTIONS = [['fpga', 'FPGA design (a board and a device)'], [DESIGN_KIND, DESIGN_ONLY_LABEL]];
/** Design Properties' board list: the design and simulation choice first, then the boards (`boards`: boardOptions'). */
export const kindBoardOptions = boards => [[DESIGN_KIND, DESIGN_ONLY_LABEL], ...boards];

/**
 * Shows the fields of an FPGA project (`fpga`: the inputs of a form-grid, each after its label) only when `isDesign()`
 * says no, and a Top-Level Source Type (`topType`) without HDL then (a Schematic instead). Returns the function that
 * applies it (called again when the choice changes).
 */
export function kindFields(isDesign, fpga, topType = null) {
  const apply = () => {
    const d = isDesign();
    for (const el of fpga) for (const x of [el, el.previousElementSibling]) if (x) x.style.display = d ? 'none' : '';
    if (!topType) return;
    const hdl = [...topType.options].find(o => o.value === 'hdl');
    if (hdl) hdl.hidden = hdl.disabled = d;
    if (d && topType.value === 'hdl') { topType.value = 'sch'; topType.dispatchEvent(new Event('change')); }
  };
  apply();
  return apply;
}

/** Design Properties' "Design and simulation only" on an FPGA project: the project made a design project, or the
 *  refusal in the console (its HDL or C sources of its own). Returns whether it was made one. */
export async function makeDesignProject(pj) {
  const r = toDesignProject(pj, Object.keys(S.hdlToSch || {}));
  if (r.error) { logError(r.error); return false; }
  Object.assign(S.project, r.project);
  await app.saveProjectJson();
  await app.reloadProject();
  app.log(`${pj.name}: a design and simulation project now (no FPGA): no board, no constraints; its HDL is not shown.`, 'info');
  return true;
}
