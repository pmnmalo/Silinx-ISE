// Silinx - printing of diagrams (ASM charts, schematics): the whole drawing as a standalone SVG,
// printed on one page or tiled over several pages (the browser's print dialog also saves PDF).
import { h, dialog, downloadText } from './ui.js';

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
export function svgSnapshot(svg, world, bounds, drop = []) {
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
  w.removeAttribute('transform'); w.removeAttribute('data-world');
  const W = Math.ceil(bounds.r - bounds.l), H = Math.ceil(bounds.b - bounds.t);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${Math.floor(bounds.l)} ${Math.floor(bounds.t)} ${W} ${H}`);
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  clone.setAttribute('style', 'background:#fff');
  return { svg: clone.outerHTML, bounds: { x: Math.floor(bounds.l), y: Math.floor(bounds.t), w: W, h: H } };
}

const PAPERS = { A4: [210, 297], A3: [297, 420], Letter: [216, 279] };
const MARGIN = 10; // mm

/** Print dialog: paper, orientation and number of pages across; then the browser print dialog. */
export async function printDiagram({ title, snapshot, filename = 'diagram' }) {
  const { bounds } = snapshot;
  const paper = h('select', {}, ...Object.keys(PAPERS).map((p) => h('option', { value: p }, p)));
  const orient = h('select', {}, h('option', { value: 'auto' }, 'Automatic'), h('option', { value: 'landscape' }, 'Landscape'), h('option', { value: 'portrait' }, 'Portrait'));
  const across = h('input', { type: 'number', min: 1, max: 20, value: 1, style: { width: '60px' } });
  const info = h('div', { class: 'muted', style: { marginTop: '8px' } });
  const layoutOf = () => {
    let [pw, ph] = PAPERS[paper.value];
    const land = orient.value === 'landscape' || (orient.value === 'auto' && bounds.w >= bounds.h);
    if (land) [pw, ph] = [ph, pw];
    const n = Math.max(1, Math.min(20, parseInt(across.value, 10) || 1));
    const aw = pw - 2 * MARGIN, ah = ph - 2 * MARGIN - 6;        // 6 mm for the page caption
    const scale = aw * n / bounds.w;                             // mm per drawing unit
    const rows = Math.max(1, Math.ceil(bounds.h * scale / ah - 1e-6));
    const fitScale = Math.min(scale, ah * rows / bounds.h);      // one page: fit both ways
    return { pw, ph, aw, ah, n, rows, scale: fitScale, land };
  };
  const upd = () => {
    const L = layoutOf();
    info.textContent = `${L.n * L.rows} page${L.n * L.rows > 1 ? 's' : ''} (${L.n} × ${L.rows}), ${paper.value} ${L.land ? 'landscape' : 'portrait'} — `
      + `11 px text prints at ${(11 * L.scale / 0.3528).toFixed(1)} pt`;
  };
  for (const el of [paper, orient, across]) el.addEventListener('input', upd);
  upd();
  const body = h('div', {},
    h('table', { class: 'form' },
      h('tr', {}, h('td', {}, 'Paper'), h('td', {}, paper)),
      h('tr', {}, h('td', {}, 'Orientation'), h('td', {}, orient)),
      h('tr', {}, h('td', {}, 'Pages across'), h('td', {}, across))),
    info,
    h('div', { class: 'muted', style: { marginTop: '6px' } }, 'Large diagrams: use several pages across (tiles) or A3. To get a PDF choose "Save as PDF" in the print dialog.'));
  const r = await dialog({ title: `Print — ${title}`, body, width: 440,
    buttons: [{ label: 'Print…', value: 'print', primary: true }, { label: 'Save SVG', value: 'svg' }, { label: 'Cancel', value: null }] });
  if (r === 'svg') { downloadText(`${filename}.svg`, snapshot.svg, 'image/svg+xml'); return; }
  if (r !== 'print') return;
  openPrint(title, snapshot, layoutOf());
}

function openPrint(title, snapshot, L) {
  const { bounds: B } = snapshot;
  const tileW = L.aw / L.scale, tileH = L.ah / L.scale;
  const rows = Math.max(1, Math.ceil(B.h / tileH - 1e-6)), cols = Math.max(1, Math.ceil(B.w / tileW - 1e-6));
  const one = rows * cols === 1;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pages = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const vb = one ? `${B.x} ${B.y} ${B.w} ${B.h}` : `${B.x + c * tileW} ${B.y + r * tileH} ${tileW} ${tileH}`;
      const svg = snapshot.svg.replace(/viewBox="[^"]*"/, `viewBox="${vb}"`).replace(/ width="\d+"/, ' width="100%"').replace(/ height="\d+"/, ' height="100%"')
        .replace(/<svg /, '<svg preserveAspectRatio="xMidYMin meet" ');
      pages.push(`<section class="page"><header>${esc(title)}${one ? '' : ` — page ${r * cols + c + 1}/${rows * cols} (row ${r + 1}, column ${c + 1})`}</header><div class="art">${svg}</div></section>`);
    }
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: ${L.land ? 'landscape' : 'portrait'}; margin: ${MARGIN}mm; }
html, body { margin: 0; background: #fff; }
.page { width: ${L.aw}mm; height: ${L.ah + 6}mm; page-break-after: always; break-after: page; overflow: hidden; }
.page:last-child { page-break-after: auto; break-after: auto; }
header { height: 6mm; font: 9pt system-ui, sans-serif; color: #444; }
.art { width: ${L.aw}mm; height: ${L.ah}mm; }
.art svg { display: block; }
@media screen { body { background: #888; padding: 10px; } .page { background: #fff; margin: 0 auto 10px; padding: 4mm; box-shadow: 0 1px 4px #0006; } }
</style></head><body>${pages.join('')}<script>addEventListener('load',()=>setTimeout(()=>print(),200));<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.open(); w.document.write(html); w.document.close(); return; }
  // pop-ups blocked: print from a hidden frame
  const f = h('iframe', { style: { position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0 } });
  document.body.append(f);
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
  setTimeout(() => f.remove(), 60000);
}
