// The views a drawing or a C source is made into that are not files of the project (#2834), read-only, each in a
// document of its own, made again each time from the source (its open editor's model, saved or not): a state diagram's
// ASM chart and an ASM chart's state diagram (core/fsm-asm.js, as the drawings' Convert commands and the MCP's
// convert_drawing make them, here not written to the project), a C source's synthesis report (core/c-report.js, as View
// C Synthesis Report writes it in the console). What cannot be made is said in the console. Shown beside their source
// by the tabs' Show … Beside (web/js/related-views.js).
import { h } from './dom.js';
import { S, closeDoc, findDoc, openDoc, openFile } from './app.js';
import { api } from './api.js';
import { log } from './console.js';

const base = (p) => p.split('/').pop();
// a drawing's model: its open editor's (saved or not), else the project's file
async function model(path, prefix, key) {
  const ed = findDoc(`${prefix}:${path}`)?.[key];
  return ed ? ed.getModel() : JSON.parse(await api.readFile(S.project.name, path));
}
// a document made again: the old one closed first
async function fresh(id) { const old = findDoc(id); if (old) await closeDoc(old); }

/** A state diagram's ASM chart, read-only (null, the reason in the console: the diagram has errors). */
export async function openFsmAsm(path) {
  const { fsmToAsm, fsmErrors, normalizeFsm } = await import('/core/fsm.js');
  const pj = S.project.name;
  let m;
  try { m = normalizeFsm(await model(path, 'fsm', 'fsmEditor')); } catch (e) { log(`ERROR: Cannot open ${path}: ${e.message}`, 'err'); return null; }
  const errs = fsmErrors(m);
  if (errs.length) { log(`ERROR: The ASM chart of "${path}": ${errs.map((x) => x.message).join('; ')}`, 'err'); return null; }
  const { mountAsmEditor } = await import('./asm-editor.js');
  if (S.project?.name !== pj) return null;   // another project opened meanwhile
  const id = `fsmasm:${path}`;
  await fresh(id);
  const name = `${base(path).replace(/\.fsm\.json$/i, '')}.asm`;
  return openDoc({
    id, title: name, tooltip: `${name}, the ASM chart of ${path}`, icon: 'asm',
    create(el, d) {
      const banner = h('span', { class: 'gen-banner read-only' }, 'Read-only, converted from ', h('a', { onclick: () => openFile(path) }, base(path)));
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      d.asmEditor = mountAsmEditor(host, { model: fsmToAsm(m), readOnly: true, banner });
      return { destroy: () => d.asmEditor.destroy?.() };
    },
  });
}

/** An ASM chart's state diagram, read-only (null, the reason in the console: not a plain state machine). */
export async function openAsmFsm(path) {
  const { asmToFsm } = await import('/core/fsm.js');
  const pj = S.project.name;
  let m;
  try { m = asmToFsm(await model(path, 'asm', 'asmEditor')); }
  catch (e) { log(`ERROR: The state diagram of "${path}": ${base(path)} cannot be shown as a state diagram: ${e.message}`, 'err'); return null; }
  const { mountFsmEditor } = await import('./fsm-editor.js');
  if (S.project?.name !== pj) return null;
  const id = `asmfsm:${path}`;
  await fresh(id);
  const name = `${base(path).replace(/\.asm\.json$/i, '')}.fsm`;
  return openDoc({
    id, title: name, tooltip: `${name}, the state diagram of ${path}`, icon: 'fsm',
    create(el, d) {
      const banner = h('span', { class: 'gen-banner read-only' }, 'Read-only, converted from ', h('a', { onclick: () => openFile(path) }, base(path)));
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      d.fsmView = mountFsmEditor(host, { model: m, readOnly: true, banner });
      return { destroy: () => d.fsmView.destroy?.() };
    },
  });
}

/** A C source's synthesis report, read-only (null, its errors in the console); its warnings in the console. */
export async function openCReportDoc(path) {
  const { cToHdl } = await import('/core/c-hdl.js');
  const { cReportLines } = await import('/core/c-report.js');
  const { hlsClock, hlsFamily, hlsMults } = await import('./c-source.js');
  const d0 = findDoc(`file:${path}`);
  const text = d0?.editor ? d0.editor.getValue() : await api.readFile(S.project.name, path);
  const lang = S.project?.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl', clock = hlsClock();
  const r = cToHdl(text, { file: path, lang, clock, family: hlsFamily(), mults: hlsMults(), ...(S.hls || {}) });
  const errors = r.diagnostics.filter((x) => x.severity === 'error');
  if (!r.ok) { log(`ERROR:SilinxC - "${path}" ${errors.map((x) => `line ${x.line}: ${x.message}`).join('; ') || 'cannot be synthesized'}`, 'err'); return null; }
  const { lines, warnings } = cReportLines(r, { path, lang, clock });
  for (const w of warnings) log(w, 'warn');
  const id = `crep:${path}`;
  await fresh(id);
  const name = `${base(path).replace(/\.(c|cpp|cc|cxx)$/i, '')} (C Synthesis Report)`;
  return openDoc({
    id, title: name, tooltip: `The C synthesis report of ${path}`, icon: 'report', source: path,
    create(el) {
      el.append(h('pre', { class: 'report-text', 'data-no-i18n': true, style: { margin: 0, padding: '8px', overflow: 'auto', height: '100%', boxSizing: 'border-box', font: '12px var(--mono)' } }, lines.join('\n')));
      return {};
    },
  });
}
