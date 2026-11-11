// Shared projects, phase 3 (#3183): a drawing as a Yjs structure of its own (core/collab-model.js), the FSM first. Two
// participants' documents, their updates exchanged as the relay would: the same drawing on both sides; concurrent edits
// of different fields of one object both kept, of one field the same value on both; an object deleted while another
// connected it: the connection left out (said: dropped) and pruned; two states added at once with the same id both kept
// (their ids made each one's own, the references with them); an edit of a deleted object leaves it deleted; the order of
// the objects kept (the encoding's); each one's undo (Y.UndoManager on the local origin) undoes their own changes only;
// the owner's files read again (syncDrawings) keep what the participants changed since; the generated HDL identical on
// both sides, compiled and simulated in VHDL and in Verilog against the diagram's own simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { putDrawing, drawingModel, pruneDrawing, syncDrawings, drawingPathsOf, drawingKind, drawingObjects, dropDrawing, DRAWING_OBJECTS_MAX } from '../core/collab-model.js';
import { projectDoc, publishProject, docTooLarge, FOLLOW_LIMITS } from '../core/collab-doc.js';
import { newFsm, normalizeFsm, generateFsm, validateFsm } from '../core/fsm.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

const P = 'src/det.fsm.json';
// two participants' documents, each one's updates sent to the other at once (as the relay does), or held (offline)
function pair() {
  const a = new Y.Doc(), b = new Y.Doc();
  let held = false;
  const queue = [];
  const send = (to) => (u, origin) => { if (origin === 'remote') return; if (held) queue.push([to, u]); else Y.applyUpdate(to, u, 'remote'); };
  a.on('update', send(b));
  b.on('update', send(a));
  return { a, b, hold: () => { held = true; }, release: () => { held = false; for (const [to, u] of queue.splice(0)) Y.applyUpdate(to, u, 'remote'); } };
}
const model = (doc) => drawingModel(doc, P).model;
const mut = (doc, fn) => { const m = structuredClone(model(doc)); fn(m); return m; };

test('drawingKind: the FSM\'s diagrams (others: not yet, #3183\'s order)', () => {
  assert.equal(drawingKind('src/a.fsm.json'), 'fsm');
  assert.equal(drawingKind('src/A.FSM.JSON'), 'fsm');
  for (const p of ['src/a.asm.json', 'src/a.tt.json', 'src/a.sch.json', 'src/a.pn.json', 'src/a.vhd', 'src/fsm.json']) assert.equal(drawingKind(p), null, p);
  assert.throws(() => putDrawing(new Y.Doc(), 'src/a.vhd', {}), /src\/a\.vhd: not a drawing that is edited live/);
});

test('a drawing put and read back: the same model, normalized; its order kept; nothing put twice', () => {
  const doc = new Y.Doc();
  const m = newFsm('det');
  putDrawing(doc, P, m);
  assert.deepEqual(model(doc), normalizeFsm(m));
  assert.deepEqual(drawingModel(doc, P).dropped, []);
  assert.equal(drawingModel(doc, 'src/none.fsm.json'), null);
  assert.equal(drawingObjects(doc), 9);
  // (the same model again: no change; one field: one update, small)
  const updates = [];
  doc.on('update', (u) => updates.push(u));
  putDrawing(doc, P, m);
  assert.equal(updates.length, 0);
  putDrawing(doc, P, mut(doc, (x) => { x.states[1].x = 330; }));
  assert.equal(updates.length, 1);
  assert.ok(updates[0].length < 80, `${updates[0].length} bytes`);
  // a state added in the middle, one deleted: the order as the model's
  const m2 = mut(doc, (x) => { x.states.splice(1, 0, { id: 's9', name: 'MID', x: 0, y: 0, outputs: {} }); x.states.pop(); x.transitions = x.transitions.filter((t) => t.from !== 's3' && t.to !== 's3'); });
  putDrawing(doc, P, m2);
  assert.deepEqual(model(doc).states.map((s) => s.name), ['S0', 'MID', 'S1']);
  assert.deepEqual(model(doc), normalizeFsm(m2));
  // (the order changed by the editor: numbered again)
  putDrawing(doc, P, mut(doc, (x) => { x.states.reverse(); }));
  assert.deepEqual(model(doc).states.map((s) => s.name), ['S1', 'MID', 'S0']);
  dropDrawing(doc, P);
  assert.equal(drawingModel(doc, P), null);
});

