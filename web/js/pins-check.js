// Emulate and Program with no pins set (#1508): the project has no UCF, or its UCF gives no LOC to any port; an alert says
// so before the board is emulated or programmed, its I/O Pin Planning one click away. Used by the Board Emulator
// (web/js/viewers.js openEmulator) and iMPACT's Program FPGA (web/js/impact.js).

import { dialog, h } from './ui.js';
import { ucfPlacesPins } from '/packages/silinx-fpga/src/parts.js';

/** True when the pins are set; else the alert (`action`: 'emulate' or 'program'; `openPins()`: I/O Pin Planning) and false. */
export async function pinsReady(ucfText, action, openPins) {
  if (ucfPlacesPins(ucfText)) return true;
  const what = action === 'program' ? 'Set them before you program the board.' : 'Set them before you emulate the design.';
  const go = await dialog({
    title: 'Pins not set',
    body: h('div', { class: 'pins-unset' }, h('p', {}, 'The design\'s pins are not set yet: no port is placed on a pin of the board.'), h('p', {}, what)),
    buttons: [{ label: 'I/O Pin Planning', value: 'pins', primary: true }, { label: 'Cancel', value: null }],
  });
  if (go === 'pins') openPins?.();
  return false;
}
