// The MCP server's synthesis says the slices as nextpnr packs them (#2529, #2674): Optimization Area's comparison of its
// two netlists, through run_process synthesize, counts their slices with the estimate of nextpnr's packing
// (packages/silinx-fpga/src/slice-estimate.js), the kept netlist's as the estimate of the netlist written; the Silinx
// toolchain (no ISE).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, writeConfig } from './server-helpers.js';
import { sliceEstimate } from '../packages/silinx-fpga/src/slice-estimate.js';

let tmp;
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

before(async () => {
  tmp = await scratchEnv('silinx-mcp-slices-');
  await writeConfig({ mode: 'silinx' });
  await ok('new_project_from_example', { name: 't', example: 'traffic' });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('run_process synthesize at Optimization Area: the two netlists\' slices as nextpnr packs them, the kept one\'s the netlist\'s (#2529)', { timeout: 300000 }, async () => {
  await ok('set_process_properties', { project: 't', optimization: 'area' });
  const r = await ok('run_process', { project: 't', process: 'synthesize' });
  const m = /Optimization Area: the usual mapping (\d+) slices, (\d+) LUTs, the mappings for speed (\d+) slices, (\d+) LUTs: (the usual mapping|the mappings for speed') kept\./.exec(r.text);
  assert.ok(m, r.text);
  const top = JSON.parse(fs.readFileSync(path.join(P.projectDir('t'), 'silinx.json'), 'utf8')).top;
  const json = fs.readFileSync(path.join(P.projectDir('t'), 'build', 'open', `${top}.json`), 'utf8');
  const kept = m[5] === 'the usual mapping' ? +m[1] : +m[3];
  assert.equal(kept, sliceEstimate(json, top));
  // (no warnings: the synthesis of the example is clean)
  assert.doesNotMatch(r.text, /WARNING/);
});