test('two participants: concurrent edits of one state\'s fields both kept; of one field, the same value on both; the same drawing on both sides', () => {
  const { a, b, hold, release } = pair();
  putDrawing(a, P, newFsm('det'));
  assert.deepEqual(model(b), model(a));
  const base = model(a);
  hold();
  putDrawing(a, P, mut(a, (x) => { x.states[0].x = 100; x.states[0].y = 200; }), { base, client: a.clientID });
  putDrawing(b, P, mut(b, (x) => { x.states[0].name = 'IDLE'; x.states[0].outputs = { z: '0' }; }), { base, client: b.clientID });
  // (both move S1 at once: one of the two, the same on both)
  putDrawing(a, P, mut(a, (x) => { x.states[1].x = 111; }), { client: a.clientID });
  putDrawing(b, P, mut(b, (x) => { x.states[1].x = 222; }), { client: b.clientID });
  release();
  assert.deepEqual(model(a), model(b));
  const s = model(a).states;
  assert.deepEqual([s[0].name, s[0].x, s[0].y, s[0].outputs], ['IDLE', 100, 200, { z: '0' }]);
  assert.ok([111, 222].includes(s[1].x));
  assert.deepEqual(validateFsm(model(a)).filter((d) => d.severity === 'error'), []);
});

test('a stale editor\'s model (base): only what it changed is put; what another changed since is kept', () => {
  const { a, b } = pair();
  putDrawing(a, P, newFsm('det'));
  const seenByB = model(b);
  // A renames S2 and moves S0; B, which has not seen it yet (its editor busy), changes a transition's condition
  putDrawing(a, P, mut(a, (x) => { x.states[2].name = 'DONE'; x.states[0].x = 40; }), { client: a.clientID });
  const bs = structuredClone(seenByB);
  bs.transitions[0].cond = 'x and y';
  bs.inputs.push({ name: 'y', width: 1 });
  putDrawing(b, P, bs, { base: seenByB, client: b.clientID });
  const m = model(a);
  assert.deepEqual(model(b), m);
  assert.deepEqual([m.states[2].name, m.states[0].x, m.transitions[0].cond, m.inputs.map((i) => i.name)], ['DONE', 40, 'x and y', ['x', 'y']]);
});

test('one deletes a state while another connects to it: the connection goes with it, said (dropped) and pruned; an edit of a deleted object leaves it deleted', () => {
  const { a, b, hold, release } = pair();
  putDrawing(a, P, newFsm('det'));
  const base = model(a);
  hold();
  // A deletes S2 (s3) with its transitions; B adds a transition S0 -> S2 and changes S2's outputs
  putDrawing(a, P, mut(a, (x) => { x.states = x.states.filter((s) => s.id !== 's3'); x.transitions = x.transitions.filter((t) => t.from !== 's3' && t.to !== 's3'); }), { base, client: a.clientID });
  const r = putDrawing(b, P, mut(b, (x) => { x.transitions.push({ id: 't7', from: 's1', to: 's3', cond: 'x', outputs: {} }); x.states[2].outputs = {}; }), { base, client: b.clientID });
  const t7 = r.renamed.get('t7');
  assert.equal(t7, `t7~${b.clientID.toString(36)}`);
  release();
  const ra = drawingModel(a, P), rb = drawingModel(b, P);
  assert.deepEqual(ra, rb);
  assert.deepEqual(ra.model.states.map((s) => s.name), ['S0', 'S1']);
  assert.ok(!ra.model.transitions.some((t) => t.id === t7));
  assert.deepEqual(ra.dropped, [{ coll: 'transitions', id: t7 }]);
  // pruned (by either: both at once, the same)
  assert.deepEqual(pruneDrawing(a, P), [{ coll: 'transitions', id: t7 }]);
  assert.deepEqual(pruneDrawing(b, P), []);
  assert.deepEqual(drawingModel(b, P).dropped, []);
  assert.deepEqual(model(a), model(b));
});

