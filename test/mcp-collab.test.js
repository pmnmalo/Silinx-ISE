// The MCP server's tools of a shared project (#3181, server/mcp-collab.js, #2674): share_project shares a project of
// the workspace through a running Silinx server's relay (its token from the configuration folder), follow_project
// follows its link read only; two participants in one test, the MCP's share followed by a page's code (core/collab-
// client.js) and the MCP's follow of it; a change on disk arriving; the status with its follower; stop; the errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSvg } from './qr-helpers.js';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { closable } from './server-close.js';
import * as Y from 'yjs';
import { followRoom } from '../core/collab-client.js';
import { docFile, docProject } from '../core/collab-doc.js';
import { parseFollowLink, relayUrl, followLink } from '../core/collab-link.js';
import { drawingModel, putDrawing } from '../core/collab-model.js';
import { normalizeFsm, generateFsm } from '../core/fsm.js';
import { normalizeTable, generateTableHdl } from '../core/logic.js';
import { normalizeModel as normalizeAsm, generate as generateAsm } from '../core/asm.js';
import { normalizePetri, generatePetri } from '../core/petri.js';
import { normalizeDoc, generateHdl } from '../core/schdoc.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 5000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(25); } };

let tmp, srv, base, closeSrv;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-collab-'));
  const { createApp, tokenFile } = await import('../server/server.js');
  const app = await createApp({ host: '127.0.0.1', token: 'tok-mcp' });
  srv = app.listen(0, '127.0.0.1');
  closeSrv = closable(srv);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  // (as startServer writes it: the MCP server finds the token of the server on this computer)
  fs.mkdirSync(path.dirname(tokenFile(srv.address().port)), { recursive: true });
  fs.writeFileSync(tokenFile(srv.address().port), 'tok-mcp');
});
after(async () => {
  await (await import('../server/mcp-collab.js')).endCollab();
  await closeSrv();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const { handle, TOOLS } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };

test('the tools are listed, with their schemas', () => {
  const byName = Object.fromEntries(TOOLS.map(t => [t.name, t]));
  assert.deepEqual(byName.share_project.inputSchema.required, ['project']);
  assert.deepEqual(byName.share_project.inputSchema.properties.action.enum, ['start', 'status', 'stop']);
  assert.deepEqual(byName.follow_project.inputSchema.required, ['link']);
  // (an editor's link writes, #3182)
  assert.equal(byName.follow_project.annotations.readOnlyHint, false);
  assert.deepEqual(byName.follow_project.inputSchema.properties.write.required, ['path', 'text']);
  assert.equal(byName.share_project.inputSchema.properties.editors.type, 'boolean');
});

test('share_project start: a page follows it (the project, its files, the owner\'s name); a change on disk arrives; status lists the follower; stop ends it', async () => {
  await ok('new_project_from_example', { name: 'traffic', example: 'traffic' });
  const r = await ok('share_project', { project: 'traffic', name: 'Teacher', server: base });
  const link = r.data.link;
  assert.match(link, new RegExp(`^${base}/#follow=[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}$`));
  assert.equal(r.text, `Sharing 'traffic' live, read only, as Teacher. Anyone with this link follows it (until share_project stop):\n${link}`);
  assert.deepEqual(r.data, { project: 'traffic', shared: true, link, followers: [] });
  // (again: the same link)
  assert.equal((await ok('share_project', { project: 'traffic', server: base })).text, `'traffic' is shared already: ${link}`);
  // (its QR code, #3637: the follow link's, decoded back; the status's too)
  const q = await ok('share_project', { project: 'traffic', server: base, qr: true });
  assert.equal(q.text, `'traffic' is shared already: ${link}`);
  assert.equal(decodeSvg(q.data.qr), link);
  assert.equal(decodeSvg((await ok('share_project', { project: 'traffic', action: 'status', qr: true })).data.qr), link);
  assert.equal((await ok('share_project', { project: 'traffic', action: 'status' })).data.qr, undefined);
  const l = parseFollowLink(link);
  const page = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, user: { name: 'Rui' } });
  await page.ready;
  const d = docProject(page.doc);
  assert.equal(d.owner, 'Teacher');
  assert.equal(d.project.name, 'traffic');
  assert.deepEqual(d.fileTree, (await P.fileTree('traffic')).filter(f => f !== 'silinx.json').sort());
  assert.equal(docFile(page.doc, 'src/timer.vhd'), await P.readFile('traffic', 'src/timer.vhd'));
  // (written on disk by another process: published again by the project watcher)
  const text = `-- changed on disk\n${await P.readFile('traffic', 'src/timer.vhd')}`;
  fs.writeFileSync(path.join(P.projectDir('traffic'), 'src/timer.vhd'), text);
  await until(() => docFile(page.doc, 'src/timer.vhd') === text, 'the change on disk', 8000);
  const st = await until(async () => { const s = await ok('share_project', { project: 'traffic', action: 'status' }); return s.data.followers.length && s; }, 'the follower in the status');
  assert.equal(st.text, `'traffic' is shared: ${link}\nFollowers:\nRui (follower)`);
  await ok('share_project', { project: 'traffic', action: 'stop' }).then(s => assert.equal(s.text, 'Stopped sharing \'traffic\': its followers no longer see it.'));
  await until(() => page.closed(), 'the page told');
  assert.equal((await ok('share_project', { project: 'traffic', action: 'status' })).text, '\'traffic\' is not shared.');
});

