// Shared projects, phase 2 (#3182): an editor, whose link signs its changes (core/collab-sign.js), on the relay of
// Silinx's own server and on a room the owner's page hosts (core/collab-loop.js): an editor's change of a text file
// (core/collab-doc.js editFile, in parts) reaches the owner and the followers, the same text everywhere; a follower's
// edit, or one signed with another room's key, refused and applied nowhere; the signature itself (a frame or its room
// changed: not the room's); the files an editor may change.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { scratchEnv } from './server-helpers.js';
import { newSigner, signerOf, verifierOf, signFrame, verifyFrame, pubOf, SIGN_RE, PUB_RE } from '../core/collab-sign.js';
import { newKey, seal } from '../core/collab-crypto.js';
import { shareRoom, followRoom, KIND } from '../core/collab-client.js';
import { projectDoc, publishProject, editFile, editablePath, docFile, FILE_MAX } from '../core/collab-doc.js';
import { relayUrl, followLink, parseFollowLink } from '../core/collab-link.js';
import { hostedRooms, socketPair } from '../core/collab-loop.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 4000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(10); } };
const PROJECT = { name: 'traffic', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], device: { part: 'xc3s250e' } };
const FILES = { 'src/top.vhd': 'entity top is end;\n', 'src/top.ucf': 'NET "clk" LOC = "B8";\n', 'src/top.fsm.json': '{"states":[]}\n' };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { ...PROJECT, fileTree: Object.keys(FILES) }, files: FILES, owner: 'Ana' }); return doc; };

let tmp, srv, base;
const live = [];
const keep = p => { live.push(p); return p; };
before(async () => {
  tmp = await scratchEnv('silinx-collab-edit-');
  const { createApp } = await import('../server/server.js');
  const app = await createApp({ host: '127.0.0.1', token: 'the-token' });
  srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}/`;
});
after(async () => {
  for (const p of live) await p.close().catch(() => {});
  srv?.closeAllConnections?.(); await new Promise(r => srv.close(r));
  const fs = await import('node:fs'); fs.rmSync(tmp, { recursive: true, force: true });
});

test('the signature: a signed frame checks with its room\'s key only; a frame, a room or a signature changed does not', async () => {
  const s = await newSigner();
  assert.match(s.text, SIGN_RE);
  assert.match(s.pub, PUB_RE);
  assert.equal(pubOf(s.text), s.pub);
  assert.equal(pubOf('short'), null);
  const v = await verifierOf(s.pub);
  const { key } = await newKey();
  const frame = await seal(key, 'R'.repeat(22), KIND.edit, Uint8Array.from([1, 2, 3]));
  const signed = await signFrame(await signerOf(s.text), 'R'.repeat(22), frame);
  assert.equal(signed.length, frame.length + 64);
  assert.deepEqual(await verifyFrame(v, 'R'.repeat(22), signed), frame);
  assert.equal(await verifyFrame(v, 'S'.repeat(22), signed), null, 'another room');
  const bad = signed.slice(); bad[5] ^= 1;
  assert.equal(await verifyFrame(v, 'R'.repeat(22), bad), null, 'the frame changed');
  const badSig = signed.slice(); badSig[badSig.length - 1] ^= 1;
  assert.equal(await verifyFrame(v, 'R'.repeat(22), badSig), null, 'the signature changed');
  assert.equal(await verifyFrame(await verifierOf((await newSigner()).pub), 'R'.repeat(22), signed), null, 'another room\'s key');
  assert.equal(await verifyFrame(v, 'R'.repeat(22), new Uint8Array(10)), null, 'too short');
  await assert.rejects(signerOf('x'.repeat(10)), /the editor link's key is not valid/);
  await assert.rejects(verifierOf('A'.repeat(86)), /the room's editors' key is not valid/);
});

test('an editor\'s link: the signing key after the room\'s key, through a relay or the owner\'s page; a link broken refused', async () => {
  const s = await newSigner(), room = 'R'.repeat(22), key = 'K'.repeat(43);
  for (const via of ['relay', 'host']) {
    const l = followLink('https://silinx.example.org/', room, key, via, s.text);
    assert.equal(l, `https://silinx.example.org/#edit=${room}.${key}.${s.text}${via === 'host' ? '.host' : ''}`);
    assert.deepEqual(parseFollowLink(l), { base: 'https://silinx.example.org/', room, key, via, sign: s.text, host: null });
  }
  for (const bad of [`#edit=${room}.${key}`, `#edit=${room}.${key}.host`, `#follow=${room}.${key}.${s.text}`, `#edit=${room}.${key}.${s.text.slice(1)}`]) assert.throws(() => parseFollowLink(bad), /the link to follow is broken/, bad);
  assert.throws(() => followLink('http://x/', room, key, 'relay', 'short'), /not an editor's key/);
});

