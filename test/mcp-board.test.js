// The MCP server's board programming (#2674, #2298, server/mcp-board.js): program_board through the interface's function
// (impl-routes.js startProgramming), with a fake openFPGALoader / djtgcfg (test/server-helpers.js makeFakes), never a real
// board: an ECP5's .bit into the ULX3S's SRAM, a Gowin's .fs into the Tang Nano 9K's, an iCE40's .bin into the iCEBreaker's
// flash, a Spartan-3E's .bit with the Basys2's programmer; its refusals (an untrusted project, no file, another device's
// bitstream unless force, no top), the tool failing; the warnings in its text and its data.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scratchEnv, makeFakes, isolatedPath, writeConfig, makeBit, POSIX_ONLY } from './server-helpers.js';
import { ecp5Bit, gowinFs } from './fixtures/open-bitstreams.js';

let tmp, fakes, oldPath, P, handle, TOOLS;
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ECP5 = { family: 'ecp5', part: 'lfe5u-85f', package: 'cabga381', speed: '-6' };
const GOWIN = { family: 'gowin', part: 'gw1nr-9c', package: 'qn88', speed: '-6' };
const ICE40 = { family: 'ice40', part: 'ice40up5k', package: 'sg48', speed: '' };

async function project(name, board, device, file, data) {
  await P.createProject({ name, board, ...(device && { device }) });
  await P.updateProject(name, pj => { pj.top = 'top'; });
  if (file) {
    await fs.mkdir(path.join(P.projectDir(name), 'build'), { recursive: true });
    await fs.writeFile(path.join(P.projectDir(name), 'build', file), data);
  }
  return `<workspace>/${name}/build/${file || ''}`;   // (as the MCP server names the workspace's paths, #3418)
}
const progLog = () => fs.readFile(process.env.FAKE_PROG_LOG, 'utf8');

before(async () => {
  tmp = await scratchEnv('silinx-mcp-board-');
  fakes = await makeFakes(tmp);
  oldPath = process.env.PATH;
  process.env.PATH = isolatedPath(fakes.prog);
  await writeConfig({ paths: { adepttool: fakes.adept } });
  ({ handle, TOOLS } = await import('../server/mcp.js'));
  P = await import('../server/projects.js');
});
afterEach(() => { delete process.env.FAKE_PROG_FAIL; delete process.env.FAKE_PROG_LOG; });
after(async () => { process.env.PATH = oldPath; await fs.rm(tmp, { recursive: true, force: true }); });

test('program_board: destructive, the project required; its programmers', () => {
  const t = TOOLS.find(x => x.name === 'program_board');
  assert.deepEqual(t.annotations, { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false });
  assert.deepEqual(t.inputSchema.required, ['project']);
  assert.deepEqual(t.inputSchema.properties.tool.enum, ['openFPGALoader', 'xc3sprog', 'djtgcfg', 'impact', 'adepttool']);
});

test('program_board: an ECP5\'s .bit into the ULX3S\'s SRAM, with openFPGALoader -b ulx3s -m; no warning', { skip: POSIX_ONLY }, async () => {
  process.env.FAKE_PROG_LOG = path.join(tmp, 'ecp5.log');
  const bit = await project('Ulx', 'ulx3s', ECP5, 'top.bit', ecp5Bit());
  const r = await call('program_board', { project: 'Ulx' });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.text.split('\n')[0], 'Programmed the board (ulx3s) with build/top.bit.');
  assert.ok(!/WARNING/.test(r.text), r.text);
  assert.deepEqual([r.data.ok, r.data.file, r.data.tool, r.data.target, r.data.warnings], [true, 'build/top.bit', 'openFPGALoader', 'sram', []]);
  assert.deepEqual(r.data.commands, [{ cmd: 'openFPGALoader', args: ['-b', 'ulx3s', '-m', bit], code: 0 }]);
  assert.ok(r.data.log.includes('Programming (SRAM, volatile) with openFPGALoader board=ulx3s'), r.data.log.join('\n'));
  assert.match(await progLog(), /^openFPGALoader -b ulx3s -m .*top\.bit$/m);
  // another ECP5's .bit: refused, nothing run; then forced: programmed, warned
  await fs.writeFile(path.join(P.projectDir('Ulx'), 'build', 'top.bit'), ecp5Bit({ part: 'LFE5U-25F-6CABGA381', idcode: 0x41111043 }));
  await fs.rm(process.env.FAKE_PROG_LOG);
  const no = await call('program_board', { project: 'Ulx' });
  assert.equal(no.isError, true);
  assert.equal(no.text.split('\n')[0], "Programming failed: bitstream was built for 'LFE5U-25F-6CABGA381' but the target device is 'LFE5U-85F': not programmed");
  await assert.rejects(progLog());
  const forced = await call('program_board', { project: 'Ulx', force: true });
  assert.equal(forced.isError, false, forced.text);
  assert.deepEqual(forced.data.warnings, ["bitstream was built for 'LFE5U-25F-6CABGA381' but the target device is 'LFE5U-85F'"]);
  assert.equal(forced.text.split('\n')[1], "WARNING: bitstream was built for 'LFE5U-25F-6CABGA381' but the target device is 'LFE5U-85F'");
});

