// A drawing editor's link to its HDL file changed alone (#245, web/js/ui.js linkModel / linkSnapshot):
// the model in place, its history's snapshots as the editor keeps them (normalized or not), so that
// an Undo / Redo keeps the link and an unchanged model is not taken for an edit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newPetri, normalizePetri } from '../core/petri.js';
import { newFsm, normalizeFsm } from '../core/fsm.js';
import { newModel, normalizeModel } from '../core/asm.js';
import { newDoc, normalizeDoc } from '../core/schdoc.js';
import { newTable, normalizeTable } from '../core/logic.js';

// web/js/ui.js registers window listeners when it is loaded
globalThis.addEventListener ??= () => {};
const { linkModel, linkSnapshot } = await import('../web/js/ui.js');

test('linkModel: the link set in place (the same object), replaced, removed; nothing else changes', () => {
  const m = newPetri('ctl', 'vhdl');
  const before = structuredClone(m);
  assert.equal(linkModel(m, 'src/ctl.vhd'), m);
  assert.deepEqual(m, { ...before, generatedFile: 'src/ctl.vhd' });
  linkModel(m, 'src/ctl.v');
  assert.equal(m.generatedFile, 'src/ctl.v');
  linkModel(m, undefined);
  assert.deepEqual(m, before);
  assert.equal('generatedFile' in m, false);
});

for (const [kind, make, norm] of [
  ['Petri net', () => newPetri('ctl', 'vhdl'), normalizePetri],
  ['state diagram', () => newFsm('blink'), normalizeFsm],
  ['ASM chart', () => newModel('ctl', 'vhdl'), normalizeModel],
  ['schematic', () => newDoc('gate', 'vhdl'), normalizeDoc],
  ['truth table', () => newTable('maj', ['a', 'b', 'c'], ['f']), normalizeTable],
]) {
  test(`linkSnapshot, the ${kind}: the snapshot takes the link as the model does (the same JSON, normalized or not)`, () => {
    const s = JSON.stringify(norm(make()));
    const linked = linkSnapshot(s, 'src/x.vhd', norm);
    assert.equal(JSON.parse(linked).generatedFile, 'src/x.vhd');
    // normalized: what the editor's next commit makes of it, so no edit is seen
    assert.equal(JSON.stringify(norm(JSON.parse(linked))), linked);
    // as the model linked in place (an editor whose history is not normalized)
    assert.equal(linkSnapshot(s, 'src/x.vhd'), JSON.stringify(linkModel(JSON.parse(s), 'src/x.vhd')));
    // linked again elsewhere, and unlinked: back to the snapshot
    assert.equal(JSON.parse(linkSnapshot(linked, 'src/y.v', norm)).generatedFile, 'src/y.v');
    assert.equal(linkSnapshot(linked, null, norm), s);
  });
}
