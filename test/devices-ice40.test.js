// The iCE40's parts in the device database (#2463): each a part of nextpnr-ice40, with the figures of Lattice's data
// sheets, valid with no speed grade; and each part in each package taken by the real nextpnr-ice40 and icepack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILIES, PARTS, findPart, partsOfFamily, validateDevice, getDeviceDb } from '../server/devices.js';
import { ICE40_PARTS, deviceFamily, openOnlyDevice, orderSteps, ICE40_STEPS } from '../packages/silinx-fpga/src/index.js';
import { nextpnrIce40Node } from '../packages/silinx-fpga/src/node.js';

const ice40 = partsOfFamily('ice40');

test('the iCE40: every part of nextpnr-ice40, last among the families, offered by the device database', () => {
  assert.deepEqual(ice40.map(p => p.part.replace(/^ice40/, '')).sort(), [...ICE40_PARTS].sort());
  assert.equal(FAMILIES.at(-1).id, 'ice40');
  assert.equal(PARTS.filter(p => p.family === 'ice40').length, 12);
  assert.ok(getDeviceDb().families.find(f => f.id === 'ice40').parts.includes('ice40up5k'));
});

test('the iCE40: the data sheets\' figures, an I/O count per package no larger than the part\'s', () => {
  const figures = p => [p.luts, p.ffs, p.brams, p.bramBits, p.plls, p.dsp, p.spram];
  assert.deepEqual(figures(findPart('ice40up5k')), [5280, 5280, 30, 120 * 1024, 1, 8, 4]);
  assert.deepEqual(figures(findPart('ice40hx8k')), [7680, 7680, 32, 128 * 1024, 2, 0, 0]);
  assert.deepEqual(figures(findPart('ice40hx1k')), [1280, 1280, 16, 64 * 1024, 1, 0, 0]);
  assert.deepEqual(figures(findPart('ice40lp384')), [384, 384, 0, 0, 0, 0, 0]);
  assert.equal(findPart('ice40up5k').packages.sg48.userIo, 39);
  assert.equal(findPart('ice40hx8k').packages.ct256.userIo, 206);
  for (const p of ice40) {
    const io = Object.values(p.packages).map(k => k.userIo);
    assert.equal(p.maxUserIo, Math.max(...io), p.part);
  }
});

test('the iCE40: a device valid with no speed grade, a package it does not have refused, open toolchain only', () => {
  assert.deepEqual(validateDevice({ part: 'ice40up5k', package: 'sg48', speed: '' }), []);
  assert.deepEqual(validateDevice({ part: 'ice40up5k', package: 'tq144', speed: '' }), ["ice40up5k is not available in package 'tq144' (valid: uwg30, sg48)"]);
  assert.equal(deviceFamily({ part: 'ice40hx1k' }), 'ice40');
  assert.equal(openOnlyDevice({ part: 'ice40hx1k' }), true);
  assert.equal(openOnlyDevice({ part: 'xc3s250e' }), false);
  assert.equal(openOnlyDevice({ part: 'nonsense' }), false);
  assert.equal(openOnlyDevice(undefined), false);
});

test('the iCE40: Implement\'s chain, which asks for Map, is nextpnr\'s Place & Route', () => {
  assert.deepEqual(orderSteps(ICE40_STEPS, ['synth', 'translate', 'map']), ['synth', 'translate', 'par']);
  assert.throws(() => orderSteps(ICE40_STEPS, ['trce']), /no step trce/);
});

// a netlist with no cells: what is checked is that nextpnr knows the part and its package
const EMPTY = JSON.stringify({ creator: 'test', modules: { top: { attributes: { top: '00000000000000000000000000000001' }, ports: {}, cells: {}, netnames: {} } } });
test('the iCE40: nextpnr-ice40 takes each part in each of its packages, and refuses another', async () => {
  const io = nextpnrIce40Node();
  const place = (p, k) => io.run([`--${p}`, '--package', k, '--json', 'n.json', '--asc', 'r.asc'], { 'n.json': EMPTY }, () => {});
  for (const p of ice40) for (const k of Object.keys(p.packages)) {
    const out = await place(p.part.replace(/^ice40/, ''), k);
    assert.ok(out['r.asc'], `${p.part} ${k}`);
  }
  await assert.rejects(place('up5k', 'tq144'));
});
