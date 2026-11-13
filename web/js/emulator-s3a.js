// Silinx - Board Emulator: the Xilinx Spartan-3A / 3AN Starter Kit drawn as the real board (#3745). Our own drawing,
// after the board's photos in its user guide (UG334, figures 1-1, 2-1, 2-5, 2-12, 3-1, 15-1): each part where it is, as
// it is turned, in proportion (the board 820 x 890), with its silkscreen names.
import { holes4, boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 820, H = 890;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
// a D-sub on the top edge, seen from above: the metal shell's front plate, the body (black, or the DTE's blue), the
// screw locks, its name and designator under it
const dsub = (x, w, name, desig, body = '#151515') => `<rect x="${x}" y="0" width="${w}" height="16" rx="2" fill="#b9bec6" stroke="#6b7079"/>`
  + `<path d="M${x + 22},3 L${x + w - 22},3 L${x + w - 28},13 L${x + 28},13 Z" fill="#8d939b"/>`
  + `<rect x="${x + 14}" y="16" width="${w - 28}" height="46" rx="2" fill="${body}"/>`
  + [x + 8, x + w - 8].map((cx) => `<rect x="${cx - 7}" y="14" width="14" height="38" rx="2" fill="#c3c7cd" stroke="#6b7079"/><circle cx="${cx}" cy="44" r="3.5" fill="#6b7079"/>`).join('')
  + text(x + w / 2, 78, name) + (desig ? text(x + w / 2, 89, desig, { size: 7, weight: 'normal' }) : '');
// a 2 x 20 stake-pin header (the differential headers J2, J15), its name on its left
const header40 = (x, y, name) => `<rect x="${x}" y="${y}" width="200" height="22" rx="1" fill="#141414"/>`
  + Array.from({ length: 40 }, (_, i) => `<rect x="${x + 4 + (i >> 1) * 9.8}" y="${y + (i % 2 ? 13 : 4)}" width="5" height="5" fill="#c9a94a"/>`).join('')
  + text(x - 8, y + 15, name, { anchor: 'end' });
// a 6-pin accessory header, right-angle, its body on the right edge, its name on its left
const header6 = (y, name) => `<rect x="${W - 26}" y="${y}" width="22" height="68" rx="2" fill="#141414"/>`
  + Array.from({ length: 6 }, (_, i) => `<rect x="${W - 40}" y="${y + 5 + i * 10.5}" width="6" height="6" fill="#c9a94a"/>`).join('')
  + text(W - 46, y + 38, name, { size: 8, anchor: 'end' });

// where the parts are (their centres)
const POWER = [44, 114];
const KNOB = [664, 777], N = [664, 705], S = [664, 845], WEST = [606, 777], EAST = [722, 777];
const LED_X = (i) => 448 + i * 16, LED_Y = 772;            // LED7 (left) .. LED0, over the switches
const SW_X = (i) => 455 + i * 37, SW_Y = 795;               // SW3 (left) .. SW0, upright, ON (HIGH, '1') up
const LCD = { x: 60, y: 690, w: 372, h: 176, cellW: 16.6, cellH: 28, cw: 13.5, ch: 26 };

/** Xilinx Spartan-3A / 3AN Starter Kit: dark green PCB. The top edge: the 5 V jack with the upright power switch under
 *  it on the left edge (top-left corner), the VGA, PS/2 (J28), RS-232 DCE (J36, female, black) and DTE (J27, male, blue)
 *  connectors, the audio jack in the top-right corner, the SUSPEND switch under it; the left edge: Ethernet (J32) and the
 *  USB download port; the right edge: the Hirose FX2 connector (J17), the accessory headers J20 and J18; the FPGA in the
 *  middle, the differential headers J2 over it and J15 under it; at the bottom the 16x2 LCD (left), LED7..LED0 over
 *  SW3..SW0 (middle), the rotary knob among NORTH / EAST / SOUTH / WEST (right). */
export function s3aLayout({ board, title, h, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkLcd, mkRotary, turnKnob, mkPower }) {
  const lcdX0 = LCD.x + LCD.w / 2 - (15 * LCD.cellW + LCD.cw) / 2, lcdY0 = LCD.y + LCD.h / 2 - 30;
  const lcdChars = Array.from({ length: 32 }, (_, i) => `<rect x="${lcdX0 + (i % 16) * LCD.cellW}" y="${lcdY0 + Math.floor(i / 16) * LCD.cellH}" width="${LCD.cw}" height="${LCD.ch}" fill="#9fbf3a" opacity=".5"/>`).join('');
  const tact = ([x, y]) => `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="2" fill="#c9ccd1" stroke="#7b8088"/>`;
  const art = `
    <defs><linearGradient id="s3apcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b6136"/><stop offset="1" stop-color="#1f4c2a"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="8" fill="url(#s3apcb) #2b6136" stroke="#102a16" stroke-width="3"/>
    ${holes4(W, H)}
    <rect x="70" y="0" width="46" height="58" rx="3" fill="#1a1a1a" stroke="#000"/><circle cx="93" cy="16" r="9" fill="#333"/><circle cx="93" cy="16" r="3" fill="#888"/>
    ${text(93, 70, '5V DC', { size: 8 })}${text(POWER[0], 88, 'ON', { size: 7, weight: 'normal' })}${text(POWER[0], 158, 'POWER', { size: 8 })}
    ${dsub(140, 140, 'VGA', '')}
    <rect x="304" y="0" width="54" height="58" rx="3" fill="#1a1a1a" stroke="#000"/><circle cx="331" cy="24" r="15" fill="#2b2b2b"/><circle cx="331" cy="24" r="4" fill="#777"/>
    ${text(331, 74, 'PS/2')}${text(331, 85, 'J28', { size: 7, weight: 'normal' })}
    ${dsub(374, 150, 'RS-232 DCE', 'J36')}${dsub(538, 150, 'RS-232 DTE', 'J27', '#2f6f9e')}
    <rect x="712" y="0" width="40" height="68" rx="3" fill="#141414" stroke="#000"/><circle cx="732" cy="14" r="8" fill="#2b2b2b"/><circle cx="732" cy="14" r="3" fill="#777"/>
    ${text(732, 82, 'AUDIO', { size: 8 })}
    <rect x="764" y="150" width="16" height="36" rx="2" fill="#141414"/><rect x="767" y="153" width="10" height="14" fill="#5a5a5a"/>
    ${text(772, 200, 'SUSPEND', { size: 7 })}${text(788, 160, 'RUN', { size: 6, anchor: 'start', weight: 'normal' })}
    <rect x="0" y="294" width="92" height="74" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="308" width="50" height="46" fill="#55595f"/><rect x="58" y="302" width="10" height="8" fill="#e6c34a"/><rect x="58" y="352" width="10" height="8" fill="#5fbf4a"/>
    ${text(46, 384, 'ETHERNET', { size: 8 })}${text(46, 395, 'J32', { size: 7, weight: 'normal' })}
    <rect x="0" y="540" width="70" height="58" rx="3" fill="#c9a94a" stroke="#8a6d1d"/><rect x="0" y="552" width="40" height="34" rx="2" fill="#55595f"/>
    ${text(78, 573, 'USB', { anchor: 'start' })}
    <rect x="${W - 58}" y="255" width="54" height="350" rx="3" fill="#141414"/><rect x="${W - 46}" y="263" width="30" height="334" fill="#0b0b0b"/>
    ${Array.from({ length: 48 }, (_, i) => `<rect x="${i % 2 ? W - 29 : W - 44}" y="${266 + i * 6.8}" width="11" height="3" fill="#c9a94a"/>`).join('')}
    ${text(W - 66, 430, 'FX2', { rotate: true, size: 10 })}${text(W - 78, 430, 'J17', { rotate: true, size: 8, weight: 'normal' })}
    <rect x="700" y="300" width="12" height="240" fill="#c9a94a" opacity=".55"/>${text(694, 420, 'J34', { rotate: true, size: 7, weight: 'normal' })}
    ${Array.from({ length: 6 }, (_, i) => `<circle cx="770" cy="${652 + i * 10.5}" r="3" fill="#d8c67e"/>`).join('')}${text(770, 640, 'J19', { size: 7 })}
    ${header6(645, 'J20')}${header6(735, 'J18')}
    ${header40(364, 228, 'J2')}${header40(364, 660, 'J15')}
    ${ic(425, 400, 100, 100, [], 9)}${text(475, 446, 'SPARTAN-3A', { size: 10, fill: '#ddd' })}${text(475, 462, (board.device?.part || 'XC3S700A').toUpperCase(), { size: 8, weight: 'normal', fill: '#bbb' })}
    ${ic(215, 430, 56, 74, ['DDR2', 'SDRAM'], 8)}${ic(292, 180, 42, 28, ['XCF04S'], 7)}${ic(250, 320, 44, 32, ['SPI', 'FLASH'], 7)}
    ${ic(130, 410, 54, 66, ['NOR', 'FLASH'], 7)}${ic(110, 300, 50, 50, ['ETH', 'PHY'], 7)}${ic(100, 600, 66, 62, ['JTAG'], 8)}${ic(200, 600, 52, 52, ['CPLD'], 7)}
    ${ic(160, 200, 48, 40, ['DAC'], 7)}${ic(160, 120, 48, 40, ['ADC'], 7)}
    ${text(253, 288, 'Platform Flash', { size: 8, weight: 'normal' })}
    <rect x="485" y="308" width="24" height="18" rx="2" fill="#d8dbe0" stroke="#7b8088"/>${text(497, 340, '50 MHz', { size: 7 })}
    <rect x="446" y="582" width="36" height="44" rx="4" fill="#c3c7cd" stroke="#6b7079"/>${text(464, 608, '133', { size: 8, fill: '#333' })}${text(490, 608, 'AUX CLK', { size: 7, anchor: 'start' })}
    <rect x="296" y="584" width="26" height="34" rx="2" fill="#2a6fd1"/>${text(309, 576, 'J26', { size: 7 })}${text(309, 630, 'MODE', { size: 7, weight: 'normal' })}
    <circle cx="507" cy="722" r="11" fill="#d9b54a" stroke="#8a6d1d" stroke-width="2"/><circle cx="507" cy="722" r="4" fill="#8a6d1d"/>${text(524, 726, 'SMA', { size: 8, anchor: 'start' })}
    <rect x="622" y="232" width="26" height="26" rx="2" fill="#c9ccd1" stroke="#7b8088"/><circle cx="635" cy="245" r="7" fill="#e9e9e9"/>${text(635, 272, 'PROG', { size: 8 })}
    <rect x="667" y="236" width="6" height="9" fill="#d18a1a"/>${text(670, 258, 'DONE', { size: 7, anchor: 'start' })}
    ${text(612, 540, 'SPARTAN-3A', { size: 18, weight: '900', family: 'Arial Black, Arial' })}
    ${[N, S, WEST, EAST].map(tact).join('')}
    <rect x="${KNOB[0] - 30}" y="${KNOB[1] - 30}" width="60" height="60" rx="3" fill="#b6bac0" stroke="#6b7079"/>
    <rect x="${LCD.x}" y="${LCD.y}" width="${LCD.w}" height="${LCD.h}" rx="3" fill="#3f8a2f" stroke="#245a1a" stroke-width="2"/>
    ${[[LCD.x + 12, LCD.y + 12], [LCD.x + LCD.w - 12, LCD.y + 12], [LCD.x + 12, LCD.y + LCD.h - 12], [LCD.x + LCD.w - 12, LCD.y + LCD.h - 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#d8c67e"/><circle cx="${x}" cy="${y}" r="3" fill="#1b1b1b"/>`).join('')}
    ${Array.from({ length: 16 }, (_, i) => `<rect x="${LCD.x + 60 + i * 9}" y="${LCD.y + 6}" width="5" height="9" fill="#c9a94a"/>`).join('')}
    <rect x="${LCD.x + 22}" y="${LCD.y + 26}" width="${LCD.w - 44}" height="${LCD.h - 52}" rx="3" fill="#111"/>
    <rect x="${LCD.x + 34}" y="${LCD.y + 38}" width="${LCD.w - 68}" height="${LCD.h - 76}" rx="2" fill="#b7d24c"/>${lcdChars}
    ${Array.from({ length: 8 }, (_, i) => text(LED_X(i) + 3, LED_Y - 10, `LED${7 - i}`, { size: 7, anchor: 'start', rotate: true })).join('')}
    ${text(SW_X(3) + 24, SW_Y + 4, 'LOGIC 1', { size: 7, anchor: 'start', weight: 'normal' })}${text(SW_X(3) + 24, SW_Y + 46, 'LOGIC 0', { size: 7, anchor: 'start', weight: 'normal' })}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk s3a-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // the power switch, upright under the 5 V jack (ON up), its LED beside it
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 's3a-power');
  // LCD glass: 2 x 16 characters over the drawn cells
  const lcd = mkLcd({ cellW: LCD.cellW, cellH: LCD.cellH, w: LCD.cw, h: LCD.ch });
  lcd.classList.add('s3a-lcd');
  part(put(lcd, LCD.x + LCD.w / 2, lcdY0), 'lcd');
  // rotary push in the middle of the knob, ⟲ / ⟳ on its sides (and the mouse wheel), the four buttons around it
  const knob = part(put(mkButton(0, 'emu-btn s3e-knob', 'rot_center'), KNOB[0], KNOB[1] - 19), 'rot_center');
  knob.addEventListener('wheel', (e) => { e.preventDefault(); turnKnob(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  const rot = mkRotary();
  rot.classList.add('s3e-rot');
  // (the row over the knob lets the clicks between its two buttons through, to the knob)
  part(put(rot, KNOB[0], KNOB[1] - 9), 'rotary').style.pointerEvents = 'none';
  const dirs = [['btn_north', 'NORTH', ...N, 1], ['btn_south', 'SOUTH', ...S, 1], ['btn_west', 'WEST', ...WEST, 0], ['btn_east', 'EAST', ...EAST, 0]];
  for (const [res, lbl, x, y, side] of dirs) {
    if (!board.resources.some((r) => r.name === res)) continue;
    part(put(mkButton(0, 'emu-btn s3e-btn', res), x, y - 11), res);
    // NORTH and SOUTH: the name beside the button (the knob is under and over them); WEST and EAST: under it
    const [lx, ly] = side ? [x + 50, y - 12] : [x, y + 17];
    silkText(`${lbl}(${pinsOf(board, res)[0] ?? ''})`, lx, ly);
    port(res, 0, lx, ly + 12);
  }
  // LED7..LED0 (tiny upright SMD LEDs) over the switches SW3..SW0
  for (let i = 0; i < 8; i++) {
    const k = 7 - i;
    part(put(mkLed(k, 'emu-led s3e-led'), LED_X(i), LED_Y - 5), `led${k}`);
  }
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = SW_X(i);
    part(put(mkSwitch(k, 'emu-sw s3e-sw', 'sw'), x, SW_Y), `sw${k}`);
    silkText(`SW${k}(${pinsOf(board, 'sw')[k] ?? ''})`, x, SW_Y + 52);
    port('sw', k, x, SW_Y + 63);
  }
  return wrap;
}
s3aLayout.lcd = true;   // the layout shows the character LCD
// its parts' look: the S3E Starter Kit's buttons, knob, switches and LEDs (emulator-s3e.js); the upright power switch,
// its LED right of it; the LCD's cells
s3aLayout.css = `${POWER_V_CSS}
.s3a-power .emu-power-led { left: 24px; top: 4px; }
.s3a-silk { font-size: 8px; }
.s3a-lcd { width: ${15 * LCD.cellW + LCD.cw}px; height: ${LCD.cellH + LCD.ch}px; }
.s3a-lcd .emu-lcd-cell { font-size: 20px; line-height: ${LCD.ch}px; }
`;
