// Silinx - Board Emulator: the Numato Mimas V2 drawn as the real board (#3745). Our own drawing, after the board's
// photo and its connection diagram (Numato's documentation): each part where it is, as it is turned, in proportion (the
// board 900 x 600), with its silkscreen names.
import { boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 900, H = 600;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
const holes = [[25, 87], [869, 85], [25, 571], [869, 571]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="#d8c67e"/><circle cx="${x}" cy="${y}" r="6" fill="#0b0b0b"/>`).join('');
// a 2 x 6 female header (P6..P9) along the bottom edge, its name over it, 3V3 / GND on its left
const header12 = (x, name) => `<rect x="${x}" y="502" width="127" height="40" rx="2" fill="#151515" stroke="#333"/>`
  + Array.from({ length: 12 }, (_, i) => `<rect x="${x + 8 + (i % 6) * 19.5}" y="${i < 6 ? 509 : 524}" width="9" height="9" fill="#050505" stroke="#444"/>`).join('')
  + text(x + 64, 494, name, { size: 9 }) + text(x - 2, 512, '3V3', { size: 6, anchor: 'end', weight: 'normal' }) + text(x - 2, 533, 'GND', { size: 6, anchor: 'end', weight: 'normal' });

// where the parts are (their centres)
const POWER = [40, 458];
const DIG_X = (i) => 129 + i * 77, DIG_Y = 391;            // S1 (left) .. S3: AN2 .. AN0 (SevenSegmentEnable[2..0])
const LED_X = (i) => 450 + i * 30, LED_Y = 431;            // D1 (left) .. D8: LED0 .. LED7
const DIP_X = (i) => 712 + i * 22, DIP_Y = 496;            // positions 1 (left) .. 8: DPSwitch7 .. DPSwitch0, ON up
// the push buttons SW1..SW6 (Switch0..5), their places on the board
const BTN_AT = [[698, 352], [837, 352], [767, 418], [767, 286], [698, 237], [837, 237]];

/** Numato Mimas V2: black PCB. The top edge: the JTAG header (P1), the VGA connector (J2), the audio jack (CON1), the
 *  micro SD slot; the left edge: the DC jack and the mini USB, the header P4 under them; the FPGA in the middle, the
 *  LPDDR left of it; the 3-digit display (left) and D1..D8 (middle) over the four headers P6..P9 along the bottom edge;
 *  the six push buttons SW1..SW6 (right) over the blue 8-way DIP switch (bottom-right corner). The board has no power
 *  switch (the USB powers it): the emulator's is by the USB connector. */
export function mimasV2Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const segs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, i) => `${s}(${pinsOf(board, 'seg')[i] ?? ''})`).concat(`h(${pinsOf(board, 'dp')[0] ?? ''})`);
  const art = `
    <defs><linearGradient id="mv2pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232326"/><stop offset="1" stop-color="#161618"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="8" fill="url(#mv2pcb) #232326" stroke="#000" stroke-width="3"/>
    ${holes}
    <rect x="0" y="148" width="80" height="60" rx="3" fill="#111" stroke="#000"/><circle cx="22" cy="178" r="14" fill="#2b2b2b"/><circle cx="22" cy="178" r="5" fill="#888"/>
    ${text(40, 224, 'DC JACK', { size: 8 })}
    <rect x="0" y="268" width="50" height="40" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="279" width="30" height="18" rx="2" fill="#55595f"/>${text(8, 324, 'USB MINI', { size: 8, anchor: 'start' })}
    <rect x="30" y="356" width="18" height="60" fill="#111" stroke="#444"/>${Array.from({ length: 4 }, (_, i) => `<circle cx="39" cy="${364 + i * 15}" r="4" fill="#d8c67e"/>`).join('')}
    ${['3V3', 'AN1', 'AN2', 'GND'].map((t, i) => text(26, 367 + i * 15, t, { size: 6, anchor: 'end', weight: 'normal' })).join('')}${text(54, 391, 'P4', { size: 8, anchor: 'start' })}
    <rect x="69" y="63" width="191" height="58" rx="3" fill="#111" stroke="#000"/><rect x="77" y="71" width="175" height="42" fill="#050505"/>
    ${Array.from({ length: 14 }, (_, i) => `<rect x="${86 + (i >> 1) * 23}" y="${i % 2 ? 94 : 78}" width="6" height="6" fill="#c9a94a"/>`).join('')}
    ${text(165, 136, 'JTAG', { size: 9 })}${text(60, 72, 'P1', { size: 8, anchor: 'end' })}
    ${['NC', 'NC', 'TDI', 'TDO', 'TCK', 'TMS', 'VREF'].map((t, i) => text(92 + i * 23, 148, t, { size: 6, weight: 'normal', rotate: true, anchor: 'end' })).join('')}
    <rect x="116" y="182" width="22" height="58" fill="#111"/>${[0, 1, 2].map((i) => `<rect x="123" y="${188 + i * 18}" width="8" height="8" fill="#c9a94a"/>`).join('')}<rect x="118" y="202" width="18" height="34" rx="2" fill="#2a6fd1"/>
    ${text(127, 176, 'K1', { size: 8 })}${text(150, 212, 'POWER SELECT', { size: 6, rotate: true, weight: 'normal' })}
    <rect x="213" y="171" width="35" height="14" rx="1" fill="#e9e9e9"/><rect x="216" y="174" width="12" height="8" fill="#222"/>${text(262, 182, 'SW7', { size: 8, anchor: 'start' })}
    ${ic(219, 205, 41, 55, ['PIC'], 7)}
    <rect x="98" y="277" width="116" height="20" fill="#111" stroke="#444"/>${Array.from({ length: 6 }, (_, i) => `<rect x="${104 + i * 18}" y="283" width="7" height="7" fill="#c9a94a"/>`).join('')}${text(156, 310, 'ICSP', { size: 7, weight: 'normal' })}
    <rect x="290" y="0" width="226" height="16" rx="2" fill="#b9bec6" stroke="#6b7079"/><rect x="330" y="16" width="146" height="58" rx="3" fill="#151515"/>
    <path d="M345,24 h116 l-10,34 h-96 z" fill="#2a2a2a"/>${[310, 496].map((cx) => `<rect x="${cx - 9}" y="14" width="18" height="40" rx="2" fill="#c3c7cd" stroke="#6b7079"/><circle cx="${cx}" cy="44" r="4" fill="#6b7079"/>`).join('')}
    ${text(403, 92, 'VGA')}${text(403, 103, 'J2', { size: 7, weight: 'normal' })}
    <rect x="575" y="0" width="96" height="104" rx="3" fill="#111" stroke="#000"/><rect x="606" y="0" width="34" height="12" fill="#2b2b2b"/><circle cx="623" cy="52" r="12" fill="#2b2b2b"/>
    ${text(623, 120, 'AUDIO', { size: 9 })}${text(623, 131, 'CON1', { size: 7, weight: 'normal' })}
    <rect x="725" y="75" width="106" height="100" rx="3" fill="#b9bec6" stroke="#6b7079"/><rect x="740" y="75" width="76" height="14" fill="#8d939b"/>
    ${text(778, 193, 'MICRO SD', { size: 8 })}
    ${ic(381, 248, 63, 69, ['LPDDR'], 8)}${text(452, 326, 'U9', { size: 7, anchor: 'start', weight: 'normal' })}
    ${ic(473, 219, 113, 112, [], 9)}${text(530, 270, 'SPARTAN-6', { size: 10, fill: '#ddd' })}${text(530, 286, (board.device?.part || 'XC6SLX9').toUpperCase(), { size: 8, weight: 'normal', fill: '#bbb' })}
    <rect x="602" y="300" width="26" height="18" rx="2" fill="#d8dbe0" stroke="#7b8088"/>${text(615, 330, '100MHz', { size: 7, weight: 'normal' })}
    <rect x="590" y="368" width="9" height="14" fill="#d18a1a"/>${text(606, 380, 'D9', { size: 7, anchor: 'start' })}
    ${[0, 1, 2].map((i) => `<rect x="${DIG_X(i) - 38}" y="${DIG_Y - 48}" width="76" height="96" rx="2" fill="#e4e4e4" stroke="#999"/><rect x="${DIG_X(i) - 33}" y="${DIG_Y - 44}" width="66" height="88" fill="#202020"/>`).join('')}
    ${text(DIG_X(0) - 50, DIG_Y, '7 SEGMENT DISPLAY', { size: 6, rotate: true, weight: 'normal' })}
    ${segs.map((s, i) => text(DIG_X(0) - 36 + i * 29, DIG_Y - 54, s, { size: 6, anchor: 'start', weight: 'normal' })).join('')}
    ${header12(81, 'P6')}${header12(237, 'P7')}${header12(393, 'P8')}${header12(549, 'P9')}
    ${BTN_AT.map(([x, y]) => `<rect x="${x - 29}" y="${y - 12}" width="58" height="24" rx="2" fill="#e9e9e9" stroke="#9a9a9a"/>`).join('')}
    <rect x="693" y="${DIP_Y - 17}" width="185" height="34" rx="2" fill="#2f6fc9" stroke="#1a4a8f"/>
    ${text(700, DIP_Y - 21, 'ON', { size: 6, anchor: 'start', weight: 'normal' })}${Array.from({ length: 8 }, (_, i) => text(DIP_X(i), DIP_Y + 27, `${i + 1}`, { size: 6, weight: 'normal' })).join('')}
    ${text(785, 470, 'DIP SWITCH', { size: 8 })}
    ${text(792, 588, 'MIMAS V2', { size: 9 })}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk mv2-silk' }, t), x, y);
  const port = (res, k, x, y, cls = '') => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y, cls);
  // the emulator's power switch (the board has none), upright under P4 by the USB, its LED under it
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'mv2-power');
  // the 3 digits S1..S3: SevenSegmentEnable[2..0]
  for (let i = 0; i < 3; i++) {
    const k = 2 - i, x = DIG_X(i);
    part(put(mkDigit(k), x, DIG_Y - 43, 'mv2-dig'), `an${k}`);
    silkText(`S${i + 1}(${pinsOf(board, 'an')[k] ?? ''})`, x, DIG_Y + 50);
    port('an', k, x, DIG_Y + 61);
  }
  // D1..D8: LED0..LED7, each named with its pin
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = LED_X(k);
    silkText(`D${k + 1}`, x, LED_Y - 22);
    part(put(mkLed(k, 'emu-led b2-led mv2-led'), x, LED_Y - 6), `led${k}`);
    port('led', k, x, LED_Y + 4, 'mv2-vport');
  }
  // the push buttons SW1..SW6 (Switch0..5), their names over them
  for (let i = 0; i < 6; i++) {
    const k = 5 - i, [x, y] = BTN_AT[k];
    silkText(`SW${k + 1}(${pinsOf(board, 'btn')[k] ?? ''})`, x, y - 26);
    part(put(mkButton(k, 'emu-btn mv2-btn'), x, y - 9), `btn${k}`);
    port('btn', k, x, y + 14);
  }
  // the DIP switch: positions 1..8 = DPSwitch7..0, ON (closed: the input reads 0) up; the ports under it, upright
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = DIP_X(i);
    part(put(mkSwitch(k, 'emu-sw mv2-dip'), x, DIP_Y - 12), `sw${k}`);
    port('sw', k, x, DIP_Y + 32, 'mv2-vport');
  }
  return wrap;
}
// its parts' look: the white tact buttons, the DIP switch's toggles, the big digits, the upright power switch (its LED
// under it); the LEDs are the Basys2's (emulator.js)
mimasV2Layout.css = `${POWER_V_CSS}
.mv2-power .emu-power-led { left: 3px; top: 42px; }
.mv2-dig svg { width: 58px; height: 86px; }
.mv2-led { width: 10px; height: 12px; }
.mv2-btn { width: 22px; height: 18px; border-radius: 3px; background: radial-gradient(#fafafa, #c9c9c9); border: 1px solid #888; cursor: pointer; user-select: none; }
.mv2-btn.on { background: radial-gradient(#ff6a5a, #b31d12); }
.mv2-dip { width: 12px; height: 24px; border-radius: 1px; background: #0f2f66; border: 1px solid #0a1a3a; position: relative; cursor: pointer; }
.mv2-dip::after { content: ''; position: absolute; left: 1px; right: 1px; height: 10px; bottom: 1px; background: #f2f2f2; border-radius: 1px; transition: bottom .08s; }
.mv2-dip.on::after { bottom: 11px; }
.mv2-vport .emu-port { writing-mode: vertical-rl; }
.mv2-silk { font-size: 8px; }
`;
