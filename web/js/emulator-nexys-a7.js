// Silinx - Board Emulator: the Digilent Nexys A7 drawn as the real board (#3706). Our own drawing, after the board's
// photos and its reference manual: each part where it is, as it is turned, in proportion (the board 900 x 820, nearly
// square as the board), with its silkscreen names (the parts' FPGA pins in brackets, as on the board).
import { holes4, boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 900, H = 820;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
// a Pmod (2 x 6 right-angle header) on the left or right edge, its pins on the board beside it, its name beside them
const pmodSide = (right, yc, name) => {
  const x = right ? W - 56 : 0, px = right ? [W - 84, W - 71] : [64, 77];
  return `<rect x="${x}" y="${yc - 61}" width="56" height="122" rx="2" fill="#141414"/>`
    + Array.from({ length: 12 }, (_, i) => `<rect x="${px[i % 2]}" y="${yc - 50 + Math.floor(i / 2) * 18}" width="8" height="8" fill="#c9a94a"/>`).join('')
    + text(right ? W - 94 : 94, yc + 4, name, { size: 11, anchor: right ? 'end' : 'start' });
};

// where the parts are (their centres)
const POWER = [165, 52];
const SW_X = (i) => 88 + i * 49.2, SW_Y = 729;           // SW15 (left) .. SW0, upright, on the bottom edge
const LED_Y = 671;                                       // LD15 .. LD0, each over its switch
// AN7 (left) .. AN0: two 4-digit displays side by side
const DIG_X = (i) => 189 + i * 57 + (i > 3 ? 18 : 0), DIG_Y = 596;
// the five buttons in a cross, by their index in btn (btn[0] = BTNC ... btn[4] = BTNR); CPU RESET over them, left
const BTN_AT = [['BTNC', 692, 500], ['BTNU', 692, 434], ['BTNL', 626, 500], ['BTND', 692, 566], ['BTNR', 758, 500]];
const RESET = [625, 316];

/** Digilent Nexys A7: dark green PCB. The top edge: the 5 V jack, the upright power switch, the USB host port, Ethernet,
 *  the VGA connector, the mono audio out jack; the left edge: the PROG / UART micro-USB, the Pmods JD (top) and JC; the
 *  right edge: the Pmods JXADC, JA and JB; the FPGA in the middle, the DDR2 under it; DONE, the red CPU RESET and PROG
 *  buttons over the cross of five buttons (right); the 8-digit display (two 4-digit ones) left of it, over LD15..LD0
 *  and the slide switches SW15..SW0 along the bottom edge. */
export function nexysA7Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const segs = ['CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG'].map((s, i) => `${s}(${pinsOf(board, 'seg')[i] ?? ''})`).concat(`DP(${pinsOf(board, 'dp')[0] ?? ''})`);
  const unit = (i) => `<rect x="${DIG_X(i) - 30}" y="${DIG_Y - 34}" width="${DIG_X(i + 3) - DIG_X(i) + 60}" height="78" rx="3" fill="#0b0b0b" stroke="#2a2a2a"/>`;
  const art = `
    <defs><linearGradient id="nxa7pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f5442"/><stop offset="1" stop-color="#184535"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="8" fill="url(#nxa7pcb) #1f5442" stroke="#0c2219" stroke-width="3"/>
    ${holes4(W, H)}
    <rect x="44" y="0" width="76" height="104" rx="3" fill="#1a1a1a" stroke="#000"/><circle cx="82" cy="32" r="15" fill="#333"/><circle cx="82" cy="32" r="5" fill="#888"/>
    ${text(POWER[0], 100, 'POWER', { size: 8 })}${text(POWER[0] + 16, 26, 'ON', { size: 7, anchor: 'start', weight: 'normal' })}${text(POWER[0] + 16, 80, 'OFF', { size: 7, anchor: 'start', weight: 'normal' })}
    <rect x="237" y="0" width="85" height="64" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="252" y="0" width="56" height="32" fill="#55595f"/>${text(280, 80, 'USB HOST', { size: 8 })}
    <rect x="388" y="0" width="124" height="100" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="406" y="0" width="88" height="62" fill="#55595f"/>${text(450, 116, 'ETHERNET', { size: 8 })}
    <rect x="530" y="0" width="220" height="76" rx="4" fill="#c3c7cd" stroke="#6b7079"/><path d="M566,6 h148 l-12,40 h-124 z" fill="#1a1a1a"/>
    ${[548, 732].map((cx) => `<circle cx="${cx}" cy="26" r="8" fill="#8d939b"/>`).join('')}${text(640, 94, 'VGA', { size: 10 })}
    <rect x="782" y="0" width="46" height="60" rx="4" fill="#222" stroke="#000"/><circle cx="805" cy="16" r="9" fill="#444"/>${text(805, 76, 'AUDIO OUT', { size: 7 })}
    <rect x="0" y="177" width="34" height="26" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="185" width="24" height="10" rx="2" fill="#55595f"/>${text(42, 194, 'PROG UART', { size: 8, anchor: 'start' })}
    ${pmodSide(false, 417, 'JD')}${pmodSide(false, 588, 'JC')}${pmodSide(true, 246, 'JXADC')}${pmodSide(true, 417, 'JA')}${pmodSide(true, 588, 'JB')}
    <rect x="370" y="240" width="180" height="38" rx="5" fill="none" stroke="#fff" stroke-width="2"/>${text(460, 268, 'NEXYS A7', { size: 22, weight: '900', family: 'Arial Black, Arial' })}
    ${ic(398, 330, 114, 114, [], 9)}${text(455, 382, 'ARTIX-7', { size: 10, fill: '#ddd' })}${text(455, 398, (board.device?.part || 'XC7A100T').toUpperCase(), { size: 8, weight: 'normal', fill: '#bbb' })}
    ${ic(392, 466, 126, 50, ['DDR2'], 8)}${ic(150, 160, 60, 50, ['USB'], 8)}${ic(250, 300, 50, 50, ['HID'], 8)}${ic(560, 150, 70, 60, ['PHY'], 8)}
    <rect x="300" y="200" width="30" height="16" rx="3" fill="#d8dbe0" stroke="#7b8088"/>${text(315, 230, '100MHz', { size: 7, weight: 'normal' })}
    <rect x="574" y="312" width="8" height="12" fill="#d18a1a"/>${text(578, 304, 'DONE', { size: 7 })}
    <rect x="${RESET[0] - 18}" y="${RESET[1] - 18}" width="36" height="36" rx="2" fill="#c9ccd1" stroke="#7b8088"/>
    <rect x="749" y="298" width="36" height="36" rx="2" fill="#c9ccd1" stroke="#7b8088"/><circle cx="767" cy="316" r="10" fill="#c8302a"/>${text(767, 350, 'PROG', { size: 8 })}
    ${BTN_AT.map(([, x, y]) => `<rect x="${x - 20}" y="${y - 20}" width="40" height="40" rx="2" fill="#c9ccd1" stroke="#7b8088"/>`).join('')}
    ${unit(0)}${unit(4)}
    ${segs.map((s, i) => text(DIG_X(0) - 28 + i * 28, DIG_Y - 40, s, { size: 6, anchor: 'start', weight: 'normal' })).join('')}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk nxa7-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // the power switch, upright on the top edge beside the 5 V jack (ON up), its LED under it
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'nxa7-power');
  // LD15..LD0 over SW15..SW0 (the bottom edge), their FPGA pins in brackets
  for (let i = 0; i < 16; i++) {
    const k = 15 - i, x = SW_X(i);
    silkText(`LD${k}`, x, LED_Y - 19);
    part(put(mkLed(k, 'emu-led b2-led'), x, LED_Y - 5), `led${k}`);
    silkText(`(${pinsOf(board, 'led')[k] ?? ''})`, x, LED_Y + 7);
    port('led', k, x, LED_Y + 18);
    part(put(mkSwitch(k, 'emu-sw nx2-sw'), x, SW_Y - 27), `sw${k}`);
    silkText(`SW${k}(${pinsOf(board, 'sw')[k] ?? ''})`, x, SW_Y + 30);
    port('sw', k, x, SW_Y + 41);
  }
  // the 8-digit display (AN7..AN0)
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = DIG_X(i);
    part(put(mkDigit(k), x, DIG_Y - 27), `an${k}`);
    port('an', k, x, DIG_Y + 46);
  }
  // CPU RESET (red, active low) and the buttons in a cross, each named with its pin
  part(put(mkButton(0, 'emu-btn nxa7-reset', 'cpu_resetn'), RESET[0], RESET[1] - 12), 'cpu_resetn');
  silkText('CPU RESET', RESET[0], RESET[1] + 22);
  for (let i = 0; i < 5; i++) {
    const k = 4 - i, [lbl, x, y] = BTN_AT[k];
    part(put(mkButton(k, 'emu-btn nx2-btn'), x, y - 18), `btn${k}`);
    silkText(`${lbl}(${pinsOf(board, 'btn')[k] ?? ''})`, x, y + 21);
    port('btn', k, x, y + 32);
  }
  return wrap;
}
// its parts' look: the upright power switch (its LED under it), the red CPU RESET button; the switches and buttons are
// the Nexys2's (emulator-nexys2.js)
nexysA7Layout.css = `${POWER_V_CSS}
.nxa7-power .emu-power-led { left: 2px; top: 78px; }
.nxa7-silk { font-size: 8px; }
.nxa7-reset { width: 24px; height: 24px; border-radius: 50%; background: radial-gradient(#ff6a5a, #b31d12); border: 2px solid #8a8a8a; }
.nxa7-reset.on { background: radial-gradient(#ffb0a8, #ff3b30); }
`;
