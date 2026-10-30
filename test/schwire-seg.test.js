// #2211: a straight segment of a schematic wire deleted, the sides kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteWireSegment } from '../core/schwire-seg.js';

const P = (x, y) => ({ x, y });
const doc = () => ({ wires: [{ id: 'W1', bus: true, points: [P(0, 0), P(100, 0), P(100, 100), P(200, 100)] }, { id: 'W2', points: [P(0, 300), P(50, 300)] }] });

test('a middle segment: the two sides kept as wires, the new one with a free id and the same properties', () => {
  const d = doc();
  assert.equal(deleteWireSegment(d, 'W1', P(100, 0), P(100, 100)), true);
  assert.deepEqual(d.wires, [
    { id: 'W1', bus: true, points: [P(0, 0), P(100, 0)] },
    { id: 'W3', bus: true, points: [P(100, 100), P(200, 100)] },
    { id: 'W2', points: [P(0, 300), P(50, 300)] }]);
});

test('an end segment: one side kept; the only segment: the wire gone', () => {
  const d = doc();
  assert.equal(deleteWireSegment(d, 'W1', P(0, 0), P(100, 0)), true);
  assert.deepEqual(d.wires[0], { id: 'W1', bus: true, points: [P(100, 0), P(100, 100), P(200, 100)] });
  assert.equal(deleteWireSegment(d, 'W2', P(0, 300), P(50, 300)), true);
  assert.deepEqual(d.wires.map(w => w.id), ['W1']);
});

test('no such wire or segment: nothing changed', () => {
  const d = doc();
  assert.equal(deleteWireSegment(d, 'W9', P(0, 0), P(100, 0)), false);
  assert.equal(deleteWireSegment(d, 'W1', P(100, 0), P(0, 0)), false);
  assert.deepEqual(d, doc());
});
