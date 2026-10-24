// The truth tables (#405: out of drawings.js): a table (.tt.json) opened in its editor and kept in sync with its HDL
// module (the table its base, #1176), the module a table is read back from, a table loaded from a module, and the table's schematic
// view (#694).
import { S, activateDoc, compileProject, findDoc, flushDoc, openDoc, openFile, setDirty, status } from './app.js';
import { alertDlg, confirmDlg, dialog, h, popupMenu, toast } from './ui.js';
import { api } from './api.js';
import { log } from './console.js';
import { markStale, saveAll } from './processes.js';
import { removeModule, renderHierarchy } from './design.js';
import { renameDialog } from './rename.js';
import {
  clashItem, drawnHdlLanguage, freshHdl, refreshOpenEditor, refreshSyncBanner, setViewAsTop, staleHdl
} from './drawings.js';

// ---- truth tables (.tt.json): table -> HDL module, synchronized like ASM charts
// The generated HDL module is linked by generatedFile: every change of the table rewrites it (its HDL
// file is read-only, #1176). Truth Table / Karnaugh Map editor: truthtable.js; logic: core/logic.js.
const ttDesignSources = () => S.sources.filter(s => s.role === 'design' && (s.lang === 'vhdl' || s.lang === 'verilog'));

export async function openTt(path) {
  const id = `tt:${path}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  let model;
  try { model = JSON.parse(await api.readFile(S.project.name, path)); }
  catch (e) { toast(`Cannot open ${path}: ${e.message}`, 'error'); return; }
  const { mountTtEditor } = await import('./truthtable.js');
  openDoc({
    id, path, title: path.split('/').pop(), icon: 'truthtable',
    create(el, d) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      const ed = mountTtEditor(host, {
        model,
        onChange: m => { setDirty(d, true); refreshTtSchematic(path, m); },
        linkInfo: () => { const f = S.schOwners?.[path]; return f ? { file: f, why: S.outOfSync?.[f] } : null; },
        onOpenFile: f => openFile(f),
        onFromModule: () => loadTtFromModule(path),
      });
      d.ttEditor = ed;
      return {
        save: async () => {
          const m = ed.getModel();
          await api.writeFile(S.project.name, path, JSON.stringify(m, null, 2)); setDirty(d, false);
          if (!S.syncing) syncHdlFromTt(path, m).catch(e => log(`WARNING: HDL not synchronized: ${e.message}`, 'warn'));
        },
        destroy: () => ed.destroy?.(),
      };
    },
  });
}
const ttModel = async path => { const d = findDoc(`tt:${path}`); if (d?.ttEditor) { await flushDoc(d); return d.ttEditor.getModel(); } return JSON.parse(await api.readFile(S.project.name, path)); };
const refreshTtLink = ttPath => findDoc(`tt:${ttPath}`)?.ttEditor?.refreshLink();

export async function syncHdlFromTt(ttPath, model) {
  const target = model.generatedFile;
  if (!target || !S.fileTree.includes(target)) return;
  if (await drawnHdlLanguage(ttPath, model)) return;
  const { generateTableHdl, validateTable, normalizeTable } = await import('/core/logic.js');
  const m = normalizeTable(model);
  S.outOfSync ||= {};
  const errs = validateTable(m).filter(x => x.severity === 'error');
  if (errs.length) {
    const why = `the truth table has errors: ${errs.map(x => x.message).join('; ')}`;
    if (S.outOfSync[target] !== why) log(`WARNING: ${target} not updated: ${why}`, 'warn');
    S.outOfSync[target] = why; staleHdl(target, ttPath, why); refreshSyncBanner(target); refreshTtLink(ttPath);
    return;
  }
  const g = generateTableHdl(m, /\.v$/i.test(target) ? 'verilog' : 'vhdl', { source: ttPath.split('/').pop() });
  freshHdl(target);
  if (S.outOfSync[target]) { delete S.outOfSync[target]; refreshSyncBanner(target); refreshTtLink(ttPath); }
  const cur = S.sources.find(x => x.path === target)?.text;
  if (cur === g.code) return;
  S.syncing = true;
  try {
    await api.writeFile(S.project.name, target, g.code);
    const src = S.sources.find(x => x.path === target); if (src) src.text = g.code;
    refreshOpenEditor(target, g.code);
    compileProject(); renderHierarchy(); markStale();
    status(`${target} updated from ${ttPath.split('/').pop()}`);
  } finally { S.syncing = false; }
}

// the table `old` made again from its HDL module (by exhaustive simulation of it, the don't cares
// written in its comments kept); throws why it cannot be
export async function ttFromHdl(hdlPath, old) {
  const mods = S.modules.filter(m => m.file === hdlPath && m.kind !== 'package');
  const mod = mods.find(m => m.name.toLowerCase() === String(old.name || '').toLowerCase()) || mods[0];
  if (!mod) throw new Error(`${hdlPath.split('/').pop()} has no module`);
  const { truthTableFromModule, dontCaresInHdl, normalizeTable, MAX_EDIT_INPUTS } = await import('/core/logic.js');
  const t = truthTableFromModule(ttDesignSources(), mod.name, { maxInputs: MAX_EDIT_INPUTS });
  // don't cares written in the HDL comments ("don't care: f = d(3, 5)")
  const dcs = dontCaresInHdl(S.sources.find(x => x.path === hdlPath)?.text);
  for (const o of t.outputs) for (const r of dcs[o.toLowerCase()] || []) if (r >= 0 && r < t.table[o].length) t.table[o] = t.table[o].slice(0, r) + 'X' + t.table[o].slice(r + 1);
  const exprs = {};
  for (const o of t.outputs) if (old.exprs?.[o] && old.table?.[o] === t.table[o] && JSON.stringify(old.inputs) === JSON.stringify(t.inputs)) exprs[o] = old.exprs[o];
  return normalizeTable({ ...old, base: undefined, name: t.name, inputs: t.inputs, outputs: t.outputs, table: t.table, exprs, lang: /\.v$/i.test(hdlPath) ? 'verilog' : 'vhdl', generatedFile: hdlPath });
}

// pick a combinational module of the project
async function pickModule(title, exclude) {
  const mods = S.modules.filter(m => m.role === 'design' && m.kind !== 'package' && m.file !== exclude);
  if (!mods.length) { alertDlg(title, 'The project has no design modules.', 'error'); return null; }
  const sel = h('select', { style: { width: '100%' } }, ...mods.map(m => h('option', { value: m.name, selected: m.name === S.sel?.module }, `${m.name} (${m.file})`)));
  const ok = await dialog({ title, width: 480, body: h('div', {}, h('div', { class: 'hint' }, 'Combinational module (at most 8 input bits): its truth table is computed by simulating every input combination.'), h('div', { style: { marginTop: '8px' } }, sel)),
    buttons: [{ label: 'OK', primary: true, value: true }, { label: 'Cancel', value: null }] });
  return ok ? sel.value : null;
}
async function moduleTable(title, mod) {
  await saveAll();
  const { truthTableFromModule } = await import('/core/logic.js');
  try { return truthTableFromModule(ttDesignSources(), mod); }
  catch (e) { alertDlg(title, e.message, 'error'); return null; }
}

// "Truth Table from Module…" in the editor: replace the table's contents
async function loadTtFromModule(ttPath) {
  const T = 'Truth Table from Module';
  const d = findDoc(`tt:${ttPath}`);
  const m = d?.ttEditor?.getModel();
  const mod = await pickModule(T, m?.generatedFile);
  if (!mod) return;
  const t = await moduleTable(T, mod);
  if (!t || !d?.ttEditor) return;
  if (!await confirmDlg(T, `Replace the contents of ${ttPath.split('/').pop()} by the truth table of '${mod}' (${t.inputs.length} input(s), ${t.outputs.length} output(s))?`)) return;
  d.ttEditor.setModel({ ...d.ttEditor.getModel(), inputs: t.inputs, outputs: t.outputs, table: t.table, exprs: {} });
  setDirty(d, true); refreshTtSchematic(ttPath, d.ttEditor.getModel());
  for (const w of t.warnings) log(`WARNING: ${w}`, 'warn');
  log(`${ttPath}: truth table of '${mod}' (${1 << t.inputs.length} rows, exhaustive simulation).`, 'ok');
}

// The schematic of a truth table (#694): always generated from the table, in its HDL logic form (the
// gates of its HDL's expressions: core/logic.js schematicFromTable), a read-only view of its module (a
// badge of its row in the Design pane), redrawn whenever the table changes. Not a file of the project.
// Simulate tries it out on the drawing (#946).
async function ttSchematicDoc(model) {
  const { schematicFromTable, validateTable, normalizeTable } = await import('/core/logic.js');
  const m = normalizeTable(model);
  const errs = validateTable(m).filter(x => x.severity !== 'warning');
  return errs.length ? { errors: errs.map(x => x.message) } : { doc: schematicFromTable(m) };
}
export async function openTtSchematic(ttPath) {
  const id = `ttsch:${ttPath}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  let model;
  try { model = await ttModel(ttPath); } catch (e) { toast(`Cannot open ${ttPath}: ${e.message}`, 'error'); return; }
  const { mountSchEditor } = await import('./sch-editor.js');
  const first = await ttSchematicDoc(model);
  openDoc({
    id, title: `${ttPath.split('/').pop().replace(/\.tt\.json$/i, '')} (Schematic)`, icon: 'schematic',
    create(el, d) {
      const bar = h('div', { class: 'doc-toolbar tt-sch-bar' });
      const host = h('div', { class: 'doc-body' });
      el.append(bar, host);
      // (not editable, but simulated in place: its inputs clicked, its outputs those of the table, #946)
      const ed = mountSchEditor(host, { doc: first.doc, readOnly: true, simulate: true });
      d.viewer = ed;
      d.showTt = ({ doc, errors }) => {
        bar.innerHTML = '';
        bar.append(h('span', { class: 'rtl-ro' }, 'Schematic (read-only): generated from '), h('a', { onclick: () => openTt(ttPath) }, ttPath.split('/').pop()));
        if (errors) bar.append(h('span', { class: 'tt-err' }, ` — the truth table has errors: ${errors.join('; ')}`));
        else ed.setDoc(doc);
      };
      d.showTt(first);
      return { destroy: () => ed.destroy?.() };
    },
  });
}
// the table changed (edited, or read back from its HDL): its schematic, when open, follows
let ttSchT = null;
function refreshTtSchematic(ttPath, model) {
  if (!findDoc(`ttsch:${ttPath}`)) return;
  clearTimeout(ttSchT);
  ttSchT = setTimeout(async () => { const d = findDoc(`ttsch:${ttPath}`); if (d?.showTt) d.showTt(await ttSchematicDoc(model)); }, 150);
}

export function ttContextMenu(e, file) {
  popupMenu([
    { label: 'Open', action: () => openTt(file) },
    S.view === 'sim' ? null : { label: 'Set as Top Module', action: () => setViewAsTop(file) },
    { label: 'Rename…', action: () => renameDialog(file) },
    clashItem(file),
    { label: 'Remove from Project', action: () => removeModule(file) },
  ].filter(Boolean), e.clientX, e.clientY);
}