test('two participants add a state with the same id at once: both kept, each with an id of its own, its transitions with it; the selection renamed', () => {
  const { a, b, hold, release } = pair();
  putDrawing(a, P, newFsm('det'));
  const base = model(a);
  hold();
  const ra = putDrawing(a, P, mut(a, (x) => { x.states.push({ id: 's4', name: 'A4', x: 700, y: 100, outputs: {} }); x.transitions.push({ id: 't7', from: 's3', to: 's4', cond: 'x' }); }), { base, client: a.clientID });
  const rb = putDrawing(b, P, mut(b, (x) => { x.states.push({ id: 's4', name: 'B4', x: 700, y: 300, outputs: {} }); x.initial = 's4'; }), { base, client: b.clientID });
  release();
  const m = model(a);
  assert.deepEqual(model(b), m);
  const a4 = ra.renamed.get('s4'), b4 = rb.renamed.get('s4');
  assert.notEqual(a4, b4);
  assert.deepEqual(m.states.slice(3).map((s) => [s.id, s.name]).sort(), [[a4, 'A4'], [b4, 'B4']].sort());
  assert.deepEqual(m.transitions.find((t) => t.id === ra.renamed.get('t7')), { id: ra.renamed.get('t7'), from: 's3', to: a4, cond: 'x', outputs: {} });
  assert.equal(m.initial, b4);
  // (an id made one's own already is kept; another new one of the same name gets one more)
  const again = putDrawing(a, P, mut(a, (x) => { x.states.push({ id: 's4', name: 'A5', x: 900, y: 100, outputs: {} }); }), { client: a.clientID });
  assert.equal(again.renamed.get('s4'), `s4~${a.clientID.toString(36)}.2`);
});

test('each one\'s undo: their own changes only, the other\'s kept, on both sides; redo', () => {
  const { a, b } = pair();
  putDrawing(a, P, newFsm('det'));
  const oa = {}, ob = {};
  const ua = new Y.UndoManager(a.getMap('drawings').get(P), { trackedOrigins: new Set([oa]), captureTimeout: 0 });
  const ub = new Y.UndoManager(b.getMap('drawings').get(P), { trackedOrigins: new Set([ob]), captureTimeout: 0 });
  putDrawing(a, P, mut(a, (x) => { x.states[0].x = 10; }), { client: a.clientID, origin: oa });
  putDrawing(b, P, mut(b, (x) => { x.states[1].name = 'MID'; }), { client: b.clientID, origin: ob });
  putDrawing(a, P, mut(a, (x) => { x.states.push({ id: 's4', name: 'NEW', x: 1, y: 1, outputs: {} }); }), { client: a.clientID, origin: oa });
  assert.equal(model(b).states.length, 4);
  ua.undo();
  assert.deepEqual(model(b).states.map((s) => s.name), ['S0', 'MID', 'S2']);
  ua.undo();
  assert.equal(model(b).states[0].x, 120);
  assert.equal(model(a).states[1].name, 'MID', 'B\'s change kept');
  assert.equal(ua.canUndo(), false);
  ub.undo();
  assert.equal(model(a).states[1].name, 'S1');
  ua.redo();
  assert.equal(model(b).states[0].x, 10);
  assert.deepEqual(model(a), model(b));
});

