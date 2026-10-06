// Spartan-3E device + development board database.
//
// Sources:
//  * Parts/packages/resources: Xilinx DS312 "Spartan-3E FPGA Family Data Sheet" v4.2,
//    Table 1 (resources) and Table 2 (available user I/Os per package).
//  * Spartan-3E Starter Kit: Xilinx UG230 board UCF (as distributed with the kit).
//  * Basys2: Digilent "Basys2_100_250General.ucf" (rev C board).
//  * Nexys2: Digilent "Nexys2_500General.ucf" / "Nexys2_1200General.ucf" (LD4..LD7 differ by die).
//
// Board resources list pins LSB first (pins[0] is bit 0). A resource with `verified:false`
// was not cross-checked against an official file and must be checked by the user.

export const FAMILY = 'spartan3e';

/**
 * Parts. userIo = maximum user I/O (I/O + input-only) per package, from DS312 Table 2.
 * speeds: speed grades available. (XC3S500E in VQ(G)100 is -4 only.)
 */
export const DEVICES = {
  family: FAMILY,
  familyName: 'Spartan-3E',
  parts: [
    {
      part: 'xc3s100e', systemGates: 100_000, logicCells: 2160, clbs: 240, slices: 960,
      luts: 1920, ffs: 1920, distRamBits: 15 * 1024, brams: 4, bramBits: 72 * 1024,
      multipliers: 4, dcms: 2, maxUserIo: 108,
      packages: { vq100: { userIo: 66, inputOnly: 7 }, cp132: { userIo: 83, inputOnly: 11 }, tq144: { userIo: 108, inputOnly: 28 } },
      speeds: ['-4', '-5'],
    },
    {
      part: 'xc3s250e', systemGates: 250_000, logicCells: 5508, clbs: 612, slices: 2448,
      luts: 4896, ffs: 4896, distRamBits: 38 * 1024, brams: 12, bramBits: 216 * 1024,
      multipliers: 12, dcms: 4, maxUserIo: 172,
      packages: {
        vq100: { userIo: 66, inputOnly: 7 }, cp132: { userIo: 92, inputOnly: 7 }, tq144: { userIo: 108, inputOnly: 28 },
        pq208: { userIo: 158, inputOnly: 32 }, ft256: { userIo: 172, inputOnly: 40 },
      },
      speeds: ['-4', '-5'],
    },
    {
      part: 'xc3s500e', systemGates: 500_000, logicCells: 10476, clbs: 1164, slices: 4656,
      luts: 9312, ffs: 9312, distRamBits: 73 * 1024, brams: 20, bramBits: 360 * 1024,
      multipliers: 20, dcms: 4, maxUserIo: 232,
      packages: {
        vq100: { userIo: 66, inputOnly: 7, speeds: ['-4'], note: 'Pb-free VQG100 only' },
        cp132: { userIo: 92, inputOnly: 7 }, pq208: { userIo: 158, inputOnly: 32 },
        ft256: { userIo: 190, inputOnly: 41 }, fg320: { userIo: 232, inputOnly: 56 },
      },
      speeds: ['-4', '-5'],
    },
    {
      part: 'xc3s1200e', systemGates: 1_200_000, logicCells: 19512, clbs: 2168, slices: 8672,
      luts: 17344, ffs: 17344, distRamBits: 136 * 1024, brams: 28, bramBits: 504 * 1024,
      multipliers: 28, dcms: 8, maxUserIo: 304,
      packages: { ft256: { userIo: 190, inputOnly: 40 }, fg320: { userIo: 250, inputOnly: 56 }, fg400: { userIo: 304, inputOnly: 72 } },
      speeds: ['-4', '-5'],
    },
    {
      part: 'xc3s1600e', systemGates: 1_600_000, logicCells: 33192, clbs: 3688, slices: 14752,
      luts: 29504, ffs: 29504, distRamBits: 231 * 1024, brams: 36, bramBits: 648 * 1024,
      multipliers: 36, dcms: 8, maxUserIo: 376,
      packages: { fg320: { userIo: 250, inputOnly: 56 }, fg400: { userIo: 304, inputOnly: 72 }, fg484: { userIo: 376, inputOnly: 82 } },
      speeds: ['-4', '-5'],
    },
  ],
  packages: {
    vq100: '100-pin Very Thin Quad Flat Pack (VQFP)',
    cp132: '132-ball Chip-Scale Package (CSP)',
    tq144: '144-pin Thin Quad Flat Pack (TQFP)',
    pq208: '208-pin Plastic Quad Flat Pack (PQFP)',
    ft256: '256-ball Fine-Pitch Thin BGA (FTBGA)',
    fg320: '320-ball Fine-Pitch BGA (FBGA)',
    fg400: '400-ball Fine-Pitch BGA (FBGA)',
    fg484: '484-ball Fine-Pitch BGA (FBGA)',
  },
  speeds: { '-4': 'Standard performance', '-5': 'High performance' },
  iostandards: ['LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'LVTTL', 'PCI33_3',
    'SSTL2_I', 'SSTL18_I', 'HSTL_I_18', 'HSTL_III_18', 'LVDS_25', 'RSDS_25', 'MINI_LVDS_25', 'LVPECL_25',
    'BLVDS_25', 'DIFF_SSTL2_I', 'DIFF_SSTL18_I', 'DIFF_HSTL_I_18', 'DIFF_HSTL_III_18'],
  driveStrengths: { LVCMOS33: [2, 4, 6, 8, 12, 16], LVTTL: [2, 4, 6, 8, 12, 16], LVCMOS25: [2, 4, 6, 8, 12], LVCMOS18: [2, 4, 6, 8], LVCMOS15: [2, 4, 6], LVCMOS12: [2] },
};