test('follow_project: an MCP client follows the MCP\'s share (two participants), a file\'s text, the owner\'s view; read only; stop', async () => {
  await ok('new_project_from_example', { name: 'blinky', example: 'blinky' });
  const { data: { link } } = await ok('share_project', { project: 'blinky', name: 'Ana', server: base });
  const f = await ok('follow_project', { link, name: 'Bot' });
  const files = (await P.fileTree('blinky')).filter(x => x !== 'silinx.json').sort();
  assert.deepEqual(f.data.files, files);
  assert.equal(f.data.owner, 'Ana');
  assert.equal(f.data.project, 'blinky');
  assert.deepEqual(f.data.participants.map(p => [p.name, p.role]), [['Ana', 'owner']]);
  assert.equal(f.data.ownerView, null);
  assert.equal(f.data.untrusted.content, 'the shared project\'s files and names');   // (#3363: the names its participants chose)
  assert.equal(f.text, `Following Ana's project 'blinky' (read only).\nFiles: ${files.join(', ')}\nIn it:\nAna (owner)`);
  const path0 = files.find(x => x.endsWith('.ucf'));
  const t = await ok('follow_project', { link, path: path0 });
  assert.equal(t.data.untrusted.content, `the shared project's files, names and the file ${path0}`);
  assert.equal(t.data.text, await P.readFile('blinky', path0));
  assert.ok(t.text.endsWith(`${path0}:\n${t.data.text}`));
  await fails('follow_project', { link, path: 'build/top.bit' }, `'build/top.bit' is not a file of the shared project (${files.join(', ')})`);
  await fails('follow_project', { link, path: '../traffic/silinx.json' }, `'../traffic/silinx.json' is not a file of the shared project (${files.join(', ')})`);
  // (the owner sees the MCP follower)
  await until(async () => (await ok('share_project', { project: 'blinky', action: 'status' })).data.followers.some(p => p.name === 'Bot'), 'Bot in the status');
  assert.equal((await ok('follow_project', { link, stop: true })).text, 'Stopped following.');
  await fails('follow_project', { link, stop: true }, 'this link is not followed');
  await ok('share_project', { project: 'blinky', action: 'stop' });
  await fails('follow_project', { link }, 'cannot follow: this shared project is no longer shared (its owner stopped sharing it)');
});

test('#3631 share_project top (Share Module…): the links open on the module; follow_project says it; a module the design has not, a test bench, a bad name, top with status', async () => {
  await ok('new_project_from_example', { name: 'blinkyMod', example: 'blinky' });
  const r = await ok('share_project', { project: 'blinkyMod', name: 'Ana', server: base, top: 'speed_ctrl', editors: true });
  const { link, editLink } = r.data;
  assert.match(link, /#follow=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}&top=speed_ctrl$/);
  assert.match(editLink, /#edit=[^&]+&top=speed_ctrl$/);
  assert.equal(r.data.top, 'speed_ctrl');
  assert.equal(r.text, `Sharing 'blinkyMod' live, read only, as Ana, opening on speed_ctrl. Anyone with this link follows it (until share_project stop):\n${link}\nAnyone with this one edits its text files and drawings too:\n${editLink}`);
  assert.deepEqual(parseFollowLink(link), { ...parseFollowLink(link.replace(/&top=.*$/, '')), top: 'speed_ctrl' });
  // (shared already: that module's links, another module's too)
  const again = await ok('share_project', { project: 'blinkyMod', server: base, top: 'knight' });
  assert.equal(again.text, `'blinkyMod' is shared already, opening on knight: ${link.replace(/speed_ctrl$/, 'knight')}`);
  assert.equal(again.data.editLink, editLink.replace(/speed_ctrl$/, 'knight'));
  // (its QR code, #3637: the module's follow link's)
  assert.equal(decodeSvg((await ok('share_project', { project: 'blinkyMod', server: base, top: 'knight', qr: true })).data.qr), link.replace(/speed_ctrl$/, 'knight'));
  assert.equal((await ok('share_project', { project: 'blinkyMod', action: 'status' })).data.link, link.replace(/&top=speed_ctrl$/, ''));
  const f = await ok('follow_project', { link, name: 'Bot' });
  assert.equal(f.data.top, 'speed_ctrl');
  assert.ok(f.text.startsWith('Following Ana\'s project \'blinkyMod\' (read only), its link opening on speed_ctrl.\n'), f.text);
  await ok('follow_project', { link, stop: true });
  await fails('share_project', { project: 'blinkyMod', server: base, top: 'nope' }, 'top: the design has no module \'nope\'');
  await fails('share_project', { project: 'blinkyMod', server: base, top: 'tb_top' }, 'top: \'tb_top\' is a test bench: a link opens it in the simulation');
  await fails('share_project', { project: 'blinkyMod', server: base, top: 'a b' }, 'top: \'a b\' is not a module name');
  await fails('share_project', { project: 'blinkyMod', action: 'status', top: 'knight' }, 'top: with action start only');
  await ok('share_project', { project: 'blinkyMod', action: 'stop' });
});

test('the errors: a project not shared, a bad action, no project, a bad server, no server there, a broken link, a link of a page\'s host', async () => {
  await fails('share_project', { project: 'traffic', action: 'stop' }, '\'traffic\' is not shared');
  await fails('share_project', { project: 'traffic', action: 'pause' }, 'action: one of start, status, stop');
  const r = await call('share_project', { project: 'nope', server: base });
  assert.equal(r.isError, true);
  assert.match(r.text, /^share_project: no project 'nope'/);
  await fails('share_project', { project: 'traffic', server: 'ftp://x' }, 'server: \'ftp://x\' is not an http(s) address');
  await fails('share_project', { project: 'traffic', server: 'not an address' }, 'server: \'not an address\' is not an address');
  const dead = 'http://127.0.0.1:1';
  const d = await call('share_project', { project: 'traffic', server: dead });
  assert.equal(d.isError, true);
  assert.match(d.text, /^share_project: cannot share through http:\/\/127\.0\.0\.1:1: cannot reach the relay at ws:\/\/127\.0\.0\.1:1\/api\/collab\/share \(is Silinx running there\? silinx serve\)$/);
  await fails('follow_project', { link: 'http://x/#follow=abc' }, 'the link to follow is broken (copy it again from the owner\'s Share Project)');
  // (a project its owner's page hosts, #3227: a browser's, over WebRTC)
  await fails('follow_project', { link: `http://x/#follow=${'R'.repeat(22)}.${'K'.repeat(43)}.host` }, 'link: a project its owner\'s page hosts (…#follow=….host) is followed in a browser, over WebRTC: open the link in Silinx');
  // (and with its owner's key, the meeting point's: a browser's too)
  await fails('follow_project', { link: `http://x/#follow=${'R'.repeat(22)}.${'K'.repeat(43)}.host.${'P'.repeat(86)}` }, 'link: a project its owner\'s page hosts (…#follow=….host) is followed in a browser, over WebRTC: open the link in Silinx');
  await fails('follow_project', { link: 'http://x/#design=abc' }, 'link: a link to follow (http(s)://…/#follow=…)');
  await fails('follow_project', { link: `#follow=${'a'.repeat(22)}.${'b'.repeat(43)}` }, 'link: a link to follow (http(s)://…/#follow=…)');
});

test('#3182 editors: share_project gives an editor\'s link; follow_project write merges a text file\'s edit, written to the disk by the owner, seen by a follower; what an editor may not change: refused, or undone from the disk', async () => {
  await ok('new_project_from_example', { name: 'trafficEd', example: 'traffic' });
  const r = await ok('share_project', { project: 'trafficEd', name: 'Ana', server: base, editors: true });
  const { link, editLink } = r.data;
  assert.match(editLink, new RegExp(`^${base}/#edit=${parseFollowLink(link).room}\\.[A-Za-z0-9_-]{43}\\.[A-Za-z0-9_-]{129}$`));
  assert.equal(r.text, `Sharing 'trafficEd' live, read only, as Ana. Anyone with this link follows it (until share_project stop):\n${link}\nAnyone with this one edits its text files and drawings too:\n${editLink}`);
  const l = parseFollowLink(link);
  const page = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, user: { name: 'Eva' } });
  await page.ready;
  // the MCP client as an editor: a text file written, merged, on the disk, at the follower's
  const f = await ok('follow_project', { link: editLink, name: 'Bot' });
  assert.equal(f.data.editor, true);
  assert.ok(f.text.startsWith('Following Ana\'s project \'trafficEd\' (an editor: its text files and drawings).'), f.text);
  const timer = await P.readFile('trafficEd', 'src/timer.vhd');
  const w = await ok('follow_project', { link: editLink, write: { path: 'src/timer.vhd', text: `-- by Bot\n${timer}` } });
  assert.ok(w.text.includes('Wrote src/timer.vhd (merged as this participant\'s edit).'), w.text);
  await until(async () => (await P.readFile('trafficEd', 'src/timer.vhd')) === `-- by Bot\n${timer}`, 'the edit on the disk', 8000);
  await until(() => docFile(page.doc, 'src/timer.vhd') === `-- by Bot\n${timer}`, 'the edit at the follower\'s');
  // refused: a file not of text (#3183: every drawing is edited live), a new file, a follower's link
  await fails('follow_project', { link: editLink, write: { path: 'doc/notes.pdf', text: '{}' } }, 'write: doc/notes.pdf: not a text file of the project that an editor can change');
  await fails('follow_project', { link: editLink, write: { path: 'src/new.vhd', text: 'x' } }, 'write: src/new.vhd: not a text file of the project that an editor can change');
  await fails('follow_project', { link, write: { path: 'src/timer.vhd', text: 'x' } }, 'write: this link follows only (an editor\'s link, …#edit=…, writes)');
  // undone by the owner, from the disk: the HDL a drawing generates (the drawing's), a file an editor's page made
  const lamps = await P.readFile('trafficEd', 'src/traffic.vhd');
  await ok('follow_project', { link: editLink, write: { path: 'src/traffic.vhd', text: `-- mine\n${lamps}` } });
  const ed = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, sign: parseFollowLink(editLink).sign, user: { name: 'Rui' } });
  await ed.ready;
  ed.doc.transact(() => ed.doc.getMap('files').set('src/evil.vhd', new Y.Text('entity evil is end;\n')));
  await until(() => docFile(page.doc, 'src/traffic.vhd') === lamps && docFile(ed.doc, 'src/evil.vhd') === null && docFile(page.doc, 'src/evil.vhd') === null, 'both undone', 8000);
  assert.equal(await P.readFile('trafficEd', 'src/traffic.vhd'), lamps);
  assert.equal(fs.existsSync(path.join(P.projectDir('trafficEd'), 'src/evil.vhd')), false);
  assert.equal(await P.readFile('trafficEd', 'src/timer.vhd'), `-- by Bot\n${timer}`, 'the allowed edit kept');
  await ed.close();
  await ok('follow_project', { link: editLink, stop: true });
  await ok('share_project', { project: 'trafficEd', action: 'stop' });
  await until(() => page.closed(), 'the page told');
});

