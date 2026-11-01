// Silinx - Board Emulator: the Digilent Nexys3 drawn as the real board (#2481). Our own drawing, after the board's
// photos and its reference manual: each part where it is, as it is turned, in proportion (the board 900 x 930, nearly
// square as the board), with its silkscreen names (the parts' FPGA pins in brackets, as on the board).
import { holes4, boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 900, H = 930;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
// a Pmod (2 x 6 right-angle header) on the top edge, its pins on the board under it, its name under them
const pmod12Top = (x, name) => `<rect x="${x}" y="0" width="122" height="62" rx="2" fill="#141414"/>`
  + Array.from({ length: 12 }, (_, i) => `<rect x="${x + 14 + (i % 6) * 17}" y="${68 + Math.floor(i / 6) * 13}" width="8" height="8" fill="#c9a94a"/>`).join('')
  + text(x + 61, 110, name, { size: 11 });
const microUsb = (x, y, w = 34) => `<rect x="${x}" y="${y}" width="${w}" height="26" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="${x + (x ? 6 : 0)}" y="${y + 8}" width="${w - 10}" height="10" rx="2" fill="#55595f"/>`;

// where the parts are (their centres)
const POWER = [27, 110];
const SW_X = (i) => 166 + i * 59, SW_Y = 846;            // SW7 (left) .. SW0, upright, on the bottom edge
const LED_Y = 772;                                       // LD7 .. LD0, each over its switch
const DIG_X = (i) => 610 + i * 60, DIG_Y = 646;          // AN3 (left) .. AN0
// the five buttons in a cross under the display, by their index in btn (btn[0] = BTNS ... btn[4] = BTNR)
const BTN_AT = [['BTNS', 731, 812], ['BTNU', 731, 744], ['BTNL', 656, 812], ['BTND', 731, 880], ['BTNR', 806, 812]];

/** Digilent Nexys3: dark green PCB. The top edge: the 5 V jack, the power select jumper and the POWER good LED, the
 *  Pmods JA..JD (2 x 6), the JTAG header in the corner; the left edge: the upright power switch (top), the Adept
 *  micro-USB (USB PROG), Ethernet, VGA and the USB HID host port; the right edge: the VHDC connector, the USB-UART
 *  micro-USB; the FPGA in the middle, DONE and RESET right of it; LD7..LD0 over the slide switches SW7..SW0 along the
 *  bottom edge, the 4-digit display over the cross of five buttons (right). */
export function nexys3Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const pin = (res, k = 0) => pinsOf(board, res)[k] ?? '';
  const art = `
    <defs><linearGradient id="nx3pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b4f3e"/><stop offset="1" stop-color="#213f31"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="8" fill="url(#nx3pcb)" stroke="#0f2219" stroke-width="3"/>
    ${holes4(W, H)}
    <rect x="62" y="0" width="72" height="96" rx="3" fill="#1a1a1a" stroke="#000"/><circle cx="98" cy="30" r="14" fill="#333"/><circle cx="98" cy="30" r="4" fill="#888"/>
    <rect x="146" y="6" width="14" height="26" rx="2" fill="#2a6fd1"/>${text(166, 26, 'J1', { size: 7, anchor: 'start', weight: 'normal' })}
    ${text(POWER[0] + 2, 170, 'POWER', { size: 8 })}${text(176, 126, 'POWER', { size: 7, weight: 'normal' })}
    ${pmod12Top(186, 'JA')}${pmod12Top(360, 'JB')}${pmod12Top(530, 'JC')}${pmod12Top(700, 'JD')}
    <rect x="874" y="82" width="20" height="92" rx="2" fill="#141414"/>${Array.from({ length: 6 }, (_, i) => `<rect x="881" y="${88 + i * 14.5}" width="7" height="7" fill="#c9a94a"/>`).join('')}${text(866, 186, 'JTAG', { size: 7, anchor: 'end', weight: 'normal' })}
    <rect x="794" y="140" width="14" height="26" rx="2" fill="#2a6fd1"/>${text(801, 180, 'MODE', { size: 7, weight: 'normal' })}
    ${microUsb(0, 205)}${text(42, 222, 'USB PROG', { size: 8, anchor: 'start' })}
    <rect x="0" y="330" width="150" height="116" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="352" width="92" height="72" fill="#55595f"/><rect x="100" y="340" width="14" height="10" fill="#e6c34a"/><rect x="100" y="426" width="14" height="10" fill="#5fbf4a"/>
    ${text(160, 392, 'ETHERNET', { anchor: 'start' })}
    <rect x="0" y="470" width="18" height="216" rx="2" fill="#b9bec6" stroke="#6b7079"/><rect x="18" y="494" width="88" height="168" rx="2" fill="#151515"/>
    ${[484, 672].map((cy) => `<rect x="12" y="${cy - 10}" width="64" height="20" rx="2" fill="#c3c7cd" stroke="#6b7079"/><circle cx="62" cy="${cy}" r="5" fill="#6b7079"/>`).join('')}
    ${text(116, 582, 'VGA', { anchor: 'start' })}
    <rect x="0" y="742" width="104" height="92" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="770" width="64" height="36" rx="2" fill="#55595f"/>${text(110, 734, 'USB HOST', { size: 8, anchor: 'start' })}
    <rect x="826" y="288" width="74" height="306" rx="4" fill="#c3c7cd" stroke="#6b7079"/><rect x="842" y="300" width="58" height="282" rx="3" fill="#1a1a1a"/>
    ${Array.from({ length: 34 }, (_, i) => `<rect x="${i % 2 ? 870 : 856}" y="${306 + i * 8}" width="10" height="3" fill="#c9a94a"/>`).join('')}${text(816, 446, 'VHDC', { size: 9, anchor: 'end' })}
    ${microUsb(866, 790)}${text(860, 784, 'UART', { size: 8, anchor: 'end' })}
    ${ic(393, 365, 108, 130, [], 9)}${text(447, 424, 'SPARTAN-6', { size: 10, fill: '#ddd' })}${text(447, 440, (board.device?.part || 'XC6SLX16').toUpperCase(), { size: 8, weight: 'normal', fill: '#bbb' })}
    ${ic(240, 520, 96, 66, ['RAM'], 8)}${ic(400, 560, 90, 56, ['FLASH'], 8)}${ic(560, 180, 60, 50, ['USB'], 8)}${ic(220, 260, 70, 70, ['PHY'], 8)}
    <rect x="662" y="252" width="8" height="12" fill="#d18a1a"/>${text(667, 280, 'DONE', { size: 8 })}
    <rect x="714" y="300" width="34" height="34" rx="2" fill="#c9ccd1" stroke="#7b8088"/><circle cx="731" cy="317" r="9" fill="#1a1a1a"/>${text(731, 350, 'RESET', { size: 8 })}
    <rect x="616" y="452" width="198" height="40" rx="5" fill="none" stroke="#fff" stroke-width="2"/>${text(715, 481, 'NEXYS 3', { size: 22, weight: '900', family: 'Arial Black, Arial' })}
    <rect x="${DIG_X(0) - 36}" y="${DIG_Y - 38}" width="${DIG_X(3) - DIG_X(0) + 72}" height="76" rx="3" fill="#0b0b0b" stroke="#2a2a2a"/>
    ${BTN_AT.map(([, x, y]) => `<rect x="${x - 20}" y="${y - 20}" width="40" height="40" rx="2" fill="#c9ccd1" stroke="#7b8088"/>`).join('')}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk nx3-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // the power switch, upright on the left edge by the jack (ON up), the POWER good LED by the power select jumper
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'nx3-power');
  // LD7..LD0 over SW7..SW0 (the bottom edge), their FPGA pins in brackets
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = SW_X(i);
    silkText(`LD${k}(${pinsOf(board, 'led')[k] ?? ''})`, x, LED_Y - 24);
    part(put(mkLed(k, 'emu-led b2-led'), x, LED_Y - 8), `led${k}`);
    port('led', k, x, LED_Y + 4);
    part(put(mkSwitch(k, 'emu-sw nx2-sw'), x, SW_Y - 28), `sw${k}`);
    silkText(`SW${k}(${pinsOf(board, 'sw')[k] ?? ''})`, x, SW_Y + 30);
    port('sw', k, x, SW_Y + 41);
  }
  // the 4-digit display (AN3..AN0)
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = DIG_X(i);
    part(put(mkDigit(k), x, DIG_Y - 27), `an${k}`);
    port('an', k, x, DIG_Y + 40);
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
// its parts' look: the upright power switch (the POWER good LED by the power select jumper); the switches and buttons
// are the Nexys2's (emulator-nexys2.js)
nexys3Layout.css = `${POWER_V_CSS}
.nx3-power .emu-power-led { left: 149px; top: 8px; }
.nx3-silk { font-size: 8px; }
`;
