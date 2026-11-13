// Silinx - Board Emulator: the Digilent / Xilinx Spartan-3 Starter Board drawn as the real board (#3745). Our own
// drawing, after the component locations of its user guide (UG130, figure 1-2): each part where it is, as it is turned,
// in proportion (the board 900 x 565), with its silkscreen names.
import { boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 900, H = 565;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
const holes = [[22, 24], [861, 24], [25, 535], [861, 535]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#d8c67e"/><circle cx="${x}" cy="${y}" r="5" fill="#1b1b1b"/>`).join('');
// a 40-pin expansion connector (A1, A2) on the top edge: its body on the edge, its pins under it, its name under them
const expTop = (x, w, name) => `<rect x="${x}" y="0" width="${w}" height="22" rx="2" fill="#2a2a2a"/>`
  + Array.from({ length: 20 }, (_, i) => `<rect x="${x + 8 + i * (w - 20) / 19}" y="22" width="6" height="18" fill="#c9a94a"/>`).join('')
  + text(x + w / 2, 15, name, { size: 9, fill: '#ddd' });
// a stake-pin header of n x m pins, seen from above
const pins = (x, y, cols, rows) => `<rect x="${x}" y="${y}" width="${cols * 10 + 4}" height="${rows * 10 + 4}" fill="#141414"/>`
  + Array.from({ length: cols * rows }, (_, i) => `<rect x="${x + 4 + (i % cols) * 10}" y="${y + 4 + Math.floor(i / cols) * 10}" width="5" height="5" fill="#c9a94a"/>`).join('');

// where the parts are (their centres)
const POWER = [130, 300];
const LED_X = (i) => 182 + i * 33.1, LED_Y = 435;          // LED7 (left) .. LED0
const BTN_X = (i) => 141 + i * 77.3, BTN_Y = 505;          // BTN3 (left) .. BTN0
const SW_X = (i) => 439 + i * 49.7, SW_Y = 492;            // SW7 (left) .. SW0, upright, ON up
const DIG_X = (i) => 533 + i * 81, DIG_Y = 392;            // AN3 (left) .. AN0

/** Digilent / Xilinx Spartan-3 Starter Board: green PCB. The top edge: the expansion connectors A1 and A2; the left
 *  edge: the VGA connector, the power jack, the RS-232 DB9 (J2); the right edge: the B1 expansion connector, the PS/2
 *  port (J3) in the bottom-right corner; the FPGA right of the middle, the Platform Flash over it, the JTAG headers J7
 *  and J5, the PROG button and the DONE LED top left; the 4-digit display over the slide switches SW7..SW0 (bottom
 *  right), LED7..LED0 over the push buttons BTN3..BTN0 (bottom left). The board has no power switch: the emulator's is
 *  by the power jack, its LED the POWER LED. */
export function s3StarterLayout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const segs = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s, i) => `${s}(${pinsOf(board, 'seg')[i] ?? ''})`).concat(`DP(${pinsOf(board, 'dp')[0] ?? ''})`);
  const art = `
    <defs><linearGradient id="s3sbpcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c7a45"/><stop offset="1" stop-color="#226238"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="6" fill="url(#s3sbpcb) #2c7a45" stroke="#123a20" stroke-width="3"/>
    ${holes}${text(171, 272, 'POWER', { size: 8, weight: 'normal' })}
    ${expTop(76, 344, 'A1')}${expTop(467, 344, 'A2')}
    <rect x="0" y="55" width="88" height="196" rx="3" fill="#3a3a3a" stroke="#111"/><rect x="0" y="80" width="26" height="146" fill="#b9bec6"/>
    ${text(58, 153, 'VGA', { size: 13, rotate: true })}
    <rect x="0" y="262" width="94" height="52" rx="3" fill="#111" stroke="#000"/>${text(47, 293, 'POWER', { size: 11 })}
    <rect x="0" y="323" width="88" height="198" rx="3" fill="#3a3a3a" stroke="#111"/><rect x="0" y="352" width="26" height="140" fill="#b9bec6"/>
    ${text(58, 422, 'RS-232', { size: 12, rotate: true })}${text(74, 422, 'J2', { size: 8, rotate: true, weight: 'normal' })}
    ${ic(118, 71, 40, 52, [], 7)}<rect x="158" y="78" width="22" height="9" fill="#bbb"/><rect x="158" y="92" width="22" height="9" fill="#bbb"/><rect x="158" y="106" width="22" height="9" fill="#bbb"/>
    ${text(138, 135, '3.3V', { size: 8 })}
    <rect x="125" y="191" width="36" height="36" rx="2" fill="#d6d9de" stroke="#7b8088"/><circle cx="143" cy="209" r="11" fill="#444"/>${text(143, 241, 'PROG', { size: 8 })}
    <rect x="190" y="190" width="9" height="18" fill="#9bd36a"/>${text(196, 222, 'DONE', { size: 8 })}
    ${ic(151, 342, 18, 52, [], 7)}
    ${pins(140, 406, 1, 2)}${text(128, 418, 'J1', { size: 7, anchor: 'end' })}
    ${pins(330, 62, 2, 1)}${text(358, 72, 'J8', { size: 7, anchor: 'start' })}${pins(330, 98, 3, 3)}${text(346, 140, 'M0 M1 M2', { size: 6, weight: 'normal' })}
    ${pins(410, 58, 7, 1)}${text(452, 82, 'J7', { size: 7 })}
    ${pins(398, 136, 7, 2)}${text(438, 172, 'J5', { size: 7 })}
    ${pins(762, 62, 3, 1)}${text(778, 86, 'JP1', { size: 7 })}
    ${ic(652, 64, 26, 22, [], 7)}${text(665, 100, '2Mbit', { size: 8, weight: 'normal' })}${text(665, 111, 'PlatformFlash', { size: 8, weight: 'normal' })}
    ${ic(606, 141, 147, 135, [], 9)}${text(680, 200, 'SPARTAN-3', { size: 12, fill: '#ddd' })}${text(680, 218, (board.device?.part || 'XC3S200').toUpperCase(), { size: 10, weight: 'normal', fill: '#bbb' })}
    <rect x="428" y="356" width="38" height="42" rx="3" fill="#1c1c1c"/>${Array.from({ length: 8 }, (_, i) => `<rect x="${433 + (i % 4) * 8}" y="${i < 4 ? 360 : 388}" width="5" height="5" fill="#e0b84a"/>`).join('')}
    ${text(447, 412, 'OSC', { size: 7 })}
    <rect x="841" y="76" width="16" height="320" fill="#c9a94a" opacity=".5"/><rect x="857" y="66" width="39" height="340" rx="2" fill="#2a2a2a"/>
    ${Array.from({ length: 20 }, (_, i) => `<rect x="${843}" y="${80 + i * 15.6}" width="18" height="5" fill="#c9a94a"/>`).join('')}
    ${text(882, 236, 'B1', { size: 11, rotate: true, fill: '#ddd' })}
    ${pins(844, 410, 3, 1)}${text(861, 404, 'JP2', { size: 7 })}
    <rect x="823" y="433" width="77" height="73" rx="3" fill="#d6d9de" stroke="#7b8088"/><circle cx="866" cy="469" r="22" fill="#2b2b2b"/><circle cx="866" cy="469" r="5" fill="#777"/>
    ${text(860, 522, 'PS/2', { size: 9 })}${text(860, 533, 'J3', { size: 7, weight: 'normal' })}
    ${[0, 1, 2, 3].map((i) => `<rect x="${DIG_X(i) - 39}" y="${DIG_Y - 55}" width="78" height="110" rx="2" fill="#f2f2f2" stroke="#999"/><rect x="${DIG_X(i) - 34}" y="${DIG_Y - 50}" width="68" height="100" fill="#1a1a1a"/>`).join('')}
    ${segs.map((s, i) => text(DIG_X(0) - 40 + i * 41, DIG_Y - 70, s, { size: 6, anchor: 'start', weight: 'normal' })).join('')}
    ${Array.from({ length: 4 }, (_, i) => `<rect x="${BTN_X(i) - 24}" y="${BTN_Y - 24}" width="48" height="48" rx="2" fill="#d6d9de" stroke="#7b8088"/>`).join('')}
    ${Array.from({ length: 8 }, (_, i) => `<rect x="${SW_X(i) - 22}" y="${SW_Y - 40}" width="44" height="80" rx="2" fill="#f2f2f2" stroke="#999"/>`).join('')}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk s3sb-silk' }, t), x, y);
  const port = (res, k, x, y, cls = '') => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y, cls);
  // the emulator's power switch (the board has none), upright by the power jack, its LED the POWER LED
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 's3sb-power');
  // the 4-digit display (AN3..AN0), each named with its anode's pin over it
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = DIG_X(i);
    silkText(`AN${k}(${pinsOf(board, 'an')[k] ?? ''})`, x, DIG_Y - 92);
    port('an', k, x, DIG_Y - 81);
    part(put(mkDigit(k), x, DIG_Y - 48, 's3sb-dig'), `an${k}`);
  }
  // LED7..LED0 over the buttons, their names over them, their ports under them, upright
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = LED_X(i);
    silkText(`LED${k}`, x, LED_Y - 30);
    part(put(mkLed(k, 'emu-led b2-led s3sb-led'), x, LED_Y - 10), `led${k}`);
    port('led', k, x, LED_Y + 13, 's3sb-vport');
  }
  // BTN3..BTN0 on the bottom edge
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = BTN_X(i);
    part(put(mkButton(k, 'emu-btn nx2-btn'), x, BTN_Y - 17), `btn${k}`);
    silkText(`BTN${k}(${pinsOf(board, 'btn')[k] ?? ''})`, x, BTN_Y + 25);
    port('btn', k, x, BTN_Y + 36);
  }
  // SW7..SW0 on the bottom edge, ON up
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = SW_X(i);
    part(put(mkSwitch(k, 'emu-sw bs2-sw s3sb-sw'), x, SW_Y - 33), `sw${k}`);
    silkText(`SW${k}`, x, SW_Y + 41);
    port('sw', k, x, SW_Y + 52);
  }
  return wrap;
}
// its parts' look: the switches are the Basys2's (emulator-basys2.js), shorter, the buttons the Nexys2's
// (emulator-nexys2.js); the upright power switch, its LED the POWER LED right of it; the big digits; the LEDs upright
s3StarterLayout.css = `${POWER_V_CSS}
.s3sb-power .emu-power-led { left: 26px; top: 2px; }
.s3sb-dig svg { width: 64px; height: 94px; }
.s3sb-led { width: 9px; height: 18px; }
.bs2-sw.s3sb-sw { width: 32px; height: 66px; }
.bs2-sw.s3sb-sw::after { height: 26px; }
.bs2-sw.s3sb-sw.on::after { bottom: 33px; }
.s3sb-vport .emu-port { writing-mode: vertical-rl; }
.s3sb-silk { font-size: 8px; }
`;
