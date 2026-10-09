// Silinx - Board Emulator: the design (behavioural RTL simulation) running on a virtual board.
// Switches and buttons drive the input ports, LEDs and 7-segment displays show the outputs,
// following the pin assignments of the UCF and the resources of the project's board.
import { Simulator } from '/core/simulator.js';
import * as V from '/core/values.js';
import { formatTime } from '/core/interp.js';
import { boardWiring, boardOutputs, lcdState, lcdFeed, lcdText } from '/core/emulate.js';

const SPEEDS = [['max', 'Max speed'], [1e5, '100 kHz'], [1e4, '10 kHz'], [1e3, '1 kHz'], [100, '100 Hz'], [10, '10 Hz'], [1, '1 Hz']];
const FRAME_BUDGET_MS = 14;

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
}
const SVG = (tag, attrs = {}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  document.head.append(h('style', {}, `
.emu { display: flex; flex-direction: column; height: 100%; background: var(--bg, #f0f0f0); font: 12px var(--font, system-ui); overflow: auto; }
.emu-bar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--border, #aaa); background: var(--panel-alt, #f7f7f7); flex-wrap: wrap; }
.emu-bar .sep { width: 1px; height: 20px; background: #ccc; margin: 0 4px; }
.emu-bar .stat { margin-left: auto; color: #555; font-family: var(--mono, monospace); }
.emu-main { display: flex; gap: 12px; padding: 12px; flex-wrap: wrap; align-items: flex-start; }
.emu-board { background: linear-gradient(#25603d, #1d4f32); border-radius: 10px; padding: 14px 18px 12px; color: #e9f3ea; box-shadow: 0 2px 8px #0005; min-width: 520px; }
.emu-board h3 { margin: 0 0 10px; font-size: 13px; letter-spacing: .04em; color: #fff; font-weight: 600; }
.emu-row { display: flex; gap: 10px; align-items: flex-end; margin: 10px 0; flex-wrap: wrap; }
.emu-cell { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 46px; }
.emu-cell .res { font: bold 10px var(--mono, monospace); color: #fff; }
.emu-cell .port { font: 10px var(--mono, monospace); color: #bfe3c6; max-width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emu-cell.nc .port { color: #8fb39a; font-style: italic; }
.emu-led { width: 16px; height: 16px; border-radius: 50%; border: 1px solid #0b2; background: #1b3a23; }
.emu-sw { width: 20px; height: 38px; border-radius: 4px; background: #222; position: relative; cursor: pointer; border: 1px solid #000; }
.emu-sw::after { content: ''; position: absolute; left: 2px; right: 2px; height: 16px; bottom: 2px; background: #ddd; border-radius: 3px; transition: bottom .08s; }
.emu-sw.on::after { bottom: 18px; background: #fff; }
.emu-btn { width: 30px; height: 30px; border-radius: 50%; background: radial-gradient(#555, #111); border: 2px solid #999; cursor: pointer; user-select: none; }
.emu-btn.on { background: radial-gradient(#d33, #600); border-color: #fcc; }
.emu-cell.nc .emu-sw, .emu-cell.nc .emu-btn { opacity: .45; }
.emu-disp { background: #111; border-radius: 6px; padding: 8px 10px; display: flex; gap: 6px; }
.emu-side { flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: 10px; }
.emu-box { background: var(--panel, #fff); border: 1px solid var(--border, #aaa); border-radius: 4px; padding: 8px; }
.emu-box h4 { margin: 0 0 6px; font-size: 12px; }
.emu-box table { border-collapse: collapse; width: 100%; font-family: var(--mono, monospace); }
.emu-box td { padding: 2px 4px; border-bottom: 1px solid #eee; }
.emu-log { font-family: var(--mono, monospace); max-height: 140px; overflow: auto; white-space: pre-wrap; color: #333; }
.emu-log .error { color: #c00; } .emu-log .warning { color: #a60; }
.emu-hint { color: #666; }
.emu-board-wrap { display: flex; flex-direction: column; gap: 6px; }
.emu-board-note { color: #555; font-size: 11px; }
.emu-pcb { position: relative; flex: none; }
.emu-pcb-art { position: absolute; left: 0; top: 0; }
.emu-at { position: absolute; transform: translateX(-50%); display: flex; justify-content: center; }
.emu-silk { color: #e8edf7; font: bold 10px Arial, sans-serif; white-space: nowrap; }
.emu-port { color: #ffcf66; font: 9px var(--mono, monospace); white-space: nowrap; max-width: 50px; overflow: hidden; text-overflow: ellipsis; }
.emu-port.nc { color: #8090bb; }
.b2-led { width: 16px; height: 10px; border-radius: 2px; border: 1px solid #0a0a0a; background: #1b3a23; }
.b2-sw { width: 22px; height: 44px; border-radius: 3px; background: #111; border: 1px solid #000; position: relative; cursor: pointer; }
.b2-sw::after { content: ''; position: absolute; left: 3px; right: 3px; height: 17px; bottom: 3px; background: #e6e6e6; border-radius: 2px; transition: bottom .08s; }
.b2-sw.on::after { bottom: 22px; background: #fff; }
.b2-btn { width: 32px; height: 32px; border-radius: 4px; background: #1a1a1a; border: 1px solid #000; position: relative; cursor: pointer; user-select: none; box-shadow: 0 2px 0 #000; }
.b2-btn::after { content: ''; position: absolute; left: 6px; top: 6px; width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(#5a5a5a, #222); }
.b2-btn.on { box-shadow: none; transform: translateY(1px); }
.b2-btn.on::after { background: radial-gradient(#d33, #700); }
.nx2-btn { width: 30px; height: 30px; border-radius: 50%; background: radial-gradient(#555, #151515); border: 2px solid #8a8a8a; cursor: pointer; user-select: none; }
.nx2-btn.on { background: radial-gradient(#d33, #700); border-color: #fcc; }
.s3e-knob { width: 34px; height: 34px; border-radius: 50%; background: radial-gradient(#666, #1c1c1c); border: 2px solid #777; cursor: pointer; user-select: none; }
.s3e-knob.on { background: radial-gradient(#d33, #700); }
.emu-lcd { position: relative; width: 248px; height: 44px; }
.emu-lcd-cell { position: absolute; color: #1c2a08; font: bold 15px/19px var(--mono, monospace); text-align: center; overflow: hidden; }
.emu-rot { display: flex; gap: 46px; }
.emu-rot-btn { width: 24px; height: 24px; border-radius: 50%; border: 1px solid #000; background: #2a2a2a; color: #eee; cursor: pointer; font-size: 14px; line-height: 20px; padding: 0; }
.emu-rot-btn:active { background: #c22; }
`));
}