test('#3355 an editor\'s change of a trusted project: through the import gate, the project untrusted before it is written (Xilinx ISE refused); what the gate refuses not written, said in the status; trusted again, the next change untrusts it again', async () => {
  // (a project the user made: trusted)
  await P.createProject({ name: 'trustedEd', template: 'traffic' });
  assert.equal((await P.readProject('trustedEd')).trusted, undefined);
  const { data: { link, editLink } } = await ok('share_project', { project: 'trustedEd', name: 'Ana', server: base, editors: true });
  const timer = await P.readFile('trustedEd', 'src/timer.vhd');
  // a change the gate refuses (a NUL byte in a text file): not written, undone, the project still trusted
  await ok('follow_project', { link: editLink, name: 'Bot', write: { path: 'src/timer.vhd', text: `-- \0\n${timer}` } });
  const page = await followRoom({ url: relayUrl(parseFollowLink(link).base, 'follow'), room: parseFollowLink(link).room, key: parseFollowLink(link).key, user: { name: 'Eva' } });
  await page.ready;
  await until(async () => (await ok('share_project', { project: 'trustedEd', action: 'status' })).data.warnings.length, 'the refusal said');
  await until(() => docFile(page.doc, 'src/timer.vhd') === timer, 'the refused change undone');
  const st = await ok('share_project', { project: 'trustedEd', action: 'status' });
  assert.deepEqual(st.data.warnings, ['src/timer.vhd: an editor\'s change not written: binary content (a NUL byte) in a text file']);
  assert.ok(st.text.endsWith('\nWARNING: src/timer.vhd: an editor\'s change not written: binary content (a NUL byte) in a text file'), st.text);
  // (#3528: its warnings name the shared project's files: labelled, as its followers are)
  assert.equal(st.data.untrusted.content, 'the followers\' names and views, the warnings, which name the shared project\'s files');
  assert.equal(await P.readFile('trustedEd', 'src/timer.vhd'), timer);
  assert.equal((await P.readProject('trustedEd')).trusted, undefined, 'nothing written: still trusted');
  // a change it lets through: written, the project untrusted, changed by an editor; Xilinx ISE refused
  await ok('follow_project', { link: editLink, write: { path: 'src/timer.vhd', text: `-- by Bot\n${timer}` } });
  await until(async () => (await P.readFile('trustedEd', 'src/timer.vhd')) === `-- by Bot\n${timer}`, 'the edit on the disk', 8000);
  const pj = await P.readProject('trustedEd');
  assert.deepEqual([pj.trusted, pj.madeBy], [false, 'editor']);
  await fails('run_process', { project: 'trustedEd', process: 'synthesize', toolchain: 'ise' },
    "project 'trustedEd' was changed by an editor of its shared link: Xilinx ISE runs only once you trust it (Trust Project, in the console when the project opens)");
  // the user trusts it again (the interface's): the next change untrusts it again
  await P.trustProject('trustedEd');
  await ok('follow_project', { link: editLink, write: { path: 'src/timer.vhd', text: `-- again\n${timer}` } });
  await until(async () => (await P.readFile('trustedEd', 'src/timer.vhd')) === `-- again\n${timer}`, 'the second edit on the disk', 8000);
  assert.deepEqual([(await P.readProject('trustedEd')).trusted, (await P.readProject('trustedEd')).madeBy], [false, 'editor']);
  await page.close();
  await ok('follow_project', { link: editLink, stop: true });
  await ok('share_project', { project: 'trustedEd', action: 'stop' });
});

