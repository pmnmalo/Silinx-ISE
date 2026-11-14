// Silinx - Board Emulator: the Numato Elbert V2 drawn as the real board (#3745). Our own drawing, after the board's
// photo and its connection diagram (Numato's documentation): each part where it is, in proportion (the board 900 x 650),
// with its silkscreen names.
import { boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 900, H = 650;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
const holes = [[22, 22], [878, 22], [22, 628], [878, 628]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="#e3d9b0"/><circle cx="${x}" cy="${y}" r="6" fill="#0b0b0b"/>`).join('');
// a female header, cols x 2, its name over it
const unit = (x, y, cols, name) => `<rect x="${x}" y="${y}" width="${cols * 22}" height="50" rx="2" fill="#151515" stroke="#333"/>`
  + Array.from({ length: 2 * cols }, (_, i) => `<rect x="${x + 7 + (i % cols) * 22}" y="${y + (i < cols ? 9 : 31)}" width="9" height="9" fill="#050505" stroke="#444"/>`).join('')
  + text(x + cols * 11, y - 7, name, { size: 9 });

// where the parts are (their centres)
const POWER = [80, 262];
// the 3 digits S3 (left), S2, S1 by their enables' pins (Numato's diagram: Enable 1..3 on P120, P121, P124)
const DIGIT_AT = { P120: ['S3', 134], P121: ['S2', 210], P124: ['S1', 285] }, DIG_X = [134, 210, 285], DIG_Y = 420;
const LED_X = (k) => 772 - k * 31, LED_Y = 428;            // D1 (right) .. D8: LED0 .. LED7
const DIP_X = 863, DIP_Y = (k) => 346 + k * 21;            // the DIP switch upright: DPSwitch0 (top) .. 7, ON to the left
// the push buttons SW1..SW6 (Switch0..5), their places on the board
const BTN_AT = [[729, 124], [849, 124], [791, 189], [849, 240], [791, 298], [729, 240]];

/** Numato Elbert V2: green PCB. The top edge: the VGA connector, the stereo jack, the micro SD adapter; the left edge:
 *  the DC barrel jack, the power select jumper, the mini USB, the header P8 and the JTAG header (P3); the three LM317
 *  regulators and the flash top left, the PIC, its ICSP and the FWUP button under them; the FPGA in the middle; the
 *  3-digit display (S3, S2, S1) bottom left and D8..D1 right of the board's name, over the headers P4, P2, P6, P1 along
 *  the bottom edge, P5 under the display; the six push buttons SW1..SW6 (right) over the upright 8-way DIP switch. The
 *  board has no power switch (the USB powers it): the emulator's is by the USB connector. */
export function elbertV2Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const segs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, i) => `${s}(${pinsOf(board, 'seg')[i] ?? ''})`).concat(`dp(${pinsOf(board, 'dp')[0] ?? ''})`);
  const art = `
    <defs><linearGradient id="elbpcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7a32"/><stop offset="1" stop-color="#256628"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="8" fill="url(#elbpcb) #2f7a32" stroke="#174a19" stroke-width="3"/>
    ${holes}
    <rect x="0" y="54" width="85" height="77" rx="3" fill="#111" stroke="#000"/><circle cx="24" cy="92" r="15" fill="#2b2b2b"/><circle cx="24" cy="92" r="5" fill="#888"/>
    ${text(50, 146, 'DC BARREL JACK', { size: 7 })}
    <rect x="38" y="160" width="20" height="66" fill="#111" stroke="#444"/>${[0, 1, 2].map((i) => `<circle cx="48" cy="${171 + i * 22}" r="4" fill="#d8c67e"/>`).join('')}
    ${text(48, 238, 'V-SELECT', { size: 6, weight: 'normal' })}${text(32, 193, '1-2 USB PWR  2-3 EXT PWR', { size: 5, rotate: true, weight: 'normal' })}
    <rect x="101" y="160" width="10" height="18" fill="#d18a1a"/>${text(106, 154, 'POWER', { size: 6, weight: 'normal' })}${text(106, 192, 'D10', { size: 7 })}
    <rect x="0" y="240" width="58" height="51" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="254" width="34" height="22" rx="2" fill="#55595f"/>${text(29, 306, 'USB', { size: 9 })}
    ${ic(99, 15, 109, 72, ['LM317'], 9)}${ic(223, 15, 94, 72, ['LM317'], 9)}${ic(150, 109, 95, 73, ['LM317'], 9)}
    ${ic(303, 116, 65, 66, ['M25P16'], 8)}
    ${ic(103, 226, 83, 72, ['PIC'], 9)}
    <rect x="207" y="211" width="20" height="87" fill="#111" stroke="#444"/>${Array.from({ length: 5 }, (_, i) => `<rect x="213" y="${219 + i * 16}" width="8" height="8" fill="#c9a94a"/>`).join('')}${text(240, 254, 'ICSP', { size: 7, rotate: true })}
    <rect x="248" y="262" width="18" height="44" rx="2" fill="#e9e9e9" stroke="#9a9a9a"/><circle cx="257" cy="284" r="5" fill="#333"/>${text(278, 284, 'FWUP', { size: 7, rotate: true })}
    <rect x="121" y="309" width="65" height="21" rx="10" fill="#d8dbe0" stroke="#7b8088"/>${text(153, 323, '12MHz', { size: 7, weight: 'normal', fill: '#333' })}
    <rect x="28" y="318" width="20" height="82" fill="#111" stroke="#444"/>${Array.from({ length: 4 }, (_, i) => `<circle cx="38" cy="${330 + i * 19}" r="4" fill="#d8c67e"/>`).join('')}${text(58, 362, 'P8', { size: 8, anchor: 'start' })}
    <rect x="12" y="430" width="51" height="138" rx="2" fill="#151515" stroke="#333"/>${Array.from({ length: 14 }, (_, i) => `<rect x="${22 + (i % 2) * 22}" y="${439 + (i >> 1) * 18}" width="9" height="9" fill="#c9a94a"/>`).join('')}
    ${text(80, 499, 'JTAG', { size: 9, rotate: true })}${text(78, 584, 'P3', { size: 8 })}
    <rect x="376" y="0" width="182" height="16" rx="2" fill="#b9bec6" stroke="#6b7079"/><rect x="410" y="16" width="114" height="50" rx="3" fill="#151515"/>
    <path d="M422,22 h90 l-8,30 h-74 z" fill="#2a2a2a"/>${[392, 542].map((cx) => `<rect x="${cx - 9}" y="14" width="18" height="38" rx="2" fill="#c3c7cd" stroke="#6b7079"/><circle cx="${cx}" cy="42" r="4" fill="#6b7079"/>`).join('')}
    ${text(467, 86, 'VGA')}
    <rect x="594" y="0" width="95" height="63" rx="3" fill="#111" stroke="#000"/><rect x="624" y="0" width="34" height="10" fill="#2b2b2b"/><circle cx="641" cy="34" r="12" fill="#2b2b2b"/>
    ${text(641, 80, 'STEREO JACK', { size: 8 })}
    <rect x="732" y="7" width="80" height="73" rx="3" fill="#b9bec6" stroke="#6b7079"/><rect x="744" y="7" width="56" height="12" fill="#8d939b"/>
    ${text(772, 96, 'MICRO SD', { size: 8 })}
    ${ic(395, 179, 218, 192, [], 10)}${text(504, 262, 'SPARTAN-3A', { size: 12, fill: '#ddd' })}${text(504, 280, (board.device?.part || 'XC3S50A').toUpperCase(), { size: 9, weight: 'normal', fill: '#bbb' })}
    ${text(504, 296, 'TQG144', { size: 8, weight: 'normal', fill: '#bbb' })}
    ${BTN_AT.map(([x, y]) => `<rect x="${x - 23}" y="${y - 23}" width="46" height="46" rx="3" fill="#1d1d1d" stroke="#000"/>`).join('')}
    <rect x="${DIP_X - 25}" y="328" width="51" height="174" rx="2" fill="#2f6fc9" stroke="#1a4a8f"/>
    ${text(DIP_X - 20, 323, 'ON', { size: 6, weight: 'normal' })}${text(826, 415, 'DIP SWITCH', { size: 8, rotate: true })}
    ${DIG_X.map((x) => `<rect x="${x - 38}" y="${DIG_Y - 48}" width="76" height="96" rx="2" fill="#e4e4e4" stroke="#999"/><rect x="${x - 33}" y="${DIG_Y - 44}" width="66" height="88" fill="#202020"/>`).join('')}
    ${text(86, DIG_Y, '7 SEGMENT DISPLAYS', { size: 6, rotate: true, weight: 'normal' })}
    ${segs.map((s, i) => text(DIG_X[0] - 36 + i * 28, DIG_Y + 62, s, { size: 6, anchor: 'start', weight: 'normal' })).join('')}
    ${text(412, 455, 'ELBERT V2', { size: 11 })}
    ${unit(233, 499, 6, 'P4')}${unit(386, 499, 6, 'P2')}${unit(543, 499, 6, 'P6')}${unit(696, 499, 6, 'P1')}${unit(95, 560, 5, 'P5')}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk elb-silk' }, t), x, y);
  const port = (res, k, x, y, cls = '') => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y, cls);
  // the emulator's power switch (the board has none), upright right of the USB, its LED under it
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'elb-power');
  // the 3 digits, each where its enable's pin is
  for (let i = 0; i < 3; i++) {
    const k = 2 - i, [name, x] = DIGIT_AT[pinsOf(board, 'an')[k]] ?? [];
    if (!name) continue;
    silkText(name, x, DIG_Y - 60);
    part(put(mkDigit(k), x, DIG_Y - 43, 'elb-dig'), `an${k}`);
  }
  // D1..D8: LED0..LED7, right to left, their names over them, their ports under them
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = LED_X(k);
    silkText(`D${k + 1}`, x, LED_Y - 22);
    part(put(mkLed(k, 'emu-led b2-led elb-led'), x, LED_Y - 6), `led${k}`);
    port('led', k, x, LED_Y + 6, 'elb-vport');
  }
  // the push buttons SW1..SW6 (Switch0..5), their names over them
  for (let i = 0; i < 6; i++) {
    const k = 5 - i, [x, y] = BTN_AT[k];
    silkText(`SW${k + 1}`, x, y - 34);
    part(put(mkButton(k, 'emu-btn elb-btn'), x, y - 12), `btn${k}`);
    port('btn', k, x, y + 27);
  }
  // the DIP switch, upright: DPSwitch0 (top) .. 7, each toggle ON (closed: the input reads 0) to the left; its ports left of it
  for (let i = 0; i < 8; i++) {
    const k = 7 - i;
    part(put(mkSwitch(k, 'emu-sw elb-dip', 'dip'), DIP_X, DIP_Y(k) - 7), `dip${k}`);
    port('dip', k, DIP_X - 56, DIP_Y(k) - 8);
  }
  return wrap;
}
// its parts' look: the round caps of the tact buttons, the DIP switch's sideways toggles, the big digits, the upright
// power switch (its LED under it); the LEDs are the Basys2's (emulator.js)
elbertV2Layout.css = `${POWER_V_CSS}
.elb-power .emu-power-led { left: 3px; top: 42px; }
.elb-dig svg { width: 58px; height: 86px; }
.elb-led { width: 10px; height: 12px; }
.elb-btn { width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(#fafafa, #c9c9c9); border: 1px solid #888; cursor: pointer; user-select: none; }
.elb-btn.on { background: radial-gradient(#ff6a5a, #b31d12); }
.elb-dip { width: 28px; height: 14px; border-radius: 1px; background: #0f2f66; border: 1px solid #0a1a3a; position: relative; cursor: pointer; }
.elb-dip::after { content: ''; position: absolute; top: 1px; bottom: 1px; width: 12px; right: 1px; background: #f2f2f2; border-radius: 1px; transition: right .08s; }
.elb-dip.on::after { right: 15px; }
.elb-vport .emu-port { writing-mode: vertical-rl; }
.elb-silk { font-size: 8px; }
`;
