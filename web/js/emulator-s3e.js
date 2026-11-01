// Silinx - Board Emulator: the Xilinx Spartan-3E Starter Kit drawn as the real board (#2478; out of emulator.js, #405).
// Our own drawing, after the board's photos and figures in its user guide (UG230): each part where it is, as it is
// turned, in proportion (1 px = 0.16 mm, the board 860 x 736), with its silkscreen names.
import { esc } from './dom.js';
import { holes4, boardFrame } from './emulator-pcb.js';

const W = 860, H = 736, SILK = '#eef3ec';
const text = (x, y, t, { size = 9, anchor = 'middle', weight = 'bold', fill = SILK, rotate = false, family = 'Arial' } = {}) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" text-anchor="${anchor}" font-family="${family}" font-weight="${weight}"${rotate ? ` transform="rotate(-90 ${x} ${y})"` : ''}>${esc(t)}</text>`;
// a D-sub on the top edge, seen from above: the metal shell's front plate, the black body, the screw locks
const dsub = (x, w, name, desig) => `<rect x="${x}" y="0" width="${w}" height="16" rx="2" fill="#b9bec6" stroke="#6b7079"/>`
  + `<path d="M${x + 22},3 L${x + w - 22},3 L${x + w - 28},13 L${x + 28},13 Z" fill="#8d939b"/>`
  + `<rect x="${x + 14}" y="16" width="${w - 28}" height="46" rx="2" fill="#151515"/>`
  + [x + 8, x + w - 8].map((cx) => `<rect x="${cx - 7}" y="14" width="14" height="38" rx="2" fill="#c3c7cd" stroke="#6b7079"/><circle cx="${cx}" cy="44" r="3.5" fill="#6b7079"/>`).join('')
  + text(x + w / 2, 78, name) + text(x + w / 2, 89, desig, { size: 7, weight: 'normal' });
// a 6-pin header (Digilent's peripheral module connector), upright, along the right edge
const header6 = (x, y, name) => `<rect x="${x}" y="${y}" width="20" height="68" rx="2" fill="#141414"/>`
  + Array.from({ length: 6 }, (_, i) => `<rect x="${x + 7}" y="${y + 5 + i * 10.5}" width="6" height="6" fill="#c9a94a"/>`).join('')
  + text(x + 10, y + 80, name);
const ic = (x, y, w, hgt, lines = [], size = 8) => `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="2" fill="#141414" stroke="#2c2c2c"/>`
  + lines.map((t, i) => text(x + w / 2, y + hgt / 2 + (i - (lines.length - 1) / 2) * (size + 3) + 3, t, { size, fill: i ? '#a9a9a9' : '#d6d6d6', weight: i ? 'normal' : 'bold' })).join('');

// where the parts are (their centres)
const KNOB = [180, 645], N = [182, 588], S = [182, 708], WEST = [108, 645], EAST = [254, 645];
const LED_X = (i) => 688 + i * 15.4, LED_Y = 621;           // LED7 (left) .. LED0
const SW_X = (i) => 690 + i * 40, SW_Y = 653;               // SW3 (left) .. SW0, upright, ON up
const LCD = { x: 276, y: 556, w: 388, h: 175, cellW: 17.3, cellH: 29, cw: 14, ch: 27 };

/** Xilinx / Digilent Spartan-3E Starter Kit (rev D): dark green PCB. The top edge: the 5 V jack and, beside it, the
 *  upright power switch with its red LED (top left), then the VGA, PS/2, RS-232 DCE (female) and DTE (male)
 *  connectors; the left edge: Ethernet (RJ-45) and the USB download port; the right edge: the Hirose FX2 connector (J3)
 *  and the 6-pin headers J4, J1, J2; the FPGA in the middle, the clocks (50 MHz oscillator, DIP socket, SMA) right of it; at the bottom the rotary knob among BTN_NORTH / EAST / SOUTH / WEST (left), the 16x2 LCD (centre),
 *  LED7..LED0 above SW3..SW0 (right). */