// 7-segment digit (a..g + dp), brightness per segment
const SEG_PATHS = [
  'M8,4 L32,4 L28,9 L12,9 Z',        // a
  'M33,6 L33,30 L28,26 L28,10 Z',     // b
  'M33,34 L33,58 L28,54 L28,38 Z',    // c
  'M8,60 L32,60 L28,55 L12,55 Z',     // d
  'M7,34 L7,58 L12,54 L12,38 Z',      // e
  'M7,6 L7,30 L12,26 L12,10 Z',       // f
  'M9,32 L13,28 L27,28 L31,32 L27,36 L13,36 Z', // g
];
function makeDigit() {
  const s = SVG('svg', { viewBox: '0 0 44 64', width: 36, height: 54 });
  const segs = SEG_PATHS.map((d) => { const p = SVG('path', { d, fill: '#ff2a1a', opacity: 0.08 }); s.append(p); return p; });
  const dp = SVG('circle', { cx: 39, cy: 58, r: 3.2, fill: '#ff2a1a', opacity: 0.08 });
  s.append(dp);
  return { el: s, set(d) { segs.forEach((p, j) => p.setAttribute('opacity', d ? 0.08 + 0.92 * d.seg[j] : 0.08)); dp.setAttribute('opacity', d ? 0.08 + 0.92 * d.dp : 0.08); } };
}

// ---------------------------------------------------------------------------------------------
// Board drawings: the PCB with its connectors, the parts at their places on the real board
// ---------------------------------------------------------------------------------------------
function svgEl(w, hgt, body) {
  const s = SVG('svg', { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, class: 'emu-pcb-art' });
  s.innerHTML = body;
  return s;
}
const pmod = (x, y, name, silk) => `<rect x="${x}" y="${y}" width="92" height="22" rx="2" fill="#141414"/>`
  + Array.from({ length: 6 }, (_, i) => `<rect x="${x + 8 + i * 14}" y="${y + 7}" width="7" height="7" fill="#c9a94a"/>`).join('')
  + `<text x="${x + 46}" y="${y + 38}" fill="${silk}" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">${name}</text>`;

/** Digilent Basys2: navy PCB, Pmods JA..JD on the top edge, USB left, PS/2 and VGA right,
 *  LEDs above the 8 slide switches at the bottom, 4-digit display with the 4 buttons below it. */
