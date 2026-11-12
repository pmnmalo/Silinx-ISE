// Silinx - Board Emulator: the Digilent Basys 3 drawn as the real board (#3706). Our own drawing, after the board's
// photos and its reference manual: each part where it is, as it is turned, in proportion (the board 900 x 600), with its
// silkscreen names (the parts' FPGA pins in brackets).
import { holes4, boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 900, H = 600;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
// a Pmod (2 x 6 right-angle header) on the left or right edge, its pins on the board beside it, its name beside them
const pmodSide = (right, yc, name) => {
  const x = right ? W - 56 : 0, px = right ? [W - 84, W - 71] : [64, 77];
  return `<rect x="${x}" y="${yc - 61}" width="56" height="122" rx="2" fill="#141414"/>`
    + Array.from({ length: 12 }, (_, i) => `<rect x="${px[i % 2]}" y="${yc - 50 + Math.floor(i / 2) * 18}" width="8" height="8" fill="#c9a94a"/>`).join('')
    + text(right ? W - 94 : 94, yc + 4, name, { size: 11, anchor: right ? 'end' : 'start' });
};

// where the parts are (their centres)
const POWER = [128, 40];
const SW_X = (i) => 58 + i * 52.3, SW_Y = 518;           // SW15 (left) .. SW0, upright, on the bottom edge
const LED_Y = 437;                                       // LD15 .. LD0, each over its switch
const DIG_X = (i) => 168 + i * 56, DIG_Y = 330;          // AN3 (left) .. AN0
// the five buttons in a cross, by their index in btn (btn[0] = BTNC ... btn[4] = BTNR)
const BTN_AT = [['BTNC', 650, 300], ['BTNU', 650, 236], ['BTNL', 586, 300], ['BTND', 650, 364], ['BTNR', 714, 300]];

/** Digilent Basys 3: blue PCB. The top edge: the power select jumper JP2, the upright power switch (its power good LED
 *  in the corner), the external power header, the PROG / UART micro-USB, the VGA connector, the USB host port, then the
 *  mode jumper JP1, the PROG button and the DONE LED in the corner; the Pmods JA (top) and JXADC on the left edge, JB
 *  (top) and JC on the right; the FPGA in the middle; the 4-digit display (left) and the cross of five buttons (right)
 *  under it; LD15..LD0 over the slide switches SW15..SW0 along the bottom edge. */
export function basys3Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const segs = ['CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG'].map((s, i) => `${s}(${pinsOf(board, 'seg')[i] ?? ''})`).concat(`DP(${pinsOf(board, 'dp')[0] ?? ''})`);
  const art = `
    <defs><linearGradient id="b3pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f58ad"/><stop offset="1" stop-color="#174592"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="8" fill="url(#b3pcb) #1f58ad" stroke="#0e2a66" stroke-width="3"/>
    ${holes4(W, H)}
    <rect x="54" y="10" width="16" height="26" rx="2" fill="#2a6fd1"/>${text(62, 50, 'JP2', { size: 7, weight: 'normal' })}
    ${text(POWER[0], 74, 'POWER', { size: 8 })}${text(POWER[0] + 16, 30, 'ON', { size: 7, anchor: 'start', weight: 'normal' })}${text(POWER[0] + 16, 56, 'OFF', { size: 7, anchor: 'start', weight: 'normal' })}
    <rect x="166" y="10" width="30" height="14" fill="#141414"/><circle cx="174" cy="17" r="3" fill="#c9a94a"/><circle cx="188" cy="17" r="3" fill="#c9a94a"/>${text(181, 38, 'EXT PWR', { size: 7, weight: 'normal' })}
    <rect x="216" y="0" width="34" height="26" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="222" y="0" width="22" height="10" rx="2" fill="#55595f"/>${text(233, 40, 'PROG UART', { size: 8 })}
    <rect x="340" y="0" width="260" height="66" rx="4" fill="#c3c7cd" stroke="#6b7079"/><path d="M380,6 h180 l-14,36 h-152 z" fill="#1a1a1a"/>
    ${[358, 582].map((cx) => `<circle cx="${cx}" cy="24" r="8" fill="#8d939b"/>`).join('')}${text(470, 84, 'VGA', { size: 10 })}
    <rect x="640" y="0" width="70" height="60" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="652" y="0" width="46" height="30" fill="#55595f"/>${text(675, 76, 'USB HOST', { size: 8 })}
    <rect x="740" y="10" width="16" height="26" rx="2" fill="#2a6fd1"/>${text(748, 50, 'MODE', { size: 7, weight: 'normal' })}
    <rect x="776" y="26" width="28" height="28" rx="2" fill="#c9ccd1" stroke="#7b8088"/><circle cx="790" cy="40" r="8" fill="#c8302a"/>${text(790, 68, 'PROG', { size: 7 })}
    <rect x="841" y="54" width="8" height="12" fill="#d18a1a"/>${text(845, 80, 'DONE', { size: 7 })}
    ${pmodSide(false, 140, 'JA')}${pmodSide(false, 344, 'JXADC')}${pmodSide(true, 140, 'JB')}${pmodSide(true, 344, 'JC')}
    ${ic(400, 140, 110, 110, [], 9)}${text(455, 190, 'ARTIX-7', { size: 10, fill: '#ddd' })}${text(455, 206, (board.device?.part || 'XC7A35T').toUpperCase(), { size: 8, weight: 'normal', fill: '#bbb' })}
    ${ic(230, 110, 56, 50, ['USB'], 8)}${ic(300, 200, 46, 32, ['FLASH'], 7)}${ic(560, 160, 40, 36, ['HID'], 7)}
    <rect x="532" y="100" width="30" height="16" rx="3" fill="#d8dbe0" stroke="#7b8088"/>${text(547, 130, '100MHz', { size: 7, weight: 'normal' })}
    <rect x="400" y="290" width="150" height="36" rx="5" fill="none" stroke="#fff" stroke-width="2"/>${text(475, 316, 'BASYS 3', { size: 22, weight: '900', family: 'Arial Black, Arial' })}
    <rect x="${DIG_X(0) - 34}" y="${DIG_Y - 34}" width="${DIG_X(3) - DIG_X(0) + 68}" height="78" rx="3" fill="#0b0b0b" stroke="#2a2a2a"/>
    ${segs.map((s, i) => text(DIG_X(0) - 30 + i * 30, DIG_Y - 40, s, { size: 6, anchor: 'start', weight: 'normal' })).join('')}
    ${BTN_AT.map(([, x, y]) => `<rect x="${x - 20}" y="${y - 20}" width="40" height="40" rx="2" fill="#c9ccd1" stroke="#7b8088"/>`).join('')}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk b3-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // the power switch, upright on the top edge (ON up), the power good LED in the corner left of it
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'b3-power');
  // LD15..LD0 over SW15..SW0 (the bottom edge), their FPGA pins in brackets
  for (let i = 0; i < 16; i++) {
    const k = 15 - i, x = SW_X(i);
    silkText(`LD${k}`, x, LED_Y - 19);
    part(put(mkLed(k, 'emu-led b2-led'), x, LED_Y - 5), `led${k}`);
    silkText(`(${pinsOf(board, 'led')[k] ?? ''})`, x, LED_Y + 9);
    port('led', k, x, LED_Y + 20);
    part(put(mkSwitch(k, 'emu-sw bs2-sw'), x, SW_Y - 36), `sw${k}`);
    silkText(`SW${k}(${pinsOf(board, 'sw')[k] ?? ''})`, x, SW_Y + 40);
    port('sw', k, x, SW_Y + 51);
  }
  // the 4-digit display (AN3..AN0)
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = DIG_X(i);
    part(put(mkDigit(k), x, DIG_Y - 27), `an${k}`);
    silkText(`AN${k}(${pinsOf(board, 'an')[k] ?? ''})`, x, DIG_Y + 46);
    port('an', k, x, DIG_Y + 57);
  }
  // the buttons in a cross, each named with its pin
  for (let i = 0; i < 5; i++) {
    const k = 4 - i, [lbl, x, y] = BTN_AT[k];
    part(put(mkButton(k, 'emu-btn nx2-btn'), x, y - 18), `btn${k}`);
    silkText(`${lbl}(${pinsOf(board, 'btn')[k] ?? ''})`, x, y + 21);
    port('btn', k, x, y + 32);
  }
  return wrap;
}
// its parts' look: the upright power switch (the power good LED in the corner); the switches are the Basys2's
// (emulator-basys2.js), the buttons the Nexys2's (emulator-nexys2.js)
basys3Layout.css = `${POWER_V_CSS}
.b3-power .emu-power-led { left: -96px; top: 40px; }
.b3-silk { font-size: 8px; }
`;
