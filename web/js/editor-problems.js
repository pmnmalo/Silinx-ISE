// A drawing editor's problems (its chart's validation: the ASM chart's, #2730) in the console, never in the editor's
// window (#2718, docs/UI-GUIDELINES.md "Messages"): its errors and warnings in the Errors and Warnings tabs while it is
// open, updated as it is edited, a click on one going to its item; Validate writes them in the Console too, as a
// schematic's Check (tasks-check.js checkLines), each line's click going to its item.
//
//   const p = editorProblems({ file, tool: 'ASM', what: 'Validate', goto: (d) => … });
//   p.set(diags);    // the editor's validation ({ severity, message, … }), as it is now
//   p.log(diags);    // Validate: its lines in the Console, shown
//   p.clear();       // the editor closed
import { S } from './app.js';
import { log, renderDiagnostics, showConsolePage } from './console.js';
import { checkLines } from './tasks-check.js';
import { t, onLanguageChange } from './i18n.js';

const SHOW = 'Show it in the drawing';

export function editorProblems({ file, tool, what = 'Validate', goto }) {
  const mine = (d) => d.source === 'editor' && d.file === file;
  const set = (diags) => {
    S.diags = [...S.diags.filter((d) => !mine(d)), ...diags.filter((d) => d.severity === 'error' || d.severity === 'warning')
      .map((d) => ({ severity: d.severity, tool, message: d.message, file, line: 0, source: 'editor', goto: () => goto(d) }))];
    renderDiagnostics();
  };
  return {
    set,
    log(diags) {
      for (const l of checkLines(what, file.split('/').pop(), diags)) {
        log(l.text, l.cls, { diag: false });   // (the tabs: set's, kept as the chart is edited)
        if (!l.diag) continue;
        const ln = document.getElementById('console-log').lastElementChild;
        ln.classList.add('mc-link');
        ln.title = t(SHOW);
        ln.addEventListener('click', () => goto(l.diag));
      }
      showConsolePage('console');
    },
    clear: () => set([]),
  };
}
onLanguageChange(() => { for (const ln of document.querySelectorAll('#console-log .ln.mc-link')) ln.title = t(SHOW); });