test('editFile: an editable file\'s text, in parts (no pair of surrogates split); a drawing, a new file, too large: refused', () => {
  const doc = owned();
  assert.equal(editablePath('src/top.vhd') && editablePath('src/top.ucf') && editablePath('notes.md'), true);
  assert.equal(editablePath('src/top.fsm.json') || editablePath('silinx.json') || editablePath('build/top.v') || editablePath('../x.vhd'), false);
  const updates = [];
  doc.on('update', u => updates.push(u.length));
  const text = `-- ${'😀a'.repeat(5000)}\n${FILES['src/top.vhd']}`;
  assert.equal(editFile(doc, 'src/top.vhd', text, { part: 1000 }), true);
  assert.equal(docFile(doc, 'src/top.vhd'), text);
  assert.ok(updates.length >= 15 && Math.max(...updates) < 8000, `${updates.length} updates, ${Math.max(...updates)} bytes at most`);
  assert.equal(editFile(doc, 'src/top.vhd', text), false, 'the same text: nothing');
  // (a change in the middle: what differs only)
  updates.length = 0;
  editFile(doc, 'src/top.vhd', text.replace('entity top', 'entity top2'));
  assert.equal(docFile(doc, 'src/top.vhd'), text.replace('entity top', 'entity top2'));
  assert.ok(updates.length <= 2 && Math.max(...updates) < 200);
  assert.throws(() => editFile(doc, 'src/top.fsm.json', '{}'), /src\/top\.fsm\.json: not a text file of the project that an editor can change/);
  assert.throws(() => editFile(doc, 'src/new.vhd', 'x'), /src\/new\.vhd: not a text file of the project that an editor can change/);
  assert.throws(() => editFile(doc, 'src/top.vhd', 'x'.repeat(FILE_MAX + 1)), /too large to share \(1 MB at most\)/);
});

