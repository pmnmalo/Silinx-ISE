// The schematic symbol library (#405: core/schdoc-symbols.js out of schdoc.js): schdoc.js still exports its names;
// every symbol of the library, placed at each rotation, has its pins on the grid and in its box, their names unique;
// an I/O marker's box holds its connection point, on every side and for every direction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as schdoc from '../core/schdoc.js';
import * as symbols from '../core/schdoc-symbols.js';

test('#405 symbol library: schdoc.js exports the module\'s names', () => {
  // (ROT_OK: schdoc.js's own, which it never exported)
  for (const [k, v] of Object.entries(symbols)) if (k !== 'ROT_OK') assert.equal(schdoc[k], v, k);
  assert.equal(schdoc.ROT_OK, undefined);
  assert.ok(Object.keys(symbols.SYMBOLS).length > 100);
});

test('#405 symbol library: every symbol, every rotation: its pins on the grid, in its box, their names unique', () => {
  const { SYMBOLS, symbolPins, symbolBox, normalizeDoc } = { ...symbols, normalizeDoc: schdoc.normalizeDoc };
  let n = 0;
  for (const type of Object.keys(SYMBOLS)) {
    for (const rot of [0, 90, 180, 270]) {
      const sym = normalizeDoc({ symbols: [{ id: 'S1', type, name: 'U1', x: 400, y: 400, rot, params: {} }] }).symbols[0];
      const pins = symbolPins(sym), box = symbolBox(sym);
      assert.equal(new Set(pins.map(p => p.name)).size, pins.length, `${type} ${rot}: pin names`);
      for (const p of pins) {
        assert.ok(p.x % 10 === 0 && p.y % 10 === 0, `${type} ${rot} ${p.name}: on the grid (${p.x}, ${p.y})`);
        assert.ok(p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h, `${type} ${rot} ${p.name}: in the box`);
        assert.ok(['in', 'out', 'inout'].includes(p.dir), `${type} ${p.name}: ${p.dir}`);
      }
      n++;
    }
  }
  assert.equal(n, Object.keys(SYMBOLS).length * 4);
});

test('#405 symbol library: an I/O marker\'s box holds its connection point', () => {
  for (const dir of ['in', 'out', 'inout']) {
    for (const side of symbols.PORT_SIDES) {
      const port = { id: 'P1', name: 'a', dir, side, width: 1, x: 200, y: 200 };
      const b = symbols.portBox(port);
      assert.ok(port.x >= b.x && port.x <= b.x + b.w && port.y >= b.y && port.y <= b.y + b.h, `${dir} ${side}`);
    }
  }
});

test('#3419 a module\'s ports, an HDL block\'s inputs and outputs that are not a list of pins: read as none', () => {
  const modules = { m: { name: 'm', ports: [{ name: 'a', dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 4 }] } };
  const doc = schdoc.normalizeDoc({ symbols: [
    { id: 'S1', type: 'module', x: 0, y: 0, params: { module: 'm', ports: 'a,y' } },
    { id: 'S2', type: 'module', x: 200, y: 0, params: { module: 'm', ports: [null, 'a', [1], { name: 'b', dir: 'out', width: 2 }] } },
    { id: 'S3', type: 'hdlblock', x: 0, y: 200, params: { title: 'h', inputs: 'a', outputs: { y: 1 } } },
    { id: 'S4', type: 'hdlblock', x: 200, y: 200, params: { title: 'h', inputs: [null, 3, { name: 'c', width: 2 }], outputs: 5 } }
  ] }, { modules });
  const [s1, s2, s3, s4] = doc.symbols;
  // (a module's ports not a list: its module's, as an instance saved without them)
  assert.deepEqual(s1.params.ports, [{ name: 'a', dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 4 }]);
  assert.deepEqual(s2.params.ports, [{ name: 'b', dir: 'out', width: 2 }]);
  assert.deepEqual([s3.params.inputs, s3.params.outputs], [[], []]);
  assert.deepEqual([s4.params.inputs, s4.params.outputs], [[{ name: 'c', width: 2 }], []]);
  assert.deepEqual(symbols.symbolPins(s1, modules).map(p => p.name), ['a', 'y']);
  assert.deepEqual(symbols.symbolPins(s4, modules).map(p => [p.name, p.width]), [['c', 2]]);
  // (a symbol not normalized, as an editor holds it: drawn with no pin from the bad field)
  assert.deepEqual(symbols.symbolPins({ type: 'hdlblock', x: 0, y: 0, params: { inputs: 'a', outputs: 'y' } }).length, 0);
  assert.equal(symbols.symbolDef({ type: 'module', x: 0, y: 0, params: { module: 'z', ports: 'a' } }).missing, true);
  assert.equal(schdoc.netlist(doc, { modules }).nets.length > 0, true);
});
