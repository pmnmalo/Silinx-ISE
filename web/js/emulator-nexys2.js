// Silinx - Board Emulator: the Digilent Nexys2 drawn (#405, #2478: out of emulator.js as it was).
import { db, pmod12, chip, holes4, boardFrame } from './emulator-pcb.js';

/** Digilent Nexys2: teal PCB, Pmods JA..JD on the top edge, serial / VGA / USB on the left, the
 *  FX2 expansion connector on the right, switches + LEDs bottom left, display and buttons bottom right. */
export function nexys2Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const W = 800, H = 560, silk = '#eef5f4';
  const art = `
    <defs><linearGradient id="nx2pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7a7c"/><stop offset="1" stop-color="#215e61"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="14" fill="url(#nx2pcb)" stroke="#153f41" stroke-width="3"/>
    ${holes4(W, H)}
    <text x="63" y="58" fill="${silk}" font-size="9" text-anchor="middle" font-family="Arial">POWER</text>
    ${pmod12(150, 10, 'JA', silk)}${pmod12(270, 10, 'JB', silk)}${pmod12(390, 10, 'JC', silk)}${pmod12(510, 10, 'JD', silk)}
    ${db(0, 100, 46, 76, '#b9bec6', 'RS-232', silk)}${db(0, 196, 46, 86, '#2f63c9', 'VGA', silk)}
    <rect x="0" y="312" width="34" height="30" rx="3" fill="#b9bec6" stroke="#6b7079"/><rect x="5" y="320" width="20" height="14" rx="2" fill="#4a4e55"/>
    <text x="44" y="332" fill="${silk}" font-size="11" font-family="Arial" font-weight="bold">USB</text>
    <rect x="${W - 58}" y="120" width="44" height="330" rx="3" fill="#141414"/>
    ${Array.from({ length: 22 }, (_, i) => `<rect x="${W - 50}" y="${132 + i * 14}" width="28" height="6" fill="#c9a94a"/>`).join('')}
    <text x="${W - 36}" y="470" fill="${silk}" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">FX2</text>
    ${chip(300, 86, 150, 64, ['Micron', 'MT45W8MW16'])}
    <text x="375" y="190" fill="#fff" font-size="34" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900">N</text>
    ${chip(305, 210, 140, 140, ['XILINX', 'SPARTAN-3E', (board.device?.part || 'XC3S500E').toUpperCase()])}
    <text x="375" y="374" fill="#fff" font-size="15" text-anchor="middle" font-family="Arial" font-weight="bold" letter-spacing="1">NEXYS 2</text>
    <text x="140" y="404" fill="#fff" font-size="20" font-family="Arial" font-weight="bold" letter-spacing="2">DIGILENT</text>
    <text x="140" y="418" fill="#cfe3e2" font-size="9" font-family="Arial" letter-spacing="3">BEYOND THEORY</text>
    <rect x="${W - 64 - 250}" y="398" width="234" height="96" rx="6" fill="#0b0b0b" stroke="#2a2a2a"/>`;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote });
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  put(mkPower(), 69, 26);
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = 66 + i * 50;
    put(mkLed(k, 'emu-led b2-led'), x, 432);
    silkText(`LD${k}`, x, 446);
    port('led', k, x, 458);
    put(mkSwitch(k, 'emu-sw b2-sw'), x, 474);
    silkText(`SW${k}`, x, 522);
    port('sw', k, x, 536);
  }
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = W - 64 - 250 + 31 + i * 58;
    put(mkDigit(k), x, 412);
    port('an', k, x, 474, 'emu-on-disp');
    put(mkButton(k, 'emu-btn nx2-btn'), x, 500);
    silkText(`BTN${k}`, x, 534);
  }
  return wrap;
}
