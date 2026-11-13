// Portuguese strings of the open families' Configure Target Device (#2298: web/js/program-open.js, the iCE40's SPI flash, the
// ECP5's and the Gowin's SRAM), merged into the dictionary of i18n.js. The family's name, the board's USB chip and the file's
// extension are kept as they are.
export const PROGRAM_PT = {
  'Flash programmed: the FPGA loads the design.': 'Flash programada: a FPGA carrega o projeto.',
  'FPGA programmed: the design runs until the board is powered off.': 'FPGA programada: o projeto corre até a placa ser desligada.',
  'not from the browser yet: the local server\'s openFPGALoader (silinx serve)': 'ainda não a partir do browser: o openFPGALoader do servidor local (silinx serve)',
  'The on-board FT2232H: the .bin written into the SPI flash, which the FPGA then loads (and at every power-up).': 'O FT2232H da placa: o .bin escrito na flash SPI, que a FPGA depois carrega (e sempre que é ligada).',
};

export const PROGRAM_PT_PATTERNS = [
  [/^Program the (.+) — SPI flash$/, 'Programar o $1 — flash SPI'],
  [/^Program the (.+) — SRAM$/, 'Programar o $1 — SRAM'],
  [/^the board's USB \((\S+)\), from the browser \(WebUSB\)$/, 'a USB da placa ($1), a partir do browser (WebUSB)'],
  [/^openFPGALoader, through the board's USB \((\S+)\)$/, 'openFPGALoader, pela USB da placa ($1)'],
  [/^Configuration file \((\.\w+)\):$/, 'Ficheiro de configuração ($1):'],
  [/^No (\.\w+) yet — run "Generate Programming File" first\.$/, 'Ainda não há $1 — execute primeiro "Generate Programming File".'],
  [/^Writes the (\.\w+) into the board's SPI flash: the FPGA loads it, and again at every power-up\.$/, 'Escreve o $1 na flash SPI da placa: a FPGA carrega-o, e de novo sempre que é ligada.'],
  [/^Loads the (\.\w+) into the FPGA's SRAM: the design runs until the board is powered off\.$/, 'Carrega o $1 na SRAM da FPGA: o projeto corre até a placa ser desligada.'],
  [/^The on-board (\S+) \(JTAG\): the (\.\w+) loaded into the FPGA's SRAM, until the board is powered off\.$/, 'O $1 da placa (JTAG): o $2 carregado na SRAM da FPGA, até a placa ser desligada.'],
];
