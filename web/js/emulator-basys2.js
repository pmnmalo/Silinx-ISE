// Silinx - Board Emulator: the Digilent Basys2 drawn (#405, #2478: out of emulator.js as it was).
import { esc } from './dom.js';
import { noMenu } from './emulator-board.js';
import { svgEl, pmod, boardNote } from './emulator-pcb.js';

/** Digilent Basys2: navy PCB, Pmods JA..JD on the top edge, USB left, PS/2 and VGA right,
 *  LEDs above the 8 slide switches at the bottom, 4-digit display with the 4 buttons below it. */
export function basys2Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const W = 780, H = 500, silk = '#e8edf7';
  const pcb = h('div', { class: 'emu-pcb', style: { width: `${W}px`, height: `${H}px` } });
  const holes = [[22, 22], [W - 22, 22], [22, H - 22], [W - 22, H - 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#d8c67e"/><circle cx="${x}" cy="${y}" r="5" fill="#1b1b1b"/>`).join('');
  pcb.append(svgEl(W, H, `
    <defs><linearGradient id="b2pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22397a"/><stop offset="1" stop-color="#172a5c"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="14" fill="url(#b2pcb)" stroke="#0e1b40" stroke-width="3"/>
    ${holes}
    ${pmod(170, 12, 'JA', silk)}${pmod(300, 12, 'JB', silk)}${pmod(430, 12, 'JC', silk)}${pmod(560, 12, 'JD', silk)}
    <rect x="0" y="64" width="40" height="40" rx="3" fill="#b9bec6" stroke="#6b7079"/><rect x="6" y="76" width="22" height="16" rx="2" fill="#4a4e55"/>
    <text x="58" y="88" fill="${silk}" font-size="11" font-family="Arial" font-weight="bold">USB</text>
    <text x="52" y="152" fill="${silk}" font-size="9" font-family="Arial">POWER</text>
    <rect x="676" y="58" width="70" height="62" rx="6" fill="#7b3fa0" stroke="#4d2266"/><circle cx="711" cy="89" r="17" fill="#2b2b2b"/><circle cx="711" cy="89" r="5" fill="#777"/>
    <text x="711" y="136" fill="${silk}" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">PS2</text>
    <path d="M${W - 4},150 L${W - 46},158 L${W - 46},252 L${W - 4},260 Z" fill="#2f63c9" stroke="#163a85" stroke-width="2"/>
    ${Array.from({ length: 15 }, (_, i) => `<circle cx="${W - 34 + (i % 3) * 10}" cy="${172 + Math.floor(i / 3) * 16}" r="2.4" fill="#0d1d40"/>`).join('')}
    <text x="${W - 70}" y="210" fill="${silk}" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">VGA</text>
    <rect x="215" y="160" width="62" height="46" rx="2" fill="#151515"/><text x="246" y="187" fill="#bbb" font-size="9" text-anchor="middle" font-family="Arial">XCF02S</text>
    <rect x="330" y="132" width="128" height="128" rx="4" fill="#121212" stroke="#333"/>
    <text x="394" y="180" fill="#d8d8d8" font-size="15" text-anchor="middle" font-family="Arial" font-weight="bold">XILINX</text>
    <text x="394" y="202" fill="#bbb" font-size="11" text-anchor="middle" font-family="Arial">SPARTAN-3E</text>
    <text x="394" y="220" fill="#bbb" font-size="11" text-anchor="middle" font-family="Arial">${esc((board.device?.part || 'XC3S250E').toUpperCase())}</text>
    <rect x="508" y="176" width="34" height="22" rx="3" fill="#c7cbd2" stroke="#8a8f98"/><text x="525" y="214" fill="${silk}" font-size="9" text-anchor="middle" font-family="Arial">MCLK</text>
    <text x="70" y="226" fill="#fff" font-size="34" font-family="Arial Black, Arial" font-weight="900" letter-spacing="1">BASYS 2</text>
    <text x="566" y="262" fill="#fff" font-size="20" font-family="Arial" font-weight="bold" letter-spacing="2">DIGILENT</text>
    <text x="566" y="278" fill="#c9d3ea" font-size="9" font-family="Arial" letter-spacing="3">BEYOND THEORY</text>
    <rect x="482" y="300" width="232" height="96" rx="6" fill="#0b0b0b" stroke="#2a2a2a"/>
  `));
  const put = (el, x, y, cls = '') => { const w = h('div', { class: `emu-at ${cls}`, style: { left: `${x}px`, top: `${y}px` } }, el); pcb.append(w); return w; };
  const silkText = (t, x, y, size = 10) => put(h('span', { class: 'emu-silk', style: { fontSize: `${size}px` } }, t), x, y);
  put(mkPower(), 75, 122);
  const port = (kind, k, x, y) => put(h('span', { class: `emu-port${bitFor(kind, k) ? '' : ' nc'}` }, portLabel(kind, k)), x, y);
  // LEDs LD7..LD0 above the switches SW7..SW0 (left half of the bottom edge)
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = 66 + i * 52;
    put(mkLed(k, 'emu-led b2-led'), x, 312);
    silkText(`LD${k}`, x, 326);
    put(mkSwitch(k, 'emu-sw b2-sw'), x, 372);
    silkText(`SW${k}`, x, 420);
    port('sw', k, x, 434);
    port('led', k, x, 340);
  }
  // 4-digit display (AN3..AN0) and, below it, BTN3..BTN0
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = 512 + i * 58;
    put(mkDigit(k), x, 318);
    port('an', k, x, 380, 'emu-on-disp');
  }
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = 512 + i * 58;
    put(mkButton(k, 'emu-btn b2-btn'), x, 412);
    silkText(`BTN${k}`, x, 450);
    port('btn', k, x, 464);
  }
  const wrap = h('div', { class: 'emu-board-wrap' }, pcb,
    boardNote(h, board, title, clockNote));
  noMenu(wrap);
  return wrap;
}