test('#3183 a state diagram edited live: an editor\'s page and the MCP client change it at once, merged per state and field; the owner writes it and its HDL; follow_project reads it merged with its Check; a structure an editor may not change undone', async () => {
  await ok('new_project_from_example', { name: 'trafficFsm', example: 'traffic' });
  const FSM = 'src/traffic.fsm.json';
  const { data: { link, editLink } } = await ok('share_project', { project: 'trafficFsm', name: 'Ana', server: base, editors: true });
  const l = parseFollowLink(editLink);
  const ed = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, sign: l.sign, user: { name: 'Rui' } });
  await ed.ready;
  const disk0 = JSON.parse(await P.readFile('trafficFsm', FSM));
  assert.deepEqual(drawingModel(ed.doc, FSM).model, normalizeFsm(disk0));
  // the MCP client reads it as merged, with its Check
  const r0 = await ok('follow_project', { link: editLink, name: 'Bot', path: FSM });
  assert.equal(r0.data.text, JSON.stringify(normalizeFsm(disk0), null, 2));
  assert.ok(r0.text.endsWith('\nProcess "Check State Diagram" of traffic.fsm.json completed successfully.'), r0.text);
  assert.deepEqual(r0.data.check, { errors: [], warnings: [] });
  // at once: Rui (a page) renames CARS and moves it; the MCP client moves ALL_RED and adds a state with a transition
  const base0 = drawingModel(ed.doc, FSM).model;
  const mine = structuredClone(base0);
  Object.assign(mine.states[0], { name: 'GO', x: 40 });
  putDrawing(ed.doc, FSM, mine, { base: base0, client: ed.doc.clientID });
  const bots = structuredClone(normalizeFsm(disk0));
  bots.states[2].y = 999;
  bots.states.push({ id: 's8', name: 'EXTRA', x: 10, y: 10, outputs: { phase: '00' } });
  bots.transitions.push({ id: 't9', from: 's7', to: 's8', cond: 'req' });
  const w = await ok('follow_project', { link: editLink, write: { path: FSM, text: JSON.stringify(bots) } });
  assert.ok(w.text.includes(`Wrote ${FSM} (merged as this participant's edit).`), w.text);
  // merged on both sides; the owner's disk, its HDL made again from it (the new state's name in it)
  const want = (m) => m && m.states[0].name === 'GO' && m.states[0].x === 40 && m.states[2].y === 999 && m.states.some((s) => s.name === 'EXTRA');
  await until(() => want(drawingModel(ed.doc, FSM)?.model), 'merged at the page');
  await until(async () => want(JSON.parse(await P.readFile('trafficFsm', FSM))), 'the merge on the disk', 8000);
  const disk = JSON.parse(await P.readFile('trafficFsm', FSM));
  assert.deepEqual(disk, drawingModel(ed.doc, FSM).model);
  await until(async () => /S_GO\b/.test(await P.readFile('trafficFsm', 'src/traffic.vhd')) && /S_EXTRA\b/.test(await P.readFile('trafficFsm', 'src/traffic.vhd')), 'the HDL made again', 8000);
  assert.equal(await P.readFile('trafficFsm', 'src/traffic.vhd'), generateFsm(normalizeFsm(disk), 'vhdl', { source: 'traffic.fsm.json' }).code);
  const pj = await P.readProject('trafficFsm');
  assert.equal(pj.trusted, false);
  // the MCP client reads the merge: its Check (EXTRA is never left: a warning of the diagram's own, not of the merge)
  const r1 = await ok('follow_project', { link: editLink, path: FSM });
  assert.deepEqual(JSON.parse(r1.data.text), disk);
  // a drawing an editor may not edit live (an ASM chart's structure made up): undone from the disk, nothing written
  ed.doc.transact(() => ed.doc.getMap('drawings').set('src/x.asm.json', new Y.Map()));
  await until(() => !ed.doc.getMap('drawings').has('src/x.asm.json'), 'the made-up structure undone', 8000);
  assert.equal(fs.existsSync(path.join(P.projectDir('trafficFsm'), 'src/x.asm.json')), false);
  // a write that is not a drawing's JSON: refused
  await fails('follow_project', { link: editLink, write: { path: FSM, text: 'not json' } }, `write: ${FSM}: not a drawing's JSON`);
  await fails('follow_project', { link: editLink, write: { path: 'src/none.fsm.json', text: '{}' } }, 'write: src/none.fsm.json: not a drawing of the project that an editor can change');
  // a follower (no editor) cannot write it
  await fails('follow_project', { link, write: { path: FSM, text: '{}' } }, 'write: this link follows only (an editor\'s link, …#edit=…, writes)');
  assert.deepEqual((await ok('share_project', { project: 'trafficFsm', action: 'status' })).data.warnings, []);
  await ed.close();
  await ok('follow_project', { link: editLink, stop: true });
  await ok('share_project', { project: 'trafficFsm', action: 'stop' });
});

