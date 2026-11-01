// Silinx - Board Emulator: the iCEBreaker drawn as the real board (#2481). Our own drawing, after the board's annotated
// top view in its repository: each part where it is, as it is turned, in proportion (the main board 712 x 493, its
// snap-off Pmod part plugged into PMOD2 on its right), with its silkscreen names.
import { holes4, boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 1010, H = 493, MW = 712;                       // the drawing: the main board (MW wide), the snap-off part
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
// a 2 x 6 Pmod header seen from above: its 12 holes, along the edge (`down`: upright, on the main board's right edge)
const header12 = (x, y, down = false) => `<rect x="${x}" y="${y}" width="${down ? 54 : 190}" height="${down ? 190 : 54}" rx="3" fill="#13254d" stroke="#d8c67e" stroke-width="1.5"/>`
  + Array.from({ length: 12 }, (_, i) => {
    const [a, b] = [i % 6, Math.floor(i / 6)];
    const [cx, cy] = down ? [x + 15 + b * 24, y + 18 + a * 31] : [x + 18 + a * 31, y + 15 + b * 24];
    return `<circle cx="${cx}" cy="${cy}" r="8" fill="#d8c67e"/><circle cx="${cx}" cy="${cy}" r="4" fill="#0c1733"/>`;
  }).join('');
const tact = (x, y, s = 48) => `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="3" fill="#c9ccd1" stroke="#7b8088"/>`;

// where the parts are (their centres)
const POWER = [24, 95];
// the snap-off part's LEDs in a cross, by their index in led (led[0] = LED1, the red one in the middle)
const LED_AT = [[848, 253], [819, 253], [877, 253], [848, 221], [848, 285]];
const BTN_Y = (i) => 162 + i * 92, BTN_X = 955;           // Button 1 (top) .. Button 3
const UBUTTON = [32, 365];

/** 1BitSquared iCEBreaker (v1.0b): dark blue PCB. PMOD1A, +5V and PMOD1B along the top edge, PMOD2 upright on the right
 *  edge; the micro-USB on the left edge with the PWR LED over it, the user button (UBUTTON) under it with the green and
 *  red LEDs beside it, the RGB LED; the USB programmer chip, the FPGA turned a quarter (a diamond) in the middle, the
 *  flash under it, CDONE, CRESET, the FLASH header on the bottom edge. Plugged into PMOD2, the snap-off part: LED1 (red)
 *  in the middle of LED2..LED5 (green) in a cross, Button 1..3 in a column. The board has no power switch (the USB
 *  powers it): the emulator's is drawn by the USB, its LED the PWR LED. */
export function icebreakerLayout({ board, title, h, mkLed, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const pin = (res, k = 0) => pinsOf(board, res)[k] ?? '';
  const art = `
    <defs><linearGradient id="icbpcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3a7a"/><stop offset="1" stop-color="#152d63"/></linearGradient></defs>
    <rect x="4" y="4" width="${MW - 8}" height="${H - 8}" rx="18" fill="url(#icbpcb)" stroke="#0b1a40" stroke-width="3"/>
    ${holes4(MW, H)}
    ${header12(80, 4)}${text(180, 78, 'PMOD1A', { size: 12 })}${text(70, 26, '7', { size: 9 })}${text(70, 50, '1', { size: 9 })}
    <rect x="330" y="8" width="28" height="48" rx="3" fill="#13254d" stroke="#d8c67e" stroke-width="1.5"/><circle cx="344" cy="20" r="7" fill="#d8c67e"/><circle cx="344" cy="44" r="7" fill="#d8c67e"/>${text(344, 78, '+5V', { size: 10 })}
    ${header12(400, 4)}${text(500, 78, 'PMOD1B', { size: 12 })}
    ${header12(620, 141, true)}${text(606, 253, 'PMOD2', { size: 12, rotate: true })}
    <rect x="0" y="189" width="56" height="80" rx="4" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="212" width="30" height="34" rx="3" fill="#55595f"/>${text(64, 234, 'USB', { size: 9, anchor: 'start' })}
    ${text(48, 156, 'PWR', { size: 8, anchor: 'start' })}${text(POWER[0], 70, 'ON', { size: 7 })}
    <rect x="94" y="108" width="22" height="16" rx="2" fill="#d8dbe0" stroke="#7b8088"/>${text(105, 102, '12MHz', { size: 7, weight: 'normal' })}
    ${ic(136, 189, 128, 128, ['FT2232HQ'], 9)}
    ${tact(UBUTTON[0], UBUTTON[1], 44)}${text(76, 365, 'UBUTTON', { size: 8, rotate: true })}
    <rect x="98" y="342" width="16" height="12" rx="2" fill="#163a16" stroke="#0a0a0a"/>${text(122, 352, 'G', { size: 8, anchor: 'start' })}
    <rect x="98" y="366" width="16" height="12" rx="2" fill="#3a1414" stroke="#0a0a0a"/>${text(122, 376, 'R', { size: 8, anchor: 'start' })}
    <rect x="146" y="424" width="34" height="34" rx="3" fill="#f2f2f2" stroke="#9a9a9a"/>${text(163, 476, 'RGBLED', { size: 8 })}
    <g transform="rotate(45 424 221)"><rect x="368" y="165" width="112" height="112" rx="4" fill="#121212" stroke="#333"/></g>
    ${text(424, 218, 'iCE40UP5k', { size: 9, fill: '#ddd' })}${text(424, 231, (board.device?.package || 'SG48').toUpperCase(), { size: 7, weight: 'normal', fill: '#bbb' })}
    ${text(300, 118, 'iCEBreaker', { size: 24, weight: '900' })}
    ${ic(408, 389, 112, 48, ['W25Q128'], 8)}
    <rect x="362" y="394" width="10" height="7" fill="#d18a1a"/>${text(367, 414, 'CDONE', { size: 7, weight: 'normal' })}
    <rect x="540" y="361" width="24" height="24" rx="2" fill="#141414"/><circle cx="552" cy="373" r="5" fill="#c9a94a"/>${text(576, 368, 'CRESET', { size: 7, rotate: true })}
    <rect x="344" y="452" width="240" height="32" rx="3" fill="#13254d" stroke="#d8c67e" stroke-width="1.5"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="${358 + i * 30}" cy="468" r="7" fill="#d8c67e"/>`).join('')}${text(464, 446, 'FLASH', { size: 8, weight: 'normal' })}
    <rect x="${MW}" y="190" width="10" height="110" fill="#8d939b"/>
    <rect x="720" y="109" width="${W - 724}" height="264" rx="14" fill="url(#icbpcb)" stroke="#0b1a40" stroke-width="3"/>
    ${[[740, 129], [740, 353]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="#d8c67e"/><circle cx="${x}" cy="${y}" r="3.5" fill="#1b1b1b"/>`).join('')}
    <rect x="756" y="141" width="44" height="190" rx="3" fill="#141414"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${764 + Math.floor(i / 6) * 20}" y="${152 + (i % 6) * 31}" width="8" height="8" fill="#c9a94a"/>`).join('')}
    ${text(820, 135, 'PMOD', { size: 9 })}
    ${[0, 1, 2].map((i) => tact(BTN_X, BTN_Y(i))).join('')}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk icb-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // the power (the USB): a switch by the USB, ON up, its LED the board's PWR LED
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'icb-power');
  // the user button BTN_N
  part(put(mkButton(0, 'emu-btn icb-btn', 'btn_n'), UBUTTON[0], UBUTTON[1] - 15), 'btn_n');
  port('btn_n', 0, UBUTTON[0], UBUTTON[1] + 24);
  // the snap-off part: LED1..LED5 in a cross, Button 1..3 in a column, each named with its FPGA pin
  for (let i = 0; i < 5; i++) {
    const k = 4 - i, [x, y] = LED_AT[k];
    part(put(mkLed(k, 'emu-led icb-led'), x, y - 6), `led${k}`);
  }
  silkText(`LED1 (${pin('led', 0)})`, 848, 302);
  for (let i = 0; i < 3; i++) {
    const k = 2 - i, y = BTN_Y(k);
    silkText(`Button ${k + 1}`, BTN_X, y - 38);
    part(put(mkButton(k, 'emu-btn icb-btn'), BTN_X, y - 15), `btn${k}`);
    port('btn', k, BTN_X, y + 26);
  }
  return wrap;
}
// its parts' look: the power switch by the USB (its LED the PWR LED), the round tact buttons, the small SMD LEDs
icebreakerLayout.css = `${POWER_V_CSS}
.icb-power .emu-power-led { left: 20px; top: 71px; }
.icb-silk { font-size: 8px; }
.icb-btn { width: 30px; height: 30px; border-radius: 50%; background: radial-gradient(#4a4a4a, #151515); border: 1px solid #000; }
.icb-btn.on { background: radial-gradient(#d33, #700); }
.icb-led { width: 12px; height: 12px; border-radius: 2px; border: 1px solid #0a0a0a; }
`;
