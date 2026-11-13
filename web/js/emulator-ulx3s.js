// Silinx - Board Emulator: the ULX3S drawn as the real board (#3745). Our own drawing, after the board's top view in
// its repository (emard/ulx3s, pic/ulx3st.jpg): each part where it is, as it is turned, in proportion (the board
// 940 x 508), with its silkscreen names; on its left, the breadboard on its GPIO header J1 that the board's data puts
// the examples' display (ulx3s) or VGA (ulx3s-vga) on.
import { esc } from './dom.js';
import { boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const BW = 940, H = 508, X0 = 300, W = X0 + BW;           // the board X0 right of the drawing's left edge, the breadboard there
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
// the header rows (20 down each long edge); gp[n] / gn[n] of J1 on row ROW(n) (the 2.5/3.3V and GND rows between)
const ROW_Y = (r) => 12 + r * 25.4, ROW = (n) => ROW_Y(n + (n < 7 ? 2 : 4));
const header = (x) => Array.from({ length: 40 }, (_, i) => {
  const cx = x + (i % 2) * 24, cy = ROW_Y(Math.floor(i / 2));
  return `<rect x="${cx - 8}" y="${cy - 8}" width="16" height="16" rx="2" fill="#d8c67e"/><circle cx="${cx}" cy="${cy}" r="4" fill="#3a3010"/>`;
}).join('');
const holes = [[83, 31], [849, 31], [83, 469], [849, 469]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="18" fill="#e8d84a"/><circle cx="${x}" cy="${y}" r="10" fill="#1b1b1b"/>`).join('');
const tact = (x, y) => `<rect x="${x - 28}" y="${y - 28}" width="56" height="56" rx="3" fill="#e9e9e9" stroke="#9a9a9a"/>`;

// where the parts are (their centres, on the board)
const POWER = [860, 78];
const LED_X = (i) => 88 + i * 25.9, LED_Y = 183;          // D7 (left) .. D0
const DIP_X = (i) => 626 + i * 27, DIP_Y = 110;           // SW1 (left) .. SW4: sw[0..3], ON up
// the buttons by their index in btn (F1, F2, UP, DOWN, LEFT, RIGHT), PWR apart
const BTN_AT = [['F1', 100, 280], ['F2', 224, 280], ['UP', 663, 380], ['DOWN', 663, 471], ['LEFT', 546, 471], ['RIGHT', 780, 471]];
const PWR = [780, 120];
// the breadboard's display (AN3 .. AN0)
const DIG_X = (i) => 70 + i * 54, DIG_Y = 150;

/** Radiona ULX3S: dark green PCB, its GPIO headers J1 (left) and J2 (right) down the long edges. The top edge: the
 *  micro USB US1, the audio jack, the GPDI (HDMI) connector, the micro USB US2; the 25 MHz oscillator Y1 top left,
 *  D7..D0 under it, the buttons F1 (B1) and F2 (B2) under them, the SD card slot on the bottom edge; the FPGA in the
 *  middle, the LCD header under it, the JTAG header J4; the red DIP switch SW1 and the PWR button (B0) top right, the
 *  SDRAM under them, UP, LEFT, DOWN, RIGHT (B3..B6) bottom right. The board has no power switch (the USB powers it):
 *  the emulator's is by US2. */
export function ulx3sLayout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const has = (res) => board.resources.some((r) => r.name === res);
  const hasDisp = has('an'), hasVga = has('vga_hsync');
  const art = `${breadboard(board, hasDisp, hasVga)}<g transform="translate(${X0} 0)">
    <defs><linearGradient id="ulxpcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#245a2c"/><stop offset="1" stop-color="#1b4722"/></linearGradient></defs>
    <rect x="2" y="2" width="${BW - 4}" height="${H - 4}" rx="4" fill="url(#ulxpcb) #245a2c" stroke="#0e2a12" stroke-width="3"/>
    ${holes}${header(13)}${header(902)}
    ${Array.from({ length: 14 }, (_, n) => text(64, ROW(n) + 5, `${n}`, { size: 13, anchor: 'start' })).join('')}${text(78, 410, 'J1', { size: 14, anchor: 'start' })}
    ${text(64, 238, '2.5/3.3V', { size: 11, anchor: 'start' })}${text(885, 116, 'J2', { size: 14, anchor: 'end' })}
    <rect x="138" y="0" width="84" height="42" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="152" y="6" width="56" height="18" rx="3" fill="#55595f"/>${text(180, 56, 'US1', { size: 9 })}
    <rect x="270" y="0" width="61" height="174" rx="3" fill="#151515"/><circle cx="300" cy="22" r="12" fill="#2b2b2b"/><circle cx="300" cy="22" r="5" fill="#777"/>
    <rect x="433" y="0" width="160" height="89" rx="4" fill="#d6d9de" stroke="#7b8088"/><rect x="455" y="6" width="116" height="40" rx="4" fill="#9da2a9"/>${text(513, 106, 'GPDI1', { size: 10 })}
    <rect x="724" y="0" width="80" height="42" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="736" y="6" width="56" height="18" rx="3" fill="#55595f"/>${text(764, 56, 'US2', { size: 9 })}
    ${text(820, 18, '5V', { size: 10, anchor: 'start' })}
    <rect x="77" y="80" width="75" height="56" rx="4" fill="#f2f2f2" stroke="#9a9a9a"/>${text(114, 74, 'Y1', { size: 10 })}${text(114, 112, '25MHz', { size: 8, weight: 'normal', fill: '#333' })}
    ${text(352, 140, '3.3V', { size: 12, rotate: true })}${text(370, 140, '2.5V', { size: 12, rotate: true })}
    ${[0, 1, 2].map((i) => `<rect x="${376 + i * 25}" y="${190}" width="16" height="16" fill="#d8c67e"/>`).join('')}${text(403, 222, 'J5', { size: 10 })}
    <rect x="${DIP_X(0) - 21}" y="84" width="116" height="80" rx="3" fill="#c8302a" stroke="#7a1a16"/>${text(DIP_X(0) - 28, 150, 'SW1', { size: 11, rotate: true })}
    ${[1, 2, 3, 4].map((i) => text(DIP_X(i - 1), 158, `${i}`, { size: 8, weight: 'normal' })).join('')}
    ${tact(...PWR)}${text(PWR[0] - 46, 128, 'B0', { size: 10 })}${text(PWR[0], 172, 'PWR', { size: 11 })}
    ${ic(354, 174, 178, 178, [], 9)}${text(443, 256, 'ECP5', { size: 12, fill: '#ddd' })}${text(443, 274, (board.device?.part || 'LFE5U-85F').toUpperCase(), { size: 9, weight: 'normal', fill: '#bbb' })}
    ${text(443, 168, 'FPGA', { size: 11 })}
    ${ic(598, 206, 225, 122, [], 9)}${text(780, 198, 'SDRAM', { size: 11 })}
    ${ic(806, 372, 50, 50, [], 7)}${text(832, 364, 'ADC', { size: 10 })}${text(745, 386, 'ULX3S', { size: 18 })}
    <rect x="354" y="384" width="200" height="22" fill="#141414"/>${Array.from({ length: 8 }, (_, i) => `<rect x="${360 + i * 25}" y="${388}" width="14" height="14" fill="#d8c67e"/>`).join('')}
    ${['BL', 'CS', 'DC', 'RES', 'SDA', 'SCL', 'VCC', 'GND'].map((t, i) => text(367 + i * 25, 378, t, { size: 8, weight: 'normal' })).join('')}${text(330, 400, 'LCD1', { size: 9, anchor: 'end' })}
    ${pins2(424, 422)}${text(448, 504, 'J4', { size: 10 })}${text(408, 460, 'TDO TCK 3V3', { size: 7, rotate: true, weight: 'normal' })}${text(488, 460, 'TMS TDI GND', { size: 7, rotate: true, weight: 'normal' })}
    <rect x="143" y="338" width="127" height="170" rx="3" fill="#4a2a24" stroke="#24120e"/><rect x="160" y="352" width="92" height="66" fill="#d8d8d8" opacity=".4"/>${text(206, 440, 'SD', { size: 11 })}
    ${BTN_AT.map(([, x, y]) => tact(x, y)).join('')}
    ${text(LED_X(0) - 20, LED_Y + 34, 'R48', { size: 7, weight: 'normal' })}</g>`;
  const { put: putAt, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const put = (el, x, y, cls) => putAt(el, x + X0, y, cls);   // (on the board, right of the breadboard)
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk ulx-silk' }, t), x, y);
  const port = (res, k, x, y, cls = '') => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y, cls);
  // the emulator's power switch (the board has none), upright by US2, its LED under it
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'ulx-power');
  // D7..D0, each named over it with its pin, its port under it, upright
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = LED_X(i);
    silkText(`D${k}`, x, LED_Y - 30);
    part(put(mkLed(k, 'emu-led b2-led ulx-led'), x, LED_Y - 10), `led${k}`);
    port('led', k, x, LED_Y + 14, 'ulx-vport');
  }
  // the DIP switch SW1: positions 1..4 = sw[0..3]
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = DIP_X(k);
    part(put(mkSwitch(k, 'emu-sw ulx-dip'), x, DIP_Y - 18), `sw${k}`);
    port('sw', k, x, DIP_Y + 56, 'ulx-vport');
  }
  // the buttons F1, F2, UP, DOWN, LEFT, RIGHT (B1..B6), each named over it with its pin, its port under it; PWR (B0)
  for (let i = 0; i < 6; i++) {
    const k = 5 - i, [lbl, x, y] = BTN_AT[k];
    silkText(`${lbl}(${pinsOf(board, 'btn')[k] ?? ''})`, x, y - 42);
    part(put(mkButton(k, 'emu-btn ulx-btn'), x, y - 14), `btn${k}`);
    port('btn', k, x, y + 30);
  }
  part(put(mkButton(0, 'emu-btn ulx-btn', 'btn_pwr_n'), PWR[0], PWR[1] - 14), 'btn_pwr_n');
  port('btn_pwr_n', 0, PWR[0] + 50, PWR[1] - 6);
  // the breadboard's 4-digit display (AN3..AN0), when the board has it
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = DIG_X(i);
    if (!hasDisp) break;
    part(putAt(mkDigit(k), x, DIG_Y - 27), `an${k}`);
    putAt(h('span', { class: 'emu-silk ulx-silk ulx-dark' }, `AN${k}`), x, DIG_Y + 36);
    putAt(h('span', { class: `emu-port${bitFor('an', k) ? '' : ' nc'}` }, portLabel('an', k)), x, DIG_Y + 48);
  }
  return wrap;
}
// a 2 x 3 header seen from above
const pins2 = (x, y) => `<rect x="${x}" y="${y}" width="48" height="72" fill="#141414"/>`
  + Array.from({ length: 6 }, (_, i) => `<rect x="${x + 6 + (i % 2) * 22}" y="${y + 6 + Math.floor(i / 2) * 22}" width="14" height="14" fill="#d8c67e"/>`).join('');

/** The breadboard left of the board, wired to J1 (gp[n] on the header's outer column, gn[n] on its inner one): the
 *  examples' 4-digit display (its segments on gp0..gp7, its anodes on gn0..gn3) or a VGA connector (its colours on
 *  gp0..gp7, HSYNC and VSYNC on gn0, gn1), as the board's data has them. */
function breadboard(board, hasDisp, hasVga) {
  const holeRows = (y) => Array.from({ length: 2 * 24 }, (_, i) => `<rect x="${22 + (i % 24) * 11}" y="${y + Math.floor(i / 24) * 9}" width="3" height="3" fill="#a59c82"/>`).join('');
  const wire = (x0, y0, n, inner, colour) => {
    const x1 = X0 + (inner ? 37 : 13), y1 = ROW(n);
    return `<path d="M${x0},${y0} C${x0 + 60},${y0} ${x1 - 70},${y1} ${x1},${y1}" fill="none" stroke="${esc(colour)}" stroke-width="2.5"/>`;
  };
  const colours = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#7f8c8d', '#ecf0f1'];
  const board0 = `<rect x="10" y="40" width="282" height="300" rx="6" fill="#ebe6d6" stroke="#b7ae94" stroke-width="2"/>${holeRows(52)}${holeRows(318)}
    ${text(20, 76, 'BREADBOARD', { size: 8, anchor: 'start', fill: '#55503f' })}`;
  if (hasDisp) {
    const segs = ['CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG'].map((c, i) => `${c}(${pinsOf(board, 'seg')[i] ?? ''})`).concat(`DP(${pinsOf(board, 'dp')[0] ?? ''})`);
    return `<g data-module="display">${board0}
    <rect x="${DIG_X(0) - 32}" y="${DIG_Y - 36}" width="${DIG_X(3) - DIG_X(0) + 64}" height="72" rx="3" fill="#0b0b0b" stroke="#2a2a2a"/>
    ${segs.map((t, i) => text(24 + (i % 4) * 66, 238 + Math.floor(i / 4) * 12, t, { size: 7, anchor: 'start', weight: 'normal', fill: '#55503f' })).join('')}
    ${colours.map((c, i) => wire(240 + (i % 4) * 8, 268 + Math.floor(i / 4) * 10, i, false, c)).join('')}
    ${[0, 1, 2, 3].map((i) => wire(200 + i * 18, 290, i, true, '#7a4a2a')).join('')}</g>`;
  }
  if (hasVga) {
    const vgaPins = [['R', 'vga_red'], ['G', 'vga_green'], ['B', 'vga_blue']].map(([c, res]) => `${c}(${pinsOf(board, res).join(' ')})`)
      .concat(`HS(${pinsOf(board, 'vga_hsync')[0] ?? ''}) VS(${pinsOf(board, 'vga_vsync')[0] ?? ''})`);
    return `<g data-module="vga">${board0}
    <rect x="10" y="110" width="16" height="150" rx="2" fill="#b9bec6" stroke="#6b7079"/><rect x="26" y="125" width="54" height="120" rx="3" fill="#151515"/>
    ${text(130, 120, 'VGA', { size: 12, fill: '#55503f' })}
    ${vgaPins.map((t, i) => text(96, 150 + i * 16, t, { size: 8, anchor: 'start', weight: 'normal', fill: '#55503f' })).join('')}
    ${colours.map((c, i) => wire(240 + (i % 4) * 8, 268 + Math.floor(i / 4) * 10, i, false, c)).join('')}
    ${[0, 1].map((i) => wire(220 + i * 18, 290, i, true, '#7a4a2a')).join('')}</g>`;
  }
  return '';
}
// its parts' look: the white tact buttons, the red DIP switch's toggles, the SMD LEDs, the upright power switch (its
// LED under it); the ports under the LEDs and the DIP switch upright
ulx3sLayout.css = `${POWER_V_CSS}
.ulx-power .emu-power-led { left: 2px; top: 42px; }
.ulx-led { width: 12px; height: 18px; }
.ulx-btn { width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(#3a3a3a, #111); border: 1px solid #000; cursor: pointer; user-select: none; }
.ulx-btn.on { background: radial-gradient(#d33, #700); }
.ulx-dip { width: 14px; height: 34px; border-radius: 1px; background: #8a1d18; border: 1px solid #4a0e0b; position: relative; cursor: pointer; }
.ulx-dip::after { content: ''; position: absolute; left: 1px; right: 1px; height: 14px; bottom: 1px; background: #f2f2f2; border-radius: 1px; transition: bottom .08s; }
.ulx-dip.on::after { bottom: 17px; }
.ulx-vport .emu-port { writing-mode: vertical-rl; }
.ulx-silk { font-size: 9px; }
.ulx-dark { color: #3a3628; }
`;
