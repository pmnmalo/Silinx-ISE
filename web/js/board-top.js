// The top of a project whose board changed (Design Properties, #3710): the board's clock, its buttons' and switches'
// levels and its display's digit enables' level written as the defaults of the top's generics CLK_HZ, BTN_LOW, SW_LOW
// and AN_LOW (#3884; core/board-generics.js, as the server's New Project and the MCP server's set_design_properties
// write them), the console told.
import { api } from './api.js';
import { topForBoard, topForBoardText } from '/core/board-generics.js';

/** pj: the project; board: its board (projectBoard(), with its resources); log: the console's. True when written. */
export async function boardTop(pj, board, log) {
  if (!board || !pj.top) return false;
  const sources = [];
  for (const f of pj.files || []) {
    if (f.role === 'sim' || !/^(vhdl|verilog)$/.test(f.lang)) continue;
    try { sources.push({ path: f.path, lang: f.lang, text: await api.readFile(pj.name, f.path) }); } catch { /* missing: skipped */ }
  }
  const top = topForBoard(sources, pj.top, board);
  if (!top) return false;
  await api.writeFile(pj.name, top.path, top.text);
  log(topForBoardText(top, board.name), 'info');
  return true;
}