export function findPart(part) {
  return DEVICES.parts.find(p => p.part === String(part || '').toLowerCase()) || null;
}

/** Validate a { part, package, speed } triple; returns a list of problems (empty = ok). */
export function validateDevice(dev) {
  const errs = [];
  const p = findPart(dev?.part);
  if (!p) return [`unknown Spartan-3E part '${dev?.part}'`];
  const pk = p.packages[String(dev.package || '').toLowerCase()];
  if (!pk) errs.push(`${p.part} is not available in package '${dev.package}' (valid: ${Object.keys(p.packages).join(', ')})`);
  const speeds = pk?.speeds || p.speeds;
  if (!speeds.includes(String(dev.speed))) errs.push(`speed grade '${dev.speed}' not available for ${p.part}-${dev.package} (valid: ${speeds.join(', ')})`);
  return errs;
}

// ---------------------------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------------------------

const S3E_UCF = 'Xilinx UG230 Spartan-3E Starter Kit UCF';
const BASYS2_UCF = 'Digilent Basys2_100_250General.ucf (rev C)';
const NEXYS2_UCF = 'Digilent Nexys2_500General.ucf / Nexys2_1200General.ucf';

export const BOARDS = [
  {
    id: 's3e-starter',
    name: 'Xilinx Spartan-3E Starter Kit (Digilent, rev D)',
    vendor: 'Xilinx / Digilent',
    device: { family: FAMILY, part: 'xc3s500e', package: 'fg320', speed: '-4' },
    // On-board USB is an embedded Xilinx Platform Cable USB. JTAG chain (iMPACT numbering):
    // 1 = XC3S500E FPGA, 2 = XCF04S Platform Flash PROM, 3 = XC2C64A CoolRunner-II CPLD.
    jtagChain: [{ name: 'xc3s500e', role: 'fpga' }, { name: 'xcf04s', role: 'prom' }, { name: 'xc2c64a', role: 'cpld' }],
    programmer: {
      preferred: 'impact',
      tools: {
        impact: { cable: 'auto', position: 1 },
        xc3sprog: { cable: 'xpc', position: 0, note: 'Embedded Platform Cable needs its firmware loaded (fxload xusb_emb.hex) on Linux.' },
        openFPGALoader: { cable: 'xilinxPlatformCableUsb', position: 0, verified: false, onboard: false,
          note: 'openFPGALoader XPCU support targets external Platform Cable USB (03fd:0013/000d); the kit\'s embedded cable (03fd:0008 after firmware) is not listed. Use an external JTAG cable on J28 instead.' },
      },
    },
    source: S3E_UCF,
    resources: [
      { name: 'clk', label: '50 MHz oscillator', pins: ['C9'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '20 ns' } },
      { name: 'clk_aux', label: 'Auxiliary clock socket (8-pin DIP)', pins: ['B8'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock' },
      { name: 'clk_sma', label: 'SMA clock input', pins: ['A10'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock' },
      { name: 'led', label: 'LEDs LD0..LD7', pins: ['F12', 'E12', 'E11', 'F11', 'C11', 'D11', 'E9', 'F9'], dir: 'out', iostandard: 'LVTTL', slew: 'slow', drive: 8, group: 'LEDs', extra: { activeHigh: true } },
      { name: 'sw', label: 'Slide switches SW0..SW3', pins: ['L13', 'L14', 'H18', 'N17'], dir: 'in', iostandard: 'LVTTL', pull: 'up', group: 'Switches' },
      { name: 'btn_east', label: 'Push button EAST', pins: ['H13'], dir: 'in', iostandard: 'LVTTL', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'btn_north', label: 'Push button NORTH', pins: ['V4'], dir: 'in', iostandard: 'LVTTL', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'btn_south', label: 'Push button SOUTH', pins: ['K17'], dir: 'in', iostandard: 'LVTTL', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'btn_west', label: 'Push button WEST', pins: ['D18'], dir: 'in', iostandard: 'LVTTL', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'rot_a', label: 'Rotary encoder A', pins: ['K18'], dir: 'in', iostandard: 'LVTTL', pull: 'up', group: 'Rotary encoder' },
      { name: 'rot_b', label: 'Rotary encoder B', pins: ['G18'], dir: 'in', iostandard: 'LVTTL', pull: 'up', group: 'Rotary encoder' },
      { name: 'rot_center', label: 'Rotary encoder push', pins: ['V16'], dir: 'in', iostandard: 'LVTTL', pull: 'down', group: 'Rotary encoder' },
      { name: 'rs232_dce_rxd', label: 'RS-232 DCE (female) RXD', pins: ['R7'], dir: 'in', iostandard: 'LVTTL', group: 'RS-232' },
      { name: 'rs232_dce_txd', label: 'RS-232 DCE (female) TXD', pins: ['M14'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'slow', group: 'RS-232' },
      { name: 'rs232_dte_rxd', label: 'RS-232 DTE (male) RXD', pins: ['U8'], dir: 'in', iostandard: 'LVTTL', group: 'RS-232' },
      { name: 'rs232_dte_txd', label: 'RS-232 DTE (male) TXD', pins: ['M13'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'slow', group: 'RS-232' },
      { name: 'vga_red', label: 'VGA red (1 bit)', pins: ['H14'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_green', label: 'VGA green (1 bit)', pins: ['H15'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_blue', label: 'VGA blue (1 bit)', pins: ['G15'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_hsync', label: 'VGA HSYNC', pins: ['F15'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_vsync', label: 'VGA VSYNC', pins: ['F14'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'ps2_clk', label: 'PS/2 clock', pins: ['G14'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'PS/2' },
      { name: 'ps2_data', label: 'PS/2 data', pins: ['G13'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'PS/2' },
      // Character LCD (HD44780-compatible, 4-bit interface on SF_D<11:8>). The data lines are
      // shared with the StrataFlash: drive sf_ce0 high to disable the flash when using the LCD.
      { name: 'lcd_e', label: 'LCD enable', pins: ['M18'], dir: 'out', iostandard: 'LVCMOS33', drive: 4, slew: 'slow', group: 'LCD' },
      { name: 'lcd_rs', label: 'LCD register select', pins: ['L18'], dir: 'out', iostandard: 'LVCMOS33', drive: 4, slew: 'slow', group: 'LCD' },
      { name: 'lcd_rw', label: 'LCD read/write', pins: ['L17'], dir: 'out', iostandard: 'LVCMOS33', drive: 4, slew: 'slow', group: 'LCD' },
      { name: 'lcd_d', label: 'LCD data DB4..DB7 (SF_D<8..11>)', pins: ['R15', 'R16', 'P17', 'M15'], dir: 'inout', iostandard: 'LVCMOS33', drive: 4, slew: 'slow', group: 'LCD' },
      { name: 'sf_ce0', label: 'StrataFlash CE0 (drive 1 when using the LCD)', pins: ['D16'], dir: 'out', iostandard: 'LVCMOS33', drive: 4, slew: 'slow', group: 'LCD' },
    ],
  },
  {
    id: 'basys2',
    name: 'Digilent Basys2',
    vendor: 'Digilent',
    device: { family: FAMILY, part: 'xc3s250e', package: 'cp132', speed: '-4' },
    variants: [
      { id: '100', label: 'Basys2-100 (XC3S100E)', device: { family: FAMILY, part: 'xc3s100e', package: 'cp132', speed: '-4' } },
      { id: '250', label: 'Basys2-250 (XC3S250E)', device: { family: FAMILY, part: 'xc3s250e', package: 'cp132', speed: '-4' }, default: true },
    ],
    deviceNotes: 'Speed grade: both -4 and -5 appear in Basys2 tutorials; check the marking on your chip. The bitstream itself is the same for either grade (only timing analysis differs).',
    speedVerified: false,
    // Adept USB (Cypress FX2, Digilent firmware). JTAG chain: 0 = FPGA, 1 = XCF02S PROM.
    jtagChain: [{ name: 'xcf02s', role: 'prom' }, { name: 'xc3s100e/xc3s250e', role: 'fpga' }],
    programmer: {
      preferred: 'djtgcfg',
      tools: {
        adepttool: { device: 0, position: 0, onboard: true, note: 'Open-source driver for the on-board Adept USB (github.com/mwkmwkmwk/adepttool); works on macOS where Digilent Adept is not available. Install with scripts/install-adepttool.sh.' },
        djtgcfg: { device: 'Basys2', position: 0 },
        impact: { cable: 'auto', position: 1, note: 'iMPACT only sees the board through the Digilent plug-in (digilent_plugin) or an external JTAG cable on the 6-pin header.' },
        xc3sprog: { cable: 'jtaghs1', position: 0, verified: false, onboard: false, note: 'On-board Adept USB is not an FTDI device; xc3sprog requires an external FTDI-based cable (e.g. JTAG-HS1/HS2) on the JTAG header.' },
        openFPGALoader: { cable: 'digilent_hs2', position: 0, verified: false, onboard: false, note: 'Only via an external FTDI JTAG cable on the JTAG header; the on-board Adept USB is not supported.' },
      },
    },
    source: BASYS2_UCF,
    resources: [
      { name: 'mclk', label: 'MCLK oscillator (25/50/100 MHz via JP4, default 50 MHz)', pins: ['B8'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', clockDedicatedRoute: false, extra: { period: '20 ns' } },
      { name: 'uclk', label: 'User clock socket IC6', pins: ['M6'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', clockDedicatedRoute: false },
      { name: 'led', label: 'LEDs LD0..LD7', pins: ['M5', 'M11', 'P7', 'P6', 'N5', 'N4', 'P4', 'G1'], dir: 'out', iostandard: 'LVCMOS33', group: 'LEDs', extra: { activeHigh: true } },
      { name: 'sw', label: 'Slide switches SW0..SW7', pins: ['P11', 'L3', 'K3', 'B4', 'G3', 'F3', 'E2', 'N3'], dir: 'in', iostandard: 'LVCMOS33', group: 'Switches' },
      { name: 'btn', label: 'Push buttons BTN0..BTN3', pins: ['G12', 'C11', 'M4', 'A7'], dir: 'in', iostandard: 'LVCMOS33', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'seg', label: '7-segment cathodes CA..CG (active low)', pins: ['L14', 'H12', 'N14', 'N11', 'P12', 'L13', 'M12'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true, order: 'seg[0]=CA ... seg[6]=CG' } },
      { name: 'dp', label: '7-segment decimal point (active low)', pins: ['N13'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'an', label: '7-segment anodes AN0..AN3 (active low)', pins: ['F12', 'J12', 'M13', 'K14'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'vga_red', label: 'VGA red RED0..RED2', pins: ['C14', 'D13', 'F13'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_green', label: 'VGA green GRN0..GRN2', pins: ['F14', 'G13', 'G14'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_blue', label: 'VGA blue BLU1..BLU2 (2 bits)', pins: ['H13', 'J13'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_hsync', label: 'VGA HSYNC', pins: ['J14'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_vsync', label: 'VGA VSYNC', pins: ['K13'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'ps2_clk', label: 'PS/2 clock', pins: ['B1'], dir: 'inout', iostandard: 'LVCMOS33', pull: 'up', drive: 2, group: 'PS/2' },
      { name: 'ps2_data', label: 'PS/2 data', pins: ['C3'], dir: 'inout', iostandard: 'LVCMOS33', pull: 'up', drive: 2, group: 'PS/2' },
      { name: 'ja', label: 'Pmod JA (JA1..JA4)', pins: ['B2', 'A3', 'J3', 'B5'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jb', label: 'Pmod JB (JB1..JB4)', pins: ['C6', 'B6', 'C5', 'B7'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jc', label: 'Pmod JC (JC1..JC4)', pins: ['A9', 'B9', 'A10', 'C9'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jd', label: 'Pmod JD (JD1..JD4)', pins: ['C12', 'A13', 'C13', 'D12'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
    ],
  },
  {
    id: 'nexys2',
    name: 'Digilent Nexys2',
    vendor: 'Digilent',
    device: { family: FAMILY, part: 'xc3s500e', package: 'fg320', speed: '-4' },
    variants: [
      { id: '500', label: 'Nexys2-500 (XC3S500E)', device: { family: FAMILY, part: 'xc3s500e', package: 'fg320', speed: '-4' }, default: true },
      // LD4..LD7 are routed to pins whose type differs between the 500K and 1200K dies.
      { id: '1200', label: 'Nexys2-1200 (XC3S1200E)', device: { family: FAMILY, part: 'xc3s1200e', package: 'fg320', speed: '-4' },
        resourceOverrides: { led: { pins: ['J14', 'J15', 'K15', 'K14', 'E16', 'P16', 'E4', 'P4'] } } },
    ],
    // Adept USB (Cypress FX2). JTAG chain: 0 = FPGA, 1 = XCF04S PROM.
    jtagChain: [{ name: 'xc3s500e/xc3s1200e', role: 'fpga' }, { name: 'xcf04s', role: 'prom' }],
    programmer: {
      preferred: 'djtgcfg',
      tools: {
        djtgcfg: { device: 'Nexys2', position: 0 },
        impact: { cable: 'auto', position: 1, note: 'iMPACT only sees the board through the Digilent plug-in or an external JTAG cable on J5.' },
        xc3sprog: { cable: 'jtaghs1', position: 0, verified: false, onboard: false, note: 'On-board Adept USB is not an FTDI device; use an external FTDI-based cable on the JTAG header.' },
        openFPGALoader: { cable: 'digilent_hs2', position: 0, verified: false, note: 'Only via an external FTDI JTAG cable; the on-board Adept USB is not supported.' },
      },
    },
    source: NEXYS2_UCF,
    resources: [
      { name: 'clk', label: '50 MHz oscillator', pins: ['B8'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '20 ns' } },
      { name: 'clk1', label: 'Clock socket IC7 (GCLK1)', pins: ['U9'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock' },
      { name: 'led', label: 'LEDs LD0..LD7 (pins for XC3S500E; 1200E variant overrides LD4..LD7)', pins: ['J14', 'J15', 'K15', 'K14', 'E17', 'P15', 'F4', 'R4'], dir: 'out', iostandard: 'LVCMOS33', group: 'LEDs', extra: { activeHigh: true } },
      { name: 'sw', label: 'Slide switches SW0..SW7', pins: ['G18', 'H18', 'K18', 'K17', 'L14', 'L13', 'N17', 'R17'], dir: 'in', iostandard: 'LVCMOS33', group: 'Switches' },
      { name: 'btn', label: 'Push buttons BTN0..BTN3', pins: ['B18', 'D18', 'E18', 'H13'], dir: 'in', iostandard: 'LVCMOS33', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'seg', label: '7-segment cathodes CA..CG (active low)', pins: ['L18', 'F18', 'D17', 'D16', 'G14', 'J17', 'H14'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true, order: 'seg[0]=CA ... seg[6]=CG' } },
      { name: 'dp', label: '7-segment decimal point (active low)', pins: ['C17'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'an', label: '7-segment anodes AN0..AN3 (active low)', pins: ['F17', 'H17', 'C18', 'F15'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'vga_red', label: 'VGA red RED0..RED2', pins: ['R9', 'T8', 'R8'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_green', label: 'VGA green GRN0..GRN2', pins: ['N8', 'P8', 'P6'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_blue', label: 'VGA blue BLU1..BLU2 (2 bits)', pins: ['U5', 'U4'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_hsync', label: 'VGA HSYNC', pins: ['T4'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_vsync', label: 'VGA VSYNC', pins: ['U3'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'ps2_clk', label: 'PS/2 clock', pins: ['R12'], dir: 'inout', iostandard: 'LVCMOS33', group: 'PS/2' },
      { name: 'ps2_data', label: 'PS/2 data', pins: ['P11'], dir: 'inout', iostandard: 'LVCMOS33', group: 'PS/2' },
      { name: 'rs232_rx', label: 'RS-232 RXD', pins: ['U6'], dir: 'in', iostandard: 'LVCMOS33', group: 'RS-232' },
      { name: 'rs232_tx', label: 'RS-232 TXD', pins: ['P9'], dir: 'out', iostandard: 'LVCMOS33', group: 'RS-232' },
      { name: 'ja', label: 'Pmod JA (JA1-4, JA7-10)', pins: ['L15', 'K12', 'L17', 'M15', 'K13', 'L16', 'M14', 'M16'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jb', label: 'Pmod JB (JB1-4, JB7-10)', pins: ['M13', 'R18', 'R15', 'T17', 'P17', 'R16', 'T18', 'U18'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jc', label: 'Pmod JC (JC1-4, JC7-10)', pins: ['G15', 'J16', 'G13', 'H16', 'H15', 'F14', 'G16', 'J12'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
    ],
  },
];

// Every resource above was transcribed from the source UCF named on its board; mark them.
for (const b of BOARDS) for (const r of b.resources) if (r.verified === undefined) r.verified = true;

export function findBoard(id) {
  return BOARDS.find(b => b.id === id) || null;
}

/**
 * Resolve a board (+ optional variant id, or a device part to pick the variant) into
 * { board, device, resources } with variant overrides applied.
 */
export function resolveBoard(id, { variant, part } = {}) {
  const b = findBoard(id);
  if (!b) return null;
  let v = null;
  if (b.variants) {
    v = b.variants.find(x => x.id === variant)
      || (part && b.variants.find(x => x.device.part === String(part).toLowerCase()))
      || b.variants.find(x => x.default) || b.variants[0];
  }
  const ov = v?.resourceOverrides || {};
  const resources = b.resources.map(r => (ov[r.name] ? { ...r, ...ov[r.name] } : { ...r }));
  return { board: b, variant: v, device: { ...(v?.device || b.device) }, resources };
}

/** Full DB for GET /api/devices. */
export function getDeviceDb() {
  return { ...DEVICES, boards: BOARDS };
}
