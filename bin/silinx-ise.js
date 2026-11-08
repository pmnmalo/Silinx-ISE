#!/usr/bin/env node
// The old name of Silinx's command (#2624): bin/silinx-ise.js runs bin/silinx.js, after a warning on stderr (never on
// stdout, which `mcp` keeps for its JSON-RPC messages), so the MCP configurations and scripts that name it keep
// working. Kept for two releases after the rename, then removed.
process.stderr.write('silinx-ise is now called silinx: run node bin/silinx.js (bin/silinx-ise.js will be removed in a later release)\n');
await import('./silinx.js');
