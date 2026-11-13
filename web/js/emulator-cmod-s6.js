// Silinx - Board Emulator: the Digilent Cmod S6 drawn as the real board (#3745). Our own drawing, after the board's
// photo in its reference manual: a 48-pin DIP module, 2.6" x 0.7" (the board 936 x 252, 360 px to the inch), each part
// where it is, with its silkscreen names.
import { boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';

const W = 936, H = 252;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
// the DIP pins, 100 mil apart, 600 mil between the rows: 1..24 along the top edge right to left, 25..48 along the
// bottom edge left to right
const PIN_X = (i) => 54 + i * 36;
const dip = Array.from({ length: 24 }, (_, i) => [18, 234].map((y) => `<circle cx="${PIN_X(i)}" cy="${y}" r="9" fill="#d8c67e"/><circle cx="${PIN_X(i)}" cy="${y}" r="4" fill="#5a4a1a"/>`).join('')).join('');

// where the parts are (their centres)
const POWER = [108, 120];
const LED_X = 666, LED_Y = (i) => 70 + i * 29;            // LD3 (top) .. LD0
const BTN_AT = [[752, 104], [838, 104]];                   // BTN0, BTN1

/** Digilent Cmod S6: a teal 48-pin DIP module. The micro USB on the left end, the POWER LED by it, the USB controller,
 *  the board's name, the FPGA in the middle, LD3..LD0 in a column right of it, the push buttons BTN0 and BTN1, the
 *  4-pin header J4 on the right end; the DIP pins along both long edges (pin 1 top right, 24 top left, 25 bottom left,
 *  48 bottom right). The board has no power switch (the USB powers it): the emulator's is by the USB, its LED the
 *  POWER LED. */
export function cmodS6Layout({ board, title, h, mkLed, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const art = `
    <defs><linearGradient id="cs6pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f6f5c"/><stop offset="1" stop-color="#18594a"/></linearGradient></defs>
    <rect x="4" y="2" width="${W - 8}" height="${H - 4}" rx="6" fill="url(#cs6pcb) #1f6f5c" stroke="#0b3329" stroke-width="3"/>
    ${dip}
    ${text(PIN_X(23) + 22, 46, '1', { size: 9 })}${text(PIN_X(0) - 22, 46, '24', { size: 9 })}${text(PIN_X(0) - 22, 214, '25', { size: 9 })}${text(PIN_X(23) + 22, 214, '48', { size: 9 })}
    <rect x="0" y="94" width="66" height="64" rx="4" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="112" width="28" height="28" rx="3" fill="#55595f"/>
    ${text(136, 92, 'POWER', { size: 9 })}
    ${ic(170, 92, 92, 92, [], 7)}${text(216, 206, 'IC5', { size: 8, weight: 'normal' })}
    ${text(370, 82, 'Cmod S6', { size: 26, weight: '900', family: 'Arial Black, Arial' })}
    ${text(370, 112, 'REV A', { size: 9, weight: 'normal' })}
    <rect x="300" y="138" width="34" height="22" rx="2" fill="#d8dbe0" stroke="#7b8088"/>${text(317, 176, '8MHz', { size: 8, weight: 'normal' })}
    ${ic(450, 70, 126, 112, [], 9)}${text(513, 122, 'SPARTAN-6', { size: 11, fill: '#ddd' })}${text(513, 140, (board.device?.part || 'XC6SLX4').toUpperCase(), { size: 9, weight: 'normal', fill: '#bbb' })}
    ${ic(372, 150, 46, 40, ['QSPI'], 7)}
    ${BTN_AT.map(([x, y]) => `<rect x="${x - 26}" y="${y - 22}" width="52" height="44" rx="2" fill="#d6d9de" stroke="#7b8088"/>`).join('')}
    ${[0, 1, 2, 3].map((i) => `<circle cx="910" cy="${72 + i * 36}" r="8" fill="#d8c67e"/><circle cx="910" cy="${72 + i * 36}" r="3.5" fill="#5a4a1a"/>`).join('')}
    ${text(888, 60, 'J4', { size: 9 })}`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk cs6-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // the emulator's power switch (the board has none), upright by the USB, its LED the POWER LED
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'cs6-power');
  // LD3..LD0 in a column, each named on its left with its pin, its port on its right
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, y = LED_Y(i);
    silkText(`LD${k}(${pinsOf(board, 'led')[k] ?? ''})`, LED_X - 34, y - 6);
    part(put(mkLed(k, 'emu-led b2-led cs6-led'), LED_X, y - 4), `led${k}`);
    port('led', k, LED_X + 30, y - 7);
  }
  // BTN0 and BTN1, their names under them
  for (let i = 0; i < 2; i++) {
    const k = 1 - i, [x, y] = BTN_AT[k];
    part(put(mkButton(k, 'emu-btn nx2-btn cs6-btn'), x, y - 14), `btn${k}`);
    silkText(`BTN${k}(${pinsOf(board, 'btn')[k] ?? ''})`, x, y + 26);
    port('btn', k, x, y + 37);
  }
  return wrap;
}
// its parts' look: the buttons are the Nexys2's (emulator-nexys2.js), smaller; the SMD LEDs; the upright power switch,
// its LED the POWER LED right of it
cmodS6Layout.css = `${POWER_V_CSS}
.cs6-power .emu-power-led { left: 22px; top: 4px; }
.cs6-led { width: 14px; height: 8px; }
.nx2-btn.cs6-btn { width: 28px; height: 28px; }
.nx2-btn.cs6-btn::after { left: 5px; top: 5px; }
.cs6-silk { font-size: 8px; }
`;
