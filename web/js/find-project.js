// Find in Project (#1430): one search across every source of the project, the toolbar's Find (Ctrl+Shift+F): its
// HDL, constraints, test benches and data files (their lines), and the drawings' texts (names, labels, expressions,
// notes of the schematics, state machines, truth tables, Petri nets); its results by file, a click opening the place.
// Replace (one result, or all of them) in the text sources, an Undo Replace putting them back; an HDL generated from
// a drawing is found but replaced in its drawing (its results open it). Matching: core/find.js.

import { h, toast } from './ui.js';
import { api } from './api.js';
import { S, app, findDoc, openDoc, openFile, setDirty } from './app.js';
import { findPattern, findInText, findInDrawing, replaceInText } from '/core/find.js';

const TEXT_FILE = /\.(vhdl?|v|sv|ucf|mem|hex|coe|txt)$/i;
const DRAWING = /\.(sch|asm|tt|bool|fsm|pn)\.json$/i;
const MAX = 2000;   // (results at most)

/** The project's texts to search: [{ path, text, drawing, generated }], the open editors' as they are. */
async function projectTexts() {
  const pj = S.project;
  // (the project's files: its sources, its drawings (not in its files' list), its constraints)
  const paths = [...new Set([...(S.fileTree || []), ...(pj.files || []).map(f => f.path), pj.constraints].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const out = [];
  for (const path of paths) {
    if (DRAWING.test(path)) { const t = S.viewTexts?.[path]; if (t != null) out.push({ path, text: t, drawing: true }); continue; }
    if (!TEXT_FILE.test(path)) continue;
    const ed = findDoc(`file:${path}`)?.editor;
    let text = ed ? ed.getValue() : S.sources.find(s => s.path === path)?.text;
    if (text == null) { try { text = await api.readFile(pj.name, path); } catch { continue; } }
    out.push({ path, text, drawing: false, generated: !!S.hdlToSch?.[path] });
  }
  return out;
}

/** Opens Find in Project (with the text selected in the editor in front, when there is one). */
export function openFindInProject() {
  if (!S.project) { toast('Open a project first', 'info'); return; }
  const sel = S.active?.editor?.getSelection?.() || '';
  const d = openDoc({ id: 'find', title: 'Find in Project', icon: 'find', create: el => mountFind(el) });
  if (sel && !/\n/.test(sel)) d.setText?.(sel);
  d.focus?.();
}

function mountFind(el) {
  const input = (cls, ph) => h('input', { type: 'text', class: cls, placeholder: ph, spellcheck: 'false', autocomplete: 'off' });
  const find = input('fp-find', 'Text to find'), rep = input('fp-replace', 'Replacement');
  const box = (cls, label) => { const c = h('input', { type: 'checkbox', class: cls }); return [c, h('label', { class: 'fp-opt' }, c, ` ${label}`)]; };
  const [mc, mcL] = box('fp-case', 'Match case'), [ww, wwL] = box('fp-word', 'Whole word'), [rx, rxL] = box('fp-regex', 'Regular expression');
  const btn = (label, act, run) => h('button', { type: 'button', class: 'btn', 'data-act': act, onclick: run }, label);
  const status = h('div', { class: 'fp-status' }), results = h('div', { class: 'fp-results' });
  const undoBtn = btn('Undo Replace', 'undo', () => undo());
  undoBtn.disabled = true;
  el.append(h('div', { class: 'page fp' },
    h('h2', {}, 'Find in Project'),
    h('div', { class: 'fp-row' }, h('label', {}, 'Find:'), find, btn('Find', 'find', () => run())),
    h('div', { class: 'fp-row' }, h('label', {}, 'Replace with:'), rep, btn('Replace All', 'replace-all', () => replace()), undoBtn),
    h('div', { class: 'fp-row fp-opts' }, mcL, wwL, rxL), status, results));
  const opts = () => ({ text: find.value, matchCase: mc.checked, word: ww.checked, regex: rx.checked });
  let last = [], undoTexts = null;
  find.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  for (const c of [mc, ww, rx]) c.addEventListener('change', () => find.value && run());

  async function run() {
    const { re, error } = findPattern(opts());
    results.innerHTML = '';
    if (error) { status.textContent = `Invalid regular expression: ${error}`; return; }
    if (!re) { status.textContent = ''; return; }
    await app.saveAll?.();
    last = (await projectTexts()).map(f => ({ ...f, hits: f.drawing ? findInDrawing(f.text, re, { max: MAX }) : findInText(f.text, re, { max: MAX }) })).filter(f => f.hits.length);
    const n = last.reduce((s, f) => s + f.hits.length, 0);
    status.textContent = n ? `${n} result(s) in ${last.length} file(s)` : 'No results';
    for (const f of last) results.append(fileResults(f));
  }
  const mark = (text, col, length) => [text.slice(0, col - 1), h('mark', {}, text.slice(col - 1, col - 1 + length)), text.slice(col - 1 + length)];
  function fileResults(f) {
    const head = h('div', { class: 'fp-file', 'data-path': f.path }, h('span', { class: 'fp-path', 'data-no-i18n': '' }, f.path), ` (${f.hits.length})`,
      f.generated ? h('span', { class: 'fp-note' }, ' generated from its drawing: replace in the drawing') : null);
    const rows = f.hits.map(m => {
      const where = f.drawing ? m.where : `${m.line}:${m.col}`;
      const r = h('div', { class: 'fp-hit', title: f.drawing ? 'Open the drawing' : 'Open at this line' },
        h('span', { class: 'fp-where', 'data-no-i18n': '' }, where), h('code', { 'data-no-i18n': '' }, ...mark(m.text, m.col, m.length)),
        !f.drawing && !f.generated ? h('button', { type: 'button', class: 'btn fp-one', title: 'Replace this one', onclick: e => { e.stopPropagation(); replace(f, m); } }, 'Replace') : null);
      r.addEventListener('click', () => (f.drawing ? import('./drawings.js').then(d => d.openView(f.path)) : openFile(f.path, m.line, m.col)));
      return r;
    });
    return h('div', { class: 'fp-group' }, head, ...rows);
  }

  // Replace All (`one`: that result only) in the text sources not generated from a drawing; Undo Replace puts them back
  async function replace(file = null, one = null) {
    const { re } = findPattern(opts());
    if (!re) return;
    if (!file) await run();
    const targets = (file ? [file] : last).filter(f => !f.drawing && !f.generated);
    const before = {};
    let count = 0;
    for (const f of targets) {
      let text;
      if (one) {
        const sub = replaceInText(f.text.slice(one.index, one.index + one.length), findPattern(opts()).re, rep.value, { regex: rx.checked });
        text = f.text.slice(0, one.index) + sub.text + f.text.slice(one.index + one.length);
        count += sub.count;
      } else {
        const r = replaceInText(f.text, re, rep.value, { regex: rx.checked });
        text = r.text; count += r.count;
      }
      if (text === f.text) continue;
      before[f.path] = f.text;
      await write(f.path, text);
    }
    if (!Object.keys(before).length) return;
    undoTexts = before;
    undoBtn.disabled = false;
    await app.reloadProject(false);
    toast(`${count} replacement(s) in ${Object.keys(before).length} file(s)`, 'ok');
    await run();
  }
  async function write(path, text) {
    await api.writeFile(S.project.name, path, text);
    const d = findDoc(`file:${path}`);
    if (d?.editor) { d.editor.setValue(text); d.editor.markClean?.(); setDirty(d, false); }
  }
  async function undo() {
    if (!undoTexts) return;
    for (const [path, text] of Object.entries(undoTexts)) await write(path, text);
    undoTexts = null;
    undoBtn.disabled = true;
    await app.reloadProject(false);
    toast('Replacement undone', 'ok');
    if (find.value) await run();
  }
  return { setText: t => { find.value = t; run(); }, focus: () => setTimeout(() => find.focus(), 0), onActivate: () => setTimeout(() => find.focus(), 0) };
}
