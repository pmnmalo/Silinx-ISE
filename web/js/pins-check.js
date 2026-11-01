// Emulate and Program with no pins set (#1508): the project has no UCF, or its UCF gives no LOC to any port; an alert says
// so before the board is emulated or programmed, its I/O Pin Planning one click away. Used by the Board Emulator
// (web/js/viewers.js openEmulator) and iMPACT's Program FPGA (web/js/impact.js).

import { dialog, h } from './ui.js';
import { readPins } from './constraints-format.js';

/** Whether the constraints text places any pin: a UCF, or the iCE40's PCF (`device`'s format, #2511). */
export function placesPins(text, device) {
  if (!text) return false;
  try { return Object.values(readPins(device, text).assignments).some((a) => a.loc); } catch { return false; }   // (a PCF with an error places none)
}

/** True when the pins are set; else the alert (`action`: 'emulate' or 'program'; `openPins()`: I/O Pin Planning) and false. */
export async function pinsReady(ucfText, action, openPins, device) {
  if (placesPins(ucfText, device)) return true;
  const what = action === 'program' ? 'Set them before you program the board.' : 'Set them before you emulate the design.';
  const go = await dialog({
    title: 'Pins not set',
    body: h('div', { class: 'pins-unset' }, h('p', {}, 'The design\'s pins are not set yet: no port is placed on a pin of the board.'), h('p', {}, what)),
    buttons: [{ label: 'I/O Pin Planning', value: 'pins', primary: true }, { label: 'Cancel', value: null }],
  });
  if (go === 'pins') openPins?.();
  return false;
}
