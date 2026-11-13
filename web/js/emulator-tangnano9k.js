// Silinx - Board Emulator: the Tang Nano 9K drawn as the real board (#3745). Our own drawing, after the board's photo
// and pinout in its maker's wiki, turned a quarter (the USB-C on the left, the HDMI on the right; the board 1100 x 380):
// each part where it is, with its silkscreen names; over and under it, the breadboards on its headers J7 and J6 that
// the board's data puts the examples' display (or VGA) and LEDs, switches and buttons on.
import { esc } from './dom.js';
import { ledNumbers } from '/core/emulate.js';
import { boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 1100, BH = 380, T = 200, BB = 250, H = T + BH + BB;   // the board T down, J7's breadboard over it, J6's under it
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
// the headers: J7 along the top edge, J6 along the bottom edge, 24 pins each, their FPGA pins left to right
const J7 = ['63', '86', '85', '84', '83', '82', '81', '80', '79', '77', '76', '75', '74', '73', '72', '71', '70', '5V', '48', '49', '31', '32', 'GND', '3V3'];
const J6 = ['38', '37', '36', '39', '25', '26', '27', '28', '29', '30', '33', '34', '40', '35', '41', '42', '51', '53', '54', '55', '56', '57', '68', '69'];
const PIN_X = (j) => 44 + j * 37.9, J7_Y = 18, J6_Y = 362;
const pinX = (row, pin) => PIN_X(Math.max(0, row.indexOf(pin)));
const headerRow = (y) => Array.from({ length: 24 }, (_, j) => `<circle cx="${PIN_X(j)}" cy="${y}" r="10" fill="#e8d84a"/><circle cx="${PIN_X(j)}" cy="${y}" r="5" fill="#2a2410"/>`).join('');
const pinNames = (row, y) => row.map((p, j) => text(PIN_X(j), y, p, { size: 8, weight: 'normal' })).join('');

// where the parts are (their centres, on the board)
const POWER = [118, 188];
const BTN_AT = [[49, 54], [49, 311]];                     // S1, S2: btn_n[0..1]
const LED_X = 287, LED_Y = (i) => 156 + i * 24.2;         // LED1 (top) .. LED6: led_n[0..5]
// on J6's breadboard, each part under its pin: LD0..LD7, SW0..SW7, BTN0..BTN3
const BB_LED_Y = T + BH + 52, BB_SW_Y = T + BH + 138;
// on J7's breadboard: the 4-digit display AN3..AN0
const DIG_X = (i) => 160 + i * 54, DIG_Y = 92;

/** Sipeed Tang Nano 9K: black PCB, turned a quarter. The USB-C on the left end, the buttons S1 (top) and S2 (bottom)
 *  beside it, the USB-JTAG chip, LED1..LED6 in a column left of the FPGA, the board's name under it, the 27 MHz
 *  oscillator, the flash, the LCD's 40-pin and 8-pin FPC connectors, the HDMI connector on the right end; the headers
 *  J7 (top) and J6 (bottom) along the long edges. The board has no power switch (the USB powers it): the emulator's is
 *  by the USB-C. Over it, the breadboard on J7 (the 4-digit display, or VGA); under it, the breadboard on J6 (LD0..LD7,
 *  SW0..SW7, BTN0..BTN3, each under its pin). */
export function tangnano9kLayout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const has = (res) => board.resources.some((r) => r.name === res);
  const hasDisp = has('an'), hasVga = has('vga_hsync');
  const n = ledNumbers(board);
  const art = `${topBreadboard(board, hasDisp, hasVga)}${bottomBreadboard(board)}<g transform="translate(0 ${T})">
    <defs><linearGradient id="tn9pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1e20"/><stop offset="1" stop-color="#141416"/></linearGradient></defs>
    <rect x="2" y="2" width="${W - 4}" height="${BH - 4}" rx="22" fill="url(#tn9pcb) #1e1e20" stroke="#000" stroke-width="3"/>
    ${headerRow(J7_Y)}${headerRow(J6_Y)}${text(PIN_X(0) - 22, J7_Y + 4, 'J7', { size: 9, anchor: 'end' })}${text(PIN_X(0) - 22, J6_Y + 4, 'J6', { size: 9, anchor: 'end' })}
    ${pinNames(J7, J7_Y + 26)}${pinNames(J6, J6_Y - 18)}
    <rect x="0" y="122" width="88" height="131" rx="10" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="146" width="40" height="84" rx="8" fill="#55595f"/>${text(60, 268, 'USB-C', { size: 9 })}
    ${BTN_AT.map(([x, y]) => `<rect x="${x - 24}" y="${y - 20}" width="48" height="40" rx="2" fill="#e9e9e9" stroke="#9a9a9a"/>`).join('')}
    ${text(BTN_AT[0][0] + 34, BTN_AT[0][1] + 34, 'S1', { size: 10 })}${text(BTN_AT[1][0] + 34, BTN_AT[1][1] - 26, 'S2', { size: 10 })}
    ${ic(165, 233, 68, 68, [], 7)}${ic(160, 90, 70, 70, [], 7)}
    ${ic(331, 119, 156, 154, [], 9)}${text(409, 190, 'GW1NR-9', { size: 11, fill: '#ddd' })}${text(409, 206, 'QN88', { size: 9, weight: 'normal', fill: '#bbb' })}
    ${text(420, 306, 'TANG NANO 9K', { size: 15 })}
    <rect x="540" y="175" width="54" height="44" rx="3" fill="#d8dbe0" stroke="#7b8088"/>${text(567, 202, '27MHz', { size: 8, weight: 'normal', fill: '#333' })}
    ${ic(579, 44, 82, 73, ['FLASH'], 8)}
    <rect x="491" y="253" width="360" height="78" rx="3" fill="#f2f2f2" stroke="#999"/><rect x="505" y="268" width="332" height="40" fill="#151515"/>${text(671, 246, 'LCD', { size: 9 })}
    <rect x="720" y="126" width="48" height="107" rx="2" fill="#151515" stroke="#444"/>${text(744, 118, '1  8', { size: 8, weight: 'normal' })}
    <rect x="905" y="78" width="195" height="223" rx="4" fill="#c3c7cd" stroke="#6b7079"/><rect x="950" y="110" width="140" height="160" rx="4" fill="#9da2a9"/>${text(870, 194, 'HDMI', { size: 11, rotate: true })}
    ${[[1002, 350], [1002, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="#e8d84a"/><circle cx="${x}" cy="${y}" r="7" fill="#1b1b1b"/>`).join('')}</g>`;
  const { put: putAt, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const put = (el, x, y, cls) => putAt(el, x, y + T, cls);   // (on the board, under J7's breadboard)
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silk = (t, x, y, cls = '') => putAt(h('span', { class: `emu-silk tn9-silk ${cls}` }, t), x, y);
  const port = (res, k, x, y, cls = '') => putAt(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y, cls);
  // the emulator's power switch (the board has none), upright by the USB-C, its LED right of it
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'tn9-power');
  // S1, S2 (btn_n[0..1], active low) and LED1..LED6 (led_n[0..5], active low) on the board
  for (let i = 0; i < 2; i++) {
    const k = 1 - i, [x, y] = BTN_AT[k];
    part(put(mkButton(k, 'emu-btn tn9-btn', 'btn_n'), x, y - 12), `btn_n${k}`);
    port('btn_n', k, x + 72, T + y - 6);
  }
  for (let i = 0; i < 6; i++) {
    const k = 5 - i, y = LED_Y(k);
    part(put(mkLed(n.led_n + k, 'emu-led b2-led tn9-led'), LED_X, y - 6), `led_n${k}`);
    silk(`LED${k + 1}`, LED_X - 30, T + y - 6);
  }
  // J6's breadboard: LD0..LD7, SW0..SW7, BTN0..BTN3, each under its pin, named with it, its port under it
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = pinX(J6, pinsOf(board, 'led')[k]);
    part(putAt(mkLed(k, 'emu-led b2-led tn9-bbled'), x, BB_LED_Y - 10), `led${k}`);
    silk(`LD${k}`, x, BB_LED_Y + 14, 'tn9-dark');
    port('led', k, x, BB_LED_Y + 26, 'tn9-vport');
  }
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = pinX(J6, pinsOf(board, 'sw')[k]);
    part(putAt(mkSwitch(k, 'emu-sw icb-sw'), x, BB_SW_Y - 24), `sw${k}`);
    silk(`SW${k}`, x, BB_SW_Y + 28, 'tn9-dark');
    port('sw', k, x, BB_SW_Y + 40, 'tn9-vport');
  }
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = pinX(J6, pinsOf(board, 'btn')[k]);
    part(putAt(mkButton(k, 'emu-btn tn9-btn'), x, BB_SW_Y - 12), `btn${k}`);
    silk(`BTN${k}`, x, BB_SW_Y + 28, 'tn9-dark');
    port('btn', k, x, BB_SW_Y + 40, 'tn9-vport');
  }
  // J7's breadboard: the 4-digit display (AN3..AN0), when the board has it
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = DIG_X(i);
    if (!hasDisp) break;
    part(putAt(mkDigit(k), x, DIG_Y - 27), `an${k}`);
    silk(`AN${k}`, x, DIG_Y + 36, 'tn9-dark');
    port('an', k, x, DIG_Y + 48);
  }
  return wrap;
}

const BREADBOARD = '#ebe6d6';
const holeRows = (x0, y, n) => Array.from({ length: 2 * n }, (_, i) => `<rect x="${x0 + (i % n) * 11}" y="${y + Math.floor(i / n) * 9}" width="3" height="3" fill="#a59c82"/>`).join('');
// a wire from a breadboard's point to a header pin
const wire = (x0, y0, x1, y1, colour) => `<path d="M${x0},${y0} C${x0},${(y0 + y1) / 2} ${x1},${(y0 + y1) / 2} ${x1},${y1}" fill="none" stroke="${esc(colour)}" stroke-width="2.5"/>`;
const COLOURS = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#7f8c8d', '#ecf0f1'];

/** J7's breadboard over the board: the examples' 4-digit display (its segments on J7's pins 63..80, its anodes on
 *  79..75), or a VGA connector (its colours on 63..80, HSYNC and VSYNC on 79, 77), as the board's data has them. */
function topBreadboard(board, hasDisp, hasVga) {
  const pinY = T + J7_Y;
  const base = `<rect x="20" y="8" width="560" height="${T - 40}" rx="6" fill="${BREADBOARD}" stroke="#b7ae94" stroke-width="2"/>${holeRows(32, 18, 50)}${holeRows(32, T - 48, 50)}
    ${text(32, 44, 'BREADBOARD', { size: 8, anchor: 'start', fill: '#55503f' })}`;
  if (hasDisp) {
    const segs = ['CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG'].map((c, i) => `${c}(${pinsOf(board, 'seg')[i] ?? ''})`).concat(`DP(${pinsOf(board, 'dp')[0] ?? ''})`);
    const segPins = [...pinsOf(board, 'seg'), ...pinsOf(board, 'dp')];
    return `<g data-module="display">${base}
    <rect x="${DIG_X(0) - 32}" y="${DIG_Y - 36}" width="${DIG_X(3) - DIG_X(0) + 64}" height="72" rx="3" fill="#0b0b0b" stroke="#2a2a2a"/>
    ${segs.map((t, i) => text(410 + (i % 2) * 74, 60 + Math.floor(i / 2) * 14, t, { size: 7, anchor: 'start', weight: 'normal', fill: '#55503f' })).join('')}
    ${segPins.map((p, i) => wire(40 + i * 12, T - 40, pinX(J7, p), pinY, COLOURS[i])).join('')}
    ${pinsOf(board, 'an').map((p, i) => wire(DIG_X(3 - i), DIG_Y + 36, pinX(J7, p), pinY, '#7a4a2a')).join('')}</g>`;
  }
  if (hasVga) {
    const vgaPins = [['R', 'vga_red'], ['G', 'vga_green'], ['B', 'vga_blue']].map(([c, res]) => `${c}(${pinsOf(board, res).join(' ')})`)
      .concat(`HS(${pinsOf(board, 'vga_hsync')[0] ?? ''}) VS(${pinsOf(board, 'vga_vsync')[0] ?? ''})`);
    const all = ['vga_red', 'vga_green', 'vga_blue', 'vga_hsync', 'vga_vsync'].flatMap((r) => pinsOf(board, r));
    return `<g data-module="vga">${base}
    <rect x="150" y="8" width="200" height="16" rx="2" fill="#b9bec6" stroke="#6b7079"/><rect x="172" y="24" width="156" height="54" rx="3" fill="#151515"/>
    ${text(250, 98, 'VGA', { size: 12, fill: '#55503f' })}
    ${vgaPins.map((t, i) => text(400, 60 + i * 15, t, { size: 8, anchor: 'start', weight: 'normal', fill: '#55503f' })).join('')}
    ${all.map((p, i) => wire(180 + i * 15, 78, pinX(J7, p), pinY, COLOURS[i % 8])).join('')}</g>`;
  }
  return '';
}

/** J6's breadboard under the board: LD0..LD7, SW0..SW7 and BTN0..BTN3, each under its pin, wired to it. */
function bottomBreadboard(board) {
  const pinY = T + J6_Y, y0 = T + BH + 14;
  const parts = [['led', BB_LED_Y - 12], ['sw', BB_SW_Y - 26], ['btn', BB_SW_Y - 14]];
  return `<g data-module="io"><rect x="140" y="${y0}" width="${W - 160}" height="${BB - 24}" rx="6" fill="${BREADBOARD}" stroke="#b7ae94" stroke-width="2"/>
    ${holeRows(152, y0 + 8, 72)}${holeRows(152, y0 + BB - 46, 72)}
    ${parts.map(([res, y]) => pinsOf(board, res).map((p, i) => wire(pinX(J6, p), y, pinX(J6, p), pinY, COLOURS[i % 8])).join('')).join('')}</g>`;
}
// its parts' look: the white tact buttons, the SMD LEDs (the board's red, the breadboard's bigger), the upright power
// switch (its LED right of it), the switches the iCEBreaker's modules' (emulator-icebreaker.js); the ports upright
tangnano9kLayout.css = `${POWER_V_CSS}
.tn9-power .emu-power-led { left: 22px; top: 4px; }
.tn9-btn { width: 24px; height: 24px; border-radius: 50%; background: radial-gradient(#fafafa, #c9c9c9); border: 1px solid #888; cursor: pointer; user-select: none; }
.tn9-btn.on { background: radial-gradient(#ff6a5a, #b31d12); }
.tn9-led { width: 14px; height: 8px; }
.tn9-bbled { width: 14px; height: 18px; border-radius: 7px 7px 2px 2px; }
.tn9-vport .emu-port { writing-mode: vertical-rl; }
.tn9-silk { font-size: 8px; }
.tn9-dark { color: #3a3628; }
`;
