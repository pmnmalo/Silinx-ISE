// Silinx - the print view of a document that is not a diagram (#1509): a clean page with its content (the text of a
// source, a copy of what the document shows), its title, the project and the file, in light colours (also in the
// dark theme), fitted to the page of the paper and orientation chosen (#1923); printed by the browser's print dialog
// (which also saves PDF).
import { esc } from './dom.js';
import { t } from './i18n.js';
import { h, dialog } from './ui.js';
import { PAGE_SIZE, PAPERS, openPrintPage, withLightTheme } from './print.js';
import { highlightHdl } from './highlight.js';

const PX_PER_MM = 96 / 25.4;
const MARGIN = 10;   // mm, the page's margin
const HEAD = 14;     // mm, the header (title, project and file) on the first page

/** The page's header line: the project and the file, as the user reads them (in their language). */
export function metaLine({ project = '', file = '' } = {}) {
  return [project && `${t('Project')}: ${project}`, file && `${t('File')}: ${file}`].filter(Boolean).join('  ·  ');
}

/** The application's style sheets as one text (a copy of a document keeps its look; read from the page's own rules). */
function appCss() {
  let out = '';
  for (const s of document.styleSheets) { try { for (const r of s.cssRules) out += `${r.cssText}\n`; } catch { /* another origin's sheet */ } }
  return out;
}

/**
 * The HTML page of a print view: `body` (HTML) under a header with `title` and `meta`. `css`: the content's own
 * style; `app`: the application's style sheets too (a copy of the document's elements), under its interface
 * (data-ui) in the light theme.
 */
export function printPageHtml({ title, meta = '', body, css = '', app = false }) {
  const ui = globalThis.document?.documentElement.dataset.ui || 'ise';
  return `<!doctype html><html data-ui="${esc(ui)}" data-theme="light" style="color-scheme: light"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
${app ? appCss() : ''}
@page { size: A4 portrait; margin: ${MARGIN}mm; }
html, body { margin: 0; padding: 0; background: #fff !important; color: #000; height: auto !important; overflow: visible !important;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pv-head { display: flex; flex-direction: column; gap: 1mm; height: ${HEAD}mm; box-sizing: border-box; border-bottom: 0.3mm solid #999; margin-bottom: 3mm;
  font: 9pt system-ui, -apple-system, "Segoe UI", sans-serif; color: #444; }
.pv-head b { font-size: 12pt; font-weight: 600; color: #000; }
.pv-content { color: #000; }
.pv-copy, .pv-copy * { overflow: visible !important; max-height: none !important; }
.pv-copy { position: relative; }
.pv-copy [hidden] { display: none !important; }
${css}
@media screen { body { padding: 12px; } }
</style></head><body><header class="pv-head"><b>${esc(title)}</b><span>${esc(meta)}</span></header>
<main class="pv-content">${body}</main></body></html>`;
}

/**
 * The page of a print view: `paper` (A4, A3, Letter) in `orient` (portrait, landscape, or auto: a copy of a document
 * `w` px wide and `hh` px high, wider than the page in portrait, turns it to landscape); its size in mm and its @page rule.
 */
export function printPage({ paper = 'A4', orient = 'auto' } = {}, w = 0, hh = 0) {
  if (!Object.hasOwn(PAPERS, paper)) paper = 'A4';
  const [a, b] = PAPERS[paper];
  const land = orient === 'landscape' || (orient === 'auto' && w > (a - 2 * MARGIN) * PX_PER_MM && w > hh);
  const [pw, ph] = land ? [b, a] : [a, b];
  return { paper, land, pw, ph, rule: `@page { size: ${PAGE_SIZE[paper]} ${land ? 'landscape' : 'portrait'}; margin: ${MARGIN}mm; }` };
}

/**
 * The print view's fit, run in the print window before it prints: the page of `paper` and `orient` (printPage); a copy
 * of a document (`.pv-copy`) is zoomed down to the page's width; `page`: to its height too (one page).
 */
export function fitToPage(win, { page = false, paper, orient } = {}) {
  const d = win.document, copy = d.querySelector('.pv-copy');
  const w = copy?.scrollWidth || 0, hh = copy?.scrollHeight || 0;
  const P = printPage({ paper, orient }, w, hh);
  if (copy) {
    const aw = (P.pw - 2 * MARGIN) * PX_PER_MM, ah = (P.ph - 2 * MARGIN - HEAD - 4) * PX_PER_MM;
    const k = Math.min(1, aw / Math.max(1, w), page ? ah / Math.max(1, hh) : 1);
    copy.style.zoom = String(+k.toFixed(4));
  }
  const st = d.createElement('style');
  st.textContent = P.rule;
  d.head.append(st);
}

/**
 * A copy of `el` as HTML for its print view: in the light theme's look, its canvases as images, its drawings
 * (SVG, canvas) kept at the size shown, its fields' values written in; the elements of `drop` (selectors: toolbars,
 * buttons…) left out.
 */
