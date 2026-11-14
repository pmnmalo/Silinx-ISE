// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The order of the modules' names wherever the hierarchy's names are listed (#3819): the Design pane's roots (the
// Implementation and the Simulation view), the module pickers, the MCP's project_info. Natural order: the digit runs
// compared by their value (access_next_state_2 before access_next_state_10; leading zeros not counted), the rest
// case-insensitively; names equal so (x_1, X_01) keep their order (Array.sort is stable). One collator, the same in the
// browser and in Node.
import { implRoots, topCandidates } from './elaborate.js';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Compares two names in natural order (a comparator for Array.sort). */
export const naturalCompare = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));

/** The names sorted in natural order (a copy), the top (`top`, any case) first when it is among them. */
export function hierarchyOrder(names, top = '') {
  const isTop = n => !!top && String(n).toLowerCase() === String(top).toLowerCase();
  return [...names].sort((a, b) => (isTop(a) === isTop(b) ? naturalCompare(a, b) : isTop(a) ? -1 : 1));
}

/** The roots of a view's hierarchy in the Design pane's order: the Implementation view's (`sim` false) the top first,
 *  the Simulation view's (no top) in natural order; `visible` a module of the view (core/elaborate.js). */
export function hierarchyRoots(lib, { sim = false, top = '', visible = () => true } = {}) {
  return sim ? hierarchyOrder(topCandidates(lib).filter(visible)) : hierarchyOrder(implRoots(lib, { top, visible }), top);
}
