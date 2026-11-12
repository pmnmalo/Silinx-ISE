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

test('#3532 a symbol\'s parameters read as text that are not text: coerced or their default, the drawing opens', () => {
  const modules = { m: { name: 'm', lang: 'vhdl', ports: [{ name: 'a', dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 1 }], generics: [{ name: 'N', default: '1' }] } };
  const values = [5, true, ['m'], [1, { a: 1 }], { a: 1 }, null, 'toString', '__proto__', 'constructor'];
  const doc = schdoc.normalizeDoc({ symbols: values.map((v, k) => ({ id: `S${k + 1}`, type: 'module', x: 200 * k, y: 0, name: `u${k + 1}`, params: { module: v } })) }, { modules });
  assert.deepEqual(doc.symbols.map(s => s.params.module), ['5', 'true', 'm', '', '', '', 'toString', '__proto__', 'constructor']);
  const nl = schdoc.netlist(doc, { modules });
  assert.deepEqual(nl.diagnostics.filter(d => d.severity === 'error').map(d => d.message), [
    "u1: module '5' not found in the project", "u2: module 'true' not found in the project",
    "u4: module '' not found in the project", "u5: module '' not found in the project", "u6: module '' not found in the project",
    "u7: module 'toString' not found in the project", "u8: module '__proto__' not found in the project", "u9: module 'constructor' not found in the project"]);
  assert.deepEqual(symbols.symbolPins(doc.symbols[2], modules).map(p => p.name), ['a', 'y']);
  // (a symbol not normalized, as an editor holds it: no module, no throw)
  for (const v of values) assert.equal(symbols.symbolDef({ type: 'module', x: 0, y: 0, params: { module: v } }, modules).missing, true);
  assert.equal(symbols.findMod({ toString: modules.m }, 'toString'), modules.m);
});

test('#3532 a module\'s generics, the other text parameters, parameters not an object: text or none', () => {
  const modules = { m: { name: 'm', lang: 'vhdl', ports: [{ name: 'a', dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 1 }], generics: [{ name: 'N', default: '1' }, { name: 'M', default: '2' }] } };
  const gens = [{ N: 4, M: { x: 1 } }, { N: [1, 2], M: 'K' }, 'abc', [5], null];
  const doc = schdoc.normalizeDoc({ symbols: [
    ...gens.map((g, k) => ({ id: `S${k + 1}`, type: 'module', x: 200 * k, y: 0, name: `u${k + 1}`, params: { module: 'm', generics: g } })),
    { id: 'S6', type: 'hdlblock', x: 0, y: 300, name: 'h1', params: { title: { a: 1 } } },
    { id: 'S7', type: 'constant', x: 200, y: 300, name: 'c1', params: { value: 12, width: 4 } },
    { id: 'S8', type: 'compare', x: 400, y: 300, name: 'k1', params: { op: ['eq', 'lt'] } },
    { id: 'S9', type: 'and2', x: 600, y: 300, name: 'g1', params: 'xyz' },
    { id: 'S10', type: 'module', x: 800, y: 300, name: 'u6', params: [1] }
  ] }, { modules });
  assert.deepEqual(doc.symbols.slice(0, 5).map(s => s.params.generics), [{ N: '4' }, { M: 'K' }, {}, {}, {}]);
  const [h1, c1, k1, g1, u6] = doc.symbols.slice(5);
  assert.equal(h1.params.title, 'logic');
  assert.equal(c1.params.value, '12');
  assert.equal(k1.params.op, 'eq,lt');
  assert.deepEqual(schdoc.compareOps(k1.params), ['eq', 'lt']);
  assert.deepEqual(g1.params, schdoc.defaultParams('and2'));
  assert.deepEqual(u6.params, { module: '', generics: {} });
  const text = schdoc.generateHdl(doc, { modules }).code;
  assert.match(text, /u1 : entity work\.m\s+generic map \(\s+N => 4\s+\)/);
  assert.match(text, /u2 : entity work\.m\s+generic map \(\s+M => K\s+\)/);
  assert.doesNotMatch(text, /\[object Object\]|0 => a/);
});

test('#3532 a wire\'s point, the kept HDL\'s fields that are not what they should be: dropped or text', () => {
  const doc = schdoc.normalizeDoc({
    ports: [{ name: 'a', dir: 'in', x: 0, y: 0 }, { name: 'y', dir: 'out', x: 200, y: 0 }],
    wires: [{ points: [null, { x: 0, y: 0 }, 5, { x: 200, y: 0 }] }],
    hdl: { lang: 7, context: 5, decls: ['x'], arch: { a: 1 }, generics: [null, { name: 'W', type: 3, default: 8 }, { type: 'integer' }, 'Z'] }
  });
  assert.deepEqual(doc.wires[0].points, [{ x: 0, y: 0 }, { x: 200, y: 0 }]);
  assert.deepEqual(doc.hdl, { context: '5', decls: 'x', arch: '', generics: [{ name: 'W', type: '3', default: '8' }] });
  assert.deepEqual(schdoc.normalizeDoc({ hdl: [1] }).hdl, undefined);
  const r = schdoc.generateHdl(doc, {});
  assert.deepEqual(r.diagnostics, []);
  assert.match(r.code, /generic \(\s+W : 3 := 8\s+\)/);
});