test('#3183 a truth table edited live: a page and the MCP client change two cells of one output at once, both kept; the owner writes it and its HDL; follow_project reads it merged', async () => {
  await ok('new_project_from_example', { name: 'trafficTt', example: 'traffic' });
  const TT = 'src/lamps.bool.json';
  const { data: { editLink } } = await ok('share_project', { project: 'trafficTt', name: 'Ana', server: base, editors: true });
  const l = parseFollowLink(editLink);
  const ed = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, sign: l.sign, user: { name: 'Rui' } });
  await ed.ready;
  const disk0 = normalizeTable(JSON.parse(await P.readFile('trafficTt', TT)));
  assert.deepEqual(drawingModel(ed.doc, TT).model, disk0);
  const r0 = await ok('follow_project', { link: editLink, name: 'Bot', path: TT });
  assert.equal(r0.data.text, JSON.stringify(disk0, null, 2));
  assert.equal(r0.data.check, undefined, 'no Check of a truth table (check_drawing has none)');
  // at once: Rui sets car_r's row 14 to 1, the MCP client its row 15 to 0 (both don't cares)
  const set = (m, r, c) => ({ ...m, table: { ...m.table, car_r: m.table.car_r.slice(0, r) + c + m.table.car_r.slice(r + 1) } });
  putDrawing(ed.doc, TT, set(disk0, 14, '1'), { base: disk0, client: ed.doc.clientID });
  await ok('follow_project', { link: editLink, write: { path: TT, text: JSON.stringify(set(disk0, 15, '0')) } });
  const want = `${disk0.table.car_r.slice(0, 14)}10`;
  await until(() => drawingModel(ed.doc, TT)?.model.table.car_r === want, 'merged at the page');
  await until(async () => JSON.parse(await P.readFile('trafficTt', TT)).table.car_r === want, 'the merge on the disk', 8000);
  const disk = JSON.parse(await P.readFile('trafficTt', TT));
  assert.deepEqual(disk, drawingModel(ed.doc, TT).model);
  await until(async () => (await P.readFile('trafficTt', 'src/lamps.vhd')) === generateTableHdl(disk, 'vhdl', { source: 'lamps.bool.json' }).code, 'the HDL made again', 8000);
  assert.deepEqual(JSON.parse((await ok('follow_project', { link: editLink, path: TT })).data.text), disk);
  assert.deepEqual((await ok('share_project', { project: 'trafficTt', action: 'status' })).data.warnings, []);
  await ed.close();
  await ok('follow_project', { link: editLink, stop: true });
  await ok('share_project', { project: 'trafficTt', action: 'stop' });
});

test('#3183 the owner writes an editor\'s change atomically (a temp file renamed over it): a reader never sees a text file or a drawing half-written; no temp file left', async () => {
  await ok('new_project_from_example', { name: 'atomicEd', example: 'traffic' });
  const dir = P.projectDir('atomicEd');
  const { data: { editLink } } = await ok('share_project', { project: 'atomicEd', name: 'Ana', server: base, editors: true });
  const ino = (rel) => fs.statSync(path.join(dir, rel)).ino;
  const timer = await P.readFile('atomicEd', 'src/timer.vhd');
  const fsm = JSON.parse(await P.readFile('atomicEd', 'src/traffic.fsm.json'));
  const before = { timer: ino('src/timer.vhd'), fsm: ino('src/traffic.fsm.json') };
  // a reader polling both files the whole time: every text it reads is whole (the old one or the new one)
  let reading = true;
  const seen = [];
  const reader = (async () => { while (reading) { for (const rel of ['src/timer.vhd', 'src/traffic.fsm.json']) seen.push([rel, fs.readFileSync(path.join(dir, rel), 'utf8')]); await new Promise((r) => setImmediate(r)); } })();
  await ok('follow_project', { link: editLink, name: 'Bot', write: { path: 'src/timer.vhd', text: `-- atomic\n${timer}` } });
  fsm.states[0].x += 20;
  await ok('follow_project', { link: editLink, write: { path: 'src/traffic.fsm.json', text: JSON.stringify(fsm) } });
  await until(async () => (await P.readFile('atomicEd', 'src/timer.vhd')).startsWith('-- atomic\n'), 'the text file written', 8000);
  await until(async () => JSON.parse(await P.readFile('atomicEd', 'src/traffic.fsm.json')).states[0].x === fsm.states[0].x, 'the drawing written', 8000);
  reading = false;
  await reader;
  // (renamed over: another file; written in place, as before, the same one)
  assert.notEqual(ino('src/timer.vhd'), before.timer);
  assert.notEqual(ino('src/traffic.fsm.json'), before.fsm);
  for (const [rel, t] of seen) {
    if (rel === 'src/timer.vhd') assert.ok(t === timer || t === `-- atomic\n${timer}`, `a half-written ${rel}: ${t.length} characters`);
    else assert.doesNotThrow(() => JSON.parse(t), `a half-written ${rel}: ${t.length} characters`);
  }
  assert.deepEqual(fs.readdirSync(path.join(dir, 'src')).filter((f) => f.endsWith('.tmp')), []);
  await ok('follow_project', { link: editLink, stop: true });
  await ok('share_project', { project: 'atomicEd', action: 'stop' });
});

test('#3183 an ASM chart edited live: a page renames a state while the MCP client moves a box, both kept; the owner writes it and its HDL; follow_project reads it merged with its Validate', async () => {
  await ok('new_project_from_example', { name: 'blinkyAsm', example: 'blinky' });
  const F = 'src/speed_ctrl.asm.json';
  const { data: { editLink } } = await ok('share_project', { project: 'blinkyAsm', name: 'Ana', server: base, editors: true });
  const l = parseFollowLink(editLink);
  const ed = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, sign: l.sign, user: { name: 'Rui' } });
  await ed.ready;
  const disk0 = normalizeAsm(JSON.parse(await P.readFile('blinkyAsm', F)));
  assert.deepEqual(drawingModel(ed.doc, F).model, disk0);
  const r0 = await ok('follow_project', { link: editLink, name: 'Bot', path: F });
  assert.ok(r0.text.endsWith('\nProcess "Validate" of speed_ctrl.asm.json completed successfully.'), r0.text);
  // at once: Rui renames WAIT_RELEASE (s2) to RELEASE, the MCP client moves IDLE (s1)
  const s2 = structuredClone(disk0); s2.nodes.find((n) => n.id === 's2').name = 'RELEASE';
  putDrawing(ed.doc, F, s2, { base: disk0, client: ed.doc.clientID });
  const s1 = structuredClone(disk0); s1.nodes.find((n) => n.id === 's1').x = 40;
  await ok('follow_project', { link: editLink, write: { path: F, text: JSON.stringify(s1) } });
  const want = (m) => m && m.nodes.find((n) => n.id === 's2').name === 'RELEASE' && m.nodes.find((n) => n.id === 's1').x === 40;
  await until(() => want(drawingModel(ed.doc, F)?.model), 'merged at the page');
  await until(async () => want(JSON.parse(await P.readFile('blinkyAsm', F))), 'the merge on the disk', 8000);
  const disk = JSON.parse(await P.readFile('blinkyAsm', F));
  assert.deepEqual(disk, drawingModel(ed.doc, F).model);
  await until(async () => (await P.readFile('blinkyAsm', 'src/speed_ctrl.vhd')) === generateAsm(disk, 'vhdl', { source: 'speed_ctrl.asm.json' }).code, 'the HDL made again', 8000);
  assert.match(await P.readFile('blinkyAsm', 'src/speed_ctrl.vhd'), /S_RELEASE/);
  assert.deepEqual((await ok('share_project', { project: 'blinkyAsm', action: 'status' })).data.warnings, []);
  await ed.close();
  await ok('follow_project', { link: editLink, stop: true });
  await ok('share_project', { project: 'blinkyAsm', action: 'stop' });
});

