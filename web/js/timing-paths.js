// The Static Timing Report's Paths panel (#3178): the slowest paths of the Silinx toolchain's timing analysis
// (build/open/paths.json, packages/silinx-fpga/src/fpga/timing-paths.js), each one's stages as bars against its clock's
// PERIOD (or the worst path between two chosen registers: From, To), and Show Path: the source lines its logic comes from marked in their editors, the elements of the drawings
// that generate them in theirs (web/js/drawing-path.js), its sites and nets in the FPGA view (Show in FPGA View opens it
// on the path). The MCP's timing_paths gives the same (server/mcp-timing.js).
//
//   mountTimingPaths(doc, el, host)   // the report's editor document: its editor's host, the panel beside it
import { h } from './ui.js';
import { api } from './api.js';
import { mountSideFold } from './side-fold.js';
import { panelToggle } from './narrow.js';
import { prefKey } from './prefs.js';
import { log } from './console.js';
import { markLines } from './editor.js';
import { S, findDoc, openFile, openFpgaView } from './app.js';
import { betweenPaths, pathHighlight } from '/packages/silinx-fpga/src/index.js';
import { clearDrawings, showInDrawings } from './drawing-path.js';
import { iseTimingPaths } from '/core/twr-paths.js';
import { vivadoTimingPaths } from '/core/vivado-paths.js';

const TIMING_REPORT = 'build/open/timing.txt';
const PATHS_FILE = 'build/open/paths.json';
const KIND = { 'clock-to-out': 'clock-to-out', net: 'net', logic: 'logic', setup: 'setup' };
const ns = x => `${x.toFixed(3)} ns`;
const end = s => `${s.inst}.${s.pin}`;

// the editors whose lines a path marked (unmarked by the next Show Path), and the analysis the path came from (its
// report and its text's hash: a new run's clears the marks when its report opens)
let marked = [], markedFrom = null;
const hash = (text) => { let x = 2166136261; for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619); return (x >>> 0).toString(36); };

/** The marks of the last Show Path taken off: the editors' lines, the drawings' elements, the FPGA view's path. */
function clearPathMarks() {
  for (const d of marked) if (d.editor) markLines(d.editor, []);
  marked = [];
  markedFrom = null;
  clearDrawings();
  findDoc('fpgaview')?.view?.showPath?.(null);
}

/** Show Path: the path's source lines marked in their editors (the first file in front), the elements of the drawings
 *  they are generated from in theirs, its sites and nets in the FPGA view when it is open (fpga: open it on the path;
 *  from: the analysis it comes from, the panel's). */
async function showPath(p, { fpga = false, from = null } = {}) {
  const hl = pathHighlight(p);
  for (const d of marked) if (d.editor) markLines(d.editor, []);
  marked = [];
  markedFrom = from;
  const files = Object.keys(hl.files);
  if (!files.length) log(`The logic of the path to ${end(p.stages.at(-1))} could not be traced back to its source lines.`);
  for (const f of [...files].reverse()) {
    const d = await openFile(f);
    if (d?.editor) { markLines(d.editor, hl.files[f]); marked.push(d); }
  }
  // (a file generated from a drawing: the drawing's elements on the path, the drawing in front of its HDL)
  hl.drawings = await showInDrawings(p, [...files].reverse());
  if (fpga && !findDoc('fpgaview')) await openFpgaView();
  findDoc('fpgaview')?.view?.showPath?.(hl);
  return hl;
}

// the paths of a timing report: the Silinx toolchain's (its analysis's paths.json), ISE's and Vivado's (their reports',
// back to the project's HDL by their netlists' names: core/twr-paths.js, core/vivado-paths.js)
async function pathsOf(pj, file) {
  const sources = () => S.sources.filter(s => !s.view && s.role !== 'sim');
  const text = await api.readFile(pj, file.endsWith('.twr') || file.endsWith('_timing.rpt') ? file : PATHS_FILE);
  const r = file.endsWith('.twr') ? iseTimingPaths(text, sources(), S.project.top)
    : file.endsWith('_timing.rpt') ? vivadoTimingPaths(text, sources(), S.project.top) : JSON.parse(text);
  return { r, origin: `${file}\n${hash(text)}` };
}

/** The Paths panel beside a timing report's editor (the Silinx toolchain's, ISE's .twr, Vivado's _timing.rpt; none when
 *  the analysis wrote no paths: an older run). */
