// The Handwritten Boolean Algebra dialog (#1066, named so #2017): the user draws a truth table on the pad (ink-pad.js) — the names in a
// header, a line under it, a line between the inputs and the outputs, a row of 0, 1 or X for each combination — and
// Silinx's own recognizer (core/ink/table.js, offline) reads it after each stroke into the table's text, which the
// user corrects before it fills the table. The user's samples of their handwriting (ink-dialog.js) are used too.
//
//   await handwrittenTable({ check }) -> { inputs, outputs, table, text } | null
//     check(result) -> an error message or null (the editor's own rules: reserved names...)
// Styles: web/css/ink.css.
import { h, dialog } from './ui.js';
import { mountInkPad, padButtons } from './ink-pad.js';
import { drawingButtons } from './ink-drawing.js';
import { inkTemplates } from './ink-dialog.js';
import { readTable, tableFromText } from '/core/ink/table.js';
import { InkError } from '/core/ink/segment.js';

export function handwrittenTable({ check = () => null, title = 'Handwritten Boolean Algebra' } = {}) {
  const templates = inkTemplates();
  let timer = null;
  const text = h('textarea', { class: 'ink-table-text', spellcheck: 'false', rows: 8, placeholder: 'A B | F\n0 0 | 0\n0 1 | 1' });
  const msg = h('div', { class: 'ink-msg' });
  const showMsg = (lines, kind = 'warn') => { msg.className = `ink-msg ink-${kind}`; msg.replaceChildren(...lines.map(l => h('div', {}, l))); };
  const padHost = h('div', { class: 'ink-pad ink-pad-table' });
  const pad = mountInkPad(padHost, { onStroke: () => { clearTimeout(timer); timer = setTimeout(recognize, 350); } });
  const flush = () => { if (timer) { clearTimeout(timer); recognize(); } };
  // the errors and warnings of the text (and of the reading, after a stroke); ok: the table can fill the editor's
  const verdict = (readErrors = [], readWarnings = []) => {
    const r = tableFromText(text.value);
    const e = r.errors.length ? null : check(r);
    const errors = [...readErrors, ...r.errors, ...(e ? [e] : [])], warnings = [...readWarnings, ...r.warnings];
    showMsg([...errors, ...warnings], errors.length || warnings.length ? 'warn' : 'ok');
    return !r.errors.length && !e;
  };
  function recognize() {
    timer = null;
    const strokes = pad.strokes();
    if (!strokes.length) { text.value = ''; showMsg([]); return; }
    try {
      const r = readTable(strokes, { templates });
      text.value = r.text;
      verdict(r.errors, r.warnings);
    } catch (e) {
      if (!(e instanceof InkError)) throw e;
      text.value = '';
      showMsg([e.message]);
    }
  }
  text.addEventListener('input', () => verdict());
  // Undo, Redo, Clear; Copy Drawing and Paste Drawing (#1749)
  const padRow = padButtons(pad);
  padRow.append(...drawingButtons(pad, { kind: 'table', read: () => text.value }));
  // the pad tall, on the left (a table is written down the page, #2007); the hint, the buttons and the table read beside it
  const body = h('div', { class: 'ink-dialog ink-portrait' },
    padHost,
    h('div', { class: 'ink-side' },
      h('div', { class: 'hint' }, "Draw the truth table with a pen, a finger or the mouse: the names in a header, a line under it, a line between the inputs and the outputs, then a row of 0, 1 or X (don't care) for each combination."),
      padRow,
      h('label', {}, 'Recognized:'), text, msg));
  return dialog({
    title, width: 'min(940px, 96vw)', body, className: 'ink-dlg',
    onOpen: () => setTimeout(() => { if (body.contains(document.activeElement)) document.activeElement.blur(); }, 0),
    buttons: [
      { label: 'Fill Table', primary: true, validate: () => { flush(); return verdict(); }, value: () => ({ ...tableFromText(text.value), text: text.value }) },
      { label: 'Cancel', value: null },
    ],
  }).finally(() => { clearTimeout(timer); pad.destroy(); });
}