test('the owner\'s files read again (syncDrawings, publishProject): a change on disk applied over what the participants changed since; an unchanged text left; a drawing removed, a bad one left out', () => {
  const { a: owner, b: editor } = pair();
  const bases = new Map();
  const text = JSON.stringify(newFsm('det'), null, 2);
  const project = { name: 'p', files: [], fileTree: [P] };
  publishProject(owner, { project, files: { [P]: text, 'src/x.vhd': 'entity x is end;\n' }, owner: 'Ana', bases });
  assert.deepEqual(model(editor), normalizeFsm(JSON.parse(text)));
  assert.equal(bases.get(P), text);
  // the editor renames S1; the disk unchanged: the rename stays
  putDrawing(editor, P, mut(editor, (x) => { x.states[1].name = 'MID'; }), { client: editor.clientID });
  publishProject(owner, { project, files: { [P]: text }, owner: 'Ana', bases });
  assert.equal(model(owner).states[1].name, 'MID');
  // the disk changed outside (another process moves S0): applied, the rename kept
  const disk = JSON.parse(text);
  disk.states[0].x = 999;
  publishProject(owner, { project, files: { [P]: JSON.stringify(disk) }, owner: 'Ana', bases });
  assert.deepEqual([model(editor).states[0].x, model(editor).states[1].name], [999, 'MID']);
  // a structure taken out by someone: put again from the file
  dropDrawing(editor, P);
  publishProject(owner, { project, files: { [P]: JSON.stringify(disk) }, owner: 'Ana', bases });
  assert.equal(model(editor).states[0].x, 999);
  // a file that is no drawing's JSON, a path not edited live, a drawing deleted: taken out
  editor.getMap('drawings').set('src/x.vhd', new Y.Map());
  syncDrawings(owner, { [P]: 'not json' }, bases);
  assert.equal(drawingModel(owner, P), null);
  assert.deepEqual([...owner.getMap('drawings').keys()], []);
  assert.equal(bases.has(P), false);
});

test('drawingPathsOf: the drawings a transaction changed', () => {
  const doc = new Y.Doc();
  const seen = [];
  doc.on('afterTransaction', (tr) => seen.push(drawingPathsOf(tr)));
  putDrawing(doc, P, newFsm('det'));
  putDrawing(doc, 'src/b.fsm.json', newFsm('b'));
  putDrawing(doc, P, mut(doc, (x) => { x.states[0].x = 1; }));
  putDrawing(doc, P, mut(doc, (x) => { x.name = 'det2'; }));
  doc.getMap('files').set('src/a.vhd', new Y.Text('x'));
  dropDrawing(doc, 'src/b.fsm.json');
  assert.deepEqual(seen, [[P], ['src/b.fsm.json'], [P], [P], [], ['src/b.fsm.json']]);
});

test('a follower\'s limit: the drawings\' objects counted', () => {
  const doc = projectDoc();
  putDrawing(doc, P, newFsm('det'));
  assert.equal(DRAWING_OBJECTS_MAX, 100_000);
  assert.equal(docTooLarge(doc), null);
  assert.equal(docTooLarge(doc, { ...FOLLOW_LIMITS, objects: 8 }), 'the shared project\'s drawings hold more objects than a follower takes (9, at most 8)');
});

test('the generated HDL: identical from both sides\' merged drawing, compiled and simulated in VHDL and in Verilog as the diagram', () => {
  const { a, b, hold, release } = pair();
  putDrawing(a, P, { ...newFsm('det'), name: 'det' });
  const base = model(a);
  hold();
  // A: a Mealy output and gray encoding; B: a new state on the way and the 2-process style
  putDrawing(a, P, mut(a, (x) => { x.transitions.find((t) => t.id === 't5').outputs = { z: '0' }; x.encoding = 'gray'; }), { base, client: a.clientID });
  putDrawing(b, P, mut(b, (x) => {
    x.states.push({ id: 's4', name: 'S3', x: 700, y: 160, outputs: { z: '1' } });
    x.transitions = x.transitions.filter((t) => t.id !== 't6');
    x.transitions.push({ id: 't8', from: 's3', to: 's4', cond: '!x' }, { id: 't9', from: 's4', to: 's1', cond: '' });
    x.style = '2process';
  }), { base, client: b.clientID });
  release();
  const ma = model(a), mb = model(b);
  assert.deepEqual(ma, mb);
  assert.deepEqual([ma.encoding, ma.style, ma.states.length, ma.type], ['gray', '2process', 4, 'mealy']);
  assert.deepEqual(validateFsm(ma), []);
  for (const lang of ['vhdl', 'verilog']) {
    const ga = generateFsm(ma, lang, { source: 'det.fsm.json' }), gb = generateFsm(mb, lang, { source: 'det.fsm.json' });
    assert.equal(ga.code, gb.code, lang);
    const vectors = randomVectors(ma, 100, 7);
    assert.deepEqual(runHdl(ga.code, lang, ma, vectors), runModel(ma, vectors), lang);
  }
});
