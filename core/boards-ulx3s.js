// Silinx - the ECP5's board (#2302): Radiona's ULX3S, its pins from its LPF (emard/ulx3s, doc/constraints/ulx3s_v20.lpf: the
// boards v2.x.x and v3.0.x). Its LFE5U in CABGA381 at speed 6, in four sizes (its variants). The board's own resources;
// the examples' seven-segment display and their VGA on its GPIO header J1 (gp/gn 0..7: a breadboard, as the iCEBreaker's
// Pmods, #2517), not verified on a board. No programming from Silinx yet (#2298): its .bit for openFPGALoader -b ulx3s.

const ULX3S_LPF = 'ULX3S ulx3s_v20.lpf (emard/ulx3s, boards v2.x.x and v3.0.x)';
const ULX3S_LPF_URL = 'https://github.com/emard/ulx3s/blob/master/doc/constraints/ulx3s_v20.lpf';
const IO = 'LVCMOS33';
const device = size => ({ family: 'ecp5', part: `lfe5u-${size}`, package: 'cabga381', speed: '-6' });

// the board's own: the clock, 8 LEDs, the 6 buttons F1, F2, UP, DOWN, LEFT, RIGHT (active high, pulled down; PWR active
// low, pulled up), the 4 DIP switches (pulled down), the FTDI's UART
const ULX3S_OWN = [
  { name: 'clk', label: '25 MHz oscillator (clk_25mhz)', pins: ['G2'], dir: 'in', iostandard: IO, group: 'Clock', extra: { period: '40 ns' } },
  { name: 'led', label: 'LEDs D0..D7', pins: ['B2', 'C2', 'C1', 'D2', 'D1', 'E2', 'E1', 'H3'], dir: 'out', iostandard: IO, group: 'LEDs', extra: { activeHigh: true } },
  { name: 'btn', label: 'Buttons F1, F2, UP, DOWN, LEFT, RIGHT (btn[1..6] of the board\'s LPF)', pins: ['R1', 'T1', 'R18', 'V1', 'U1', 'H16'], dir: 'in', iostandard: IO, pull: 'down', group: 'Buttons',
    extra: { activeHigh: true, order: 'btn[0]=F1 btn[1]=F2 btn[2]=UP btn[3]=DOWN btn[4]=LEFT btn[5]=RIGHT' } },
  { name: 'btn_pwr_n', label: 'Button PWR (btn[0] of the board\'s LPF; active low)', pins: ['D6'], dir: 'in', iostandard: IO, pull: 'up', group: 'Buttons', extra: { activeLow: true } },
  { name: 'sw', label: 'DIP switches SW1..SW4', pins: ['E8', 'D8', 'D7', 'E7'], dir: 'in', iostandard: IO, pull: 'down', group: 'Switches' },
  { name: 'rx', label: 'UART RX (ftdi_txd, from the FTDI)', pins: ['M1'], dir: 'in', iostandard: IO, group: 'UART' },
  { name: 'tx', label: 'UART TX (ftdi_rxd, to the FTDI)', pins: ['L4'], dir: 'out', iostandard: IO, group: 'UART' },
];

const VARIANTS = [
  { id: '12f', label: 'ULX3S 12F (LFE5U-12F)', device: device('12f') },
  { id: '25f', label: 'ULX3S 25F (LFE5U-25F)', device: device('25f') },
  { id: '45f', label: 'ULX3S 45F (LFE5U-45F)', device: device('45f') },
  { id: '85f', label: 'ULX3S 85F (LFE5U-85F)', device: device('85f'), default: true },
];
const BOARD = {
  vendor: 'Radiona', device: device('85f'), variants: VARIANTS,
  deviceNotes: 'The size is printed on the FPGA (LFE5U-12F, 25F, 45F or 85F). Speed grade 6 on every board.',
  flash: { type: 'spi', part: 'IS25LP128', sizeMbit: 128, xcf: false, verified: false, note: 'Not written from Silinx yet: openFPGALoader -b ulx3s -f <top>.bit writes the .bit into it.' },
  jtagChain: [{ name: 'lfe5u', role: 'fpga' }],
  programmer: {
    preferred: 'openFPGALoader',
    tools: { openFPGALoader: { board: 'ulx3s', onboard: true, verified: false, usb: 'FT231X', note: 'The on-board FT231X (JTAG): the .bit loaded into the FPGA\'s SRAM, until the board is powered off.' } },
  },
  source: ULX3S_LPF, sourceUrl: ULX3S_LPF_URL,
};
const header = (what, pins) => ({ dir: 'out', iostandard: IO, verified: false, label: `${what} on the GPIO header J1 (${pins}; a breadboard)` });

export const ULX3S_BOARDS = [
  {
    id: 'ulx3s', name: 'Radiona ULX3S', ...BOARD,
    resources: [
      ...ULX3S_OWN,
      { ...header('7-segment cathodes CA..CG (active low)', 'gp0..gp6'), name: 'seg', pins: ['B11', 'A10', 'A9', 'B9', 'A7', 'C8', 'C6'], group: '7-segment', extra: { activeLow: true } },
      { ...header('7-segment decimal point (active low)', 'gp7'), name: 'dp', pins: ['A6'], group: '7-segment', extra: { activeLow: true } },
      { ...header('7-segment anodes AN0..AN3 (active low)', 'gn0..gn3'), name: 'an', pins: ['C11', 'A11', 'B10', 'C10'], group: '7-segment', extra: { activeLow: true } },
    ],
  },
  {
    // the ULX3S with a VGA connector on its header (3/3/2 bits of colour through resistors): the display's pins, so a board of its own
    id: 'ulx3s-vga', name: 'Radiona ULX3S + VGA', ...BOARD,
    resources: [
      ...ULX3S_OWN,
      { ...header('VGA red R0..R2', 'gp0..gp2'), name: 'vga_red', pins: ['B11', 'A10', 'A9'], group: 'VGA' },
      { ...header('VGA green G0..G2', 'gp3..gp5'), name: 'vga_green', pins: ['B9', 'A7', 'C8'], group: 'VGA' },
      { ...header('VGA blue B0..B1', 'gp6..gp7'), name: 'vga_blue', pins: ['C6', 'A6'], group: 'VGA' },
      { ...header('VGA HSYNC', 'gn0'), name: 'vga_hsync', pins: ['C11'], group: 'VGA' },
      { ...header('VGA VSYNC', 'gn1'), name: 'vga_vsync', pins: ['A11'], group: 'VGA' },
    ],
  },
];
