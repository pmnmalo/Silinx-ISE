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
import { normalizeTable, reshapeTable, generateTableHdl, truthTableFromModule, validateTable } from '../core/logic.js';
import { compile, elaborate } from '../core/compile.js';
import { newPetri, normalizePetri, generatePetri, validatePetri } from '../core/petri.js';
import { newModel as newAsm, normalizeModel as normalizeAsm, generate as generateAsm, validate as validateAsm } from '../core/asm.js';
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

test('drawingKind: the FSM\'s diagrams, the truth tables, the ASM charts, the Petri nets (others: not yet, #3183\'s order)', () => {
  assert.equal(drawingKind('src/a.fsm.json'), 'fsm');
  assert.equal(drawingKind('src/A.FSM.JSON'), 'fsm');
  assert.equal(drawingKind('src/a.bool.json'), 'tt');
  assert.equal(drawingKind('src/a.tt.json'), 'tt', 'a truth table saved before #2065');
  assert.equal(drawingKind('src/a.asm.json'), 'asm');
  assert.equal(drawingKind('src/a.pn.json'), 'pn');
  for (const p of ['src/a.sch.json', 'src/a.vhd', 'src/fsm.json', 'src/bool.json']) assert.equal(drawingKind(p), null, p);
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

// ---- the truth table (#3183's second editor): its outputs by name, a field per cell
const T = 'src/maj.bool.json';
const table = () => normalizeTable({ name: 'maj', inputs: ['a', 'b', 'c'], outputs: ['y', 'z'], table: { y: '00010111', z: '01101001' }, notes: 'majority and parity', lang: 'vhdl' });
const tmodel = (doc) => drawingModel(doc, T).model;
const tmut = (doc, fn) => { const m = structuredClone(tmodel(doc)); fn(m); return m; };
const cell = (col, r, c) => col.slice(0, r) + c + col.slice(r + 1);

test('a truth table put and read back: the same table, normalized (its keys in one order whatever the structure\'s); one cell changed: one field', () => {
  const doc = new Y.Doc();
  putDrawing(doc, T, table());
  assert.deepEqual(tmodel(doc), table());
  assert.deepEqual(Object.keys(tmodel(doc)), ['version', 'name', 'inputs', 'outputs', 'table', 'exprs', 'notes', 'form', 'lang']);
  assert.equal(drawingObjects(doc), 2);
  const updates = [];
  doc.on('update', (u) => updates.push(u));
  putDrawing(doc, T, tmut(doc, (m) => { m.table.y = cell(m.table.y, 0, 'X'); }));
  assert.equal(updates.length, 1);
  assert.ok(updates[0].length < 40, `${updates[0].length} bytes`);
  assert.equal(tmodel(doc).table.y, 'X0010111');
  // its typed expression, form and solutions per output; a new output; an output removed
  putDrawing(doc, T, tmut(doc, (m) => { m.exprs.z = 'a ^ b ^ c'; m.forms = { z: 'xor' }; m.outputs.push('w'); m.table.w = '11110000'; }));
  assert.deepEqual([tmodel(doc).exprs, tmodel(doc).forms, tmodel(doc).outputs, tmodel(doc).table.w], [{ z: 'a ^ b ^ c' }, { z: 'xor' }, ['y', 'z', 'w'], '11110000']);
  putDrawing(doc, T, tmut(doc, (m) => { m.outputs = ['y', 'w']; delete m.table.z; delete m.exprs.z; delete m.forms; }));
  assert.deepEqual([tmodel(doc).outputs, tmodel(doc).exprs, tmodel(doc).forms], [['y', 'w'], {}, undefined]);
});

test('a truth table, two participants: two cells of one column both kept; one cell, the same value on both; an output added by both: one; the notes, one of the two', () => {
  const { a, b, hold, release } = pair();
  putDrawing(a, T, table());
  const base = tmodel(a);
  hold();
  putDrawing(a, T, tmut(a, (m) => { m.table.y = cell(m.table.y, 0, '1'); m.table.z = cell(m.table.z, 7, 'X'); m.notes = 'by Ana'; m.outputs.push('w'); m.table.w = '00000001'; }), { base, client: a.clientID });
  putDrawing(b, T, tmut(b, (m) => { m.table.y = cell(m.table.y, 1, '1'); m.table.z = cell(m.table.z, 7, '0'); m.notes = 'by Rui'; m.outputs.push('w'); m.table.w = '00000001'; }), { base, client: b.clientID });
  release();
  const m = tmodel(a);
  assert.deepEqual(tmodel(b), m);
  assert.equal(m.table.y, '11010111');
  assert.ok(['X', '0'].includes(m.table.z[7]));
  assert.ok(['by Ana', 'by Rui'].includes(m.notes));
  assert.deepEqual(m.outputs, ['y', 'z', 'w']);
  assert.deepEqual(validateTable(m), []);
});

test('a truth table: one adds an input (every column reshaped) while another changes a cell: one table on both sides; each one\'s undo', () => {
  const { a, b } = pair();
  putDrawing(a, T, table());
  const oa = {}, ob = {};
  const ua = new Y.UndoManager(a.getMap('drawings').get(T), { trackedOrigins: new Set([oa]), captureTimeout: 0 });
  const ub = new Y.UndoManager(b.getMap('drawings').get(T), { trackedOrigins: new Set([ob]), captureTimeout: 0 });
  const wide = reshapeTable(tmodel(a), ['a', 'b', 'c', 'd'], ['y', 'z']);
  putDrawing(a, T, wide, { client: a.clientID, origin: oa });
  assert.equal(tmodel(b).table.y.length, 16);
  putDrawing(b, T, tmut(b, (m) => { m.table.z = cell(m.table.z, 15, '0'); }), { client: b.clientID, origin: ob });
  assert.deepEqual(tmodel(a), tmodel(b));
  assert.equal(tmodel(a).table.z[15], '0');
  ub.undo();
  assert.deepEqual(tmodel(a), normalizeTable(wide));
  ua.undo();
  assert.deepEqual(tmodel(b), table());
  assert.deepEqual(tmodel(a), tmodel(b));
});

test('a truth table\'s generated HDL: identical from both sides\' merged table, compiled, elaborated and simulated in VHDL and in Verilog as its columns', () => {
  const { a, b, hold, release } = pair();
  putDrawing(a, T, table());
  const base = tmodel(a);
  hold();
  putDrawing(a, T, tmut(a, (m) => { m.table.y = cell(m.table.y, 0, '1'); m.forms = { z: 'xor' }; }), { base, client: a.clientID });
  putDrawing(b, T, tmut(b, (m) => { m.table.z = cell(m.table.z, 3, '1'); m.lang = 'verilog'; }), { base, client: b.clientID });
  release();
  const ma = tmodel(a), mb = tmodel(b);
  assert.deepEqual(ma, mb);
  assert.deepEqual([ma.table.y, ma.table.z, ma.forms, ma.lang], ['10010111', '01111001', { z: 'xor' }, 'verilog']);
  for (const lang of ['vhdl', 'verilog']) {
    const ga = generateTableHdl(ma, lang, { source: 'maj.bool.json' }), gb = generateTableHdl(mb, lang, { source: 'maj.bool.json' });
    assert.equal(ga.code, gb.code, lang);
    const lib = compile([{ path: ga.filename, text: ga.code }]);
    assert.deepEqual([...lib.errors, ...elaborate(lib, 'maj').diags].map((x) => `${x.severity}: ${x.message}`), [], lang);
    const t = truthTableFromModule([{ path: ga.filename, text: ga.code }], 'maj');
    assert.deepEqual([t.warnings, t.table.y, t.table.z], [[], ma.table.y, ma.table.z], lang);
  }
});

// ---- the ASM chart (#3183's third editor): its boxes and links, a link to a box deleted going with it
const A = 'src/ctl.asm.json';
const amodel = (doc) => drawingModel(doc, A).model;
const amut = (doc, fn) => { const m = structuredClone(amodel(doc)); fn(m); return m; };
const node = (m, id) => m.nodes.find((n) => n.id === id);

test('an ASM chart, two participants: a box moved and its actions changed at once both kept; a box deleted while a link to it is drawn: the link goes with it; the same chart on both sides', () => {
  const { a, b, hold, release } = pair();
  putDrawing(a, A, newAsm('ctl'));
  assert.deepEqual(amodel(b), newAsm('ctl'));
  const base = amodel(a);
  hold();
  putDrawing(a, A, amut(a, (m) => { node(m, 's2').x = 420; node(m, 'o1').actions = []; m.nodes = m.nodes.filter((n) => n.id !== 'o1'); m.edges = m.edges.filter((e) => e.from !== 'o1' && e.to !== 'o1'); m.edges.push({ id: 'e9', from: 'd1', to: 's2', port: 'true' }); }), { base, client: a.clientID });
  const r = putDrawing(b, A, amut(b, (m) => { node(m, 's2').actions = ['busy = 1', 'load = 1']; m.edges.push({ id: 'e9', from: 'o1', to: 's3', port: 'next' }); }), { base, client: b.clientID });
  release();
  const ra = drawingModel(a, A), rb = drawingModel(b, A);
  assert.deepEqual(ra, rb);
  assert.deepEqual([node(ra.model, 's2').x, node(ra.model, 's2').actions], [420, ['busy = 1', 'load = 1']]);
  assert.deepEqual(ra.dropped, [{ coll: 'edges', id: r.renamed.get('e9') }], 'B\'s link from the box A deleted');
  assert.ok(!node(ra.model, 'o1'));
  pruneDrawing(a, A);
  assert.deepEqual(drawingModel(b, A).dropped, []);
  assert.deepEqual(validateAsm(amodel(a)).filter((d) => d.severity === 'error'), []);
});

test('an ASM chart\'s generated HDL: identical from both sides\' merged chart, compiled and simulated in VHDL and in Verilog the same; each one\'s undo', () => {
  const { a, b, hold, release } = pair();
  putDrawing(a, A, newAsm('ctl'));
  const oa = {}, ob = {};
  const ua = new Y.UndoManager(a.getMap('drawings').get(A), { trackedOrigins: new Set([oa]), captureTimeout: 0 });
  const base = amodel(a);
  hold();
  putDrawing(a, A, amut(a, (m) => { node(m, 'd2').cond = 'done = 1 and start = 0'; m.encoding = 'gray'; }), { base, client: a.clientID, origin: oa });
  putDrawing(b, A, amut(b, (m) => { node(m, 's3').actions = ['ready = 1']; m.outputs[0].registered = true; }), { base, client: b.clientID, origin: ob });
  release();
  const ma = amodel(a);
  assert.deepEqual(amodel(b), ma);
  assert.deepEqual([node(ma, 'd2').cond, ma.encoding, node(ma, 's3').actions, ma.outputs[0].registered], ['done = 1 and start = 0', 'gray', ['ready = 1'], true]);
  assert.deepEqual(validateAsm(ma).filter((d) => d.severity === 'error'), []);
  const vectors = randomVectors(ma, 80, 5);
  const runs = ['vhdl', 'verilog'].map((lang) => {
    const ga = generateAsm(ma, lang), gb = generateAsm(amodel(b), lang);
    assert.equal(ga.code, gb.code, lang);
    return runHdl(ga.code, lang, ma, vectors);
  });
  assert.deepEqual(runs[0], runs[1]);
  assert.equal(runs[0].length, 80);
  ua.undo();
  assert.deepEqual([node(amodel(b), 'd2').cond, amodel(b).encoding, node(amodel(b), 's3').actions], ['done', 'binary', ['ready = 1']]);
});

// ---- the Petri net (#3183's fourth editor): its places, transitions and arcs; an arc names a place or a transition
const N = 'src/ctl.pn.json';
const nmodel = (doc) => drawingModel(doc, N).model;
const nmut = (doc, fn) => { const m = structuredClone(nmodel(doc)); fn(m); return m; };

test('a Petri net, two participants: a place\'s tokens and a transition\'s guard changed at once both kept; an arc to a transition deleted meanwhile goes with it, to a place kept; two places added at once both kept', () => {
  const { a, b, hold, release } = pair();
  putDrawing(a, N, newPetri('ctl'));
  assert.deepEqual(nmodel(b), normalizePetri(newPetri('ctl')));
  const base = nmodel(a);
  hold();
  const ra = putDrawing(a, N, nmut(a, (m) => {
    m.places[0].tokens = 2; m.places[0].capacity = 2;
    m.transitions = m.transitions.filter((t) => t.id !== 't2'); m.arcs = m.arcs.filter((x) => x.from !== 't2' && x.to !== 't2');
    m.places.push({ id: 'p3', name: 'spare', x: 500, y: 140 });
  }), { base, client: a.clientID });
  const rb = putDrawing(b, N, nmut(b, (m) => {
    m.transitions[0].guard = 'go && !busy';
    m.places.push({ id: 'p3', name: 'other', x: 500, y: 260 });
    m.arcs.push({ id: 'a5', from: 'p3', to: 't2' }, { id: 'a6', from: 't1', to: 'p3' });
  }), { base, client: b.clientID });
  release();
  const r1 = drawingModel(a, N), r2 = drawingModel(b, N);
  assert.deepEqual(r1, r2);
  const m = r1.model;
  assert.deepEqual([m.places[0].tokens, m.transitions[0].guard, m.transitions.map((t) => t.id)], [2, 'go && !busy', ['t1']]);
  assert.deepEqual(m.places.map((p) => p.name).sort(), ['idle', 'other', 'spare', 'work']);
  assert.deepEqual(r1.dropped, [{ coll: 'arcs', id: rb.renamed.get('a5') }], 'the arc to the deleted transition');
  assert.ok(m.arcs.some((x) => x.id === rb.renamed.get('a6') && x.to === rb.renamed.get('p3')), 'the arc between the kept ones');
  assert.notEqual(ra.renamed.get('p3'), rb.renamed.get('p3'));
});

test('a Petri net\'s generated HDL: identical from both sides\' merged net, compiled and simulated in VHDL and in Verilog the same; each one\'s undo', () => {
  const { a, b, hold, release } = pair();
  putDrawing(a, N, newPetri('ctl'));
  const oa = {}, ob = {};
  const ub = new Y.UndoManager(b.getMap('drawings').get(N), { trackedOrigins: new Set([ob]), captureTimeout: 0 });
  const base = nmodel(a);
  hold();
  putDrawing(a, N, nmut(a, (m) => { m.transitions[1].guard = '!go'; m.places[1].outputs = { busy: '1' }; }), { base, client: a.clientID, origin: oa });
  putDrawing(b, N, nmut(b, (m) => { m.arcs.find((x) => x.id === 'a2').weight = 1; m.places[0].tokens = 1; m.lang = 'verilog'; }), { base, client: b.clientID, origin: ob });
  release();
  const ma = nmodel(a);
  assert.deepEqual(nmodel(b), ma);
  assert.deepEqual(validatePetri(ma).filter((d) => d.severity === 'error'), []);
  const vectors = randomVectors(ma, 60, 9);
  const runs = ['vhdl', 'verilog'].map((lang) => {
    const ga = generatePetri(ma, lang, { source: 'ctl.pn.json' }), gb = generatePetri(nmodel(b), lang, { source: 'ctl.pn.json' });
    assert.equal(ga.code, gb.code, lang);
    return runHdl(ga.code, lang, ma, vectors);
  });
  assert.deepEqual(runs[0], runs[1]);
  assert.equal(runs[0].length, 60);
  ub.undo();
  assert.equal(nmodel(a).lang, 'vhdl');
  assert.equal(nmodel(a).transitions[1].guard, '!go', 'A\'s change kept');
});
