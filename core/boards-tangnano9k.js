// Silinx - the Gowin's board (#2303): Sipeed's Tang Nano 9K (GW1NR-LV9QN88PC6/I5), its pins from Apicula's tangnano9k.cst
// (YosysHQ/apicula examples) and LiteX's platform of the board (litex-hub/litex-boards sipeed_tang_nano_9k.py: its headers J6
// and J7). The board's own resources: the 27 MHz clock, 6 LEDs and 2 buttons (active low, its bank 3 at 1.8 V), the BL702's
// UART. nextpnr-himbaechel-gowin places no port without a pin, so every port of the examples has one: their LEDs,
// switches, buttons and seven-segment display on its headers (a breadboard, as the iCEBreaker's Pmods, #2517), vga's VGA
// on the same pins (tangnano9k-vga); none verified on a board. Its .fs from gowin_pack (Silinx's port, #2303); not programmed from
// Silinx yet (#2298).

const CST_SOURCE = 'Apicula\'s tangnano9k.cst (YosysHQ/apicula) and the headers J6 / J7 of LiteX\'s sipeed_tang_nano_9k.py';
const CST_URL = 'https://github.com/YosysHQ/apicula/blob/master/examples/tangnano9k.cst';
const device = { family: 'gowin', part: 'gw1nr-9c', package: 'qn88', speed: '-6' };

const OWN = [
  { name: 'clk', label: '27 MHz oscillator', pins: ['52'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '37.037 ns' } },
  { name: 'led_n', label: 'LEDs LED1..LED6 (active low)', pins: ['10', '11', '13', '14', '15', '16'], dir: 'out', iostandard: 'LVCMOS18', group: 'LEDs', extra: { activeLow: true } },
  { name: 'btn_n', label: 'Buttons S1, S2 (active low)', pins: ['3', '4'], dir: 'in', iostandard: 'LVCMOS18', group: 'Buttons', extra: { activeLow: true } },
  { name: 'rx', label: 'UART RX (from the BL702)', pins: ['18'], dir: 'in', iostandard: 'LVCMOS33', group: 'UART' },
  { name: 'tx', label: 'UART TX (to the BL702)', pins: ['17'], dir: 'out', iostandard: 'LVCMOS33', group: 'UART' },
];
const header = (what, pins, dir = 'out') => ({ dir, iostandard: 'LVCMOS33', verified: false, label: `${what} on the header ${pins} (a breadboard)` });
// the examples' inputs and LEDs on J6 (its pins 36..39 are the SD card's: left out)
const BREADBOARD = [
  { ...header('LEDs LD0..LD7 (active high)', 'J6', 'out'), name: 'led', pins: ['25', '26', '27', '28', '29', '30', '33', '34'], group: 'LEDs', extra: { activeHigh: true } },
  { ...header('Switches SW0..SW7', 'J6', 'in'), name: 'sw', pins: ['40', '35', '41', '42', '51', '53', '54', '55'], group: 'Switches' },
  { ...header('Push buttons BTN0..BTN3 (active high)', 'J6', 'in'), name: 'btn', pins: ['56', '57', '68', '69'], group: 'Buttons', extra: { activeHigh: true } },
];
const BOARD = {
  vendor: 'Sipeed', device,
  flash: { type: 'spi', part: 'P25Q32U', sizeMbit: 32, xcf: false, verified: false, note: 'Not written from Silinx yet: openFPGALoader -b tangnano9k -f <top>.fs writes the .fs into it.' },
  jtagChain: [{ name: 'gw1nr-9c', role: 'fpga' }],
  programmer: {
    preferred: 'openFPGALoader',
    tools: { openFPGALoader: { board: 'tangnano9k', onboard: true, verified: false, usb: 'BL702', note: 'The on-board BL702 (JTAG): the .fs loaded into the FPGA\'s SRAM, until the board is powered off.' } },
  },
  source: CST_SOURCE, sourceUrl: CST_URL,
};

export const TANGNANO9K_BOARDS = [
  {
    id: 'tangnano9k', name: 'Sipeed Tang Nano 9K', ...BOARD,
    resources: [
      ...OWN, ...BREADBOARD,
      { ...header('7-segment cathodes CA..CG (active low)', 'J7'), name: 'seg', pins: ['63', '86', '85', '84', '83', '82', '81'], group: '7-segment', extra: { activeLow: true } },
      { ...header('7-segment decimal point (active low)', 'J7'), name: 'dp', pins: ['80'], group: '7-segment', extra: { activeLow: true } },
      { ...header('7-segment anodes AN0..AN3 (active low)', 'J7'), name: 'an', pins: ['79', '77', '76', '75'], group: '7-segment', extra: { activeLow: true } },
    ],
  },
  {
    // the Tang Nano 9K with a VGA connector on J7 (3/3/2 bits of colour through resistors): the display's pins
    id: 'tangnano9k-vga', name: 'Sipeed Tang Nano 9K + VGA', ...BOARD,
    resources: [
      ...OWN, ...BREADBOARD,
      { ...header('VGA red R0..R2', 'J7'), name: 'vga_red', pins: ['63', '86', '85'], group: 'VGA' },
      { ...header('VGA green G0..G2', 'J7'), name: 'vga_green', pins: ['84', '83', '82'], group: 'VGA' },
      { ...header('VGA blue B0..B1', 'J7'), name: 'vga_blue', pins: ['81', '80'], group: 'VGA' },
      { ...header('VGA HSYNC', 'J7'), name: 'vga_hsync', pins: ['79'], group: 'VGA' },
      { ...header('VGA VSYNC', 'J7'), name: 'vga_vsync', pins: ['77'], group: 'VGA' },
    ],
  },
];
