// #2211: a straight segment of a schematic wire deleted, the sides kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netlist } from '../core/schdoc.js';
import { deleteWireSegment, netWireIds } from '../core/schwire-seg.js';

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

// #2228: a T of three wires, a wire joined to it by a net name, and a wire of another signal
const netDoc = () => ({ wires: [
  { id: 'W1', points: [P(100, 100), P(300, 100)] }, { id: 'W2', points: [P(300, 100), P(500, 100)] }, { id: 'W3', points: [P(300, 100), P(300, 300)] },
  { id: 'W4', points: [P(100, 500), P(300, 500)] }, { id: 'W5', points: [P(100, 700), P(300, 700)] }],
  symbols: [], ports: [], labels: [{ id: 'L1', x: 200, y: 100, net: 'n' }, { id: 'L2', x: 200, y: 500, net: 'n' }] });

test('the network of a wire: across junctions and net names, the wire first, the other signal apart', () => {
  const nl = netlist(netDoc());
  assert.deepEqual(netWireIds(nl, 'W3'), ['W3', 'W1', 'W2', 'W4']);
  assert.deepEqual(netWireIds(nl, 'W4'), ['W4', 'W1', 'W2', 'W3']);
  assert.deepEqual(netWireIds(nl, 'W5'), ['W5']);
});

test('the network of a wire: no netlist, or a wire not in it: that wire alone', () => {
  assert.deepEqual(netWireIds(null, 'W1'), ['W1']);
  assert.deepEqual(netWireIds(netlist(netDoc()), 'W9'), ['W9']);
});
