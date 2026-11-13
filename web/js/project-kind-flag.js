// Silinx - the open project's kind on the page (#3780): <html data-project-kind="design"> while a design and simulation
// project is open, so that the editors (loaded without the app too: a link's page, their unit tests) hide what is HDL
// (a schematic's Language, a state diagram's Coding Style, a truth table's HDL notations) without importing the app.
// No imports.

/** Marks the page with the project's kind (null: none open). */
export function setKindFlag(pj) {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  if (pj?.kind === 'design') root.dataset.projectKind = 'design'; else delete root.dataset.projectKind;
}
/** Whether a design and simulation project is open. */
export const designKind = () => globalThis.document?.documentElement.dataset.projectKind === 'design';
