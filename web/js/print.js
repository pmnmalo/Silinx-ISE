// Silinx - printing of diagrams (ASM charts, schematics): the whole drawing as a standalone SVG,
// printed on one page or tiled over several pages (the browser's print dialog also saves PDF).
import { h, dialog, alertDlg, toast, downloadText } from './ui.js';
import { esc } from './dom.js';

const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'visibility', 'display', 'marker-start', 'marker-end'];

/**
 * Standalone SVG of a live editor canvas: computed styles inlined (so it no longer needs the app
 * CSS), editor-only elements removed and the world group shown untransformed in `bounds`.
 * @param {SVGSVGElement} svg      the editor canvas
 * @param {Element} world          the group carrying the pan/zoom transform
 * @param {{l,t,r,b}} bounds       drawing bounds in world coordinates
 * @param {string[]} drop          selectors of elements to leave out (grid, handles, rubber band…)
 */
export function svgSnapshot(svg, world, bounds, drop = []) { return withLightTheme(() => snapshotNow(svg, world, bounds, drop)); }
function snapshotNow(svg, world, bounds, drop) {
  const clone = svg.cloneNode(true);
  const src = [svg, ...svg.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const st = STYLE_PROPS.map((p) => {
      let v = cs.getPropertyValue(p);
      if (!v || v === 'normal' && p !== 'font-weight') return '';
      if (p.startsWith('marker') && v === 'none') return '';
      return `${p}:${v}`;
    }).filter(Boolean).join(';');
    dst[i].setAttribute('style', st);
    dst[i].removeAttribute('class');
    if (el === world) dst[i].setAttribute('data-world', '');
  });
  // the selectors refer to the classes of the original: mark the clones of the dropped elements
  for (const sel of drop) for (const el of svg.querySelectorAll(sel)) { const k = src.indexOf(el); if (k >= 0) dst[k].setAttribute('data-drop', ''); }
  for (const el of clone.querySelectorAll('[data-drop]')) el.remove();
  for (const el of clone.querySelectorAll('title')) el.remove();
  const w = clone.querySelector('[data-world]');
  w?.removeAttribute('transform'); w?.removeAttribute('data-world');
  const W = Math.ceil(bounds.r - bounds.l), H = Math.ceil(bounds.b - bounds.t);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${Math.floor(bounds.l)} ${Math.floor(bounds.t)} ${W} ${H}`);
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  clone.setAttribute('style', 'background:#fff');
  return { svg: clone.outerHTML, bounds: { x: Math.floor(bounds.l), y: Math.floor(bounds.t), w: W, h: H } };
}

/** fn() run with the light theme's styles (a print is light, also in the dark theme, #1509): its computed styles
 *  read there, the theme put back before anything is drawn again. */
export function withLightTheme(fn) {
  const root = document.documentElement, was = root.dataset.theme, scheme = root.style.colorScheme;
  if (was !== 'dark') return fn();
  root.dataset.theme = 'light'; root.style.colorScheme = 'light';
  try { return fn(); } finally { root.dataset.theme = was; root.style.colorScheme = scheme; }
}

// the project and the file of the document printed, in every page's header (printActive sets it, #1509)
let printMeta = '';
export function setPrintMeta(meta = '') { printMeta = String(meta); }

export const PAPERS = { A4: [210, 297], A3: [297, 420], Letter: [216, 279] };
// each paper's name in the page's @page rule (from this table, never from the dialog's text)
export const PAGE_SIZE = { A4: 'A4', A3: 'A3', Letter: 'letter' };
const MARGIN = 10;   // mm, page margin
const CAPTION = 7;   // mm, page caption (title, page number)
const SLACK = 0.5;   // mm, the page box stays this much shorter than the printable area (no blank extra page)

/**
 * Page layout of a drawing of `bounds` ({w, h} in drawing units, 1 unit = 1 screen px):
 * paper size in mm, orientation, number of pages across and the resulting scale (mm per unit).
 */
export function pageLayout(bounds, { paper = 'A4', orient = 'auto', across = 1 } = {}) {
  // (a known paper only: its name goes into the print page's CSS)
  if (!Object.hasOwn(PAPERS, paper)) paper = 'A4';
  let [pw, ph] = PAPERS[paper];
  const land = orient === 'landscape' || (orient === 'auto' && bounds.w >= bounds.h);
  if (land) [pw, ph] = [ph, pw];
  const n = Math.max(1, Math.min(20, Math.round(across) || 1));
  // ah: height of drawing shown per page, which is also the step between rows of tiles
  const aw = pw - 2 * MARGIN, ah = ph - 2 * MARGIN - CAPTION - SLACK;
  let scale = aw * n / bounds.w;
  let rows = Math.max(1, Math.ceil(bounds.h * scale / ah - 1e-6));
  if (n === 1 && rows > 1) { scale = ah / bounds.h; rows = 1; }   // one page: fit both ways
  const cols = Math.max(1, Math.ceil(bounds.w * scale / aw - 1e-6));
  return { paper, pw, ph, aw, ah, cols, rows, scale, land };
}

const mm = (v) => `${+v.toFixed(3)}mm`;

/**
 * HTML document printing the drawing (an image at `imgUrl`, of size bounds.w x bounds.h) with
 * layout L: one page per tile, the image cropped by each page window (loaded only once).
 */
export function printHtml(title, bounds, imgUrl, L, meta = '') {
  const W = bounds.w * L.scale, H = bounds.h * L.scale;
  const n = L.cols * L.rows;
  const pages = [];
  for (let r = 0; r < L.rows; r++) {
    for (let c = 0; c < L.cols; c++) {
      // a single page centres the drawing; tiles start at the top-left corner of the window
      const x = n === 1 ? (L.aw - W) / 2 : -c * L.aw, y = n === 1 ? 0 : -r * L.ah;
      const cap = n === 1 ? '' : ` — page ${r * L.cols + c + 1} of ${n} (row ${r + 1}, column ${c + 1})`;
      pages.push(`<section class="page"><header><b>${esc(title)}${esc(cap)}</b>${meta ? `<span>${esc(meta)}</span>` : ''}</header><div class="art">`
        + `<img src="${esc(imgUrl)}" alt="" style="left:${mm(x)};top:${mm(y)};width:${mm(W)};height:${mm(H)}"></div></section>`);
    }
  }
  const size = `${Object.hasOwn(PAGE_SIZE, L.paper) ? PAGE_SIZE[L.paper] : PAGE_SIZE.A4} ${L.land ? 'landscape' : 'portrait'}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: ${esc(size)}; margin: ${MARGIN}mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { position: relative; width: ${mm(L.aw)}; height: ${mm(L.ah + CAPTION)}; overflow: hidden; break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
header { display: flex; justify-content: space-between; gap: 4mm; height: ${CAPTION}mm; font: 9pt system-ui, -apple-system, "Segoe UI", sans-serif; color: #444; white-space: nowrap; overflow: hidden; }
header b { font-weight: 600; color: #000; overflow: hidden; text-overflow: ellipsis; }
.art { position: absolute; left: 0; top: ${CAPTION}mm; width: ${mm(L.aw)}; height: ${mm(L.ah)}; overflow: hidden; }
.art img { position: absolute; max-width: none; }
@media screen {
  body { background: #777; padding: 12px 0; }
  .page { margin: 0 auto 12px; background: #fff; box-shadow: 0 0 0 ${MARGIN}mm #fff, 0 2px 8px ${MARGIN}mm #0005; }
}
</style></head><body>${pages.join('\n')}</body></html>`;
}
// The print page has no script of its own: a page written into a new window or a frame keeps the
// opener's Content-Security-Policy, which runs no inline script (#487). The opener prints it, once
// its images are loaded (and laid out by `ready`, given the window: the fit of a print view, #1509).
function printWhenLoaded(win, ready) {
  Promise.all([...win.document.images].map(i => (i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))))
    .then(() => { try { ready?.(win); } catch (e) { console.error(e); } setTimeout(() => win.print(), 250); });
}

/** Raster image (PNG blob) of a snapshot at `k` pixels per drawing unit, within browser canvas limits. */
export async function snapshotPng(snapshot, k = 2) {
  const { w, h: hh } = snapshot.bounds;
  k = Math.max(0.1, Math.min(k, 16000 / w, 16000 / hh, Math.sqrt(120e6 / (w * hh))));
  const url = URL.createObjectURL(new Blob([snapshot.svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('cannot render the drawing')); img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * k); cv.height = Math.round(hh * k);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('the image is too large for this browser');
    return { blob, width: cv.width, height: cv.height };
  } finally { URL.revokeObjectURL(url); }
}

function downloadBlob(filename, blob) {
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Print dialog: paper, orientation and pages across, then the browser print dialog; or save SVG / PNG. */
export async function printDiagram({ title, snapshot, filename = 'diagram' }) {
  const { bounds } = snapshot;
  const paper = h('select', {}, ...Object.keys(PAPERS).map((p) => h('option', { value: p }, p)));
  const orient = h('select', {}, h('option', { value: 'auto' }, 'Automatic'), h('option', { value: 'landscape' }, 'Landscape'), h('option', { value: 'portrait' }, 'Portrait'));
  const across = h('input', { type: 'number', min: 1, max: 20, value: 1, style: { width: '60px' } });
  const pngK = h('select', {}, ...[[1, '1× (screen size)'], [2, '2×'], [3, '3×'], [4, '4×']].map(([v, l]) => h('option', { value: v, selected: v === 2 }, l)));
  const info = h('div', { class: 'muted', style: { marginTop: '8px' } });
  const opts = () => ({ paper: paper.value, orient: orient.value, across: parseInt(across.value, 10) || 1 });
  const upd = () => {
    const L = pageLayout(bounds, opts());
    const n = L.cols * L.rows;
    info.textContent = `${n} page${n > 1 ? 's' : ''} (${L.cols} across × ${L.rows} down), ${paper.value} ${L.land ? 'landscape' : 'portrait'}; `
      + `12 px text prints at ${(12 * L.scale / 0.3528).toFixed(1)} pt`;
  };
  for (const el of [paper, orient, across]) el.addEventListener('input', upd);
  upd();
  const body = h('div', {},
    h('table', { class: 'form' },
      h('tr', {}, h('td', {}, 'Paper'), h('td', {}, paper)),
      h('tr', {}, h('td', {}, 'Orientation'), h('td', {}, orient)),
      h('tr', {}, h('td', {}, 'Pages across'), h('td', {}, across)),
      h('tr', {}, h('td', {}, 'PNG resolution'), h('td', {}, pngK))),
    info,
    h('div', { class: 'muted', style: { marginTop: '6px' } },
      `Drawing: ${bounds.w} × ${bounds.h} px. Large diagrams: several pages across (tiles) or A3; text below ~5 pt is hard to read on paper. `
      + 'For a PDF choose "Save as PDF" in the print dialog (keep the margins at "Default").'));
  const r = await dialog({ title: `Print — ${title}`, body, width: 470,
    buttons: [{ label: 'Print…', value: 'print', primary: true }, { label: 'Save PNG', value: 'png' }, { label: 'Save SVG', value: 'svg' }, { label: 'Cancel', value: null }] });
  if (r === 'svg') { downloadText(`${filename}.svg`, snapshot.svg, 'image/svg+xml'); return; }
  if (r === 'png') {
    try { const p = await snapshotPng(snapshot, +pngK.value); downloadBlob(`${filename}.png`, p.blob); toast(`${filename}.png: ${p.width} × ${p.height} px`); }
    catch (e) { alertDlg('Save PNG', e.message); }
    return;
  }
  if (r !== 'print') return;
  openPrint(title, snapshot, pageLayout(bounds, opts()));
}

function openPrint(title, snapshot, L) {
  const url = URL.createObjectURL(new Blob([snapshot.svg], { type: 'image/svg+xml' }));
  setTimeout(() => URL.revokeObjectURL(url), 30 * 60 * 1000);
  openPrintPage(printHtml(title, snapshot.bounds, url, L, printMeta));
}

/** The page `html` in a new window (a hidden frame when pop-ups are blocked), printed once loaded and `ready(win)` ran. */
export function openPrintPage(html, ready) {
  const w = window.open('', '_blank');
  if (w) { w.document.open(); w.document.write(html); w.document.close(); printWhenLoaded(w, ready); return; }
  // pop-ups blocked: print from a hidden frame
  const f = h('iframe', { class: 'print-frame', style: { position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0 } });
  document.body.append(f);
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close(); printWhenLoaded(f.contentWindow, ready);
  setTimeout(() => f.remove(), 10 * 60 * 1000);
}