test('#3183 a Petri net edited live: a page adds a place while the MCP client adds a transition, both kept; the owner writes it and its HDL; follow_project reads it merged with its Check', async () => {
  await ok('new_project_from_example', { name: 'netPn', example: 'traffic' });
  await ok('new_source', { project: 'netPn', type: 'petri', name: 'ctl', language: 'vhdl' });
  const F = 'src/ctl.pn.json';
  const { data: { editLink } } = await ok('share_project', { project: 'netPn', name: 'Ana', server: base, editors: true });
  const l = parseFollowLink(editLink);
  const ed = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, sign: l.sign, user: { name: 'Rui' } });
  await ed.ready;
  const disk0 = normalizePetri(JSON.parse(await P.readFile('netPn', F)));
  assert.deepEqual(drawingModel(ed.doc, F).model, disk0);
  assert.ok((await ok('follow_project', { link: editLink, name: 'Bot', path: F })).text.includes('\nProcess "Check Petri Net" of ctl.pn.json '));
  // at once: Rui adds a place, the MCP client a transition
  const mine = structuredClone(disk0); mine.places.push({ id: 'p9', name: 'spare', x: 600, y: 140, tokens: 0, capacity: 1, outputs: {} });
  putDrawing(ed.doc, F, mine, { base: disk0, client: ed.doc.clientID });
  const bots = structuredClone(disk0); bots.transitions.push({ id: 't9', name: 'fire', x: 300, y: 300, guard: '', outputs: {} });
  await ok('follow_project', { link: editLink, write: { path: F, text: JSON.stringify(bots) } });
  const want = (m) => m && m.places.some((p) => p.name === 'spare') && m.transitions.some((t) => t.name === 'fire');
  await until(() => want(drawingModel(ed.doc, F)?.model), 'merged at the page');
  await until(async () => want(JSON.parse(await P.readFile('netPn', F))), 'the merge on the disk', 8000);
  const disk = JSON.parse(await P.readFile('netPn', F));
  assert.deepEqual(disk, drawingModel(ed.doc, F).model);
  await until(async () => (await P.readFile('netPn', 'src/ctl.vhd')) === generatePetri(disk, 'vhdl', { source: 'ctl.pn.json' }).code, 'the HDL made again', 8000);
  assert.match(await P.readFile('netPn', 'src/ctl.vhd'), /spare/);
  assert.deepEqual((await ok('share_project', { project: 'netPn', action: 'status' })).data.warnings, []);
  await ed.close();
  await ok('follow_project', { link: editLink, stop: true });
  await ok('share_project', { project: 'netPn', action: 'stop' });
});

test('#3183 a schematic edited live: a page moves a symbol while the MCP client changes the description, both kept; the owner writes it (indented as its editor saves it) and its HDL; follow_project reads it merged', async () => {
  await ok('new_project_from_example', { name: 'gatesSch', example: 'gates' });
  const F = 'src/gates.sch.json';
  const { data: { editLink } } = await ok('share_project', { project: 'gatesSch', name: 'Ana', server: base, editors: true });
  const l = parseFollowLink(editLink);
  const ed = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, sign: l.sign, user: { name: 'Rui' } });
  await ed.ready;
  const disk0 = normalizeDoc(JSON.parse(await P.readFile('gatesSch', F)));
  const C = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
  assert.equal(C(drawingModel(ed.doc, F).model), C(disk0));
  await ok('follow_project', { link: editLink, name: 'Bot', path: F });
  // at once: Rui moves the inverter S5, the MCP client changes the description
  const mine = structuredClone(disk0); mine.symbols.find((x) => x.id === 'S5').x += 40;
  putDrawing(ed.doc, F, mine, { base: disk0, client: ed.doc.clientID });
  const bots = structuredClone(disk0); bots.description = 'merged live';
  await ok('follow_project', { link: editLink, write: { path: F, text: JSON.stringify(bots) } });
  const want = (m) => m && m.symbols.find((x) => x.id === 'S5').x === mine.symbols.find((x) => x.id === 'S5').x && m.description === 'merged live';
  await until(() => want(drawingModel(ed.doc, F)?.model), 'merged at the page');
  await until(async () => want(JSON.parse(await P.readFile('gatesSch', F))), 'the merge on the disk', 8000);
  const text = await P.readFile('gatesSch', F);
  assert.equal(C(JSON.parse(text)), C(drawingModel(ed.doc, F).model));
  assert.equal(text, JSON.stringify(drawingModel(ed.doc, F).model, null, 1), 'indented by one space, as the schematic editor saves it');
  await until(async () => (await P.readFile('gatesSch', 'src/gates.vhd')) === generateHdl(JSON.parse(text), { lang: 'vhdl' }).code, 'the HDL made again', 8000);
  assert.match(await P.readFile('gatesSch', 'src/gates.vhd'), /^-- merged live$/m);
  assert.deepEqual((await ok('share_project', { project: 'gatesSch', action: 'status' })).data.warnings, []);
  await ed.close();
  await ok('follow_project', { link: editLink, stop: true });
  await ok('share_project', { project: 'gatesSch', action: 'stop' });
});

