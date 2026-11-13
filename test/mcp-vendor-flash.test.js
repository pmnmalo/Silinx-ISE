// The MCP server's run_process on a board whose maker's tool writes its flash over its USB (#3711, #2674: what the
// interface's Generate Programming File does): ISE's bitstream (fake ISE tools on PATH, server-helpers.js) writes the
// PROM bitstream as build/<top>_prom.bin too, and the result's text and log end with how to program it (MimasV2Config).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, makeFakes, isolatedPath, writeConfig, POSIX_ONLY } from './server-helpers.js';

let tmp, oldPath;
before(async () => {
  tmp = await scratchEnv('silinx-mcp-flash-');
  const fakes = await makeFakes(tmp);
  oldPath = process.env.PATH;
  process.env.PATH = isolatedPath(fakes.ise, fakes.docker, fakes.ssh);
  process.env.FAKE_ISE_FIXTURES = fakes.fix;
  await writeConfig({ mode: 'local' });
});
after(() => { process.env.PATH = oldPath; fs.rmSync(tmp, { recursive: true, force: true }); });

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}

test('#3711 run_process bitstream on the Mimas V2: the .bin of the PROM bitstream, and how to program it with MimasV2Config', { skip: POSIX_ONLY }, async () => {
  const made = await call('new_project_from_example', { name: 'mimas', example: 'clock', board: 'mimas-v2' });
  assert.equal(made.isError, false, made.text);
  assert.equal((await P.readProject('mimas')).device.part, 'xc6slx9');
  await P.trustProject('mimas');   // (ISE runs a project made through the MCP server once the user trusts it)
  const r = await call('run_process', { project: 'mimas', process: 'bitstream', toolchain: 'ise' });
  assert.equal(r.isError, false, r.text);
  const line = 'Programming file: Numato Mimas V2: program its flash over its USB with MimasV2Config (Numato) and build/digital_clock_prom.bin (StartUpClk Cclk, the flash\'s bitstream): python -m MimasV2.Config <SERIAL_PORT> build/digital_clock_prom.bin (https://github.com/numato/samplecode/tree/master/FPGA/MimasV2/tools/configuration/python).';
  assert.equal(r.data.log.at(-1), line);
  assert.ok(r.text.includes(line), r.text);
  // (its warning: an<3>, on a header pin, #3709; no other)
  assert.deepEqual(r.data.warnings, ['WARNING: an<3>: the mimas-v2 has no pin for it; it is on the header pin io_p6<0> (the board\'s constraints)']);
  assert.ok(fs.existsSync(path.join(P.projectDir('mimas'), 'build', 'digital_clock_prom.bin')));
});