function basys2Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote }) {
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
    <rect x="52" y="122" width="34" height="14" rx="2" fill="#111"/><rect x="54" y="124" width="14" height="10" rx="1" fill="#ddd"/>
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
    <text x="394" y="220" fill="#bbb" font-size="11" text-anchor="middle" font-family="Arial">${(board.device?.part || 'XC3S250E').toUpperCase()}</text>
    <rect x="508" y="176" width="34" height="22" rx="3" fill="#c7cbd2" stroke="#8a8f98"/><text x="525" y="214" fill="${silk}" font-size="9" text-anchor="middle" font-family="Arial">MCLK</text>
    <text x="70" y="226" fill="#fff" font-size="34" font-family="Arial Black, Arial" font-weight="900" letter-spacing="1">BASYS 2</text>
    <text x="566" y="262" fill="#fff" font-size="20" font-family="Arial" font-weight="bold" letter-spacing="2">DIGILENT</text>
    <text x="566" y="278" fill="#c9d3ea" font-size="9" font-family="Arial" letter-spacing="3">BEYOND THEORY</text>
    <rect x="482" y="300" width="232" height="96" rx="6" fill="#0b0b0b" stroke="#2a2a2a"/>
  `));
  const put = (el, x, y, cls = '') => { const w = h('div', { class: `emu-at ${cls}`, style: { left: `${x}px`, top: `${y}px` } }, el); pcb.append(w); return w; };
  const silkText = (t, x, y, size = 10) => put(h('span', { class: 'emu-silk', style: { fontSize: `${size}px` } }, t), x, y);
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
    h('div', { class: 'emu-board-note' }, `${board.name}${title ? ` — ${title}` : ''} · ${clockNote}`));
  return wrap;
}

const db = (x, y, w, hgt, fill, label, silk, vertical = true) => `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="4" fill="${fill}" stroke="#222" stroke-width="1.5"/>`
  + `<rect x="${x + (vertical ? 8 : 10)}" y="${y + (vertical ? 10 : 8)}" width="${w - (vertical ? 16 : 20)}" height="${hgt - (vertical ? 20 : 16)}" rx="3" fill="#2b2b2b"/>`
  + (label ? `<text x="${vertical ? x + w + 8 : x + w / 2}" y="${vertical ? y + hgt / 2 + 4 : y + hgt + 14}" fill="${silk}" font-size="11" ${vertical ? '' : 'text-anchor="middle"'} font-family="Arial" font-weight="bold">${label}</text>` : '');
const pmod12 = (x, y, name, silk) => `<rect x="${x}" y="${y}" width="96" height="30" rx="2" fill="#141414"/>`
  + Array.from({ length: 12 }, (_, i) => `<rect x="${x + 8 + (i % 6) * 14}" y="${y + 6 + Math.floor(i / 6) * 11}" width="7" height="7" fill="#c9a94a"/>`).join('')
  + `<text x="${x + 48}" y="${y + 46}" fill="${silk}" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">${name}</text>`;
const chip = (x, y, w, hgt, lines) => `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="3" fill="#121212" stroke="#333"/>`
  + lines.map((t, i) => `<text x="${x + w / 2}" y="${y + hgt / 2 - (lines.length - 1) * 9 + i * 18 + 4}" fill="${i ? '#bbb' : '#ddd'}" font-size="${i ? 11 : 14}" text-anchor="middle" font-family="Arial" font-weight="${i ? 'normal' : 'bold'}">${t}</text>`).join('');
const holes4 = (W, H) => [[22, 22], [W - 22, 22], [22, H - 22], [W - 22, H - 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#d8c67e"/><circle cx="${x}" cy="${y}" r="5" fill="#1b1b1b"/>`).join('');

function boardFrame({ h, W, H, art, board, title, clockNote }) {
  const pcb = h('div', { class: 'emu-pcb', style: { width: `${W}px`, height: `${H}px` } });
  pcb.append(svgEl(W, H, art));
  const put = (el, x, y, cls = '') => { const w = h('div', { class: `emu-at ${cls}`, style: { left: `${x}px`, top: `${y}px` } }, el); pcb.append(w); return w; };
  const wrap = h('div', { class: 'emu-board-wrap' }, pcb, h('div', { class: 'emu-board-note' }, `${board.name}${title ? ` — ${title}` : ''} · ${clockNote}`));
  return { pcb, put, wrap };
}

/** Digilent Nexys2: teal PCB, Pmods JA..JD on the top edge, serial / VGA / USB on the left, the
 *  FX2 expansion connector on the right, switches + LEDs bottom left, display and buttons bottom right. */
function nexys2Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote }) {
  const W = 800, H = 560, silk = '#eef5f4';
  const art = `
    <defs><linearGradient id="nx2pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7a7c"/><stop offset="1" stop-color="#215e61"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="14" fill="url(#nx2pcb)" stroke="#153f41" stroke-width="3"/>
    ${holes4(W, H)}
    <rect x="44" y="8" width="38" height="34" rx="3" fill="#151515"/><text x="63" y="58" fill="${silk}" font-size="9" text-anchor="middle" font-family="Arial">POWER</text>
    ${pmod12(150, 10, 'JA', silk)}${pmod12(270, 10, 'JB', silk)}${pmod12(390, 10, 'JC', silk)}${pmod12(510, 10, 'JD', silk)}
    ${db(0, 100, 46, 76, '#b9bec6', 'RS-232', silk)}${db(0, 196, 46, 86, '#2f63c9', 'VGA', silk)}
    <rect x="0" y="312" width="34" height="30" rx="3" fill="#b9bec6" stroke="#6b7079"/><rect x="5" y="320" width="20" height="14" rx="2" fill="#4a4e55"/>
    <text x="44" y="332" fill="${silk}" font-size="11" font-family="Arial" font-weight="bold">USB</text>
    <rect x="${W - 58}" y="120" width="44" height="330" rx="3" fill="#141414"/>
    ${Array.from({ length: 22 }, (_, i) => `<rect x="${W - 50}" y="${132 + i * 14}" width="28" height="6" fill="#c9a94a"/>`).join('')}
    <text x="${W - 36}" y="470" fill="${silk}" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">FX2</text>
    ${chip(300, 86, 150, 64, ['Micron', 'MT45W8MW16'])}
    <text x="375" y="190" fill="#fff" font-size="34" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900">N</text>
    ${chip(305, 210, 140, 140, ['XILINX', 'SPARTAN-3E', (board.device?.part || 'XC3S500E').toUpperCase()])}
    <text x="375" y="374" fill="#fff" font-size="15" text-anchor="middle" font-family="Arial" font-weight="bold" letter-spacing="1">NEXYS 2</text>
    <text x="140" y="404" fill="#fff" font-size="20" font-family="Arial" font-weight="bold" letter-spacing="2">DIGILENT</text>
    <text x="140" y="418" fill="#cfe3e2" font-size="9" font-family="Arial" letter-spacing="3">BEYOND THEORY</text>
    <rect x="${W - 64 - 250}" y="398" width="234" height="96" rx="6" fill="#0b0b0b" stroke="#2a2a2a"/>`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = 66 + i * 50;
    put(mkLed(k, 'emu-led b2-led'), x, 432);
    silkText(`LD${k}`, x, 446);
    port('led', k, x, 458);
    put(mkSwitch(k, 'emu-sw b2-sw'), x, 474);
    silkText(`SW${k}`, x, 522);
    port('sw', k, x, 536);
  }
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = W - 64 - 250 + 31 + i * 58;
    put(mkDigit(k), x, 412);
    port('an', k, x, 474, 'emu-on-disp');
    put(mkButton(k, 'emu-btn nx2-btn'), x, 500);
    silkText(`BTN${k}`, x, 534);
  }
  return wrap;
}

