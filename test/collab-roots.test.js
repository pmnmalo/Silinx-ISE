// What a Yjs update of a shared project changes, read before it is applied (#3527, core/collab-roots.js): the roots its
// insertions and deletions reach (a root's first child, a nested type, a neighbour in the document or earlier in the
// update), what it builds on that the document does not have; checked against the roots that applying it to a copy
// changes (Yjs's own transaction); collab-doc's updateOutside and editOutside, their messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { updateRoots } from '../core/collab-roots.js';
import { projectDoc, publishProject, updateOutside, editOutside, docMeter, DOC_ROOTS, EDIT_ROOTS } from '../core/collab-doc.js';

const owned = () => {
  const doc = projectDoc();
  publishProject(doc, { project: { name: 'p', top: 'top', fileTree: ['src/top.vhd'] }, files: { 'src/top.vhd': 'entity top is end;\n' }, owner: 'Ana' });
  doc.getMap('drawings').set('src/a.sch.json', new Y.Map([['objects', new Y.Map([['w1', 'wire']])]]));
  return doc;
};
// an editor's copy of `doc`, its changes by `change`: each update it makes
const updatesOf = (doc, change) => {
  const e = new Y.Doc();
  Y.applyUpdate(e, Y.encodeStateAsUpdate(doc));
  const us = [];
  e.on('update', u => us.push(u));
  change(e);
  return us;
};
// the reference: the roots a copy of `doc` sees changed when the update is applied (Yjs's transaction)
const applied = (doc, u) => {
  const c = new Y.Doc();
  Y.applyUpdate(c, Y.encodeStateAsUpdate(doc));
  const roots = new Set();
  c.on('afterTransaction', tr => {
    for (const t of tr.changed.keys()) { let r = t; while (r._item) r = r._item.parent; roots.add(Y.findRootTypeKey(r)); }
    for (const t of tr.changedParentTypes.keys()) { let r = t; while (r._item) r = r._item.parent; roots.add(Y.findRootTypeKey(r)); }
  });
  Y.applyUpdate(c, u);
  return roots;
};

const CHANGES = {
  'a root of its own': d => d.getMap('evil').set('k', 'v'),
  'a root of its own, nested': d => d.getMap('evil').set('m', new Y.Map([['k', new Y.Text('t')]])),
  'a text of the files': d => d.getMap('files').get('src/top.vhd').insert(0, '-- a\n'),
  'a text of the files, deleted from': d => d.getMap('files').get('src/top.vhd').delete(0, 6),
  'a file added': d => d.getMap('files').set('src/b.vhd', new Y.Text('b')),
  'a file removed': d => d.getMap('files').delete('src/top.vhd'),
  'a drawing\'s object': d => d.getMap('drawings').get('src/a.sch.json').get('objects').set('w2', 'wire'),
  'a drawing\'s object replaced': d => d.getMap('drawings').get('src/a.sch.json').get('objects').set('w1', 'net'),
  'the project\'s settings': d => d.getMap('project').set('json', '{}'),
  'the meta, a value replaced': d => d.getMap('meta').set('owner', 'Eve'),
  'the meta, a value deleted': d => d.getMap('meta').delete('version'),
  'the files and the meta at once': d => d.transact(() => { d.getMap('files').get('src/top.vhd').insert(0, 'x'); d.getMap('meta').set('owner', 'Eve'); }),
};

test('#3527 updateRoots: the roots an update reaches, as applying it says', () => {
  const doc = owned();
  for (const [what, change] of Object.entries(CHANGES)) {
    const us = updatesOf(doc, change);
    assert.equal(us.length, 1, what);
    const r = updateRoots(doc, us[0]);
    assert.deepEqual([[...r.roots].sort(), r.unknown], [[...applied(doc, us[0])].sort(), false], what);
  }
  // (insertions that refer to one another in one update: a text typed in a new file, a map in a new root)
  const us = updatesOf(doc, d => d.transact(() => { const t = new Y.Text(); d.getMap('evil').set('t', t); t.insert(0, 'a'); t.insert(1, 'b'); }));
  assert.deepEqual([...updateRoots(doc, us[0]).roots], ['evil']);
});

