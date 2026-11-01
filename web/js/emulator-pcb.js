// Silinx - Board Emulator: the drawing helpers of the boards (#405, #2478: out of emulator.js as they were): the PCB
// in SVG, its connectors and chips, the frame the layouts place the parts on, and the note under the board.
import { esc } from './dom.js';
import { noMenu } from './emulator-board.js';

const SVG = (tag, attrs = {}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

export function svgEl(w, hgt, body) {
  const s = SVG('svg', { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, class: 'emu-pcb-art' });
  s.innerHTML = body;
  return s;
}
export const pmod = (x, y, name, silk) => `<rect x="${x}" y="${y}" width="92" height="22" rx="2" fill="#141414"/>`
  + Array.from({ length: 6 }, (_, i) => `<rect x="${x + 8 + i * 14}" y="${y + 7}" width="7" height="7" fill="#c9a94a"/>`).join('')
  + `<text x="${x + 46}" y="${y + 38}" fill="${silk}" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">${esc(name)}</text>`;

export const db = (x, y, w, hgt, fill, label, silk, vertical = true) => `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="4" fill="${fill}" stroke="#222" stroke-width="1.5"/>`
  + `<rect x="${x + (vertical ? 8 : 10)}" y="${y + (vertical ? 10 : 8)}" width="${w - (vertical ? 16 : 20)}" height="${hgt - (vertical ? 20 : 16)}" rx="3" fill="#2b2b2b"/>`
  + (label ? `<text x="${vertical ? x + w + 8 : x + w / 2}" y="${vertical ? y + hgt / 2 + 4 : y + hgt + 14}" fill="${silk}" font-size="11" ${vertical ? '' : 'text-anchor="middle"'} font-family="Arial" font-weight="bold">${label}</text>` : '');
export const pmod12 = (x, y, name, silk) => `<rect x="${x}" y="${y}" width="96" height="30" rx="2" fill="#141414"/>`
  + Array.from({ length: 12 }, (_, i) => `<rect x="${x + 8 + (i % 6) * 14}" y="${y + 6 + Math.floor(i / 6) * 11}" width="7" height="7" fill="#c9a94a"/>`).join('')
  + `<text x="${x + 48}" y="${y + 46}" fill="${silk}" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">${esc(name)}</text>`;
export const chip = (x, y, w, hgt, lines) => `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="3" fill="#121212" stroke="#333"/>`
  + lines.map((t, i) => `<text x="${x + w / 2}" y="${y + hgt / 2 - (lines.length - 1) * 9 + i * 18 + 4}" fill="${i ? '#bbb' : '#ddd'}" font-size="${i ? 11 : 14}" text-anchor="middle" font-family="Arial" font-weight="${i ? 'normal' : 'bold'}">${esc(t)}</text>`).join('');
export const holes4 = (W, H) => [[22, 22], [W - 22, 22], [22, H - 22], [W - 22, H - 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#d8c67e"/><circle cx="${x}" cy="${y}" r="5" fill="#1b1b1b"/>`).join('');

// "<board> — <design> · <clock note>": the names are data (not translated), the note is UI text
export const boardNote = (h, board, title, clockNote) => h('div', { class: 'emu-board-note' },
  h('span', { 'data-no-i18n': true }, `${board.name}${title ? ` — ${title}` : ''}`), ' · ', h('span', {}, clockNote));

export function boardFrame({ h, W, H, art, board, title, clockNote }) {
  const pcb = h('div', { class: 'emu-pcb', style: { width: `${W}px`, height: `${H}px` } });
  pcb.append(svgEl(W, H, art));
  const put = (el, x, y, cls = '') => { const w = h('div', { class: `emu-at ${cls}`, style: { left: `${x}px`, top: `${y}px` } }, el); pcb.append(w); return w; };
  const wrap = h('div', { class: 'emu-board-wrap' }, pcb, boardNote(h, board, title, clockNote));
  noMenu(wrap);
  return { pcb, put, wrap };
}

// text on the board (its silkscreen, a chip's marking), upright or turned a quarter left
export const svgText = (x, y, t, { size = 9, anchor = 'middle', weight = 'bold', fill = '#eef3ec', rotate = false, family = 'Arial' } = {}) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" text-anchor="${anchor}" font-family="${family}" font-weight="${weight}"${rotate ? ` transform="rotate(-90 ${x} ${y})"` : ''}>${esc(t)}</text>`;
// a chip seen from above, its marking in lines
export const ic = (x, y, w, hgt, lines = [], size = 8) => `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="2" fill="#141414" stroke="#2c2c2c"/>`
  + lines.map((t, i) => svgText(x + w / 2, y + hgt / 2 + (i - (lines.length - 1) / 2) * (size + 3) + 3, t, { size, fill: i ? '#a9a9a9' : '#d6d6d6', weight: i ? 'normal' : 'bold' })).join('');
// the upright power switch (ON up), for the boards that have one; its LED placed by the board's own style
export const POWER_V_CSS = `
.emu-power-v { flex-direction: column; gap: 0; position: relative; }
.emu-power-v .emu-power-sw { width: 16px; height: 36px; }
.emu-power-v .emu-power-sw::after { left: 1px; right: 1px; width: auto; top: auto; bottom: 2px; height: 15px; transition: bottom .08s; }
.emu-power-v.on .emu-power-sw::after { left: 1px; bottom: 17px; }
.emu-power-v .emu-power-led { position: absolute; }
`;
