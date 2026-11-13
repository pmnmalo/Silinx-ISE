// The browser edition's board programming (#2298): which USB driver programs a board, by its programmer's webusb (core/boards.js:
// 'spi', the iCEBreaker's FT2232H on its SPI flash; a JTAG cable of core/ftdi-jtag.js, 'digilent' the Basys 3's and the Nexys
// A7's, 'ft2232' the Tang Nano 9K's BL702; 'ft231x', the ULX3S's FT231X in bit-bang mode, core/ft231x-jtag.js; none: the Digilent
// Adept USB of the Basys2 / Nexys2) and by the file:
//   a .bin  the iCE40's SPI flash (core/ftdi-ice40.js)
//   a .fs   the Gowin's SRAM (core/ftdi-jtag.js programGowinSram), the file's IDCODE checked as the server checks it
//   a .bit  an ECP5's SRAM (the ULX3S: core/ft231x-jtag.js programEcp5Sram), its part and IDCODE checked; a Xilinx FPGA's SRAM:
//           through the FT2232H's JTAG (the 7-series) or the Adept's (core/adept.js)
// getUsb(vendor, filters): the WebUSB device (web/js/api-local.js asks the browser for it).
import { ADEPT_FILTERS, ADEPT_VENDOR, scanAdept, programAdept } from './adept.js';
import { FTDI_FILTERS, FTDI_VENDOR, programIce40Flash } from './ftdi-ice40.js';
import { CABLES, FTDI_JTAG_FILTERS, scanFtdi, programFtdiXilinx, programGowinSram } from './ftdi-jtag.js';
import { FT231X_FILTERS, scanFt231x, programEcp5Sram } from './ft231x-jtag.js';
import { gowinFsInfo, ecp5BitInfo, checkOpenBitstream, idHex } from './open-bitstream.js';
import { deviceFamily, familyName, openOnlyDevice } from '../packages/silinx-fpga/src/parts.js';

const fail = msg => { throw new Error(msg); };

/** The board's USB as the browser drives it: 'spi', a JTAG cable's name, or null (the Adept, or no board). */
export const usbOf = board => board?.programmer?.tools?.openFPGALoader?.webusb || null;

/** Scan the board's JTAG chain: { devices }. */
export async function scanUsb({ board = null, getUsb, log = () => {} }) {
  const cable = usbOf(board);
  if (cable === 'spi') fail(`${board.name} has no JTAG chain to scan: its FPGA loads its SPI flash`);
  if (cable === 'ft231x') return scanFt231x(await getUsb(FTDI_VENDOR, FT231X_FILTERS), { log });
  if (CABLES[cable]) return scanFtdi(await getUsb(FTDI_VENDOR, FTDI_JTAG_FILTERS), { cable, log });
  return scanAdept(await getUsb(ADEPT_VENDOR, ADEPT_FILTERS), { log });
}

/**
 * Program the board with a file's bytes. device: the project's ({ part }), what the file must be built for; force: a file for
 * another device programmed anyway, warned (as the server's /program).
 */
export async function programUsb({ board = null, device = null, file = '', data, getUsb, log = () => {}, force = false }) {
  const cable = usbOf(board);
  if (/\.bin$/i.test(file)) return programIce40Flash(await getUsb(FTDI_VENDOR, FTDI_FILTERS), data, { log });
  if (/\.fs$/i.test(file)) {
    if (!CABLES[cable]) fail(`${board?.name || 'this board'} is not programmed from the browser with a .fs`);
    let info;
    try { info = gowinFsInfo(data); } catch (e) { fail(`${file}: ${e.message}`); }
    log(`Bitstream ${file} (${data.length} bytes, a Gowin's .fs${info.idcode != null ? `, IDCODE ${idHex(info.idcode)}` : ''})`);
    const mismatch = checkOpenBitstream('gowin', info, device);
    if (mismatch && !force) fail(`${mismatch}: not programmed`);
    if (mismatch) log(`WARNING: ${mismatch}`);
    log('Programming (SRAM, volatile)');
    return programGowinSram(await getUsb(FTDI_VENDOR, FTDI_JTAG_FILTERS), info.bytes, { cable, idcode: mismatch ? null : info.idcode, log });
  }
  if (deviceFamily(device) === 'ecp5' && cable === 'ft231x') {
    let info;
    try { info = ecp5BitInfo(data); } catch (e) { fail(`${file}: ${e.message}`); }
    log(`Bitstream ${file} (${data.length} bytes, an ECP5's .bit${info.part ? `: part ${info.part}` : ''}${info.idcode != null ? `, IDCODE ${idHex(info.idcode)}` : ''})`);
    const mismatch = checkOpenBitstream('ecp5', info, device);
    if (mismatch && !force) fail(`${mismatch}: not programmed`);
    if (mismatch) log(`WARNING: ${mismatch}`);
    log('Programming (SRAM, volatile)');
    return programEcp5Sram(await getUsb(FTDI_VENDOR, FT231X_FILTERS), data, { idcode: mismatch ? null : info.idcode, log });
  }
  // (an open family's board whose USB the browser does not drive)
  if (openOnlyDevice(device)) fail(`the ${familyName(deviceFamily(device))}'s boards are not programmed from the browser yet: the local server programs them (silinx serve), with openFPGALoader`);
  if (CABLES[cable]) return programFtdiXilinx(await getUsb(FTDI_VENDOR, FTDI_JTAG_FILTERS), data, { cable, part: device?.part || null, log });
  return programAdept(await getUsb(ADEPT_VENDOR, ADEPT_FILTERS), data, { part: device?.part || null, log });
}
