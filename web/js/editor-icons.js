// The editors' tool icons, 16x16: the schematic editor's, which the other drawing editors' toolbars share (#2505).
import { h } from './dom.js';

const I = (body) => `<svg viewBox="0 0 16 16">${body}</svg>`;
export const ICON = {
  select: I('<path d="M3 1.5v12l3.2-3 2.3 5 1.8-.8-2.3-5H12z" fill="#fff" stroke="#24476f" stroke-width="1.1" stroke-linejoin="round"/>'),
  wire: I('<path d="M1.5 12.5h5v-9h8" fill="none" stroke="#0000a0" stroke-width="1.6"/><circle cx="1.5" cy="12.5" r="1.4" fill="#0000a0"/><circle cx="14.5" cy="3.5" r="1.4" fill="#0000a0"/>'),
  net: I('<path d="M1 12.5h14" stroke="#0000a0" stroke-width="1.4"/><text x="1.5" y="9.5" font-size="8" font-family="Arial" font-weight="bold" fill="#800000">abc</text>'),
  io: I('<path d="M1.5 4.5h8l4 3.5-4 3.5h-8z" fill="#fffff0" stroke="#000080" stroke-width="1.2"/>'),
  rotate: I('<path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2" fill="none" stroke="#24476f" stroke-width="1.5"/><path d="M13.6 1.8v3.8H9.8z" fill="#24476f"/>'),
  mirrorv: I('<path d="M1 8h14" stroke="#888" stroke-dasharray="2 1.5"/><path d="M3.5 6.5h9L12.5 1.5z" fill="#9cc3ea" stroke="#24476f"/><path d="M3.5 9.5h9l0 5z" fill="#fff" stroke="#24476f"/>'),
  more: I('<circle cx="8" cy="3" r="1.5" fill="#24476f"/><circle cx="8" cy="8" r="1.5" fill="#24476f"/><circle cx="8" cy="13" r="1.5" fill="#24476f"/>'),
  mirror: I('<path d="M8 1v14" stroke="#888" stroke-dasharray="2 1.5"/><path d="M6.5 3.5v9L1.5 12.5z" fill="#9cc3ea" stroke="#24476f"/><path d="M9.5 3.5v9l5 0z" fill="#fff" stroke="#24476f"/>'),
  del: I('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="#c00000" stroke-width="2.2" stroke-linecap="round"/>'),
  zin: I('<circle cx="6.5" cy="6.5" r="4.5" fill="#e8f2fc" stroke="#24476f" stroke-width="1.4"/><path d="M10 10l4.5 4.5" stroke="#24476f" stroke-width="2"/><path d="M4 6.5h5M6.5 4v5" stroke="#24476f" stroke-width="1.4"/>'),
  zout: I('<circle cx="6.5" cy="6.5" r="4.5" fill="#e8f2fc" stroke="#24476f" stroke-width="1.4"/><path d="M10 10l4.5 4.5" stroke="#24476f" stroke-width="2"/><path d="M4 6.5h5" stroke="#24476f" stroke-width="1.4"/>'),
  fit: I('<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="#24476f" stroke-width="1.5"/><rect x="5" y="5" width="6" height="6" fill="#9cc3ea" stroke="#24476f"/>'),
  check: I('<rect x="1.5" y="1.5" width="13" height="13" rx="1" fill="#fff" stroke="#24476f"/><path d="M4 8.2l2.6 2.6L12 5" fill="none" stroke="#008000" stroke-width="2"/>'),
  sim: I('<rect x="1" y="4" width="7" height="8" rx="1.5" fill="#1f6b1f" stroke="#0d3d0d"/><rect x="4.5" y="5.5" width="2.5" height="5" rx=".6" fill="#fff"/><path d="M9 8h2.5" stroke="#00b000" stroke-width="1.6"/><circle cx="13" cy="8" r="2.4" fill="#33e033" stroke="#0d6d0d"/>'),
  info: I('<circle cx="8" cy="8" r="6.5" fill="#e8f2fc" stroke="#24476f" stroke-width="1.2"/><circle cx="8" cy="4.6" r="1.1" fill="#24476f"/><path d="M8 7v5" stroke="#24476f" stroke-width="2"/>'),
  // (#1730: a wire with a square bend redrawn, Rearrange Wires)
  rewire: I('<path d="M1.5 12.5h4v-8h5v4h4" fill="none" stroke="#24476f" stroke-width="1.6" stroke-linejoin="round"/><circle cx="1.5" cy="12.5" r="1.4" fill="#24476f"/><circle cx="14.5" cy="8.5" r="1.4" fill="#24476f"/><path d="M12 1l.6 1.4 1.4.6-1.4.6L12 5l-.6-1.4L10 3l1.4-.6z" fill="#e0a000"/>'),
  beautify: I('<path d="M2 14.5l8.5-8.5" stroke="#24476f" stroke-width="2" stroke-linecap="round"/><path d="M11.5 1l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#e0a000"/><path d="M4 3l.5 1 1 .5-1 .5L4 6l-.5-1-1-.5 1-.5zM13.5 9.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" fill="#e0a000"/>'),
  view: I('<path d="M3 1.5h7l3 3v10H3z" fill="#fff" stroke="#24476f"/><path d="M10 1.5v3h3" fill="none" stroke="#24476f"/><text x="4.2" y="12" font-size="6.5" font-family="Consolas,monospace" font-weight="bold" fill="#000080">&lt;/&gt;</text>'),
  // (the Petri net editor's tools and the Algebra editor's menu)
  arc: I('<path d="M2 13L13 3" stroke="#24476f" stroke-width="1.6"/><path d="M14.5 1.5l-1.2 5.2-4-4z" fill="#24476f"/>'),
  inhibitor: I('<path d="M2 13l8.2-7.6" stroke="#24476f" stroke-width="1.6"/><circle cx="12" cy="4" r="2.4" fill="#fff" stroke="#24476f" stroke-width="1.4"/>'),
  module: I('<rect x="3.5" y="2.5" width="9" height="11" fill="#e8f0ff" stroke="#24476f"/><path d="M1 5.5h2.5M1 10.5h2.5M12.5 8H15" stroke="#24476f" stroke-width="1.2"/>'),
  pen: I('<path d="M2 14l1-3.6 8-8 2.6 2.6-8 8z" fill="#fff" stroke="#24476f" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.6 3.8l2.6 2.6" stroke="#24476f" stroke-width="1.2"/>'),
};


// A button of a drawing editor's toolbar as the schematic editor's: its icon, or its icon and a label
export const toolIcon = (act, icon, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn asm-tool ${cls}`, 'data-act': act, title, html: ICON[icon], onclick });
export const toolWide = (icon, label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn asm-wide ${cls}`, title, html: `${ICON[icon]}<span>${label}</span>`, onclick });
// the view's three buttons, the schematic editor's
export const zoomTools = (zoomBy, fit) => [toolIcon('zin', 'zin', 'Zoom In (+)', () => zoomBy(1.25)), toolIcon('zout', 'zout', 'Zoom Out (−)', () => zoomBy(0.8)), toolIcon('fit', 'fit', 'Zoom to Full View (F)', () => fit())];
