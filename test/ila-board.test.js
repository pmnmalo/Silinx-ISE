// The logic analyzer on the board from the server (#3176): scripts/ila-scan.py run with stand-ins for adepttool
// (test/fixtures/adepttool-stub: a Spartan-3E and a Platform Flash on the chain, the FPGA's USER1 register a model of
// the core) through server/ila-board.js boardLink: a capture run (core/ila-link.js) armed, polled and read back, every
// scan through USER1 with the register's length; no board; and the MCP tool capture on blinky with its capture
// settings: the samples around the trigger, build/capture.json (each probe's samples by its path), its refusals.
// (Python 3 needed: skipped without it, as test/xcf.test.js's.)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scratchEnv } from './server-helpers.js';
import { capSpec, SAMPLES } from './ila-lib.mjs';

const STUB = fileURLToPath(new URL('./fixtures/adepttool-stub', import.meta.url));
// (Python 3's own path, as it names it: on Windows python, and a path the system reads, not the shell's /c/…, #3613)
const PY = ['python3', 'python'].map(c => spawnSync(c, ['-c', 'import sys; print(sys.executable if sys.version_info[0] == 3 else "")'], { encoding: 'utf8' }).stdout?.trim()).find(Boolean) || '';
const skip = !PY && 'no Python 3 here';
const cfg = { paths: { adepttool: STUB, adepttoolPython: PY } };
const hex = v => v.toString(16);

let tmp;
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
const { boardLink } = await import('../server/ila-board.js');
const { runCapture } = await import('../core/ila-link.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
before(async () => {
  tmp = await scratchEnv('silinx-ila-board-');
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify({ mode: 'silinx', ...cfg }));
});
after(() => { delete process.env.SILINX_ILA_STUB; fs.rmSync(tmp, { recursive: true, force: true }); });

test('ila-scan.py through adepttool (stand-ins): a capture armed, polled and read back; every scan through USER1, the register\'s bits', { skip }, async () => {
  const spec = capSpec({ depth: 32, pre: 8 }), log = path.join(tmp, 'scans.log');
  process.env.SILINX_ILA_STUB = JSON.stringify({ width: 9, depth: 32, fill: 3, samples: SAMPLES(spec).map(hex), log });
  const link = await boardLink(spec, { cfg });
  try {
    assert.deepEqual([link.product, link.fpga], ['Digilent Basys2', 'xc3s250e']);
    const cap = await runCapture(link, spec, { pollMs: 0, sleep: async () => {} });
    assert.deepEqual(cap.samples, SAMPLES(spec));
    assert.equal(cap.polls, 3);
  } finally { await link.close(); }
  const scans = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.ok(scans.every(l => l.startsWith('18 ')), 'the register\'s 18 bits');
  assert.deepEqual(scans.map(l => +l.split(' ')[1]), [1, 0, 0, 0, 0, 3, ...Array(32).fill(2), 0]);
  // no board
  process.env.SILINX_ILA_STUB = JSON.stringify({ boards: 0, width: 9, depth: 32, samples: [] });
  await assert.rejects(boardLink(spec, { cfg }), { message: 'no Digilent Adept board found: is it connected and powered on?' });
});

test('the MCP tool capture on blinky: the samples around the trigger, build/capture.json by the probes\' paths; its refusals', { skip, timeout: 300000 }, async () => {
  const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
  await ok('new_project_from_example', { name: 'b', example: 'blinky' });
  const none = await call('capture', { project: 'b' });
  assert.equal(none.text, 'capture: the project \'b\' has no capture (capture_settings sets one, then Implement and program the board)');
  await ok('capture_settings', { project: 'b', probes: ['u_knight.count', 'u_knight.dir'], clock: 'clk', depth: 16, pre: 2, trigger: { combine: 'and', conditions: [{ probe: 'u_knight.dir', op: 'rise' }] } });
  // the board's core: count k in the low 8 bits, dir the 9th
  const samples = Array.from({ length: 16 }, (_, k) => BigInt(10 + k) | (BigInt(k >= 2 ? 1 : 0) << 8n));
  process.env.SILINX_ILA_STUB = JSON.stringify({ width: 9, depth: 16, fill: 2, samples: samples.map(hex) });
  const r = await ok('capture', { project: 'b', timeout_s: 5 });
  assert.equal(r.text, ['Armed: 16 samples, 2 before the trigger.', 'Triggered (2 polls); reading 16 samples.',
    'Captured 16 samples of u_knight.count, u_knight.dir on clk; the trigger at sample 2. Saved in build/capture.json.',
    'Samples 0 to 4:', '  u_knight.count: 10 11 12 13 14', '  u_knight.dir: 0 0 1 1 1'].join('\n'));
  const saved = JSON.parse(fs.readFileSync(path.join(P.projectDir('b'), 'build', 'capture.json'), 'utf8'));
  assert.deepEqual([saved.top, saved.clock, saved.depth, saved.pre, saved.trigger, saved.polls], ['top', 'clk', 16, 2, 2, 2]);
  assert.deepEqual(saved.probes.map(p => [p.path, p.width, p.samples.length]), [['u_knight.count', 8, 16], ['u_knight.dir', 1, 16]]);
  assert.deepEqual(saved.probes[0].samples.slice(0, 3), ['0xa', '0xb', '0xc']);
  assert.deepEqual(r.data.probes, saved.probes);
  // another core on the board (Implement again, program the board), and a capture that does not trigger
  process.env.SILINX_ILA_STUB = JSON.stringify({ width: 12, depth: 64, samples: [] });
  assert.equal((await call('capture', { project: 'b' })).text, 'capture: The board\'s core is not this capture\'s: 12 bit(s) x 64 samples, not 9 x 16: Implement the design with its capture and program the board again.');
  process.env.SILINX_ILA_STUB = JSON.stringify({ width: 9, depth: 16, fill: 1e9, samples: [] });
  assert.equal((await call('capture', { project: 'b', timeout_s: 0.2 })).text, 'capture: The trigger has not come in 0.2 s: the capture stays armed (run capture with arm: false to wait again).');
  assert.equal((await call('capture', { project: 'b', timeout_s: 0 })).text, 'capture: timeout_s: a number of seconds above 0');
});

test('the MCP tool capture with no adepttool: says how to install it', async () => {
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify({ mode: 'silinx', paths: { adepttool: path.join(tmp, 'none') } }));
  try {
    const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
    await ok('new_project_from_example', { name: 'n', example: 'blinky' });
    await ok('capture_settings', { project: 'n', probes: ['led'], clock: 'clk', depth: 16, trigger: {} });
    assert.equal((await call('capture', { project: 'n' })).text, 'capture: The capture reads the board through adepttool, which is not installed: run scripts/install-adepttool.sh.');
  } finally { fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify({ mode: 'silinx', ...cfg })); }
});
