// The schematic editor's skeleton (#405: out of mountSchEditor in sch-editor.js): the toolbar, the palette, the
// canvas with its SVG (the grid, the sheet, the drawing, Try it's layer, the overlay), the properties, the problems,
// Try it's bar and the status line.
import { GRID } from '/core/schdoc.js';
import { SVGNS } from './sch-svg.js';
import { h } from './dom.js';
import { statusLine } from './status-line.js';

/** { canvas, contentG, hint, left, overlayG, right, sheetG, simBar, simG, status, svg, tb, vp } of mountSchEditor
 * (status: its status line, { el, set }, #2763). */
export function mountSchDom(ctx) {
  const {
    container, uidE
  } = ctx;

  // ---------------- DOM skeleton
  const tb = h('div', { class: 'se-toolbar' });
  const left = h('div', { class: 'se-left' });
  const canvas = h('div', { class: 'se-canvas' });
  const right = h('div', { class: 'se-right' });
  const status = statusLine('se-status');
  const simBar = h('div', { class: 'se-simbar', hidden: true });
  const main = h('div', { class: 'se-main' }, left, h('div', { class: 'se-center' }, simBar, canvas), right);
  container.append(tb, main, status.el);

  canvas.innerHTML = `<svg class="se-svg" xmlns="${SVGNS}">
    <defs>
      <pattern id="se-grid-${uidE}" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="0.7" class="griddot"/></pattern>
      <pattern id="se-grid2-${uidE}" width="${GRID * 5}" height="${GRID * 5}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1.1" class="griddot"/></pattern>
    </defs>
    <g class="se-vp"><g class="se-sheet"></g><g class="se-content"></g><g class="se-simlayer"></g><g class="se-overlay"></g></g></svg>
    <div class="se-hint" hidden></div>`;
  const svg = canvas.querySelector('svg');
  const vp = svg.querySelector('.se-vp');
  const sheetG = svg.querySelector('.se-sheet');
  const contentG = svg.querySelector('.se-content');
  const overlayG = svg.querySelector('.se-overlay');
  const simG = svg.querySelector('.se-simlayer');
  const hint = canvas.querySelector('.se-hint');

  return { canvas, contentG, hint, left, overlayG, right, sheetG, simBar, simG, status, svg, tb, vp };
}
