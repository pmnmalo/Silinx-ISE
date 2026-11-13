// Silinx - a board programmed over its own USB with its maker's tool, which writes a .bin to the board's SPI flash (the
// Numato Mimas V2's MimasV2Config, the Elbert V2's configuration tool, #3711): no JTAG on that USB, so the FPGA boots
// from the flash, and the bitstream is the PROM one (StartUpClk Cclk: a JtagClk bitstream never ends its start-up
// from a flash) as a binary (bitgen -g Binary:yes, build/<top>_prom.bin). Shared by the ISE flow (server/ise.js), the
// Configure Target Device panel (web/js/impact.js) and so the MCP server's run_process, whose log ends with it.

/** The board's flash tool and its file for a top: { tool, file, command, url }, or null (not such a board). */
export function vendorFlash(board, top) {
  const t = board?.programmer?.vendorTool;
  if (!t?.onboard || board.flash?.type !== 'spi') return null;
  const file = `build/${top || '<top>'}_prom.bin`;
  return { tool: t.name, file, command: t.command ? t.command.replace('<design.bin>', file) : null, url: t.url || null };
}

/** The line that says how to program it. */
export function vendorFlashText(board, top) {
  const v = vendorFlash(board, top);
  if (!v) return null;
  return `${board.name}: program its flash over its USB with ${v.tool} and ${v.file} (StartUpClk Cclk, the flash's bitstream)${v.command ? `: ${v.command}` : ''}${v.url ? ` (${v.url})` : ''}.`;
}