export function s3eLayout({ board, title, h, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkLcd, mkRotary, turnKnob, mkPower }) {
  const silk = SILK;
  const lcdX0 = LCD.x + LCD.w / 2 - (15 * LCD.cellW + LCD.cw) / 2, lcdY0 = LCD.y + LCD.h / 2 - 32;
  const lcdChars = Array.from({ length: 32 }, (_, i) => `<rect x="${lcdX0 + (i % 16) * LCD.cellW}" y="${lcdY0 + Math.floor(i / 16) * LCD.cellH}" width="${LCD.cw}" height="${LCD.ch}" fill="#9fbf3a" opacity=".5"/>`).join('');
  const tact = ([x, y]) => `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="2" fill="#c9ccd1" stroke="#7b8088"/>`;
  const art = `
    <defs><linearGradient id="s3epcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a5c3d"/><stop offset="1" stop-color="#1f4a30"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="10" fill="url(#s3epcb)" stroke="#102a1b" stroke-width="3"/>
    ${holes4(W, H)}
    <rect x="62" y="0" width="46" height="60" rx="3" fill="#1a1a1a" stroke="#000"/><circle cx="85" cy="16" r="9" fill="#333"/><circle cx="85" cy="16" r="3" fill="#888"/>
    ${text(85, 72, '5V DC')}${text(140, 56, 'ON', { size: 8 })}${text(140, 118, 'POWER', { size: 8 })}
    ${dsub(232, 160, 'VGA', 'J15')}
    <rect x="406" y="0" width="58" height="62" rx="3" fill="#1a1a1a" stroke="#000"/><circle cx="435" cy="24" r="16" fill="#2b2b2b"/><circle cx="435" cy="24" r="4" fill="#777"/>
    ${text(435, 78, 'PS/2')}${text(435, 89, 'J14', { size: 7, weight: 'normal' })}
    ${dsub(478, 150, 'RS-232 DCE', 'J9')}${dsub(642, 150, 'RS-232 DTE', 'J10')}
    <rect x="0" y="324" width="104" height="88" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="342" width="56" height="52" fill="#55595f"/><rect x="62" y="336" width="10" height="8" fill="#e6c34a"/><rect x="62" y="392" width="10" height="8" fill="#5fbf4a"/>
    ${text(54, 428, 'ETHERNET')}
    <rect x="0" y="434" width="80" height="58" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="448" width="40" height="30" rx="2" fill="#55595f"/>
    ${text(86, 467, 'USB', { anchor: 'start' })}
    <rect x="800" y="132" width="56" height="362" rx="3" fill="#141414"/><rect x="812" y="140" width="30" height="346" fill="#0b0b0b"/>
    ${Array.from({ length: 50 }, (_, i) => `<rect x="${i % 2 ? 829 : 814}" y="${143 + i * 6.8}" width="11" height="3" fill="#c9a94a"/>`).join('')}
    ${text(780, 316, 'FX2', { rotate: true, size: 10 })}${text(792, 316, 'J3', { rotate: true, size: 8, weight: 'normal' })}
    ${header6(780, 500, 'J4')}${header6(832, 500, 'J1')}${header6(832, 600, 'J2')}
    ${ic(398, 118, 58, 102, ['DDR', 'SDRAM'], 8)}${ic(300, 196, 52, 40, ['SPI', 'FLASH'], 7)}${ic(560, 150, 40, 26, ['XCF04S'], 7)}
    ${ic(611, 147, 58, 50, ['XC2C64A', 'CPLD'], 7)}${ic(378, 471, 104, 74, ['NOR', 'FLASH'], 8)}
    ${ic(170, 452, 70, 72, ['USB'], 8)}${ic(40, 518, 96, 66, ['ETH', 'PHY'], 8)}
    <rect x="387" y="294" width="88" height="88" rx="3" fill="#121212" stroke="#333"/>
    ${text(431, 334, 'SPARTAN-3E', { size: 9, fill: '#ddd' })}${text(431, 350, (board.device?.part || 'XC3S500E').toUpperCase(), { size: 8, weight: 'normal', fill: '#bbb' })}
    ${text(560, 404, 'SPARTAN-3E', { size: 22, weight: '900', family: 'Arial Black, Arial' })}
    <rect x="580" y="330" width="22" height="20" rx="2" fill="#d8dbe0" stroke="#7b8088"/>${text(591, 362, '50 MHz', { size: 7 })}
    <rect x="622" y="316" width="36" height="52" rx="2" fill="#1a1a1a"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="${i < 4 ? 629 : 651}" cy="${325 + (i % 4) * 11}" r="2.5" fill="#c9a94a"/>`).join('')}${text(664, 346, 'AUX CLK', { size: 7, anchor: 'start' })}
    <circle cx="702" cy="423" r="11" fill="#d9b54a" stroke="#8a6d1d" stroke-width="2"/><circle cx="702" cy="423" r="4" fill="#8a6d1d"/>${text(702, 448, 'SMA', { size: 8 })}
    <rect x="718" y="156" width="26" height="26" rx="2" fill="#c9ccd1" stroke="#7b8088"/><circle cx="731" cy="169" r="7" fill="#e9e9e9"/>${text(731, 196, 'PROG', { size: 8 })}
    <rect x="542" y="110" width="6" height="9" fill="#d18a1a"/>${text(545, 132, 'DONE', { size: 7 })}
    ${[N, S, WEST, EAST].map(tact).join('')}
    <rect x="${KNOB[0] - 30}" y="${KNOB[1] - 30}" width="60" height="60" rx="3" fill="#b6bac0" stroke="#6b7079"/>
    <rect x="${LCD.x}" y="${LCD.y}" width="${LCD.w}" height="${LCD.h}" rx="3" fill="#3f8a2f" stroke="#245a1a" stroke-width="2"/>
    ${[[LCD.x + 12, LCD.y + 12], [LCD.x + LCD.w - 12, LCD.y + 12], [LCD.x + 12, LCD.y + LCD.h - 12], [LCD.x + LCD.w - 12, LCD.y + LCD.h - 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#d8c67e"/><circle cx="${x}" cy="${y}" r="3" fill="#1b1b1b"/>`).join('')}
    ${Array.from({ length: 16 }, (_, i) => `<rect x="${LCD.x + 60 + i * 9}" y="${LCD.y + LCD.h - 16}" width="5" height="9" fill="#c9a94a"/>`).join('')}
    <rect x="${LCD.x + 22}" y="${LCD.y + 28}" width="${LCD.w - 44}" height="${LCD.h - 62}" rx="3" fill="#111"/>
    <rect x="${LCD.x + 38}" y="${LCD.y + 40}" width="${LCD.w - 76}" height="${LCD.h - 86}" rx="2" fill="#b7d24c"/>${lcdChars}
    ${text(LCD.x + LCD.w / 2, LCD.y + 18, 'DISP1', { size: 8, weight: 'normal' })}
    ${Array.from({ length: 8 }, (_, i) => text(LED_X(i) + 3, LED_Y - 12, `LD${7 - i}`, { size: 7, anchor: 'start', rotate: true })).join('')}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk s3e-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // the power switch, upright beside the 5 V jack (ON up), its red LED in the corner
  const power = part(put(mkPower(), 140, 66), 'power');
  power.firstChild.classList.add('emu-power-v', 's3e-power');
  // LCD glass: 2 x 16 characters over the drawn cells
  const lcd = mkLcd({ cellW: LCD.cellW, cellH: LCD.cellH, w: LCD.cw, h: LCD.ch });
  lcd.classList.add('s3e-lcd');
  part(put(lcd, LCD.x + LCD.w / 2, lcdY0), 'lcd');
  // rotary push in the middle of the knob, ⟲ / ⟳ on its sides (and the mouse wheel), direction buttons around it
  const knob = part(put(mkButton(0, 'emu-btn s3e-knob', 'rot_center'), KNOB[0], KNOB[1] - 19), 'rot_center');
  knob.addEventListener('wheel', (e) => { e.preventDefault(); turnKnob(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  const rot = mkRotary();
  rot.classList.add('s3e-rot');
  // (the row over the knob lets the clicks between its two buttons through, to the knob)
  part(put(rot, KNOB[0], KNOB[1] - 9), 'rotary').style.pointerEvents = 'none';
  const dirs = [['btn_north', 'BTN_NORTH', ...N, 1], ['btn_south', 'BTN_SOUTH', ...S, 1], ['btn_west', 'BTN_WEST', ...WEST, 0], ['btn_east', 'BTN_EAST', ...EAST, 0]];
  for (const [res, lbl, x, y, side] of dirs) {
    if (!board.resources.some((r) => r.name === res)) continue;
    part(put(mkButton(0, 'emu-btn s3e-btn', res), x, y - 11), res);
    // NORTH and SOUTH: the name beside the button (the knob is under and over them); WEST and EAST: under it
    const [lx, ly] = side ? [x + 58, y - 12] : [res === 'btn_east' ? x - 6 : x, y + 17];
    silkText(lbl, lx, ly);
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
    silkText(`SW${k}`, x, SW_Y + 52);
    port('sw', k, x, SW_Y + 63);
  }
  return wrap;
}
s3eLayout.lcd = true;   // the layout shows the character LCD
// its parts' look: the upright power switch (its LED moved to the corner by the jack), the tact buttons, the slide
// switches, the SMD LEDs, the LCD's larger cells
s3eLayout.css = `
.emu-power-v { flex-direction: column; gap: 0; }
.emu-power-v .emu-power-sw { width: 16px; height: 36px; }
.emu-power-v .emu-power-sw::after { left: 1px; right: 1px; width: auto; top: auto; bottom: 2px; height: 15px; transition: bottom .08s; }
.emu-power-v.on .emu-power-sw::after { left: 1px; bottom: 17px; }
.s3e-power { position: relative; }
.s3e-power .emu-power-led { position: absolute; left: -96px; top: -24px; }
.s3e-btn { width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(#f2f2f2, #b9b9b9); border: 1px solid #555; cursor: pointer; user-select: none; }
.s3e-btn.on { background: radial-gradient(#ff6a5a, #b31d12); }
.s3e-led { width: 7px; height: 10px; border-radius: 1px; border: 1px solid #0a0a0a; }
.s3e-sw { width: 24px; height: 48px; border-radius: 2px; background: #111; border: 1px solid #000; position: relative; cursor: pointer; }
.s3e-sw::after { content: ''; position: absolute; left: 3px; right: 3px; height: 19px; bottom: 3px; background: #5a5a5a; border: 1px solid #000; border-radius: 1px; transition: bottom .08s; }
.s3e-sw.on::after { bottom: 24px; background: #7a7a7a; }
.s3e-rot { gap: 38px; pointer-events: none; }
.s3e-rot .emu-rot-btn { width: 18px; height: 18px; font-size: 11px; line-height: 15px; pointer-events: auto; }
.s3e-silk { font-size: 9px; }
.s3e-lcd { width: ${15 * LCD.cellW + LCD.cw}px; height: ${LCD.cellH + LCD.ch}px; }
.s3e-lcd .emu-lcd-cell { font-size: 21px; line-height: ${LCD.ch}px; }
`;
