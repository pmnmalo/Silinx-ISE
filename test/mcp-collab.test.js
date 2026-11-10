// The MCP server's tools of a shared project (#3181, server/mcp-collab.js, #2674): share_project shares a project of
// the workspace through a running Silinx server's relay (its token from the configuration folder), follow_project
// follows its link read only; two participants in one test, the MCP's share followed by a page's code (core/collab-
// client.js) and the MCP's follow of it; a change on disk arriving; the status with its follower; stop; the errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { followRoom } from '../core/collab-client.js';
import { docFile, docProject } from '../core/collab-doc.js';
import { parseFollowLink, relayUrl } from '../core/collab-link.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 5000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(25); } };

let tmp, srv, base;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-collab-'));
  const { createApp, tokenFile } = await import('../server/server.js');
  const app = await createApp({ host: '127.0.0.1', token: 'tok-mcp' });
  srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  // (as startServer writes it: the MCP server finds the token of the server on this computer)
  fs.mkdirSync(path.dirname(tokenFile(srv.address().port)), { recursive: true });
  fs.writeFileSync(tokenFile(srv.address().port), 'tok-mcp');
});
after(async () => {
  await (await import('../server/mcp-collab.js')).endCollab();
  srv?.closeAllConnections?.();
  await new Promise(r => srv.close(r));
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
  assert.equal(byName.follow_project.annotations.readOnlyHint, true);
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
  assert.equal(f.text, `Following Ana's project 'blinky' (read only).\nFiles: ${files.join(', ')}\nIn it:\nAna (owner)`);
  const path0 = files.find(x => x.endsWith('.ucf'));
  const t = await ok('follow_project', { link, path: path0 });
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

test('the errors: a project not shared, a bad action, no project, a bad server, no server there, a broken link', async () => {
  await fails('share_project', { project: 'traffic', action: 'stop' }, '\'traffic\' is not shared');
  await fails('share_project', { project: 'traffic', action: 'pause' }, 'action: start, status or stop');
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
  await fails('follow_project', { link: 'http://x/#design=abc' }, 'link: a link to follow (http(s)://…/#follow=…)');
  await fails('follow_project', { link: `#follow=${'a'.repeat(22)}.${'b'.repeat(43)}` }, 'link: a link to follow (http(s)://…/#follow=…)');
});