test('program_board: a Gowin\'s .fs into the Tang Nano 9K\'s SRAM, an iCE40\'s .bin into the iCEBreaker\'s flash', { skip: POSIX_ONLY }, async () => {
  process.env.FAKE_PROG_LOG = path.join(tmp, 'open.log');
  const fsFile = await project('Tang', 'tangnano9k', GOWIN, 'top.fs', gowinFs());
  const g = await call('program_board', { project: 'Tang' });
  assert.equal(g.isError, false, g.text);
  assert.deepEqual([g.data.target, g.data.warnings, g.data.commands[0].args], ['sram', [], ['-b', 'tangnano9k', '-m', fsFile]]);
  const bin = await project('Ice', 'icebreaker', ICE40, 'top.bin', Buffer.alloc(1024, 0xff));
  const i = await call('program_board', { project: 'Ice' });
  assert.equal(i.isError, false, i.text);
  assert.equal(i.text.split('\n')[0], 'Programmed the board (icebreaker) with build/top.bin (its SPI flash).');
  assert.deepEqual([i.data.target, i.data.warnings, i.data.commands[0].args], ['flash', [], ['-b', 'ice40_generic', bin]]);
  assert.deepEqual((await progLog()).trim().split('\n'), [`openFPGALoader -b tangnano9k -m ${path.join(P.projectDir('Tang'), 'build', 'top.fs')}`,
    `openFPGALoader -b ice40_generic ${path.join(P.projectDir('Ice'), 'build', 'top.bin')}`]);
});

test('program_board: a Spartan-3E\'s .bit with the board\'s programmer, or the one asked', { skip: POSIX_ONLY }, async () => {
  process.env.FAKE_PROG_LOG = path.join(tmp, 's3e.log');
  await project('B2', 'basys2', null, 'top.bit', makeBit());
  const r = await call('program_board', { project: 'B2', tool: 'djtgcfg' });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual([r.data.tool, r.data.warnings], ['djtgcfg', []]);
  assert.match(await progLog(), /^djtgcfg prog -d Basys2 -i 0 -f .*top\.bit$/m);
});

test('program_board\'s refusals: untrusted, no top, no file yet, the programmer failing', { skip: POSIX_ONLY }, async () => {
  await project('Mcp', 'ulx3s', ECP5, 'top.bit', ecp5Bit());
  await P.updateProject('Mcp', pj => ({ ...pj, trusted: false, madeBy: 'mcp' }));
  const u = await call('program_board', { project: 'Mcp' });
  assert.equal(u.isError, true);
  assert.match(u.text, /^program_board: project 'Mcp' .*: programming the board runs only once you trust it \(Trust Project, in the console when the project opens\)$/);
  await P.createProject({ name: 'NoTop', board: 'ulx3s', device: ECP5 });
  assert.equal((await call('program_board', { project: 'NoTop' })).text, "program_board: 'NoTop' has no top module: set_top first");
  const noFile = await project('NoFile', 'tangnano9k', GOWIN);
  assert.equal((await call('program_board', { project: 'NoFile' })).text, `program_board: bitstream not found: ${noFile}top.fs (run the implementation first)`);   // (the workspace's path named)
  await project('Fail', 'ulx3s', ECP5, 'top.bit', ecp5Bit());
  process.env.FAKE_PROG_FAIL = 'openFPGALoader';
  const f = await call('program_board', { project: 'Fail' });
  assert.equal(f.isError, true);
  assert.equal(f.text.split('\n')[0], 'Programming failed: openFPGALoader exited with code 1');
  assert.equal(f.data.ok, false);
});
