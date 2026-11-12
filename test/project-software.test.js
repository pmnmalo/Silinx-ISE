// core/project-software.js (#3703): the software of Import Project (.zip)… and Export Project (.zip)…'s Software: row,
// and the software of a zip's files, as the import reads them (server/project-zip.js importProjectEntries).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOFTWARE, SUPPORTED, projectSoftware } from '../core/project-software.js';
import { TRANSFER_TOOLS } from '../server/mcp-transfer.js';

test('#3703 SOFTWARE: Silinx and Xilinx ISE supported, the export\'s kinds; Vivado and Quartus disabled with their reason', () => {
  assert.deepEqual(SOFTWARE.map(s => s.id), ['silinx', 'xilinx', 'vivado', 'quartus']);
  assert.deepEqual(SUPPORTED, ['silinx', 'xilinx']);
  // (the MCP's export_project kinds: the same software, #2674)
  assert.deepEqual([...SUPPORTED].sort(), TRANSFER_TOOLS.find(t => t.name === 'export_project').inputSchema.properties.kind.enum.sort());
  for (const s of SOFTWARE.filter(x => !SUPPORTED.includes(x.id))) assert.match(s.reason, /^Silinx does not read or write an? .+ project \(.+\) yet\.$/);
  assert.ok(Object.isFrozen(SOFTWARE) && SOFTWARE.every(Object.isFrozen));
});

test('#3703 projectSoftware: a .xise first, then a silinx.json, a .xpr, a .qpf or .qsf; in a folder too, any case', () => {
  assert.equal(projectSoftware(['silinx.json', 'top.vhd']), 'silinx');
  assert.equal(projectSoftware(['traffic/silinx.json', 'traffic/top.vhd']), 'silinx');
  assert.equal(projectSoftware(['blinky.xise', 'blinky.vhd', 'blinky.ucf']), 'xilinx');
  assert.equal(projectSoftware(['p/BLINKY.XISE']), 'xilinx');
  // (a .xise wins, as the import takes it: importProjectEntries)
  assert.equal(projectSoftware(['silinx.json', 'p.xise']), 'xilinx');
  assert.equal(projectSoftware(['v/v.xpr', 'v/v.srcs/sources_1/top.v']), 'vivado');
  assert.equal(projectSoftware(['q.qpf', 'q.qsf', 'q.v']), 'quartus');
  assert.equal(projectSoftware(['q.qsf']), 'quartus');
  assert.equal(projectSoftware(new Set(['a.silinx.json.bak', 'mysilinx.json'])), null);
  assert.equal(projectSoftware([]), null);
  assert.equal(projectSoftware(['top.vhd', 'readme.md']), null);
});
