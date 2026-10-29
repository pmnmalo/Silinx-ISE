// The direction an I/O marker takes from the symbols' pins an edit connects it to (#1109, core/schdoc-markers.js): an
// output pin makes it an output, an inout pin bidirectional, input pins only an input; a marker the edit connects to no
// new pin keeps its own (set in the properties).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, normalizeDoc, netlist } from '../core/schdoc.js';
import { markerDirections } from '../core/schdoc-markers.js';

// an AND2 at (200, 200): I0 (200, 210), I1 (200, 230) inputs, O (280, 220) its output; a marker on empty space
function drawing({ dir = 'in', at = { x: 400, y: 220 } } = {}) {
  const d = newDoc('t', 'vhdl');
  d.symbols.push({ id: 'S1', type: 'and2', x: 200, y: 200 });
  d.ports.push({ id: 'P1', name: 'q', dir, width: 1, ...at });
  return normalizeDoc(d);
}
const wired = (d, points) => normalizeDoc({ ...d, wires: [...d.wires, { id: `W${d.wires.length + 1}`, points }] });
const after = (before, d) => markerDirections(d, netlist(before), netlist(d));

test('#1109 a marker wired to a symbol\'s output becomes an output; to its input, an input', () => {
  const d0 = drawing({ dir: 'in' });
  assert.deepEqual(after(d0, wired(d0, [{ x: 280, y: 220 }, { x: 400, y: 220 }])), [{ port: 'P1', dir: 'out' }]);
  const d1 = drawing({ dir: 'out', at: { x: 120, y: 210 } });
  assert.deepEqual(after(d1, wired(d1, [{ x: 120, y: 210 }, { x: 200, y: 210 }])), [{ port: 'P1', dir: 'in' }]);
  // already the direction: nothing to change
  const d2 = drawing({ dir: 'out' });
  assert.deepEqual(after(d2, wired(d2, [{ x: 280, y: 220 }, { x: 400, y: 220 }])), []);
});

test('#1109 a marker moved onto a pin takes its direction; a bidirectional pin, a bidirectional marker', () => {
  const d0 = drawing({ dir: 'in' });
  const moved = normalizeDoc({ ...d0, ports: [{ ...d0.ports[0], x: 280, y: 220 }] });
  assert.deepEqual(after(d0, moved), [{ port: 'P1', dir: 'out' }]);
  // (the pins' directions as the netlist gives them: an inout pin's)
  const fake = (pins) => ({ portNet: new Map([['P1', { endpoints: pins.map(([sym, pin, dir]) => ({ kind: 'pin', sym, pin, dir })) }]]) });
  assert.deepEqual(markerDirections(d0, fake([]), fake([['S2', 'IO', 'inout']])), [{ port: 'P1', dir: 'inout' }]);
  // an output and inputs on one net: the output drives it, the marker an output
  assert.deepEqual(markerDirections(d0, fake([]), fake([['S1', 'I0', 'in'], ['S3', 'O', 'out']])), [{ port: 'P1', dir: 'out' }]);
});

test('#1109 an edit that connects the marker to no new pin keeps its direction (set in the properties); a marker connected to nothing, none', () => {
  // connected to the output, then set to an input by hand (its properties): the edit connects nothing new
  const d0 = wired(drawing({ dir: 'out' }), [{ x: 280, y: 220 }, { x: 400, y: 220 }]);
  const byHand = normalizeDoc({ ...d0, ports: [{ ...d0.ports[0], dir: 'in' }] });
  assert.deepEqual(after(d0, byHand), []);
  // a wire from the marker to empty space: no pin
  const d1 = drawing({ dir: 'in' });
  assert.deepEqual(after(d1, wired(d1, [{ x: 400, y: 220 }, { x: 500, y: 220 }])), []);
  // another symbol's output wired onto a net the marker already had an input pin on: an output now drives it
  const d2 = wired(drawing({ dir: 'in', at: { x: 120, y: 210 } }), [{ x: 120, y: 210 }, { x: 200, y: 210 }]);
  const inv = normalizeDoc({ ...d2, symbols: [...d2.symbols, { id: 'S2', type: 'inv', x: 0, y: 180 }] });   // (O at (80, 190))
  assert.deepEqual(after(inv, wired(inv, [{ x: 80, y: 190 }, { x: 120, y: 190 }, { x: 120, y: 210 }])), [{ port: 'P1', dir: 'out' }]);
});

// #1796: a bus tap is a connector: an input marker wired to a tap's bit side (its O) stays an input; wired to a gate's
// output too, it becomes an output as before
test('#1796 an input marker wired to a bus tap\'s bit side stays an input', async () => {
  const { newDoc, normalizeDoc, netlist, symbolPins } = await import('../core/schdoc.js');
  const { markerDirections } = await import('../core/schdoc-markers.js');
  const d = newDoc('m', 'vhdl');
  d.symbols.push({ id: 'T', type: 'slice', x: 300, y: 200, rot: 0, mirror: false, name: 'T1', params: { msb: 1, lsb: 1 } });
  const o = symbolPins(normalizeDoc(d).symbols[0]).find((p) => p.name === 'O');
  d.ports.push({ id: 'P1', name: 'X1', dir: 'in', width: 1, x: o.x + 100, y: o.y });
  const before = netlist(normalizeDoc(d));
  d.wires.push({ id: 'W1', points: [{ x: o.x, y: o.y }, { x: o.x + 100, y: o.y }] });
  const doc = normalizeDoc(d);
  assert.deepEqual(markerDirections(doc, before, netlist(doc)), []);
  // (a gate's output on it too: an output, #1109)
  doc.symbols.push({ id: 'G', type: 'inv', x: 0, y: 0, rot: 0, mirror: false, name: 'G1', params: { width: 1 } });
  const g = symbolPins(normalizeDoc(doc).symbols.find((s) => s.id === 'G')).find((p) => p.name === 'O');
  const b2 = netlist(normalizeDoc(doc));
  doc.wires.push({ id: 'W2', points: [{ x: g.x, y: g.y }, { x: o.x + 100, y: g.y }, { x: o.x + 100, y: o.y }] });
  assert.deepEqual(markerDirections(normalizeDoc(doc), b2, netlist(normalizeDoc(doc))), [{ port: 'P1', dir: 'out' }]);
});