test('#3227 through a relay on another computer: share_project with its key; follow_project of a site\'s link that names the relay', async () => {
  await ok('new_project_from_example', { name: 'gatesRelay', example: 'gates' });
  // (the key given, not the token file of this computer: here this server's token, as a relay's key opens a room the same way)
  const { data: { link } } = await ok('share_project', { project: 'gatesRelay', name: 'Ana', server: base, key: 'tok-mcp' });
  const l = parseFollowLink(link);
  // the browser edition's link: the site's address, the relay's in it
  const site = followLink('https://site.example/', l.room, l.key, 'relay', null, base);
  const f = await ok('follow_project', { link: site, name: 'Bot' });
  assert.equal(f.data.project, 'gatesRelay');
  assert.equal(f.data.owner, 'Ana');
  await ok('follow_project', { link: site, stop: true });
  await ok('share_project', { project: 'gatesRelay', action: 'stop' });
  // (a wrong key: refused, the relay's own message)
  await fails('share_project', { project: 'gatesRelay', server: base, key: 'not-the-key' }, `cannot share through ${base}: sharing a project needs this Silinx server's token (is Silinx running there? silinx serve)`);
});

test('the server\'s token goes only to its own server: another host (a key needed), a loopback port whose server does not hold it', async () => {
  const http = await import('node:http');
  const { tokenFile } = await import('../server/server.js');
  const port = srv.address().port;
  const another = at => `server: ${at} is not a Silinx server on this computer: sharing through another computer's relay needs that relay's key (key); this computer's server token is sent only to its own server`;
  // a WebSocket that records where it would connect, and with what (the token rides in its subprotocols)
  const seen = [];
  const prev = globalThis.WebSocket;
  globalThis.WebSocket = class {
    constructor(url, protocols) { seen.push({ url, protocols }); this.readyState = 0; this.on = {}; setTimeout(() => { this.readyState = 3; for (const t of ['error', 'close']) for (const f of this.on[t] || []) f({ code: 1006, reason: '' }); }, 0); }
    addEventListener(type, f) { (this.on[type] ||= []).push(f); }
    removeEventListener() {}
    send() {}
    close() {}
  };
  // (another computer's relays, named in the user's settings: #3363 refuses any other)
  const cfgFile = path.join(process.env.SILINX_CONFIG_DIR, 'config.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ relay: { relays: [`http://relay.example:${port}`, `http://[::2]:${port}`] } }));
  try {
    // another host, at the port of this computer's server: no token, a key needed
    const evil = `http://relay.example:${port}`;
    await fails('share_project', { project: 'traffic', server: evil }, another(evil));
    await fails('share_project', { project: 'traffic', server: `http://[::2]:${port}` }, another(`http://[::2]:${port}`));
    assert.deepEqual(seen, []);
    // with the relay's key: that key, never the token
    const r = await call('share_project', { project: 'traffic', server: evil, key: 'relay-key' });
    assert.equal(r.isError, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, `ws://relay.example:${port}/api/collab/share`);
    assert.ok(seen[0].protocols.includes('token.relay-key'), String(seen[0].protocols));
    assert.ok(!seen[0].protocols.some(p => p.includes('tok-mcp')), String(seen[0].protocols));
  } finally { globalThis.WebSocket = prev; fs.rmSync(cfgFile, { force: true }); }
  // a loopback port whose server is another program (the token file left by a server that stopped): not sent
  const upgrades = [];
  const other = http.createServer((req, res) => { res.writeHead(404); res.end(); });
  other.on('upgrade', (req, socket) => { upgrades.push(req.headers['sec-websocket-protocol'] || ''); socket.destroy(); });
  await new Promise(r => other.listen(0, '127.0.0.1', r));
  const otherPort = other.address().port;
  fs.writeFileSync(tokenFile(otherPort), 'tok-stale');
  try {
    for (const host of ['127.0.0.1', 'localhost']) {
      const at = `http://${host}:${otherPort}`;
      await fails('share_project', { project: 'traffic', server: at }, `server: the server at ${at} is not the Silinx server whose token this computer keeps for port ${otherPort} (another program, or one started since): not shared; start Silinx again (silinx serve)`);
    }
    assert.deepEqual(upgrades, []);
  } finally {
    fs.rmSync(tokenFile(otherPort), { force: true });
    other.closeAllConnections?.();
    await new Promise(r => other.close(r));
  }
  // this computer's own server, by its loopback address: shared with its token
  await ok('share_project', { project: 'traffic', server: base });
  await ok('share_project', { project: 'traffic', action: 'stop' });
});

test('#3363 share_project and follow_project reach this computer\'s server or a relay the user\'s settings name, nothing else', async () => {
  const NOT = (what, at) => `${what}: ${at} is neither a Silinx server on this computer nor a relay the user's settings name (relay.relays in config.json): the MCP server shares and follows through those only`;
  // (a WebSocket that records where it would connect: none for a refused host)
  const seen = [];
  const prev = globalThis.WebSocket;
  globalThis.WebSocket = class { constructor(url) { seen.push(url); throw new Error('not here'); } };
  try {
    for (const at of ['https://relay.example', 'http://192.0.2.7:8642', 'http://[2001:db8::7]']) {
      await fails('share_project', { project: 'traffic', server: at, key: 'a-relay-key-of-someone-0123456789' }, NOT('server', at));
      // a link to follow: the relay it names, or the site it is on
      await fails('follow_project', { link: followLink(`${at}/`, 'R'.repeat(22), 'K'.repeat(43)) }, NOT('link', at));
      await fails('follow_project', { link: followLink(`${base}/`, 'R'.repeat(22), 'K'.repeat(43), 'relay', null, at) }, NOT('link', at));
    }
    assert.deepEqual(seen, []);
  } finally { globalThis.WebSocket = prev; }
});

test('#3361 follow_project: a file the import gate refuses is not given, its reason said; a room past a follower\'s caps is left', async () => {
  const { shareRoom } = await import('../core/collab-client.js');
  const { projectDoc, publishProject } = await import('../core/collab-doc.js');
  const plant = (doc, p, text) => { const yt = new Y.Text(); yt.insert(0, text); doc.getMap('files').set(p, yt); };
  // a hostile owner: a web page under a source's name, a NUL byte
  const doc = projectDoc();
  publishProject(doc, { project: { name: 'h', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], fileTree: ['src/top.vhd'] }, files: { 'src/top.vhd': 'entity top is end;\n' }, owner: 'Eve' });
  plant(doc, 'src/page.vhd', '<html><body>x</body></html>');
  plant(doc, 'src/zero.vhd', 'a\0b');
  const owner = await shareRoom({ url: relayUrl(base, 'share'), token: 'tok-mcp', doc, user: { name: 'Eve' } });
  const link = followLink(`${base}/`, owner.room, owner.key);
  const f = await ok('follow_project', { link, name: 'Bot' });
  assert.deepEqual(f.data.files, ['src/page.vhd', 'src/top.vhd', 'src/zero.vhd']);
  assert.equal((await ok('follow_project', { link, path: 'src/top.vhd' })).data.text, 'entity top is end;\n');
  await fails('follow_project', { link, path: 'src/page.vhd' }, 'src/page.vhd: not shown: a web page (HTML), not the file its name says');
  await fails('follow_project', { link, path: 'src/zero.vhd' }, 'src/zero.vhd: not shown: binary content (a NUL byte) in a text file');
  await ok('follow_project', { link, stop: true });
  // past the files a follower takes: refused
  doc.transact(() => { for (let i = 0; i < 5000; i++) plant(doc, `src/f${i}.v`, ''); });
  // (the change on its way first: a follower joining while it is sealed would get it before the whole project, its
  // 5000 files alone within the caps)
  await owner.flush();
  await fails('follow_project', { link }, 'cannot follow: the shared project has more files than a follower takes (5003, at most 5000)');
  await owner.close();
});

