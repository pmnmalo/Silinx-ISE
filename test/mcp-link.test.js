// The MCP server's tools of a design's link (#2826, server/mcp-link.js): project_link (a project's link, the project
// inside it) and open_link (a project of a link: the design inside it, or an example), as the interface's Copy Link…
// and its opening of a link; a project that differs never replaced (#2829), a zip at an address never fetched, and
// the errors of a broken link or of a view the design does not have.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { scratchEnv } from './server-helpers.js';
import { decodeSvg } from './qr-helpers.js';
import { QR_MAX_BYTES } from '../core/qr.js';

let tmp;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-mcp-link-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  // (the label of a design's text, #3528: test/mcp-untrusted.test.js; the data here without it)
  const { untrusted, ...data } = r.structuredContent || {};
  return { text: r.content[0].text, data: r.structuredContent && data, untrusted: untrusted?.content, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true); assert.equal(r.text, `${name}: ${message}`); };
const files = async name => Object.fromEntries(await Promise.all((await P.fileTree(name)).map(async f => [f, await P.readFile(name, f)])));

test('project_link / open_link: gates (a schematic) round trip into Try it, the same files, Check Syntax with no warnings', async () => {
  await ok('new_project_from_example', { name: 'gates', example: 'gates' });
  const r = await ok('project_link', { project: 'gates', view: 'try', base: 'http://localhost:3000/' });
  const link = r.data.link;
  assert.match(link, /^http:\/\/localhost:3000\/#design=[A-Za-z0-9_-]+&view=try$/);
  assert.equal(r.text, `WARNING: the link is ${link.length} characters long: some slide tools cut a link longer than 2000 (a zip hosted elsewhere makes a short one)\nThe link of 'gates', opening Try it (${link.length} characters; src/gates.vhd made again from its drawing):\n${link}`);
  assert.deepEqual(r.data.left, ['src/gates.vhd']);
  // into a new project: every file as it was
  const o = await ok('open_link', { link, name: 'gates_link' });
  assert.equal(o.text, 'Opened the link as the new project \'gates_link\': top gates, basys2; the link opens Try it (Try it is the interface\'s: a schematic\'s live simulation, a state diagram\'s, a Petri net\'s or an ASM chart\'s simulation).');
  assert.deepEqual(o.data, { project: 'gates_link', created: true, view: 'try', top: null, board: 'basys2', warnings: [] });
  assert.deepEqual(await files('gates_link'), await files('gates'));
  const c = await ok('check_syntax', { project: 'gates_link' });
  assert.doesNotMatch(c.text, /WARNING|ERROR/);
  // opened again: the same project, kept
  const again = await ok('open_link', { link, name: 'gates_link' });
  assert.equal(again.text, 'The link\'s design is the project \'gates_link\' already (unchanged): top gates, basys2; the link opens Try it (Try it is the interface\'s: a schematic\'s live simulation, a state diagram\'s, a Petri net\'s or an ASM chart\'s simulation).');
  assert.equal(again.data.created, false);
  // changed: never replaced (#2829)
  await P.writeFile('gates_link', 'sim/tb_gates.vhd', '-- the student\'s work\n');
  await fails('open_link', { link, name: 'gates_link' }, 'project \'gates_link\' exists and differs from the link\'s design: it is not replaced (give another name, or delete_project first)');
  assert.equal(await P.readFile('gates_link', 'sim/tb_gates.vhd'), '-- the student\'s work\n');
  // named after the design: 'gates', the same as the example's project
  assert.equal((await ok('open_link', { link: new URL(link).hash })).data.created, false);
});

test('project_link: the views a design has, the default base, the errors', async () => {
  await ok('new_project_from_example', { name: 'traffic', example: 'traffic' });
  const s = await ok('project_link', { project: 'traffic', view: 'simulate', top: 'tb_traffic' });
  assert.match(s.data.link, /^https:\/\/pmnmalo\.github\.io\/Silinx\/#design=[A-Za-z0-9_-]+&top=tb_traffic&view=simulate$/);
  assert.deepEqual(s.data.left.sort(), ['src/lamps.vhd', 'src/traffic.vhd']);
  const e = await ok('project_link', { project: 'traffic' });
  assert.doesNotMatch(e.data.link, /view=|top=/);
  // a state diagram's module (traffic's FSM, #2869): its Simulate
  assert.match((await ok('project_link', { project: 'traffic', view: 'try', top: 'traffic' })).data.link, /#design=[A-Za-z0-9_-]+&top=traffic&view=try$/);
  await fails('project_link', { project: 'traffic', view: 'try' }, 'Try it: \'top\' is not a schematic, a state diagram, a Petri net or an ASM chart');
  await fails('project_link', { project: 'traffic', top: 'nothere' }, 'the design has no module \'nothere\'');
  // the simulation's top= a test bench; the other views', a design module (#2878)
  assert.match((await ok('project_link', { project: 'traffic', view: 'simulate', top: 'tb_traffic' })).data.link, /&top=tb_traffic&view=simulate$/);
  await fails('project_link', { project: 'traffic', view: 'simulate', top: 'timer' }, '\'timer\' is not a test bench of the design');
  await fails('project_link', { project: 'traffic', top: 'tb_traffic' }, '\'tb_traffic\' is a test bench: a link opens it in the simulation');
  await fails('project_link', { project: 'traffic', view: 'run' }, 'view: one of try, simulate, emulate');
  await fails('project_link', { project: 'traffic', base: 'javascript:alert(1)' }, 'base: \'javascript:alert(1)\' is not an http(s) address');
  await fails('project_link', { project: 'traffic', base: 'nope' }, 'base: \'nope\' is not an address');
  await fails('project_link', { project: 'nothere' }, 'no project \'nothere\' in the workspace');
  await ok('new_project', { name: 'empty' });
  await fails('project_link', { project: 'empty', view: 'emulate' }, 'the design has no board to emulate it on');
  // (the top module only, #2884)
  await fails('project_link', { project: 'traffic', view: 'emulate', top: 'timer' }, 'the board emulator emulates the top module, \'top\', not \'timer\'');
  await fails('project_link', { project: 'empty', view: 'simulate' }, 'the design has no test bench to simulate');
});

test('project_link: a project too large for a link', async () => {
  await ok('new_project', { name: 'big' });
  const noise = Array.from({ length: 60000 }, (_, i) => ((i * 2654435761) >>> 0).toString(36)).join(' ');
  await P.writeFile('big', 'src/noise.txt', noise);
  const r = await call('project_link', { project: 'big' });
  assert.equal(r.isError, true);
  assert.match(r.text, /^project_link: the design is too large for a link \(\d+ characters, at most 64000\): export it as a \.zip \(Export Project \(\.zip\)…, Silinx\) and link to that$/);
});

test('open_link: an example, on its board and on another (its pins the board\'s), in the emulator', async () => {
  const r = await ok('open_link', { link: 'https://pmnmalo.github.io/Silinx/#open=example:pong&view=emulate' });
  assert.equal(r.text, 'Opened the link as the new project \'pong\': top pong, basys2; the link opens the board emulator (run_process bitstream builds it for the board).');
  const n = await ok('open_link', { link: '#open=example:blinky&board=nexys2', name: 'blinky_n2' });
  assert.equal(n.data.board, 'nexys2');
  assert.equal((await P.readProject('blinky_n2')).device.part, 'xc3s500e');
  // a project the MCP server made, as new_project_from_example's: untrusted (#2981)
  for (const pj of ['pong', 'blinky_n2']) assert.deepEqual([(await P.readProject(pj)).trusted, (await P.readProject(pj)).madeBy], [false, 'mcp'], pj);
  // opened again: the example's project as it is
  assert.equal((await ok('open_link', { link: '#open=example:pong' })).data.created, false);
  await P.writeFile('pong', 'src/extra.vhd', '-- mine\n');
  await fails('open_link', { link: '#open=example:pong' }, 'project \'pong\' exists and differs from the link\'s design: it is not replaced (give another name, or delete_project first)');
  await fails('open_link', { link: '#open=example:nothere' }, 'the link names no example \'nothere\' (list_examples)');
  await fails('open_link', { link: '#open=example:pong&board=zx81', name: 'p2' }, 'the link\'s board \'zx81\' is not a board (list_devices)');
  await fails('open_link', { link: '#open=example:gates&view=simulate&top=nothere', name: 'g2' }, 'the design has no module \'nothere\'');
  assert.equal(fs.existsSync(P.projectDir('g2')), false);
});

test('open_link: a broken or hostile link is refused, nothing made (#2829)', async () => {
  const before = (await P.listProjects()).length;
  await fails('open_link', { link: 'https://pmnmalo.github.io/Silinx/' }, 'the link has no design (#design=… or #open=…)');
  await fails('open_link', { link: '#token=abc' }, 'the link has no design (#design=… or #open=…)');
  await fails('open_link', { link: '#open=https://example.org/lecture3.zip' }, 'the link opens a zip at https://example.org/lecture3.zip: the MCP server fetches nothing from the network (download it into the exchange folder, then import_project)');
  await fails('open_link', { link: '#open=http://192.168.1.1/a.zip' }, 'the link\'s open= is not an https address (\'http://192.168.1.1/a.zip\')');
  await fails('open_link', { link: '#open=https://127.0.0.1/a.zip' }, 'the link\'s open= is an address of this computer or of a local network (\'127.0.0.1\')');
  await fails('open_link', { link: '#design=abc$' }, 'the design in the link is not base64url');
  const hostile = Buffer.from(zlib.deflateRawSync(JSON.stringify({ v: 1, project: { name: 'evil' }, files: { '../../escape.vhd': 'x' } }))).toString('base64url');
  await fails('open_link', { link: `#design=${hostile}` }, 'the link\'s design has a file outside the project (\'../../escape.vhd\')');
  const named = Buffer.from(zlib.deflateRawSync(JSON.stringify({ v: 1, project: { name: '<svg onload=alert(1)>' }, files: {} }))).toString('base64url');
  await fails('open_link', { link: `#design=${named}` }, 'the link\'s design has no valid project name (\'<svg onload=alert(1)>\')');
  await fails('open_link', { link: '#open=example:gates', name: '../x' }, 'invalid project name \'../x\': a letter, then up to 63 letters, digits, - and _');
  assert.equal((await P.listProjects()).length, before);
  assert.equal(fs.existsSync(path.join(tmp, 'escape.vhd')), false);
});

test('#2894 project_link / open_link of every example with constraints: the same .ucf, board, device and top; implemented with the same pinout and the same warnings; a module link and the project only too', { timeout: 900000 }, async () => {
  for (const ex of ['traffic', 'pong', 'stopwatch', 'clock', 'vga', 'uart']) {
    const o = `${ex}_2894`, l = `${ex}_2894l`;
    await ok('new_project_from_example', { name: o, example: ex });
    const src = await P.readProject(o);
    // the project only, and a module's link (the top's first other module; Share Module Copy…)
    const mod = (await Promise.all(src.files.filter(f => f.role !== 'sim').map(f => P.readFile(o, f.path)))).join('\n')
      .match(/^\s*(?:entity|module)\s+(\w+)/gim).map(m => m.trim().split(/\s+/)[1]).find(m => m.toLowerCase() !== src.top.toLowerCase());
    for (const [args, as] of [[{}, l], [{ top: mod }, `${l}m`], [{ view: 'emulate' }, `${l}e`]]) {
      const r = await ok('open_link', { link: (await ok('project_link', { project: o, ...args })).data.link, name: as });
      assert.deepEqual(r.data.warnings, [], `${as}`);
      const got = await P.readProject(as);
      for (const k of ['constraints', 'board', 'device', 'top', 'simTop', 'files']) assert.deepEqual(got[k], src[k], `${as}: ${k}`);
      assert.equal(await P.readFile(as, got.constraints), await P.readFile(o, src.constraints), `${as}: the same ${src.constraints}`);
      assert.deepEqual(await files(as), await files(o), as);
    }
    // implemented: the same pins (the placed design's pads), the same warnings
    const run = async p => { const r = await ok('run_process', { project: p, process: 'pins' }); return { warnings: r.data.warnings, pins: (await ok('get_report', { project: p, report: 'pins' })).text }; };
    const [a, b] = [await run(o), await run(l)];
    assert.deepEqual(b.warnings, a.warnings, `${ex}: no new warnings`);
    assert.equal(b.pins, a.pins, `${ex}: the same pinout`);
    assert.match(b.pins, /LOC = "B8"/, `${ex}: the clock on its pin`);
  }
  // to the bitstream (pong, the link's copy): no warnings
  const bit = await ok('run_process', { project: 'pong_2894l', process: 'bitstream' });
  assert.deepEqual(bit.data.warnings, []);
  assert.ok(fs.existsSync(path.join(P.projectDir('pong_2894l'), 'build', 'pong.bit')) || /bit/i.test(bit.text));
});

// #3637: project_link qr, the link's QR code as an SVG (decoded back); a link longer than a QR code holds has none, a
// warning saying so
test('#3637 project_link qr: the link\'s QR code; a link too long for one, the warning', async () => {
  // (an example's full link is longer: gates' about 5000 characters)
  await ok('new_project', { name: 'qr1' });
  const r = await ok('project_link', { project: 'qr1', qr: true });
  assert.ok(r.data.link.length <= QR_MAX_BYTES, `${r.data.link.length}`);
  assert.equal(decodeSvg(r.data.qr), r.data.link);
  assert.deepEqual(r.data.warnings, []);
  assert.equal(r.text, `The link of 'qr1' (${r.data.link.length} characters; its QR code: qr, an SVG):\n${r.data.link}`);
  // (no qr asked: none)
  assert.equal((await ok('project_link', { project: 'qr1' })).data.qr, undefined);
  // too long
  await ok('new_project_from_example', { name: 'qr2', example: 'gates' });
  const t = await ok('project_link', { project: 'qr2', qr: true });
  const n = t.data.link.length;
  assert.ok(n > QR_MAX_BYTES && n < 64000, `${n}`);
  assert.equal(t.data.qr, undefined);
  assert.deepEqual(t.data.warnings, [
    `WARNING: the link is ${n} characters long: some slide tools cut a link longer than 2000 (a zip hosted elsewhere makes a short one)`,
    `WARNING: the link is ${n} characters, too long for a QR code (at most ${QR_MAX_BYTES}): a short link (short: true) has one`,
  ]);
  assert.ok(t.text.startsWith(`${t.data.warnings.join('\n')}\nThe link of 'qr2' (${n} characters`) && !t.text.includes('QR code: qr'), t.text);
});
