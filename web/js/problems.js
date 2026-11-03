// A drawing's problems go to the console (#2718, docs/UI-GUIDELINES.md "Messages"), never into its editor: the ASM, FSM
// and Petri net editors check their drawing as it is edited and say what they found here, a 'silinx-problems' event
// from the editor's element that the console takes (web/js/console.js): the drawing's file's entries of the Errors and
// Warnings tabs, each a click away from its item.
// detail: { tool, diags: [{ severity, message, … }], focus(d): its item selected and shown,
//           check: a check asked for (ASM's Validate), its name: its lines in the console too, under Design }

export function reportProblems(el, detail) {
  el.dispatchEvent(new CustomEvent('silinx-problems', { bubbles: true, detail }));
}