test('#3527 updateRoots: what it builds on that the document does not have; an update that does not decode', () => {
  const doc = owned();
  // (an editor's second change after a first the document never had: a gap in its client's changes)
  const [first, second] = updatesOf(doc, d => { d.getMap('evil').set('k', 'v'); d.getMap('files').get('src/top.vhd').insert(0, 'x'); });
  assert.deepEqual([[...updateRoots(doc, second).roots], updateRoots(doc, second).unknown], [['files'], true]);
  assert.equal(updateRoots(doc, first).unknown, false);
  // (an item it refers to that the document does not have: another document's)
  const other = new Y.Doc();
  other.getMap('files').set('src/x.vhd', new Y.Text('x'));
  const later = updatesOf(other, d => d.getMap('files').get('src/x.vhd').insert(1, 'y'))[0];
  assert.equal(updateRoots(doc, later).unknown, true);
  assert.equal(updateRoots(doc, Uint8Array.from([9, 9, 9])), null);
  // (an empty update: nothing)
  assert.deepEqual(updateRoots(doc, Y.encodeStateAsUpdate(new Y.Doc())), { roots: new Set(), unknown: false });
});

test('#3527 updateOutside (an owner\'s update at a follower\'s) and editOutside (an editor\'s edit at the owner\'s): their messages', () => {
  const doc = owned();
  assert.deepEqual(DOC_ROOTS, ['meta', 'project', 'files', 'drawings']);
  assert.deepEqual(EDIT_ROOTS, ['files', 'drawings']);
  const one = change => updatesOf(doc, change)[0];
  assert.equal(updateOutside(doc, one(CHANGES['a root of its own'])), 'the shared project holds a part that no shared project has ("evil")');
  assert.equal(updateOutside(doc, one(CHANGES['the meta, a value replaced'])), null);
  assert.equal(updateOutside(doc, one(d => d.getMap(`x${'y'.repeat(100)}`).set('k', 1))), `the shared project holds a part that no shared project has ("x${'y'.repeat(63)}")`);
  assert.equal(updateOutside(doc, Uint8Array.from([9, 9, 9])), 'an update of the shared project that does not decode');
  for (const w of ['a text of the files', 'a text of the files, deleted from', 'a file added', 'a file removed', 'a drawing\'s object', 'a drawing\'s object replaced']) assert.equal(editOutside(doc, one(CHANGES[w])), null, w);
  assert.equal(editOutside(doc, one(CHANGES['a root of its own'])), 'it changes a part of the document that an editor does not ("evil")');
  assert.equal(editOutside(doc, one(CHANGES['the project\'s settings'])), 'it changes a part of the document that an editor does not ("project")');
  assert.equal(editOutside(doc, one(CHANGES['the meta, a value deleted'])), 'it changes a part of the document that an editor does not ("meta")');
  assert.equal(editOutside(doc, one(CHANGES['the files and the meta at once'])), 'it changes a part of the document that an editor does not ("meta")');
  const [, second] = updatesOf(doc, d => { d.getMap('evil').set('k', 'v'); d.getMap('files').get('src/top.vhd').insert(0, 'x'); });
  assert.equal(editOutside(doc, second), 'it builds on changes the owner does not have');
  assert.equal(editOutside(doc, Uint8Array.from([9, 9, 9])), 'it is not an update of the document');
});

test('#3527 docMeter: the document\'s bytes (its own changes and what it received), against its encoded size; the message past a maximum', () => {
  const doc = owned();
  const m = docMeter(doc);
  const size = () => Y.encodeStateAsUpdate(doc).length;
  assert.equal(m.over(size()), null);
  assert.equal(m.over(size() - 1), `the shared project is larger than a follower takes (${Math.ceil(size() / 1024)} KB, at most ${Math.ceil((size() - 1) / 1024)} KB)`);
  // (its own change counted: past the maximum, measured again)
  doc.getMap('meta').set('junk', 'x'.repeat(3000));
  assert.equal(m.over(4096), null);
  assert.equal(m.over(4096, 2000), `the shared project is larger than a follower takes (${Math.ceil((size() + 2000) / 1024)} KB, at most 4 KB)`);
  // (what was received, applied or waiting: counted; a deletion measured as what it leaves)
  const other = new Y.Doc();
  other.getMap('files').set('src/x.vhd', new Y.Text('y'.repeat(2000)));
  const later = updatesOf(other, d => d.getMap('files').get('src/x.vhd').insert(0, 'z'.repeat(2000)))[0];
  Y.applyUpdate(doc, later, 'remote');
  m.add(later.length);
  assert.ok(size() > 5000, 'the waiting update in the encoded size');
  assert.match(m.over(5000), /^the shared project is larger than a follower takes \(\d+ KB, at most 5 KB\)$/);
  m.stop();
});