// an owner with editors, an editor, a follower and a pretender (a follower's link, edits forged), on a transport
async function scene(open, join) {
  const doc = owned();
  const owner = keep(await open({ doc, user: { name: 'Ana' }, editors: true }));
  assert.match(owner.editKey, SIGN_RE);
  const errors = { ed: [], fol: [], pre: [] };
  const on = k => e => { if (e.type === 'error') errors[k].push(e.message); };
  const ed = keep(await join({ room: owner.room, key: owner.key, sign: owner.editKey, user: { name: 'Rui' }, onEvent: on('ed') }));
  const fol = keep(await join({ room: owner.room, key: owner.key, user: { name: 'Eva' }, onEvent: on('fol') }));
  // (a pretender: the room's key, and the editor key of another room)
  const pre = keep(await join({ room: owner.room, key: owner.key, sign: (await newSigner()).text, user: { name: 'Bo' }, onEvent: on('pre') }));
  await Promise.all([ed.ready, fol.ready, pre.ready]);
  assert.equal(ed.editor, true);
  assert.equal(fol.editor, false);
  return { doc, owner, ed, fol, pre, errors };
}
async function edits(t) {
  const { doc, owner, ed, fol, pre, errors } = t;
  // the editor's change: at the owner's and the follower's, the same text
  editFile(ed.doc, 'src/top.vhd', 'entity top is\nend entity;\n');
  await until(() => docFile(doc, 'src/top.vhd') === 'entity top is\nend entity;\n', 'the edit at the owner\'s');
  await until(() => docFile(fol.doc, 'src/top.vhd') === 'entity top is\nend entity;\n', 'the edit at the follower\'s');
  // the owner's change after it: at the editor's
  editFile(doc, 'src/top.ucf', 'NET "clk" LOC = "C8";\n');
  await until(() => docFile(ed.doc, 'src/top.ucf') === 'NET "clk" LOC = "C8";\n', 'the owner\'s change at the editor\'s');
  // a large change, in parts: every part through (no frame past a follower's maximum)
  const big = `${'-- a line of a large file\n'.repeat(8000)}entity top is\nend entity;\n`;
  editFile(ed.doc, 'src/top.vhd', big);
  await until(() => docFile(fol.doc, 'src/top.vhd') === big && docFile(doc, 'src/top.vhd') === big, 'the large edit at the follower\'s and the owner\'s', 8000);
  assert.equal(ed.closed(), false);
  // the presence: the editor as an editor
  await until(() => owner.peers().length === 3, 'all in');
  assert.deepEqual(owner.peers().map(p => [p.name, p.role]), [['Bo', 'editor'], ['Eva', 'follower'], ['Rui', 'editor']]);   // (as they say)
  // a follower's own update (its link reads only): refused, applied nowhere
  const forged = new Y.Doc();
  Y.applyUpdate(forged, Y.encodeStateAsUpdate(fol.doc));
  const sv = Y.encodeStateVector(forged);
  forged.getMap('files').get('src/top.vhd').insert(0, '-- hacked\n');
  const u = Y.encodeStateAsUpdate(forged, sv);
  await fol.send(KIND.update, u);
  await until(() => errors.fol.length === 1, 'the update refused');
  assert.deepEqual(errors.fol, ['read only: a follower cannot change the shared project']);
  // an edit not signed, and one signed with another room's key: refused by the room, applied nowhere
  await fol.send(KIND.edit, u);
  await until(() => errors.fol.length === 2, 'the unsigned edit refused');
  editFile(pre.doc, 'src/top.vhd', '-- hacked\n');
  await until(() => errors.pre.length, 'the edit of another key refused');
  const NOT = 'read only: this link cannot change the shared project (not an editor\'s)';
  assert.deepEqual([errors.fol[1], ...new Set(errors.pre)], [NOT, NOT]);   // (each of the pretender's updates: its deletion, its insertion)
  await sleep(50);
  for (const [who, d] of [['owner', doc], ['editor', ed.doc], ['follower', fol.doc]]) assert.ok(docFile(d, 'src/top.vhd') === big, `never applied (${who}'s: ${JSON.stringify(docFile(d, 'src/top.vhd').slice(0, 30))}, ${docFile(d, 'src/top.vhd').length} for ${big.length})`);
  assert.deepEqual(errors.ed, []);
  await owner.close();
  await until(() => ed.closed() && fol.closed(), 'the room ended');
}

test('an editor on the server\'s relay: its changes reach everyone, the same text; a follower\'s and a pretender\'s refused', async () => {
  const t = await scene(
    o => shareRoom({ url: relayUrl(base, 'share'), token: 'the-token', ...o }),
    o => followRoom({ url: relayUrl(base, 'follow'), ...o }));
  await edits(t);
});

test('an editor in a room the owner\'s page hosts: the same', async () => {
  const h = hostedRooms();
  const t = await scene(
    o => shareRoom({ url: 'silinx-host:', WebSocket: h.owner, ...o }),
    o => followRoom({ url: 'silinx-host:', WebSocket: function S() { const { client, room } = socketPair(); h.follower(room); return client; }, ...o }));
  await edits(t);
});
