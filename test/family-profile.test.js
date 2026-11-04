// The device families' profiles (core/family-profile.js, #2310): each entry against the modules that make what it names
// (the clock managers of core/clocking.js, the block RAMs of core/blockram.js, the resources model's counts against
// Xilinx's data sheets, DS312 and DS160), and the browser's open flow asking the profile as it tested the families' names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import { FAMILY_PROFILES, familyProfile } from '../core/family-profile.js';
import { planClock } from '../core/clocking.js';
import { MEMORY_FAMILIES, planMemory } from '../core/blockram.js';
import { resourceCount, resourceOfPrimitive } from '../packages/silinx-fpga/src/resources.js';
import { FAMILY_INFO, ICE40_STEPS } from '../packages/silinx-fpga/src/index.js';
import { findPart } from '../server/devices.js';

globalThis.SILINX_ASSETS = 'https://example.test/assets/';
const { browserOpenStatus, browserSteps, BROWSER_DEVICES } = await import('../web/js/open-flow-browser.js');

test('every profile is of a known family; a family with none gets an empty, frozen profile', () => {
  for (const f of Object.keys(FAMILY_PROFILES)) assert.ok(FAMILY_INFO[f], f);
  assert.deepEqual(Object.keys(FAMILY_PROFILES).sort(), ['ice40', 'spartan3e', 'spartan6']);
  for (const f of ['spartan3a', 'artix7', 'nonsense', null, undefined]) {
    assert.deepEqual(familyProfile(f), {});
    assert.ok(Object.isFrozen(familyProfile(f)));
  }
  assert.equal(familyProfile('ice40').clock, undefined);
  assert.equal(familyProfile('ice40').blockRam, undefined);
});

test('the clock manager: the primitive core/clocking.js plans for the family, its resource the resources model\'s', () => {
  const clocked = Object.keys(FAMILY_PROFILES).filter(f => familyProfile(f).clock);
  assert.deepEqual(clocked, ['spartan3e', 'spartan6']);
  for (const f of clocked) {
    const { manager, primitive, resource } = familyProfile(f).clock;
    assert.equal(planClock({ family: f, speed: f === 'spartan6' ? '-3' : '-4', inMHz: 50, input: 'clk', outputs: [] }).primitive, primitive, f);
    assert.equal(resourceOfPrimitive(f, primitive), resource, f);
    assert.equal(manager, resource);
  }
  // DS312 Table 1: DCMs; DS160 Table 1: CMTs, one PLL each
  assert.equal(resourceCount(findPart('xc3s100e'), familyProfile('spartan3e').clock.resource), 2);
  assert.equal(resourceCount(findPart('xc3s1200e'), familyProfile('spartan3e').clock.resource), 8);
  assert.equal(resourceCount(findPart('xc6slx16'), familyProfile('spartan6').clock.resource), 2);
  assert.equal(resourceCount(findPart('xc6slx45'), familyProfile('spartan6').clock.resource), 4);
});

test('the block RAMs: the families core/blockram.js makes, counted in the plan\'s unit', () => {
  assert.deepEqual(Object.keys(FAMILY_PROFILES).filter(f => familyProfile(f).blockRam), MEMORY_FAMILIES);
  // the plan's halves are the profile's unit: one RAMB16 is one on the Spartan-3E, two halves of 9 Kbit on the Spartan-6
  const big = f => planMemory({ family: f, kind: 'ram', ports: 'single', width: 36, depth: 512, writeMode: 'READ_FIRST', style: 'primitive' });
  assert.equal(familyProfile('spartan3e').blockRam.halves, false);
  assert.equal(big('spartan3e').halves, 1);
  assert.equal(familyProfile('spartan6').blockRam.halves, true);
  assert.equal(big('spartan6').halves, 2);
  // DS312: RAMB16s; DS160: 18 Kbit block RAMs, two halves each
  assert.equal(resourceCount(findPart('xc3s250e'), familyProfile('spartan3e').blockRam.resource), 12);
  assert.equal(resourceCount(findPart('xc6slx16'), familyProfile('spartan6').blockRam.resource), 64);
});

