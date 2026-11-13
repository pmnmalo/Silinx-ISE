// Silinx - Board Emulator: the Papilio One drawn as the real board (#3745). Our own drawing, after the board's photo
// in its datasheet: each part where it is, in proportion (the board 800 x 782), with its silkscreen names. The board has
// no LEDs, switches or buttons of its own: its wings' pins carry the design's ports, named beside them.
import { boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 800, H = 782;
// the wing headers' rows, top to bottom: GND, 2V5, 3V3, 5V, then pins 0..7, 5V, 3V3, 2V5, GND, then pins 8..15
const ROW_Y = (r) => 283 + r * 19.4, ROW = (n) => ROW_Y(n + (n < 8 ? 4 : 8));
const POWER_ROWS = [0, 1, 2, 3, 12, 13, 14, 15];
// a wing header: two columns of 24 holes, the signals on its outer one (x), its 16 pins numbered beside it
const wing = (x, inner) => Array.from({ length: 48 }, (_, i) => {
  const cx = x + (i % 2) * inner, cy = ROW_Y(Math.floor(i / 2));
  return `<rect x="${cx - 9}" y="${cy - 9}" width="18" height="18" rx="2" fill="#e8d0a0"/><circle cx="${cx}" cy="${cy}" r="5" fill="#2a1a10"/>`;
}).join('');
const holes = [[8, 390], [8, 560], [792, 300], [792, 510]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#f2f2f2"/>`).join('');

// where the parts are (their centres)
const POWER = [196, 74];
const WING_X = { c: 40, b: 700, a: 752 };                 // the signal columns: C (Wing2, left edge), B and A (Wing1, right edge)

/** Gadget Factory Papilio One: red PCB. The top edge: the DC jack (top-left corner), the PWR LED, the mini USB; the
 *  FT2232 (USB, JTAG, UART) and its crystal, the RX / TX LEDs, the JTAG header, the power select and VCCO jumpers, the
 *  32 MHz oscillator; the FPGA in the middle, the SPI flash under it; Wing2 (C) down the left edge, Wing1 (B and A) down
 *  the right edge. The board has no power switch: the emulator's is by the jack, its LED the PWR LED. */
export function papilioOneLayout({ board, title, h, portLabel, bitFor, clockNote, mkPower }) {
  const art = `
    <defs><linearGradient id="papcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d42a1e"/><stop offset="1" stop-color="#b51f15"/></linearGradient></defs>
    <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="4" fill="url(#papcb) #d42a1e" stroke="#6a0f0a" stroke-width="3"/>
    ${holes}
    <rect x="22" y="0" width="126" height="117" rx="4" fill="#151515" stroke="#000"/><circle cx="85" cy="40" r="22" fill="#2b2b2b"/><circle cx="85" cy="40" r="7" fill="#888"/>
    ${text(230, 46, 'PWR', { size: 10, anchor: 'start' })}
    <rect x="333" y="0" width="94" height="63" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="350" y="6" width="60" height="24" rx="3" fill="#55595f"/>${text(450, 40, 'USB', { size: 14, rotate: true })}
    ${ic(517, 90, 90, 90, [], 8)}<rect x="660" y="108" width="62" height="36" rx="14" fill="#c3c7cd" stroke="#6b7079"/>${text(690, 98, 'X1', { size: 9 })}
    <rect x="694" y="214" width="12" height="8" fill="#e9e9e9"/><rect x="694" y="232" width="12" height="8" fill="#e9e9e9"/>${text(716, 222, 'RX', { size: 10, anchor: 'start' })}${text(716, 242, 'TX', { size: 10, anchor: 'start' })}
    ${Array.from({ length: 6 }, (_, i) => `<rect x="${466 + i * 32}" y="${216}" width="18" height="18" rx="2" fill="#e8d0a0"/>`).join('')}
    ${['TMS', 'TDI', 'TDO', 'TCK', 'GND', 'REF'].map((t, i) => text(475 + i * 32, 252, t, { size: 8, weight: 'normal' })).join('')}
    <rect x="417" y="150" width="22" height="44" rx="2" fill="#151515"/>${text(400, 172, 'PWRSELECT', { size: 7, rotate: true, weight: 'normal' })}
    ${ic(80, 130, 80, 50, [], 7)}${ic(170, 140, 60, 40, [], 7)}${ic(250, 140, 60, 40, [], 7)}${ic(210, 200, 70, 40, [], 7)}
    <rect x="207" y="300" width="64" height="48" rx="3" fill="#c3c7cd" stroke="#6b7079"/>${text(239, 330, '32MHz', { size: 8, weight: 'normal', fill: '#333' })}${text(239, 366, 'OSC', { size: 9 })}
    ${[0, 1, 2].map((i) => `<rect x="${330 + i * 24}" y="${290}" width="18" height="34" rx="2" fill="#151515"/>`).join('')}${text(370, 344, 'VCCO', { size: 10 })}
    ${ic(310, 405, 180, 198, [], 9)}${text(400, 495, 'SPARTAN-3E', { size: 12, fill: '#ddd' })}${text(400, 513, (board.device?.part || 'XC3S500E').toUpperCase(), { size: 10, weight: 'normal', fill: '#bbb' })}
    ${text(330, 396, 'S3E', { size: 12, anchor: 'start' })}
    ${ic(226, 690, 60, 64, [], 7)}${text(256, 680, 'U7', { size: 9 })}
    ${text(400, 660, 'Papilio One', { size: 18 })}${text(400, 680, 'BPC3003', { size: 10, weight: 'normal' })}
    ${wing(WING_X.c, 24)}${wing(WING_X.b - 24, 24)}${wing(WING_X.a - 24, 24)}
    ${text(52, 268, 'C', { size: 14 })}${text(WING_X.b - 12, 268, 'B', { size: 14 })}${text(WING_X.a - 12, 268, 'A', { size: 14 })}
    ${text(52, 762, 'WING2', { size: 11 })}${text(WING_X.b + 12, 762, 'WING1', { size: 11 })}
    ${POWER_ROWS.map((r, i) => text(98, ROW_Y(r) + 4, ['GND', '2V5', '3V3', '5V', '5V', '3V3', '2V5', 'GND'][i], { size: 8, anchor: 'start', weight: 'normal' })).join('')}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk pap-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port pap-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // the emulator's power switch (the board has none), upright by the jack, its LED the PWR LED
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'pap-power');
  // the wings' pins 0..15, each numbered, the design's port on it beside it, inside the board (A's left of B's)
  for (let i = 0; i < 16; i++) {
    const k = 15 - i, y = ROW(k) - 7;
    silkText(`${k}`, 90, y);
    port('wing_c', k, 128, y);
    silkText(`${k}`, 648, y);
    port('wing_b', k, 610, y);
    port('wing_a', k, 548, y);
  }
  return wrap;
}
// the upright power switch, its LED the PWR LED right of it; the wings' ports small
papilioOneLayout.css = `${POWER_V_CSS}
.pap-power .emu-power-led { left: 24px; top: -6px; }
.pap-silk { font-size: 9px; }
.emu-port.pap-port { font-size: 9px; }
`;
