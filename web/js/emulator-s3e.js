// Silinx - Board Emulator: the Xilinx Spartan-3E Starter Kit drawn (#405, #2478: out of emulator.js as it was).
import { db, chip, holes4, boardFrame } from './emulator-pcb.js';

/** Xilinx / Digilent Spartan-3E Starter Kit: dark green PCB, serial / VGA on the top edge,
 *  Ethernet and USB on the left, 16x2 LCD at the bottom, rotary knob with the four direction
 *  buttons around it, 8 LEDs and 4 slide switches bottom right. */
export function s3eLayout({ board, title, h, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkLcd, mkRotary, turnKnob, mkPower }) {
  const W = 840, H = 560, silk = '#eef3ec';
  const lcdChars = Array.from({ length: 32 }, (_, i) => `<rect x="${314 + (i % 16) * 15.5}" y="${448 + Math.floor(i / 16) * 24}" width="12" height="19" fill="#9fbf3a" opacity=".55"/>`).join('');
  const art = `
    <defs><linearGradient id="s3epcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24543a"/><stop offset="1" stop-color="#1a412b"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="12" fill="url(#s3epcb)" stroke="#102a1b" stroke-width="3"/>
    ${holes4(W, H)}
    <text x="90" y="58" fill="${silk}" font-size="9" text-anchor="middle" font-family="Arial">POWER</text>
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
  put(mkPower(), 96, 18);
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
