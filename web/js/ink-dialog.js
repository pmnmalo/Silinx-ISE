// The Handwritten Expression dialog (#1056): the user writes Boolean expressions on a drawing pad (ink-pad.js), one a
// line, with any names (#2010), with a pen, a finger or the mouse; Silinx's own recognizer (core/ink/equations.js,
// expression.js, offline) reads them after each stroke and shows the text, which the user corrects before inserting it. "Teach Silinx my handwriting" keeps the
// user's samples of a symbol in the browser (localStorage), used as templates of their own.
//
//   await handwrittenExpression({ name, check, title }) -> { text, inputs, outputs, table, exprs } | null
//     name: the output of a single expression with no name; check(table): the host's error of the table they make,
//     or null (core/ink/equations.js tableFromEquations)
// Styles: web/css/ink.css.
import { h, dialog } from './ui.js';
import { mountInkPad, padButtons } from './ink-pad.js';
import { drawingButtons } from './ink-drawing.js';
import { InkError } from '/core/ink/expression.js';
import { recognizeEquations, tableFromEquations } from '/core/ink/equations.js';
import { builtinTemplates, userTemplates, encodeSample, validSamples } from '/core/ink/templates.js';
import { boxOf } from '/core/ink/segment.js';
import { SYMBOLS } from '/core/ink/font.js';
import { LogicError } from '/core/logic.js';
import { prefKey } from './prefs.js';

export const SAMPLES_KEY = prefKey('silinx.ink.samples');
const MAX_SAMPLES = 400;

export function loadSamples() {
  try { return validSamples(JSON.parse(localStorage.getItem(SAMPLES_KEY) || '[]')); } catch { return []; }
}
function saveSamples(list) {
  try { localStorage.setItem(SAMPLES_KEY, JSON.stringify(list.slice(-MAX_SAMPLES))); return true; } catch { return false; }
}

/** The error of a text of equations, one a line (null: they make a table, and check finds nothing wrong with it). */
export function expressionError(text, { name = 'F', check = () => null } = {}) {
  try { return check(tableFromEquations(text, { name })); } catch (e) { if (e instanceof LogicError) return e.message; throw e; }
}

/** The templates of the recognizer: the built-in ones and the user's samples kept by the browser. */
export const inkTemplates = () => [...builtinTemplates(), ...userTemplates(loadSamples())];

export function handwrittenExpression({ name = 'F', check = () => null, title = 'Handwritten Expression' } = {}) {
  let samples = loadSamples();
  let templates = inkTemplates();
  let timer = null;
  const text = h('textarea', { class: 'ink-text', rows: 3, spellcheck: 'false', placeholder: 'The recognized text appears here, an expression a line' });
  const error = () => expressionError(text.value, { name, check });
  const msg = h('div', { class: 'ink-msg' });
  const padHost = h('div', { class: 'ink-pad' });
  // read after each stroke, a moment later (the next stroke may follow at once); at once before Insert
  const pad = mountInkPad(padHost, { onStroke: () => { clearTimeout(timer); timer = setTimeout(recognize, 250); } });
  const flush = () => { if (timer) { clearTimeout(timer); recognize(); } };
  // (a correction typed by hand: the reading still pending would write over it, #2389; the next stroke reads again)
  const edited = () => { clearTimeout(timer); timer = null; };
  const showMsg = (lines, kind = 'warn') => { msg.className = `ink-msg ink-${kind}`; msg.replaceChildren(...lines.map(l => h('div', {}, l))); };
  function recognize() {
    timer = null;
    const strokes = pad.strokes();
    if (!strokes.length) { text.value = ''; pad.setLabels([]); showMsg([]); return; }
    try {
      const r = recognizeEquations(strokes, { templates });
      text.value = r.text;
      pad.setLabels(r.lines.flatMap(l => l.chars).map(c => ({ ch: c.ch, box: boxOf(c.ink.map(k => strokes[k])) })));
      const e = error(), warnings = [...new Set(r.lines.flatMap(l => l.warnings))];
      showMsg([...warnings, ...(e ? [e] : [])], e || warnings.length ? 'warn' : 'ok');
    } catch (e) {
      if (!(e instanceof InkError)) throw e;
      showMsg([e.message]);
    }
  }
  text.addEventListener('input', () => { edited(); const e = error(); showMsg(e ? [e] : [], e ? 'warn' : 'ok'); });

  // ---- teach Silinx my handwriting
  const sym = h('input', { type: 'text', class: 'ink-sym', maxlength: 1, spellcheck: 'false', title: 'The symbol written on the pad' });
  const count = h('span', { class: 'ink-count' });
  const showCount = () => { count.textContent = `Samples of your handwriting: ${samples.length}`; };
  const teachMsg = h('div', { class: 'ink-msg' });
  const saveSample = () => {
    const c = sym.value.trim();
    const strokes = pad.strokes();
    if (!SYMBOLS.includes(c)) { teachMsg.textContent = `Type one symbol of the set: ${SYMBOLS.join(' ')}`; return; }
    if (!strokes.length) { teachMsg.textContent = 'Write the symbol on the pad first.'; return; }
    samples = [...samples, encodeSample(c, strokes)].slice(-MAX_SAMPLES);
    teachMsg.textContent = saveSamples(samples) ? `Sample of '${c}' saved.` : 'The browser did not keep the sample (storage unavailable).';
    templates = [...builtinTemplates(), ...userTemplates(samples)];
    showCount();
    pad.clear();
  };
  const forget = () => {
    samples = [];
    saveSamples(samples);
    templates = builtinTemplates();
    teachMsg.textContent = 'Your samples were forgotten.';
    showCount();
  };
  showCount();
  const teach = h('details', { class: 'ink-teach' },
    h('summary', {}, 'Teach Silinx my handwriting'),
    h('div', { class: 'hint' }, 'Write one symbol on the pad, type it here and save it: Silinx then reads your way of writing it too. The samples are kept by this browser only.'),
    h('div', { class: 'ink-row' }, h('label', {}, 'Symbol:'), sym,
      h('button', { type: 'button', class: 'btn ink-save', onclick: saveSample }, 'Save Sample'),
      h('button', { type: 'button', class: 'btn ink-forget', onclick: forget }, 'Forget My Samples'), count),
    teachMsg);

  // Undo, Redo, Clear; Copy Drawing and Paste Drawing (#1749)
  const padRow = padButtons(pad);
  padRow.append(...drawingButtons(pad, { kind: 'expression', read: () => text.value }));
  const body = h('div', { class: 'ink-dialog' },
    h('div', { class: 'hint' }, "Write the expressions with a pen, a finger or the mouse, one a line, with any names, e.g. F = A·B' + C. A bar over letters is NOT; a dot or a * is AND."),
    padHost,
    padRow,
    h('div', { class: 'ink-row' }, h('label', {}, 'Recognized:'), text),
    msg,
    teach);
  return dialog({
    title, width: 'min(760px, 96vw)', body, className: 'ink-dlg',
    // no text field in focus: on a pen display or a tablet it would open the on-screen keyboard over the pad
    onOpen: () => setTimeout(() => { if (body.contains(document.activeElement)) document.activeElement.blur(); }, 0),
    buttons: [
      { label: 'Insert', primary: true, validate: () => { flush(); const e = error(); if (e) showMsg([e]); return !e; }, value: () => ({ text: text.value.trim(), ...tableFromEquations(text.value, { name }) }) },
      { label: 'Cancel', value: null },
    ],
  }).finally(() => { clearTimeout(timer); pad.destroy(); });
}
