// The Board Emulator's print view (#1512): the board as shown (its LEDs, displays, switches and buttons in their
// current state, the VGA monitor's picture), its Watch and the emulation's time; the commands (the toolbar, the
// Watch's list of signals, the knob's arrows), the hints and the messages left out.
import { esc } from './dom.js';
import { domSnapshot } from './print-view.js';

// (the time: above the copy; the Silinx interface shows it on the board, web/js/tasks-emu.js)
const DROP = ['select', '.emu-hint', '.emu-rot-btn', '.emu-box:has(.emu-log)', 'a[href="#"]', '.stat', '.asm-cap'];

/** { body, app, fit } (one page) of the emulator whose board is in `main`, its side panel `side`, its time in `stat` (the toolbar's). */
export function emuPrintView({ main, side, stat }) {
  return {
    app: true, fit: { page: true },
    css: '.pv-emu-time { margin: 0 0 3mm; font: 10pt system-ui, -apple-system, "Segoe UI", sans-serif; }',
    body: `<p class="pv-emu-time">${esc(stat.textContent)}</p>${domSnapshot(main, { drop: DROP })}${side ? domSnapshot(side, { drop: DROP }) : ''}`,
  };
}