/** Xilinx / Digilent Spartan-3E Starter Kit: dark green PCB, serial / VGA on the top edge,
 *  Ethernet and USB on the left, 16x2 LCD at the bottom, rotary knob with the four direction
 *  buttons around it, 8 LEDs and 4 slide switches bottom right. */
function s3eLayout({ board, title, h, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkLcd, mkRotary, turnKnob }) {
  const W = 840, H = 560, silk = '#eef3ec';
  const lcdChars = Array.from({ length: 32 }, (_, i) => `<rect x="${314 + (i % 16) * 15.5}" y="${448 + Math.floor(i / 16) * 24}" width="12" height="19" fill="#9fbf3a" opacity=".55"/>`).join('');
  const art = `
    <defs><linearGradient id="s3epcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24543a"/><stop offset="1" stop-color="#1a412b"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="12" fill="url(#s3epcb)" stroke="#102a1b" stroke-width="3"/>
    ${holes4(W, H)}
    <rect x="70" y="6" width="40" height="36" rx="3" fill="#151515"/><text x="90" y="58" fill="${silk}" font-size="9" text-anchor="middle" font-family="Arial">POWER</text>
    <rect x="150" y="6" width="54" height="52" rx="6" fill="#7b3fa0" stroke="#4d2266"/><circle cx="177" cy="32" r="15" fill="#2b2b2b"/><text x="177" y="74" fill="${silk}" font-size="10" text-anchor="middle" font-family="Arial" font-weight="bold">PS/2</text>
    ${db(250, 0, 90, 46, '#b9bec6', 'DCE', silk, false)}${db(430, 0, 90, 46, '#b9bec6', 'DTE', silk, false)}${db(560, 0, 96, 46, '#2f63c9', 'VGA', silk, false)}
    <rect x="0" y="180" width="54" height="60" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="8" y="192" width="38" height="36" fill="#55595f"/>
    <text x="64" y="214" fill="${silk}" font-size="10" font-family="Arial" font-weight="bold">ETHERNET</text>
    <rect x="0" y="262" width="40" height="30" rx="3" fill="#b9bec6" stroke="#6b7079"/><text x="50" y="282" fill="${silk}" font-size="10" font-family="Arial" font-weight="bold">USB</text>
    <rect x="${W - 46}" y="110" width="40" height="210" rx="3" fill="#1d6b3a" stroke="#0d3b1f"/>
    ${Array.from({ length: 6 }, (_, i) => `<circle cx="${W - 26}" cy="${132 + i * 33}" r="8" fill="#9aa1a8" stroke="#4d5359"/>`).join('')}
    ${chip(330, 150, 150, 150, ['XILINX', 'SPARTAN-3E', (board.device?.part || 'XC3S500E').toUpperCase()])}
    <text x="560" y="250" fill="#fff" font-size="22" font-family="Arial" font-weight="bold" font-style="italic">SPARTAN-3E</text>
    <text x="560" y="270" fill="#cfe0d2" font-size="10" font-family="Arial" letter-spacing="2">STARTER KIT</text>
    <rect x="296" y="426" width="282" height="86" rx="4" fill="#3d4a1c" stroke="#222" stroke-width="2"/>
    <rect x="306" y="438" width="262" height="62" rx="2" fill="#b7d24c"/>${lcdChars}
    <text x="437" y="530" fill="${silk}" font-size="10" text-anchor="middle" font-family="Arial">LCD 16x2 (HD44780)</text>
    <circle cx="150" cy="420" r="34" fill="#111" stroke="#444" stroke-width="3"/><circle cx="150" cy="420" r="22" fill="#2a2a2a"/>
    <text x="236" y="380" fill="${silk}" font-size="9" font-family="Arial">ROTARY</text><text x="236" y="392" fill="${silk}" font-size="9" font-family="Arial">(push = ROT_CENTER)</text>`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // LCD glass: 2 x 16 characters over the drawn cells
  put(mkLcd(), 437, 448);
  // rotary push in the middle of the knob, ⟲ / ⟳ beside it (and the mouse wheel), direction buttons around it
  const knob = put(mkButton(0, 'emu-btn s3e-knob', 'rot_center'), 150, 403);
  knob.addEventListener('wheel', (e) => { e.preventDefault(); turnKnob(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  put(mkRotary(), 150, 446);
  const dirs = [['btn_north', 'NORTH', 150, 316], ['btn_south', 'SOUTH', 150, 470], ['btn_west', 'WEST', 70, 404], ['btn_east', 'EAST', 230, 404]];
  for (const [res, lbl, x, y] of dirs) {
    if (!board.resources.some((r) => r.name === res)) continue;
    put(mkButton(0, 'emu-btn b2-btn', res), x, y);
    silkText(lbl, x, y + 34);
    port(res, 0, x, y + 47);
  }
  // LEDs LD7..LD0 and switches SW3..SW0 on the right
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = 612 + i * 26;
    put(mkLed(k, 'emu-led b2-led'), x, 392);
    silkText(`${k}`, x, 405);
  }
  silkText('LD7 ··· LD0', 703, 372);
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = 636 + i * 46;
    put(mkSwitch(k, 'emu-sw b2-sw', 'sw'), x, 432);
    silkText(`SW${k}`, x, 480);
    port('sw', k, x, 494);
  }
  return wrap;
}

const BOARD_LAYOUTS = { basys2: basys2Layout, nexys2: nexys2Layout, 's3e-starter': s3eLayout };
s3eLayout.lcd = true;   // the layout shows the character LCD

/**
 * Mount the emulator.
 * @param {HTMLElement} container
 * @param {{ design, board, assignments, title?, files?, onOpenSource? }} opts
 */
export function mountEmulator(container, { design, board, assignments, title = '', files, timing = null, model = null }) {
  injectStyle();
  const wiring = boardWiring({ ports: design.top.ports, assignments, board });
  const sim = new Simulator(design, { files, maxWaveEvents: 1e9 });
  const inputPorts = design.top.ports.filter((p) => p.dir === 'in');
  const outputSigs = new Set(wiring.bits.filter((b) => b.dir !== 'in').map((b) => b.sig));
  const clockSigs = new Set(wiring.clocks.map((c) => c.sig));
  // a clock port that is not on a board clock pin: named clk*, driven at 50 MHz
  if (!wiring.clocks.length) {
    const c = inputPorts.find((p) => /^(clk|clock|mclk)/i.test(p.name) && p.sig.t.w === 1);
    if (c) wiring.clocks.push({ sig: c.sig, port: c.name, period: 20000, guessed: true });
  }
  const period = wiring.clocks[0]?.period || 20000;
  const inVal = new Map(inputPorts.map((p) => [p.sig, 0n]));   // value of each input port (unmapped bits 0)
  // inputs with a pull-up on the board (e.g. the rotary encoder's A / B) rest at '1'
  for (const b of wiring.bits) if (b.dir === 'in' && b.res.pull === 'up' && b.kind !== 'sw' && b.kind !== 'btn') inVal.set(b.sig, (inVal.get(b.sig) ?? 0n) | (1n << BigInt(b.pos)));
  const hasLcd = wiring.bits.some((b) => b.res.name === 'lcd_e');
  let lcd = lcdState(), lcdView = null;

  let running = false, speed = 'max', prev = null, raf = 0, destroyed = false;
  let slice = 2000, cyclesAcc = 0, lastT = 0, rateWin = { t: performance.now(), cyc: 0, rate: 0 };
  let logN = 0;
  let lcdDirty = true;

  // ------------------------------------------------------------------------------- DOM
  const root = h('div', { class: 'emu' });
  container.append(root);
  const runBtn = h('button', { class: 'btn', onclick: () => setRunning(!running) }, '▶ Run');
  const stepBtn = h('button', { class: 'btn', title: 'Advance one clock cycle', onclick: () => step() }, '⏭ Step');
  const resetBtn = h('button', { class: 'btn', title: 'Power-cycle the board: restart the design from time 0', onclick: () => powerCycle() }, '⟲ Power cycle');
  const speedSel = h('select', { title: 'Emulated clock rate', onchange: (e) => { speed = e.target.value === 'max' ? 'max' : Number(e.target.value); } },
    ...SPEEDS.map(([v, l]) => h('option', { value: v }, l)));
  const stat = h('span', { class: 'stat' });
  // timing scale: the top's large integer generics divided (see core/emulate.js)
  let timingSel = null;
  if (timing?.gens?.length) {
    const opts = [1, 10, 100, 1000, 10000, 100000];
    if (!opts.includes(timing.scale)) opts.push(timing.scale);
    timingSel = h('select', { title: `Divide the timing generics (${timing.gens.map((g) => `${g.name} = ${g.value.toLocaleString()}`).join(', ')}) so that the design runs visibly at the emulator's speed`,
      onchange: (e) => timing.onChange?.(Number(e.target.value)) },
      ...opts.sort((a, b) => a - b).map((k) => h('option', { value: k, selected: k === timing.scale }, k === 1 ? 'real (÷1)' : `÷${k.toLocaleString()}`)));
  }
  // the model: behavioural RTL or a netgen netlist (post-synthesis / translate / map / place & route)
  const modelSel = model ? h('select', { title: 'What runs on the board: the HDL (RTL) or a netlist generated by ISE (netgen)', onchange: (e) => model.onChange?.(e.target.value) },
    h('option', { value: '', selected: !model.current }, 'Behavioral (RTL)'),
    ...Object.entries(model.names).map(([k, n]) => h('option', { value: k, selected: model.current === k, disabled: !model.available.includes(k) && model.current !== k },
      `${n} netlist${model.available.includes(k) ? '' : ' (not generated)'}`))) : null;
  root.append(h('div', { class: 'emu-bar' }, modelSel ? 'Model:' : null, modelSel, modelSel ? h('span', { class: 'sep' }) : null,
    runBtn, stepBtn, resetBtn, h('span', { class: 'sep' }), 'Clock:', speedSel,
    timingSel ? h('span', { class: 'sep' }) : null, timingSel ? 'Timing:' : null, timingSel, stat));

  const main = h('div', { class: 'emu-main' });
  root.append(main);
  // the port bit on resource `res` (its pin `idx`); widgets are addressed by board resource name
  const bitFor = (res, idx = 0) => wiring.bits.find((b) => b.res.name === res && b.idx === idx);
  const resOf = (name) => board.resources.find((r) => r.name === name);
  const resLabel = { led: 'LD', sw: 'SW', btn: 'BTN', an: 'AN' };
  const resName = (res, idx) => (resLabel[res] ? `${resLabel[res]}${idx}` : res.toUpperCase());
  const tip = (res, idx = 0) => { const b = bitFor(res, idx); return b ? `${resName(res, idx)} = ${b.bit} (pin ${b.loc})` : `${resName(res, idx)}: not connected in the UCF`; };
  const setInputBit = (b, v) => {
    if (!b || b.dir !== 'in') return;
    const cur = inVal.get(b.sig) ?? 0n;
    const m = 1n << BigInt(b.pos);
    const nv = v ? cur | m : cur & ~m;
    if (nv === cur) return;
    inVal.set(b.sig, nv);
    applyInput(b.sig);
  };

  // ---- interactive parts (placed by the board layout below)
  const digits = [], leds = [];
  const mkDigit = (k) => { const d = makeDigit(); digits[k] = d; return d.el; };
  const mkLed = (k, cls = 'emu-led') => { const l = h('div', { class: cls }); leds[k] = l; return l; };
  const mkSwitch = (k, cls = 'emu-sw', res = 'sw') => {
    const b = bitFor(res, k);
    const el = h('div', { class: cls, title: `${tip(res, k)} — click to toggle` });
    el.addEventListener('click', () => { const on = !el.classList.contains('on'); el.classList.toggle('on', on); setInputBit(b, on); if (!running) refresh(); });
    return el;
  };
  const mkButton = (k, cls = 'emu-btn', res = 'btn') => {
    const b = bitFor(res, k);
    const el = h('div', { class: cls, title: `${tip(res, k)} — press and hold (Shift+click keeps it pressed)` });
    let latched = false;
    const set = (on) => { el.classList.toggle('on', on); setInputBit(b, on); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (e.shiftKey) { latched = !latched; set(latched); } else { latched = false; set(true); el.setPointerCapture(e.pointerId); } });
    el.addEventListener('pointerup', () => { if (!latched) set(false); });
    el.addEventListener('pointercancel', () => { if (!latched) set(false); });
    return el;
  };
  const portLabel = (res, k = 0) => { const b = bitFor(res, k); return b ? b.bit : '—'; };
  // character LCD: 2 x 16 cells drawn from the HD44780 model (custom characters from CGRAM)
  const mkLcd = ({ cellW = 15.5, cellH = 24, w = 12, h: ch = 19 } = {}) => {
    const el = h('div', { class: 'emu-lcd', title: hasLcd ? 'Character LCD (HD44780): lcd_e, lcd_rs, lcd_rw, lcd_d' : 'LCD: not connected in the UCF' });
    const cells = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) {
      const cell = h('div', { class: 'emu-lcd-cell', style: { left: `${c * cellW}px`, top: `${r * cellH}px`, width: `${w}px`, height: `${ch}px` } });
      cells.push(cell); el.append(cell);
    }
    lcdView = {
      set(lines, st) {
        cells.forEach((cell, i) => {
          const code = lines ? lines[i >> 4][i & 15] : 0x20;
          if (cell._code === code && !(code < 16 && lines)) return;
          cell._code = code;
          if (lines && code < 16) {   // custom character: 5x8 dots from CGRAM
            const base = (code & 7) * 8;
            let svg = '<svg viewBox="0 0 5 8" width="100%" height="100%">';
            for (let y = 0; y < 8; y++) for (let x = 0; x < 5; x++) if ((st.cgram[base + y] >> (4 - x)) & 1) svg += `<rect x="${x}" y="${y}" width=".9" height=".9" fill="#1c2a08"/>`;
            cell.innerHTML = `${svg}</svg>`;
          } else cell.textContent = code === 0x20 ? '' : (code === 0x5c ? '¥' : code === 0x7e ? '→' : code === 0x7f ? '←' : String.fromCharCode(code));
        });
      },
    };
    return el;
  };
  // rotary encoder (ROT_A / ROT_B in quadrature, at rest both '1'): one detent per click / wheel step
  const QUAD_CYCLES = 1000;
  const turnKnob = (dir) => {
    const a = bitFor('rot_a'), b = bitFor('rot_b');
    if (!a || !b) return;
    const seq = dir > 0 ? [[0, 1], [0, 0], [1, 0], [1, 1]] : [[1, 0], [0, 0], [0, 1], [1, 1]];   // clockwise: A leads
    seq.forEach(([va, vb], k) => sim.at(sim.now + (k + 1) * QUAD_CYCLES * period, () => { setInputBit(a, va); setInputBit(b, vb); }));
    if (!running) { runCycles(5 * QUAD_CYCLES); refresh(); }
  };
  const mkRotary = () => {
    const el = h('div', { class: 'emu-rot', title: bitFor('rot_a') ? 'Turn the knob: ⟲ / ⟳ or the mouse wheel (ROT_A / ROT_B)' : 'Rotary encoder: ROT_A / ROT_B not connected in the UCF' },
      h('button', { class: 'emu-rot-btn', title: 'Turn left (counter-clockwise)', onclick: () => turnKnob(-1) }, '⟲'),
      h('button', { class: 'emu-rot-btn', title: 'Turn right (clockwise)', onclick: () => turnKnob(1) }, '⟳'));
    return el;
  };

  const notEmulated = board.resources.filter((r) => !['led', 'sw', 'btn', 'seg', 'dp', 'an', 'rot'].includes(wiring.bits.find((b) => b.res === r)?.kind) && r.group !== 'Clock'
    && !(r.group === 'LCD' && BOARD_LAYOUTS[board.id]?.lcd)
    && wiring.bits.some((b) => b.res === r)).map((r) => r.name);
  const clockNote = (wiring.clocks.length ? `Clock ${wiring.clocks.map((c) => c.port).join(', ')}: ${1e6 / period} MHz on the board${wiring.clocks[0].guessed ? ' (not in the UCF: assumed)' : ''}` : 'No clock input found')
    + (notEmulated.length ? ` · not emulated: ${notEmulated.join(', ')}` : '');

  const layout = BOARD_LAYOUTS[board.id];
  if (layout) main.append(layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkLcd, mkRotary, turnKnob }));
  else {
    // generic board: rows of displays, LEDs, switches and buttons
    const boardEl = h('div', { class: 'emu-board' }, h('h3', {}, `${board.name}${title ? ` — ${title}` : ''}`));
    main.append(boardEl);
    const cell = (kind, idx, widget) => h('div', { class: `emu-cell${bitFor(kind, idx) ? '' : ' nc'}`, title: tip(kind, idx) },
      widget, h('span', { class: 'res' }, `${resLabel[kind] || kind}${idx}`), h('span', { class: 'port' }, portLabel(kind, idx)));
    const row = (res, kind, mk) => {
      const r = resOf(res);
      if (!r) return;
      const el = h('div', { class: 'emu-row' });
      for (let k = r.pins.length - 1; k >= 0; k--) el.append(cell(kind, k, mk(k)));
      boardEl.append(el);
    };
    if (resOf('an') && resOf('seg')) {
      const disp = h('div', { class: 'emu-disp' });
      for (let k = resOf('an').pins.length - 1; k >= 0; k--) disp.append(cell('an', k, mkDigit(k)));
      boardEl.append(h('div', { class: 'emu-row' }, disp));
    }
    row('led', 'led', (k) => mkLed(k));
    row('sw', 'sw', (k) => mkSwitch(k));
    row('btn', 'btn', (k) => mkButton(k));
    const others = board.resources.filter((r) => r.name !== 'btn' && (/^btn_/.test(r.name) || r.name === 'rot_center'));
    if (others.length) boardEl.append(h('div', { class: 'emu-row' }, ...others.map((r) => h('div', { class: `emu-cell${bitFor(r.name) ? '' : ' nc'}`, title: tip(r.name) },
      mkButton(0, 'emu-btn', r.name), h('span', { class: 'res' }, r.name.replace(/^btn_/, '').toUpperCase()), h('span', { class: 'port' }, portLabel(r.name))))));
    boardEl.append(h('div', { style: { fontSize: '11px', color: '#cfe8d4', marginTop: '6px' } }, clockNote));
  }

  // side: watch, unconnected ports, log
  const side = h('div', { class: 'emu-side' });
  main.append(side);
  const watchBody = h('tbody');
  const watched = [];
  const sigSel = h('select', { style: { maxWidth: '100%' } }, h('option', { value: '' }, 'Add a signal to watch…'),
    ...design.signals.filter((s) => !Array.isArray(s.init) && s.t?.kind !== 'str').map((s, i) => h('option', { value: String(i) }, s.path || s.name)));
  const sigList = design.signals.filter((s) => !Array.isArray(s.init) && s.t?.kind !== 'str');
  sigSel.addEventListener('change', () => {
    const s = sigList[Number(sigSel.value)];
    sigSel.value = '';
    if (!s || watched.some((w) => w.s === s)) return;
    const val = h('td', { style: { textAlign: 'right' } });
    const tr = h('tr', {}, h('td', {}, s.path || s.name), val,
      h('td', {}, h('a', { href: '#', title: 'Remove', onclick: (e) => { e.preventDefault(); tr.remove(); watched.splice(watched.findIndex((w) => w.s === s), 1); } }, '✕')));
    watched.push({ s, val });
    watchBody.append(tr);
    refresh();
  });
  side.append(h('div', { class: 'emu-box' }, h('h4', {}, 'Watch'), sigSel, h('table', {}, watchBody)));
  if (timing?.gens?.length) {
    const used = new Map((design.top.params || []).map((p) => [p.name, Number(p.value?.v ?? 0)]));
    side.append(h('div', { class: 'emu-box' }, h('h4', {}, timing.scale > 1 ? `Timing ÷${timing.scale.toLocaleString()} (emulation only)` : 'Timing generics'),
      h('table', {}, h('tbody', {}, ...timing.gens.map((g) => h('tr', {}, h('td', {}, g.name), h('td', { style: { textAlign: 'right' } }, g.value.toLocaleString()),
        h('td', { style: { textAlign: 'right' } }, timing.scale > 1 ? `→ ${(used.get(g.name) ?? 0).toLocaleString()}` : ''))))),
      h('div', { class: 'emu-hint', style: { marginTop: '4px' } }, timing.scale > 1
        ? 'Divided so that counters, dividers and debouncers advance at the emulator\'s speed (about 10^5 clock cycles per second instead of 50 MHz). The design and the bitstream are not changed.'
        : 'Real values: at the emulator\'s speed, a design that counts millions of cycles moves very slowly.')));
  }
  const unm = wiring.unmapped.filter((u) => !clockSigs.has(design.top.ports.find((p) => p.name === u.port)?.sig));
  if (unm.length) {
    side.append(h('div', { class: 'emu-box' }, h('h4', {}, 'Not on the board'),
      h('div', { class: 'emu-hint' }, `${unm.length} port bit(s) have no LOC on a ${board.name} resource (inputs are held at 0): `),
      h('div', { style: { fontFamily: 'var(--mono, monospace)', marginTop: '4px' } }, unm.map((u) => `${u.bit}${u.loc ? ` (${u.loc})` : ''}`).join(', '))));
  }
  const logEl = h('div', { class: 'emu-log' });
  side.append(h('div', { class: 'emu-box' }, h('h4', {}, 'Messages'), logEl));
  side.append(h('div', { class: 'emu-hint' }, 'The design is simulated from its HDL (behavioural RTL) at a reduced clock rate; registers without an initial value start at 0, as on the FPGA; '
    + 'each display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board. Buttons: press and hold; Shift+click keeps a button pressed.'));

  // ------------------------------------------------------------------------------- simulation
  function applyInput(sig) {
    if (clockSigs.has(sig) || wiring.clocks.some((c) => c.sig === sig)) return;
    sim.force(sig, V.fromInt(inVal.get(sig) ?? 0n, sig.t.w));
  }
  // Like the FPGA after configuration: every register / memory without an explicit initial value
  // starts at 0 (in simulation it would stay 'U'/X, e.g. a free-running counter never starts).
  const allX = (v) => v && !Array.isArray(v) && v.w > 0 && v.x === (1n << BigInt(v.w)) - 1n;
  const zeroOf = (v) => V.withSign(V.fromInt(0, v.w, false), v.s);
  function powerUpZero() {
    for (const s of design.signals) {
      if (Array.isArray(s.val)) { if (s.val.some(allX)) s.val = s.val.map((e) => (allX(e) ? zeroOf(e) : e)); }
      else if (allX(s.val)) s.val = zeroOf(s.val);
    }
  }
  function setupSim() {
    powerUpZero();
    for (const s of design.signals) s.wave = null;
    for (const p of inputPorts) applyInput(p.sig);
    for (const c of wiring.clocks) sim.addClock(c.sig, { period: c.period });
    prev = null;
    lcd = lcdState(); lcdDirty = true;
    logN = 0;
    logEl.textContent = '';
  }
  function powerCycle() {
    sim.reset();
    setupSim();
    refresh();
  }
  function runCycles(n) {
    const t0 = sim.now;
    for (const s of outputSigs) s.wave = { t: [sim.now], v: [s.val] };
    sim.waveEvents = 0; sim.waveTruncated = false;
    sim.run(sim.now + n * period);
    prev = boardOutputs(wiring, t0, Math.max(sim.now, t0 + 1), prev);
    if (hasLcd && lcdFeed(lcd, wiring, t0, sim.now)) lcdDirty = true;
    rateWin.cyc += n;
  }
  function step() { setRunning(false); runCycles(1); refresh(); }
  function setRunning(on) {
    running = on && !sim.finished;
    runBtn.textContent = running ? '⏸ Pause' : '▶ Run';
    stepBtn.disabled = running;
    lastT = performance.now();
    cyclesAcc = 0;
  }

  // a timer rather than requestAnimationFrame: the board keeps running (slower) when its tab is
  // not visible, and in headless browsers
  const schedule = () => { raf = setTimeout(() => frame(performance.now()), running ? 4 : 30); };
  function frame(now) {
    if (destroyed) return;
    schedule();
    if (!running) return;
    const start = performance.now();
    if (speed === 'max') {
      // as many cycles as fit in the frame budget
      let done = 0;
      do {
        runCycles(slice);
        done += slice;
        if (sim.finished) break;
      } while (performance.now() - start < FRAME_BUDGET_MS * 0.85);
      const perCycle = (performance.now() - start) / Math.max(1, done);   // ms per clock cycle
      slice = Math.max(50, Math.min(200000, Math.round((FRAME_BUDGET_MS * 0.2) / Math.max(1e-6, perCycle))));
    } else {
      cyclesAcc += speed * Math.min(0.25, (now - lastT) / 1000);
      lastT = now;
      let n = Math.floor(cyclesAcc);
      cyclesAcc -= n;
      while (n > 0 && performance.now() - start < FRAME_BUDGET_MS) {
        const k = Math.min(n, slice);
        runCycles(k);
        n -= k;
        if (sim.finished) break;
      }
      if (n > 0) cyclesAcc = 0;   // could not keep up: drop the backlog
    }
    if (sim.finished) setRunning(false);
    refresh();
  }

  function refresh() {
    // no window run yet (start-up, power cycle): LEDs and digits dark
    leds.forEach((l, k) => { const v = prev?.leds[k] ?? 0; l.style.background = `rgb(${Math.round(27 + 20 * v)}, ${Math.round(58 + 197 * v)}, ${Math.round(35 + 40 * v)})`; l.style.boxShadow = v > 0.05 ? `0 0 ${Math.round(8 * v)}px #4f4` : 'none'; });
    digits.forEach((d, k) => d && d.set(prev?.digits[k] ?? null));
    if (lcdView && lcdDirty) { lcdView.set(lcdText(lcd), lcd); lcdDirty = false; }
    for (const w of watched) {
      const v = w.s.val;
      w.val.textContent = v == null || Array.isArray(v) ? '?' : (w.s.t?.w > 1 ? `${V.toBin(v)}${v.x ? '' : ` (${v.v.toString(16).toUpperCase()}h)`}` : (v.x ? 'X' : v.v.toString()));
    }
    const nowMs = performance.now();
    if (nowMs - rateWin.t > 1000) { rateWin.rate = rateWin.cyc * 1000 / (nowMs - rateWin.t); rateWin = { t: nowMs, cyc: 0, rate: rateWin.rate }; }
    const r = running ? rateWin.rate : 0;
    stat.textContent = `t = ${formatTime(sim.now)} · ${Math.round(sim.now / period).toLocaleString()} cycles${running ? ` · ${r >= 1000 ? `${(r / 1000).toFixed(1)} kHz` : `${Math.round(r)} Hz`} (${(r * period / 1e10).toFixed(r * period / 1e10 < 1 ? 3 : 1)}% of real time)` : ''}${sim.finished === 'error' ? ' · stopped by an error' : ''}`;
    // simulator messages
    const log = sim.log;
    if (log.length !== logN) {
      for (const e of log.slice(Math.max(logN, log.length - 50))) logEl.append(h('div', { class: e.kind }, `${formatTime(e.time)}  ${e.kind === 'print' ? '' : `${e.kind.toUpperCase()}: `}${e.text}`));
      logN = log.length;
      while (logEl.childElementCount > 200) logEl.firstChild.remove();
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  setupSim();
  sim.run(0);
  refresh();
  schedule();
  setRunning(true);

  return {
    destroy() { destroyed = true; clearTimeout(raf); root.remove(); },
    pause: () => setRunning(false),
    wiring,
    sim,
    get outputs() { return prev; },
  };
}
