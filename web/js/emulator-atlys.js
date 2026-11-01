// Silinx - Board Emulator: the Digilent Atlys drawn as the real board (#2481). Our own drawing, after the board's
// photos and its reference manual: each part where it is, as it is turned, in proportion (the board 860 x 780), with its
// silkscreen names; its 7-segment display on a module plugged into the VHDCI connector, as the examples use it (#732).
import { holes4, boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 1100, H = 780, BW = 860;                       // the drawing: the board (BW wide), the module on its VHDCI
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
const microUsb = (y) => `<rect x="0" y="${y}" width="34" height="26" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="${y + 8}" width="24" height="10" rx="2" fill="#55595f"/>`;
// an HDMI connector on the top edge, its opening up; on the left edge, its opening left
const hdmiTop = (x, name) => `<rect x="${x}" y="0" width="86" height="48" rx="3" fill="#c3c7cd" stroke="#6b7079"/><path d="M${x + 12},6 h62 l-6,14 h-50 z" fill="#3a3d42"/>` + text(x + 43, 62, name, { size: 8 });
const audio = (x, fill, name) => `<rect x="${x}" y="0" width="40" height="56" rx="4" fill="${fill}" stroke="#222"/><circle cx="${x + 20}" cy="14" r="9" fill="#222"/>` + text(x + 20, 70, name, { size: 7 });

// where the parts are (their centres)
const POWER = [134, 48];
const SW_X = (i) => 468 + i * 40, SW_Y = 726;            // SW7 (left) .. SW0, upright, on the bottom edge
const LED_Y = 650;                                       // LD7 .. LD0, each over its switch
const DIG_X = (i) => 920 + i * 46, DIG_Y = 300;          // AN3 (left) .. AN0, on the module
// the five buttons in a cross, by their index in btn (btn[0] = BTNU ... btn[4] = BTNC), RESET over them
const BTN_AT = [['BTNU', 770, 470], ['BTNL', 712, 530], ['BTND', 770, 590], ['BTNR', 828, 530], ['BTNC', 770, 530]];
const RESET = [836, 474];

/** Digilent Atlys: dark green PCB. The top edge: the 5 V jack and the upright power switch beside it, HDMI OUT, the
 *  audio jacks (HP OUT, LINE OUT, LINE IN, MIC), HDMI IN, Ethernet in the corner; the left edge: the JTAG header, the
 *  USB PROG micro-USB, the USB HOST port, the UART micro-USB, an HDMI IN; the right edge: the VHDCI connector, with the
 *  7-segment module plugged into it; the FPGA in the middle; RESET over the cross of five buttons (right); the Pmod JB
 *  on the bottom edge (left), LD7..LD0 over the slide switches SW7..SW0 along it (right). */
export function atlysLayout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const segs = ['CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG', 'DP'].map((s, i) => `${s}(${(i < 7 ? pinsOf(board, 'seg')[i] : pinsOf(board, 'dp')[0]) ?? ''})`);
  const art = `
    <defs><linearGradient id="atpcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a4d40"/><stop offset="1" stop-color="#203e33"/></linearGradient></defs>
    <rect x="4" y="4" width="${BW - 8}" height="${H - 8}" rx="10" fill="url(#atpcb)" stroke="#0f2219" stroke-width="3"/>
    ${holes4(BW, H)}
    <rect x="40" y="0" width="62" height="84" rx="3" fill="#1a1a1a" stroke="#000"/><circle cx="71" cy="24" r="12" fill="#333"/><circle cx="71" cy="24" r="4" fill="#888"/>
    ${text(POWER[0], 16, 'ON', { size: 7 })}${text(POWER[0], 100, 'OFF', { size: 7 })}${text(POWER[0], 112, 'POWER', { size: 8 })}
    ${hdmiTop(170, 'HDMI OUT')}${audio(280, '#222', 'HP OUT')}${audio(330, '#55b34a', 'LINE OUT')}${audio(380, '#4a8ad8', 'LINE IN')}${audio(430, '#e0789a', 'MIC')}
    ${hdmiTop(490, 'HDMI IN')}
    <rect x="620" y="0" width="120" height="96" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="638" y="0" width="84" height="58" fill="#55595f"/>${text(680, 110, 'ETHERNET', { size: 8 })}
    <rect x="18" y="140" width="40" height="104" rx="2" fill="#141414"/>${Array.from({ length: 14 }, (_, i) => `<rect x="${i % 2 ? 42 : 26}" y="${148 + Math.floor(i / 2) * 13.5}" width="8" height="8" fill="#c9a94a"/>`).join('')}${text(66, 196, 'JTAG', { size: 7, anchor: 'start', weight: 'normal' })}
    ${microUsb(286)}${text(42, 304, 'PROG', { size: 8, anchor: 'start' })}
    <rect x="0" y="348" width="96" height="82" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="372" width="62" height="34" rx="2" fill="#55595f"/>${text(104, 394, 'HOST', { size: 8, anchor: 'start' })}
    ${microUsb(472)}${text(42, 490, 'UART', { size: 8, anchor: 'start' })}
    <rect x="0" y="556" width="62" height="118" rx="3" fill="#c3c7cd" stroke="#6b7079"/><path d="M6,568 v94 l14,-8 v-78 z" fill="#3a3d42"/>${text(70, 620, 'HDMI IN', { size: 8, anchor: 'start' })}
    <rect x="306" y="700" width="128" height="80" rx="2" fill="#141414"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${318 + (i % 6) * 18}" y="${680 + Math.floor(i / 6) * 12}" width="8" height="8" fill="#c9a94a"/>`).join('')}${text(296, 696, 'JB', { size: 11, anchor: 'end' })}
    <rect x="254" y="726" width="22" height="34" rx="2" fill="#2a6fd1"/>
    <rect x="${BW - 72}" y="170" width="72" height="270" rx="4" fill="#c3c7cd" stroke="#6b7079"/><rect x="${BW - 58}" y="182" width="58" height="246" rx="3" fill="#1a1a1a"/>
    ${Array.from({ length: 30 }, (_, i) => `<rect x="${i % 2 ? BW - 30 : BW - 44}" y="${188 + i * 8}" width="10" height="3" fill="#c9a94a"/>`).join('')}${text(BW - 82, 306, 'VHDCI', { size: 9, anchor: 'end' })}
    <rect x="${BW - 112}" y="120" width="14" height="24" rx="2" fill="#2a6fd1"/>
    ${ic(400, 240, 110, 110, [], 9)}${text(455, 292, 'SPARTAN-6', { size: 10, fill: '#ddd' })}${text(455, 308, (board.device?.part || 'XC6SLX45').toUpperCase(), { size: 8, weight: 'normal', fill: '#bbb' })}
    ${ic(470, 390, 80, 56, ['DDR2'], 8)}${ic(610, 150, 92, 80, ['PHY'], 8)}${ic(150, 200, 64, 56, ['USB'], 8)}${ic(160, 330, 64, 56, ['HID'], 8)}${ic(330, 140, 60, 40, ['AC97'], 8)}
    <rect x="232" y="196" width="60" height="22" rx="3" fill="#d8dbe0" stroke="#7b8088"/>${text(262, 232, '100MHz', { size: 7, weight: 'normal' })}
    <rect x="602" y="236" width="150" height="40" rx="5" fill="none" stroke="#fff" stroke-width="2"/>${text(677, 265, 'ATLYS', { size: 24, weight: '900', family: 'Arial Black, Arial' })}
    <rect x="726" y="446" width="8" height="12" fill="#d18a1a"/>${text(730, 438, 'DONE', { size: 7 })}
    ${BTN_AT.map(([, x, y]) => `<rect x="${x - 19}" y="${y - 19}" width="38" height="38" rx="2" fill="#c9ccd1" stroke="#7b8088"/>`).join('')}
    <path d="M${BW},200 h18 v210 h-18 z" fill="#8d939b"/>
    <rect x="${BW + 18}" y="150" width="${W - BW - 22}" height="310" rx="6" fill="#20357a" stroke="#0e1f4d" stroke-width="2"/>
    ${text(BW + 30, 176, 'VHDCI MODULE', { size: 8, anchor: 'start' })}${text(BW + 30, 188, '7-SEGMENT (EXP-IO)', { size: 7, anchor: 'start', weight: 'normal', fill: '#c9d3ea' })}
    <rect x="${DIG_X(0) - 30}" y="${DIG_Y - 36}" width="${DIG_X(3) - DIG_X(0) + 60}" height="72" rx="3" fill="#0b0b0b" stroke="#2a2a2a"/>
    ${segs.map((s, i) => text(BW + 30 + (i % 4) * 50, 392 + Math.floor(i / 4) * 12, s, { size: 7, anchor: 'start', weight: 'normal', fill: '#c9d3ea' })).join('')}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk at-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // the power switch, upright on the top edge beside the 5 V jack (ON up), its LED beside it
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'at-power');
  // LD7..LD0 over SW7..SW0 (the right part of the bottom edge), their FPGA pins in brackets
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = SW_X(i);
    silkText(`LD${k}`, x, LED_Y - 30);
    part(put(mkLed(k, 'emu-led b2-led at-led'), x, LED_Y - 16), `led${k}`);
    silkText(`(${pinsOf(board, 'led')[k] ?? ''})`, x, LED_Y - 4);
    port('led', k, x, LED_Y + 7);
    part(put(mkSwitch(k, 'emu-sw at-sw'), x, SW_Y - 26), `sw${k}`);
    silkText(`SW${k}`, x, SW_Y + 27);
    port('sw', k, x, SW_Y + 38);
  }
  // the 4-digit display on the VHDCI module (AN3..AN0)
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = DIG_X(i);
    part(put(mkDigit(k), x, DIG_Y - 27), `an${k}`);
    put(h('span', { class: 'emu-silk at-silk' }, `AN${k}`), x, DIG_Y + 40);
    port('an', k, x, DIG_Y + 52);
  }
  // RESET (red) over the buttons in a cross, each named with its pin
  part(put(mkButton(0, 'emu-btn at-reset', 'btn_reset'), ...RESET.map((v, i) => v - [0, 11][i])), 'btn_reset');
  silkText('RESET', RESET[0], RESET[1] - 28);
  for (let i = 0; i < 5; i++) {
    const k = 4 - i, [lbl, x, y] = BTN_AT[k];
    part(put(mkButton(k, 'emu-btn nx2-btn'), x, y - 17), `btn${k}`);
    silkText(lbl, x, y + 20);
    port('btn', k, x, y + 31);
  }
  return wrap;
}
// its parts' look: the upright power switch (its LED beside it), the small slide switches, the red RESET button; the
// buttons are the Nexys2's (emulator-nexys2.js)
atlysLayout.css = `${POWER_V_CSS}
.at-power .emu-power-led { left: 24px; top: 30px; }
.at-silk { font-size: 8px; }
.at-led { width: 10px; height: 14px; }
.at-sw { width: 26px; height: 50px; border-radius: 2px; background: #111; border: 1px solid #000; position: relative; cursor: pointer; }
.at-sw::after { content: ''; position: absolute; left: 4px; right: 4px; height: 19px; bottom: 4px; background: #4a4a4a; border: 1px solid #000; border-radius: 1px; transition: bottom .08s; }
.at-sw.on::after { bottom: 25px; background: #6a6a6a; }
.at-reset { width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(#ff6a5a, #b31d12); border: 2px solid #8a8a8a; }
.at-reset.on { background: radial-gradient(#ffb0a8, #ff3b30); }
`;