export function domSnapshot(el, { drop = [] } = {}) {
  return withLightTheme(() => {
    const clone = el.cloneNode(true);
    const src = [el, ...el.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
    const gone = new Set(drop.flatMap((sel) => [...el.querySelectorAll(sel)]));
    src.forEach((s, i) => {
      const c = dst[i];
      if (gone.has(s)) { c.setAttribute('data-pv-drop', ''); return; }
      if (s.tagName === 'CANVAS') {
        const r = s.getBoundingClientRect();
        const img = document.createElement('img');
        try { img.src = s.toDataURL('image/png'); } catch { /* a tainted canvas: left blank */ }
        img.setAttribute('style', `width:${r.width}px;height:${r.height}px;display:block`);
        img.className = s.className;
        c.replaceWith(img);
        return;
      }
      if (s instanceof SVGSVGElement && !s.parentElement?.closest('svg')) {
        const r = s.getBoundingClientRect();
        if (r.width && r.height) { c.setAttribute('width', r.width); c.setAttribute('height', r.height); c.style.width = `${r.width}px`; c.style.height = `${r.height}px`; }
      }
      if (s.tagName === 'INPUT') { if (/^(checkbox|radio)$/i.test(s.type)) c.toggleAttribute('checked', s.checked); else c.setAttribute('value', s.value); }
      else if (s.tagName === 'TEXTAREA') c.textContent = s.value;
      else if (s.tagName === 'OPTION') c.toggleAttribute('selected', s.selected);
      // (the user's scroll: a copy shows all of a scrolled list, from its start)
    });
    for (const c of clone.querySelectorAll('[data-pv-drop]')) c.remove();
    clone.removeAttribute('hidden');
    // (as wide as shown: its text wraps as on the screen; what was scrolled sideways widens it)
    return `<div class="pv-copy" style="width:${Math.ceil(el.getBoundingClientRect().width) || 800}px">${clone.outerHTML}</div>`;
  });
}

/** The print view of a source's text: its lines numbered, HDL highlighted, long lines wrapped. */
export function textBody(text, lang) {
  const html = lang === 'vhdl' || lang === 'verilog' ? highlightHdl(text, lang) : esc(text);
  const rows = html.replace(/\n$/, '').split('\n').map((line, i) => `<tr><td class="n">${i + 1}</td><td>${line || ' '}</td></tr>`);
  return `<table class="pv-code">${rows.join('')}</table>`;
}
export const TEXT_CSS = `.pv-code { border-collapse: collapse; width: 100%; font: 8.5pt/1.35 Consolas, Menlo, "DejaVu Sans Mono", monospace; }
.pv-code td { padding: 0 0 0 3mm; vertical-align: top; white-space: pre-wrap; word-break: break-all; }
.pv-code td.n { width: 1%; padding: 0 2mm 0 0; text-align: right; color: #888; border-right: 0.2mm solid #ccc; white-space: nowrap; }
.pv-code tr { break-inside: avoid; }
.tk-com { color: #008000; } .tk-kw { color: #0000c0; font-weight: 600; } .tk-lit { color: #a31515; } .tk-attr { color: #7f007f; } .tk-st { color: #6f42c1; }`;

// the paper and orientation chosen last (the dialog opens with them)
let chosen = { paper: 'A4', orient: 'auto' };

/** The print dialog of a print view: its paper and orientation (`{ paper, orient }`), or null (cancelled). */
export async function printOptions(title) {
  const paper = h('select', {}, ...Object.keys(PAPERS).map((p) => h('option', { value: p, selected: p === chosen.paper }, p)));
  const orient = h('select', {}, ...[['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]
    .map(([v, l]) => h('option', { value: v, selected: v === chosen.orient }, l)));
  const body = h('div', {},
    h('table', { class: 'form' },
      h('tr', {}, h('td', {}, 'Paper'), h('td', {}, paper)),
      h('tr', {}, h('td', {}, 'Orientation'), h('td', {}, orient))),
    h('div', { class: 'muted', style: { marginTop: '6px' } }, 'Automatic: landscape when what is shown is wider than the page. For a PDF choose "Save as PDF" in the print dialog.'));
  const r = await dialog({ title: `Print — ${title}`, body, width: 420, buttons: [{ label: 'Print…', value: 'print', primary: true }, { label: 'Cancel', value: null }] });
  if (r !== 'print') return null;
  chosen = { paper: paper.value, orient: orient.value };
  return { ...chosen };
}

/** Print view `{ title, meta, html, fit }` opened and printed on the page of `opts` (`{ paper, orient }`; `fit`: options of fitToPage). */
export function openPrintView(v, opts = {}) {
  openPrintPage(v.html, (win) => fitToPage(win, { ...(v.fit || {}), ...opts }));
}