export async function mountTimingPaths(d, el, host) {
  const pj = S.project?.name;
  let r, origin;
  try { ({ r, origin } = await pathsOf(pj, d.path || TIMING_REPORT)); } catch { return null; }
  if (!r?.paths || S.project?.name !== pj) return null;
  // (the marks of this report's earlier analysis: a new run's paths, they are taken off)
  if (markedFrom && markedFrom.split('\n')[0] === origin.split('\n')[0] && markedFrom !== origin) clearPathMarks();
  const root = h('div', { class: 'tp' });
  const side = h('aside', { class: 'tp-side' }, h('div', { class: 'asm-cap' }, 'Paths'));
  host.replaceWith(root);
  root.append(host, side);
  mountSideFold({ root, side, key: 'silinx.timing.paths.folded', titles: { fold: 'Collapse the Paths panel', unfold: 'Expand the Paths panel' } });
  el.querySelector('.editor-bar')?.append(panelToggle(root, h('button', { class: 'btn', title: 'Show / hide the Paths panel' }, '☰ Paths'), { key: prefKey('silinx.narrow.paths') }));

  let sel = 0, shown = r.paths;
  const list = h('table', { class: 'tp-list' });
  const detail = h('div', { class: 'tp-detail' });
  const none = h('p', { class: 'tp-none' }, 'No path between two flip-flops of a clock to time.');
  // between two chosen registers (the analysis's points and the worst path of each pair: an older run has none)
  const pick = (title) => h('select', { class: 'tp-pick', title, onchange: () => choose() },
    h('option', { value: '' }, 'Any register'), ...(r.points || []).map(x => h('option', { value: x, 'data-no-i18n': '' }, x)));
  const from = pick('The register the paths start from'), to = pick('The register the paths end in');
  const between = r.pairs ? h('div', { class: 'tp-between' }, h('label', {}, 'From', from), h('label', {}, 'To', to)) : null;
  function choose() {
    shown = !from.value && !to.value ? r.paths : betweenPaths(r, from.value, to.value);
    sel = 0;
    none.textContent = from.value || to.value ? 'No path between these registers.' : 'No path between two flip-flops of a clock to time.';
    list.hidden = !shown.length; none.hidden = !!shown.length;
    renderList(); renderDetail();
  }
  side.append(...[between, list, none, detail].filter(Boolean));
  list.hidden = !shown.length; none.hidden = !!shown.length;
  function renderList() {
    list.replaceChildren(h('tr', {}, h('th', {}, '#'), h('th', {}, 'Slack'), h('th', {}, 'Delay'), h('th', {}, 'To')),
      ...shown.map((p, i) => h('tr', { class: `tp-row${i === sel ? ' sel' : ''}${p.slack != null && p.slack < 0 ? ' tp-fail' : ''}`, 'data-i': i, onclick: () => { sel = i; renderList(); renderDetail(); } },
        h('td', { 'data-no-i18n': '' }, String(i + 1)), h('td', { class: 'num', 'data-no-i18n': '' }, p.slack == null ? '—' : p.slack.toFixed(3)),
        h('td', { class: 'num', 'data-no-i18n': '' }, p.delay.toFixed(3)), h('td', { class: 'tp-to', 'data-no-i18n': '', title: end(p.stages.at(-1)) }, p.stages.at(-1).inst))));
  }
  function renderDetail() {
    const p = shown[sel];
    if (!p) { detail.replaceChildren(); return; }
    // the bar: each stage's share of the PERIOD (of the delay with no PERIOD), the slack after them
    const span = Math.max(p.required ?? 0, p.delay) || 1;
    const bar = h('div', { class: 'tp-bar', title: p.required == null ? 'The path\'s stages (no PERIOD constraint on its clock)' : 'The path\'s stages against the PERIOD' },
      ...p.stages.filter(s => s.delay > 0).map(s => h('span', { class: `tp-seg tp-${s.kind}`, style: { width: `${(100 * s.delay) / span}%` }, title: `${KIND[s.kind]} ${ns(s.delay)}` })),
      p.slack != null && p.slack > 0 ? h('span', { class: 'tp-seg tp-slack', style: { width: `${(100 * p.slack) / span}%` }, title: `slack ${ns(p.slack)}` }) : null);
    detail.replaceChildren(...[
      h('h4', {}, `Path ${sel + 1}`),
      h('div', { class: 'tp-sum', 'data-no-i18n': '' }, `${end(p.stages[0])} → ${end(p.stages.at(-1))}`),
      h('div', { class: 'tp-sum' }, p.required == null ? `Delay ${ns(p.delay)}, no PERIOD constraint` : `Delay ${ns(p.delay)} of ${ns(p.required)}, slack ${ns(p.slack)}`),
      p.half ? h('div', { class: 'tp-sum' }, 'Between the two edges of the clock: half its period.') : null,
      bar,
      h('table', { class: 'tp-stages' }, ...p.stages.map(s => h('tr', { class: `tp-${s.kind}` },
        h('td', {}, KIND[s.kind]), h('td', { class: 'num', 'data-no-i18n': '' }, s.delay.toFixed(3)),
        h('td', { 'data-no-i18n': '', title: [s.site, s.net && `net ${s.net}`, ...s.sources.map(x => `${x.file}:${x.line}`)].filter(Boolean).join('\n') },
          s.kind === 'net' ? (s.net || end(s)) : end(s),
          ...s.sources.map(x => h('a', { href: '#', class: 'tp-src', onclick: e => { e.preventDefault(); openFile(x.file, x.line); } }, ` ${x.file.split('/').pop()}:${x.line}`)))))),
      h('div', { class: 'tp-actions' },
        h('button', { class: 'btn', title: 'Mark the source lines of the path\'s logic, and the path in the FPGA view when it is open', onclick: () => showPath(p, { from: origin }) }, 'Show Path'),
        // (Vivado's sites: a 7-series device's, not the FPGA view's)
        r.toolchain === 'vivado' ? null : h('button', { class: 'btn', title: 'Open the FPGA view on the path: its sites and its nets', onclick: () => showPath(p, { fpga: true, from: origin }) }, 'Show in FPGA View'))].filter(Boolean));
  }
  renderList(); renderDetail();
  return { paths: r.paths, between: (a = '', b = '') => { from.value = a; to.value = b; choose(); return shown; },
    select: i => { sel = i; renderList(); renderDetail(); }, show: (i, o) => showPath(shown[i], { from: origin, ...o }) };
}
