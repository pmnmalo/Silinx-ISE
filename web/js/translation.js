// An HDL source in the other language (#2693): a Verilog module of a VHDL project (or the other way round) has the
// preferred language's badge too on its Design row, which opens the source translated (core/translate.js), read-only,
// in a document of its own, made again when the source is saved. What cannot be translated is said in the document.
// The source's tab menu shows it beside the source (Show Generated VHDL / Verilog Beside, web/js/split-view.js, #2711).
import { h } from './dom.js';
import { S, findDoc, closeDoc, openDoc, openFile, activateDoc } from './app.js';
import { createEditor } from './editor.js';
import { translateSource, translatedPath, translationLang } from '/core/translate.js';

const preferred = () => (S.project?.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
const label = lang => (lang === 'vhdl' ? 'VHDL' : 'Verilog');

/** The badge a module of an HDL file in the other language has after its own (null when the file is in the preferred
 *  one): { text, title, open, context }. */
export function translationBadge(file, context) {
  const lang = translationLang(file, preferred());
  return lang ? { text: label(lang), base: false, title: `Translated to ${label(lang)} (read-only)`, open: () => openTranslation(file), context } : null;
}

/** The language a project source is translated to ('VHDL' / 'Verilog': in the other language than the preferred one),
 *  or null. */
export function translationOf(path) {
  const lang = S.sources.some(s => s.path === path && !s.view) && translationLang(path, preferred());
  return lang ? label(lang) : null;
}

// the source's text: its open editor's (saved or not), else the project's
async function sourceText(path) {
  const d = findDoc(`file:${path}`);
  if (d?.editor) return d.editor.getValue();
  const s = S.sources.find(x => x.path === path && !x.view);
  if (s?.text != null) return s.text;
  return (await import('./api.js')).api.readFile(S.project.name, path);
}
const translate = (path, text) => translateSource(text, { path, to: translationLang(path, preferred()), sources: S.sources.filter(s => !s.view) });

/** The source translated to the preferred language, read-only, in a document of its own. */
export async function openTranslation(path) {
  const lang = translationLang(path, preferred());
  if (!lang) return openFile(path);
  const id = `tr:${path}`;
  const old = findDoc(id);
  // (open already, in this language: made again, where it is)
  if (old?.translation?.lang === lang) { await old.refresh(); activateDoc(old); return old; }
  if (old) await closeDoc(old);
  const r = translate(path, await sourceText(path));
  const name = translatedPath(path.split('/').pop(), lang);
  return openDoc({
    id, title: name, tooltip: `${name}, translated from ${path}`, icon: lang,
    create(el, d) {
      const link = () => h('a', { onclick: () => openFile(path) }, path.split('/').pop());
      const banner = h('span', { class: 'gen-banner read-only' });
      const show = t => banner.replaceChildren(...(t.ok ? ['Read-only, translated from ', link()] : ['Cannot be translated from ', link()]));
      const bar = h('div', { class: 'editor-bar' }, h('span', { class: 'path' }, name), banner);
      const host = h('div', { class: 'editor-host' });
      el.append(bar, host);
      show(r);
      d.translation = r;
      d.editor = createEditor(host, { text: r.text, lang, path: name, readOnly: true });
      el.append(d.editor.status);   // (its status line, #2763)
      // (the source saved: translated again)
      const follow = async () => {
        const t = translate(path, await sourceText(path));
        d.translation = t;
        show(t);
        if (t.text !== d.editor.getValue()) d.editor.setValue(t.text);
      };
      d.refresh = follow;
      addEventListener('silinx:design-changed', follow);
      return { lang, destroy: () => { removeEventListener('silinx:design-changed', follow); d.editor.destroy(); } };
    },
  });
}