test('the multiplier: MULT18X18SIO on the Spartan-3E, DSP48A1 on the Spartan-6', () => {
  assert.equal(resourceOfPrimitive('spartan3e', 'MULT18X18SIO'), familyProfile('spartan3e').multiplier);
  assert.equal(resourceOfPrimitive('spartan6', 'DSP48A1'), familyProfile('spartan6').multiplier);
  assert.equal(resourceCount(findPart('xc3s500e'), familyProfile('spartan3e').multiplier), 20);
  assert.equal(resourceCount(findPart('xc6slx16'), familyProfile('spartan6').multiplier), 32);
  assert.equal(familyProfile('ice40').multiplier, undefined);
});

test('the open flow: the parts each family\'s Silinx toolchain takes, its bit database, the iCE40\'s own steps', () => {
  for (const key of Object.keys(BROWSER_DEVICES)) {
    const dev = key.split('/')[0];
    const f = dev.startsWith('xc6') ? 'spartan6' : 'spartan3e';
    assert.ok(familyProfile(f).openFlow.parts.test(dev), key);
  }
  assert.equal(familyProfile('spartan3e').openFlow.bitDb, 'bitdb');
  assert.equal(familyProfile('spartan6').openFlow.bitDb, 's6');
  // nextpnr: the Spartan-3E's and the Spartan-6's engine (#2136, #2288, #2137)
  assert.deepEqual(Object.keys(FAMILY_PROFILES).filter(f => familyProfile(f).openFlow?.nextpnr), ['spartan3e', 'spartan6']);
  for (const dev of ['xc3s200a', 'xc3s400', 'xc6slx45t', 'xc7a35t']) {
    assert.ok(!familyProfile('spartan3e').openFlow.parts.test(dev) && !familyProfile('spartan6').openFlow.parts.test(dev), dev);
  }
  assert.equal(familyProfile('ice40').openFlow.tools, 'nextpnr-ice40');
  assert.equal(familyProfile('ice40').openFlow.steps, ICE40_STEPS);
});

test('the browser\'s open flow asks the profile: the same answers per family as before', () => {
  const s3e = browserOpenStatus({ family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' });
  assert.deepEqual([s3e.available, s3e.family, s3e.graph], [true, 'spartan3e', 'xc3s250ecp132-4.json.gz']);
  const s6 = browserOpenStatus({ family: 'spartan6', part: 'xc6slx16', package: 'csg324', speed: '-3' });
  assert.deepEqual([s6.family, s6.graph ?? null], ['spartan6', s6.available ? 'xc6slx16csg324-3.json.gz' : null]);
  const ice = browserOpenStatus({ family: 'ice40', part: 'ice40hx1k', package: 'tq144', speed: '' });
  assert.deepEqual([ice.available, ice.family, ice.part], [true, 'ice40', 'ice40hx1ktq144']);
  assert.match(browserOpenStatus({ family: 'ice40', part: 'ice40zz9k', package: 'tq144' }).reason, /not an iCE40 part of nextpnr-ice40/);
  // a family with no open flow, and a Spartan-6 part outside the Nexys3's and Atlys's kind: not the Silinx toolchain's
  for (const device of [{ family: 'spartan3a', part: 'xc3s200a', package: 'vq100', speed: '-4' }, { family: 'spartan6', part: 'xc6slx45t', package: 'fgg484', speed: '-3' }]) {
    const st = browserOpenStatus(device);
    assert.equal(st.available, false, device.part);
    assert.match(st.reason, /the Silinx toolchain supports the Spartan-3E and the Nexys3's and Atlys's Spartan-6 only/);
  }
  // the iCE40's steps (its own tools'), the others the Silinx toolchain's
  assert.deepEqual(browserSteps(['bitgen'], { family: 'ice40' }), ICE40_STEPS.map(s => s.id));
  assert.deepEqual(browserSteps(['par'], { family: 'ice40' }), ['synth', 'translate', 'par']);
  assert.deepEqual(browserSteps(['bitgen'], { family: 'ice40', synthUpToDate: true }), browserSteps(['bitgen'], { family: 'ice40' }).filter(s => s !== 'synth'));
  assert.throws(() => browserSteps(['impact'], { family: 'spartan3e' }), /not available in the Silinx toolchain/);
});
