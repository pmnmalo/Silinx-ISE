// Silinx - Board Emulator: the Digilent Basys2 drawn as the real board (#2479; out of emulator.js, #405). Our own
// drawing, after the board's photos and its reference manual: each part where it is, as it is turned, in proportion
// (the board 840 x 556), with its silkscreen names (the switches', buttons', digits' and Pmods' with their FPGA pins).
import { holes4, boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 840, H = 556;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
// a Pmod (6-pin right-angle header) on the top edge: its black body on the edge, its pins on the board under it, each
// with its FPGA pin (then GND, VCC), the header's name on its left
const pmodTop = (x, name, pins) => `<rect x="${x}" y="0" width="125" height="40" rx="2" fill="#141414"/>`
  + [...pins, 'GND', 'VCC'].map((p, i) => `<circle cx="${x + 14 + i * 19.4}" cy="48" r="5" fill="#d8c67e"/><circle cx="${x + 14 + i * 19.4}" cy="48" r="2" fill="#5a4a1a"/>`
    + text(x + 17 + i * 19.4, 58, i < 4 ? `(${p})` : p, { size: 7, weight: 'normal', anchor: 'end', rotate: true })).join('')
  + text(x - 12, 52, name, { size: 11 });

// where the parts are (their centres)
const POWER = [24, 430];
const SW_X = (i) => 108 + i * 54.4, SW_Y = 475;           // SW7 (left) .. SW0, upright, ON (HIGH) up, on the bottom edge
const LED_Y = 410;                                        // LD7 .. LD0, each over its switch
const BTN_X = (i) => 558 + i * 64.4, BTN_Y = 492;         // BTN3 (left) .. BTN0, on the bottom edge
const DIG_X = (i) => 620 + i * 60 + (i > 1 ? 14 : 0), DIG_Y = 409;   // AN3 (left) .. AN0, a colon between AN2 and AN1

/** Digilent Basys2 (rev C): royal blue PCB. The Pmods JA..JD along the top edge; on the left edge the PS/2
 *  connector (J1), the mini-USB (J3), the battery connector, the STATUS LED and, in the bottom-left corner, the upright
 *  power switch SW8 (ON up); the VGA connector (J2) on the right edge, the mode jumper JP3 above it; the FPGA (IC3)
 *  in the middle, the clock jumper JP4 above it, the socket IC6; LD7..LD0 over the big slide switches SW7..SW0 along
 *  the bottom edge (left), the 4-digit display DISP1 over BTN3..BTN0 (right). */
export function basys2Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const segs = ['CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG'].map((s, i) => `${s}(${pinsOf(board, 'seg')[i] ?? ''})`).concat(`DP(${pinsOf(board, 'dp')[0] ?? ''})`);
  const art = `
    <defs><linearGradient id="b2pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2156b3"/><stop offset="1" stop-color="#18449a"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="8" fill="url(#b2pcb)" stroke="#0e2a66" stroke-width="3"/>
    ${holes4(W, H)}
    ${pmodTop(99, 'JA', [pinsOf(board, 'ja')[0], ...pinsOf(board, 'tx'), ...pinsOf(board, 'rx'), pinsOf(board, 'ja')[1]])}${pmodTop(278, 'JB', pinsOf(board, 'jb'))}${pmodTop(457, 'JC', pinsOf(board, 'jc'))}${pmodTop(635, 'JD', pinsOf(board, 'jd'))}
    <rect x="0" y="91" width="54" height="96" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="104" width="30" height="70" fill="#9da2a9"/><rect x="34" y="96" width="14" height="86" fill="#d9dce1"/>
    ${text(10, 86, 'J1', { size: 8, anchor: 'start' })}${text(64, 108, `PS2C(${pinsOf(board, 'ps2_clk')[0] ?? ''})`, { size: 7, anchor: 'start', weight: 'normal' })}${text(64, 118, `PS2D(${pinsOf(board, 'ps2_data')[0] ?? ''})`, { size: 7, anchor: 'start', weight: 'normal' })}
    <rect x="0" y="244" width="60" height="44" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="256" width="36" height="20" rx="2" fill="#55595f"/>${text(10, 238, 'J3', { size: 8, anchor: 'start' })}
    <rect x="10" y="318" width="34" height="14" fill="#141414"/><circle cx="19" cy="325" r="3" fill="#c9a94a"/><circle cx="35" cy="325" r="3" fill="#c9a94a"/>${text(8, 312, 'BATTERY', { size: 7, anchor: 'start', weight: 'normal' })}
    ${text(80, 342, 'STATUS', { size: 7, anchor: 'start', weight: 'normal' })}${text(80, 351, 'LED', { size: 7, anchor: 'start', weight: 'normal' })}
    ${text(8, 374, '5V DC ONLY', { size: 7, anchor: 'start', weight: 'normal' })}${text(POWER[0], 400, 'ON', { size: 7 })}${text(POWER[0], 462, 'OFF', { size: 7 })}
    ${text(POWER[0] + 18, 432, 'SW8', { size: 7, rotate: true })}${text(POWER[0] + 2, 478, 'POWER', { size: 8 })}
    <rect x="109" y="343" width="50" height="36" rx="3" fill="#d8dbe0" stroke="#7b8088"/><rect x="115" y="349" width="38" height="24" rx="2" fill="#b9bdc3"/>${text(104, 365, 'X1', { size: 7, anchor: 'end', weight: 'normal' })}
    ${ic(150, 150, 46, 46, ['USB'], 8)}${ic(316, 160, 40, 30, ['XCF02S'], 6)}${ic(623, 149, 53, 45, ['IC4'], 7)}
    <rect x="398" y="220" width="58" height="58" rx="2" fill="#121212" stroke="#333"/>${text(427, 246, 'SPARTAN-3E', { size: 7, fill: '#ddd' })}${text(427, 258, (board.device?.part || 'XC3S100E').toUpperCase(), { size: 6, weight: 'normal', fill: '#bbb' })}
    ${text(464, 262, 'IC3', { size: 8, anchor: 'start', weight: 'normal' })}
    <rect x="408" y="116" width="40" height="13" fill="#141414"/>${[0, 1, 2].map((i) => `<circle cx="${415 + i * 13}" cy="122" r="3" fill="#c9a94a"/>`).join('')}
    ${text(428, 108, '50MHz', { size: 7, weight: 'normal' })}${text(404, 126, '100MHz', { size: 7, anchor: 'end', weight: 'normal' })}${text(452, 126, '25MHz', { size: 7, anchor: 'start', weight: 'normal' })}
    ${text(428, 142, `MCLK (${pinsOf(board, 'mclk')[0] ?? 'B8'})`, { size: 7, weight: 'normal' })}${text(428, 152, 'JP4', { size: 7, weight: 'normal' })}
    <rect x="620" y="273" width="64" height="58" rx="2" fill="#1a1a1a"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="${630 + (i % 4) * 14.5}" cy="${i < 4 ? 284 : 320}" r="3" fill="#c9a94a"/>`).join('')}
    ${text(612, 340, 'IC6', { size: 8, anchor: 'end' })}${text(652, 268, `UCLK (${pinsOf(board, 'uclk')[0] ?? 'M6'})`, { size: 7, weight: 'normal' })}
    <rect x="776" y="58" width="36" height="14" fill="#141414"/><rect x="776" y="56" width="24" height="18" rx="2" fill="#2a7de1"/>${text(794, 50, 'MODE', { size: 7, weight: 'normal' })}${text(780, 86, 'PC', { size: 7, weight: 'normal' })}${text(806, 86, 'ROM', { size: 7, weight: 'normal' })}${text(770, 70, 'JP3', { size: 7, anchor: 'end', weight: 'normal' })}
    <rect x="726" y="106" width="114" height="228" rx="4" fill="#1a1a1a" stroke="#000"/><rect x="808" y="118" width="32" height="204" fill="#c3c7cd" stroke="#6b7079"/>
    ${[124, 300].map((y) => `<rect x="742" y="${y}" width="66" height="24" rx="3" fill="#c3c7cd" stroke="#6b7079"/><circle cx="760" cy="${y + 12}" r="6" fill="#8d939b"/>`).join('')}
    ${text(716, 222, 'J2', { size: 8, anchor: 'end' })}${text(716, 234, 'VGA', { size: 8, anchor: 'end' })}
    <rect x="198" y="236" width="152" height="36" rx="8" fill="#163c86" stroke="#fff" stroke-width="2.5"/>${text(274, 263, 'BASYS 2', { size: 24, weight: '900', family: 'Arial Black, Arial' })}
    ${text(524, 452, 'HIGH', { size: 7, rotate: true })}${text(524, 512, 'LOW', { size: 7, rotate: true })}
    <rect x="585" y="378" width="253" height="62" rx="2" fill="#0b0b0b" stroke="#2a2a2a"/><circle cx="${DIG_X(1) + 33}" cy="400" r="2.5" fill="#3a0d08"/><circle cx="${DIG_X(1) + 33}" cy="418" r="2.5" fill="#3a0d08"/>
    ${text(585, 372, 'DISP1', { size: 7, anchor: 'start', weight: 'normal' })}
    ${segs.map((s, i) => text(580, 383 + i * 8, s, { size: 6, anchor: 'end', weight: 'normal' })).join('')}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk b2-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // the power switch SW8, upright in the bottom-left corner (ON up), its STATUS LED over it
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'b2-power');
  // LD7..LD0 over SW7..SW0 (left part of the bottom edge): the LED's name over it, its FPGA pin under it
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = SW_X(i);
    silkText(`LD${k}`, x, LED_Y - 20);
    part(put(mkLed(k, 'emu-led b2-led'), x, LED_Y - 5), `led${k}`);
    silkText(`(${pinsOf(board, 'led')[k] ?? ''})`, x, LED_Y + 6);
    port('led', k, x, LED_Y + 17);
    part(put(mkSwitch(k, 'emu-sw bs2-sw'), x, SW_Y - 38), `sw${k}`);
    silkText(`SW${k}-${pinsOf(board, 'sw')[k] ?? ''}`, x, SW_Y + 40);
    port('sw', k, x, SW_Y + 51);
  }
  // the 4-digit display (AN3..AN0) and, under it, BTN3..BTN0
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = DIG_X(i);
    part(put(mkDigit(k), x, DIG_Y - 27), `an${k}`);
    silkText(`AN${k}(${pinsOf(board, 'an')[k] ?? ''})`, x, DIG_Y + 33);
    port('an', k, x, DIG_Y + 44);
  }
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = BTN_X(i);
    part(put(mkButton(k, 'emu-btn b2-btn bs2-btn'), x, BTN_Y - 18), `btn${k}`);
    silkText(`BTN${k}-${pinsOf(board, 'btn')[k] ?? ''}`, x, BTN_Y + 23);
    port('btn', k, x, BTN_Y + 34);
  }
  return wrap;
}
// its parts' look: the upright power switch (the STATUS LED over it), the big black slide switches, the tact buttons
basys2Layout.css = `${POWER_V_CSS}
.b2-power .emu-power-led { left: 52px; top: -76px; }
.b2-silk { font-size: 8px; }
.bs2-sw { width: 40px; height: 72px; border-radius: 2px; background: #111; border: 1px solid #000; position: relative; cursor: pointer; }
.bs2-sw::after { content: ''; position: absolute; left: 6px; right: 6px; height: 28px; bottom: 5px; background: #4a4a4a; border: 1px solid #000; border-radius: 1px; transition: bottom .08s; }
.bs2-sw.on::after { bottom: 37px; background: #6a6a6a; }
.bs2-btn { width: 38px; height: 38px; }
.bs2-btn::after { left: 8px; top: 8px; }
`;