test('#3527 regression: follow_project leaves a room whose owner sends a part of no shared project; share_project refuses an editor\'s change of another part than the files and the drawings, said in its status', async () => {
  const { shareRoom } = await import('../core/collab-client.js');
  const { projectDoc, publishProject } = await import('../core/collab-doc.js');
  // a hostile owner: a root of its own
  const doc = projectDoc();
  publishProject(doc, { project: { name: 'h', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], fileTree: ['src/top.vhd'] }, files: { 'src/top.vhd': 'entity top is end;\n' }, owner: 'Eve' });
  doc.getMap('evil').set('k', 'x'.repeat(1000));
  const owner = await shareRoom({ url: relayUrl(base, 'share'), token: 'tok-mcp', doc, user: { name: 'Eve' } });
  await fails('follow_project', { link: followLink(`${base}/`, owner.room, owner.key) }, 'cannot follow: the shared project holds a part that no shared project has ("evil")');
  await owner.close();
  // an editor's change of the project's settings: refused by the MCP's share, said in its status, applied nowhere
  await P.createProject({ name: 'rootsEd', template: 'traffic' });
  const { data: { link, editLink } } = await ok('share_project', { project: 'rootsEd', name: 'Ana', server: base, editors: true });
  const l = parseFollowLink(editLink);
  const ed = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, sign: l.sign, user: { name: 'Rui' } });
  await ed.ready;
  ed.doc.getMap('project').set('json', '{"name":"hacked"}');
  await until(async () => (await ok('share_project', { project: 'rootsEd', action: 'status' })).data.warnings.length, 'the refusal said');
  const st = await ok('share_project', { project: 'rootsEd', action: 'status' });
  assert.deepEqual(st.data.warnings, ['an editor\'s change was refused: it changes a part of the document that an editor does not ("project")']);
  assert.ok(st.text.endsWith('\nWARNING: an editor\'s change was refused: it changes a part of the document that an editor does not ("project")'), st.text);
  const f = await ok('follow_project', { link, name: 'Bot' });
  assert.equal(f.data.project, 'rootsEd');
  await ed.close();
  await ok('follow_project', { link, stop: true });
  await ok('share_project', { project: 'rootsEd', action: 'stop' });
});

test('#3835 follow_project: its connection lost is made again; meanwhile connected: false, said, a write merged and sent once it is back', async () => {
  await ok('new_project_from_example', { name: 'trafficRc', example: 'traffic' });
  const { data: { editLink } } = await ok('share_project', { project: 'trafficRc', name: 'Ana', server: base, editors: true });
  // (the MCP's sockets, as this test sees them; `down`: a new one fails, as a network gone)
  const Base = globalThis.WebSocket, socks = [];
  let down = false;
  globalThis.WebSocket = class FlakyWebSocket extends Base { constructor(...a) { super(...a); socks.push(this); if (down) this.close(); } };
  try {
    const f = await ok('follow_project', { link: editLink, name: 'Bot' });
    assert.equal(f.data.connected, true);
    assert.ok(!f.text.includes('reconnecting'), f.text);
    down = true;
    socks.at(-1).close();
    const off = await until(async () => { const r = await ok('follow_project', { link: editLink }); return r.data.connected ? null : r; }, 'the loss seen');
    assert.equal(off.data.following, true);
    assert.ok(off.text.includes('\nThe connection to the relay was lost: reconnecting (what this shows is as it was then).'), off.text);
    const timer = await P.readFile('trafficRc', 'src/timer.vhd');
    const w = await ok('follow_project', { link: editLink, write: { path: 'src/timer.vhd', text: `-- offline\n${timer}` } });
    assert.ok(w.text.includes('Wrote src/timer.vhd (merged as this participant\'s edit, sent once the connection is back).'), w.text);
    down = false;
    await until(async () => (await ok('follow_project', { link: editLink })).data.connected, 'back', 10_000);
    await until(async () => (await P.readFile('trafficRc', 'src/timer.vhd')) === `-- offline\n${timer}`, 'the write on the disk', 8000);
    assert.ok(socks.length >= 2);
    // (the owner sees Bot again, and nothing refused: no warning)
    const st = await until(async () => { const r = await ok('share_project', { project: 'trafficRc', action: 'status' }); return r.data.followers.length ? r : null; }, 'Bot in the status again');
    assert.deepEqual(st.data.followers.map(p => p.name), ['Bot']);
    assert.deepEqual(st.data.warnings, []);
  } finally { globalThis.WebSocket = Base; }
  await ok('follow_project', { link: editLink, stop: true });
  await ok('share_project', { project: 'trafficRc', action: 'stop' });
});
