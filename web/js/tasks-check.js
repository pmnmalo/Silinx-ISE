// The Tasks interface's Edit: a schematic's Check in the console below (#993, #782), as every process's messages are
// (the message centre, web/js/messages.js): a header, its errors and warnings, its result, under the Design source;
// each message's line takes the editor to the item it is about. The editor's own panel is not shown there: the
// editor asks first (web/js/sch-editor.js showDiags, a cancelable 'silinx-diagnostics' event).
// checkLines has no DOM and is unit tested (test/tasks.test.js).
import { t, onLanguageChange } from './i18n.js';

const SHOW = 'Show it in the drawing';
const SEVERITY = { error: ['ERROR', 'err'], warning: ['WARNING', 'warn'] };

/** The console's lines of a check `what` of `name` that found `diags` ({ severity, message }): { text, cls, diag? }. */
export function checkLines(what, name, diags) {
  const errs = diags.filter(d => d.severity === 'error').length, warns = diags.filter(d => d.severity === 'warning').length;
  return [
    { text: `\nStarted : "${what}" of ${name}.\n`, cls: 'hdr' },
    ...diags.map(d => { const [tag, cls] = SEVERITY[d.severity] || ['INFO', '']; return { text: `${tag}: ${d.message}`, cls, diag: d }; }),
    errs ? { text: `\nProcess "${what}" failed`, cls: 'err' }
      : { text: `\nProcess "${what}" completed successfully${warns ? ` with ${warns} warning(s)` : ''}`, cls: 'ok' },
  ];
}

/** Writes a schematic's Check in the console (`log`: web/js/console.js) while `on()` (the Tasks interface),
 *  `showConsole()` opening it. */
export function initCheckMessages(on, showConsole, log) {
  document.addEventListener('silinx-diagnostics', e => {
    const { what, name, diags, focus } = e.detail;
    if (!on() || what !== 'Check Schematic') return;   // (a Try it refused: the editor's panel, beside the drawing)
    e.preventDefault();
    for (const l of checkLines(what, name, diags)) {
      log(l.text, l.cls, { diag: !!l.diag });   // (the Errors and Warnings tabs: its errors and warnings, not its result)
      if (!l.diag) continue;
      const ln = document.getElementById('console-log').lastElementChild;
      ln.classList.add('mc-link');
      ln.title = t(SHOW);   // (the console's lines are not translated: their tooltip here, again when the language changes)
      ln.addEventListener('click', () => focus(l.diag));
    }
    showConsole();
  });
  onLanguageChange(() => { for (const ln of document.querySelectorAll('#console-log .ln.mc-link')) ln.title = t(SHOW); });
}
