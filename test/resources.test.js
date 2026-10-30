// The device resources model (packages/silinx-fpga/src/resources.js, #790): its counts against Xilinx's data sheets (an
// independent copy of their tables, below), against the device reports of the shipped devices and ISE's
// MAP report of the Spartan-6 parts, and its primitives against core/unisim.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resourcesOf, resourceCount, familyResources, primitivesOf, resourceOfPrimitive, RESOURCE_FAMILIES } from '../packages/silinx-fpga/src/resources.js';
import { findPart, partsOfFamily, PARTS } from '../server/devices.js';
import { UNISIM_SOURCE } from '../core/unisim.js';

// DS312 v4.2 Table 1 (slices, distributed RAM Kb, block RAMs, multipliers, DCMs, max user I/O) and Table 2
// (user I/O per package); 24 BUFGMUX on every part
const DS312 = {
  xc3s100e: [960, 15, 4, 4, 2, 108, { vq100: 66, cp132: 83, tq144: 108 }],
  xc3s250e: [2448, 38, 12, 12, 4, 172, { vq100: 66, cp132: 92, tq144: 108, pq208: 158, ft256: 172 }],
  xc3s500e: [4656, 73, 20, 20, 4, 232, { vq100: 66, cp132: 92, pq208: 158, ft256: 190, fg320: 232 }],
  xc3s1200e: [8672, 136, 28, 28, 8, 304, { ft256: 190, fg320: 250, fg400: 304 }],
  xc3s1600e: [14752, 231, 36, 36, 8, 376, { fg320: 250, fg400: 304, fg484: 376 }],
};
// DS160 v2.0 Table 1 (slices, flip-flops, distributed RAM Kb, DSP48A1, 18 Kb block RAMs, CMTs, MCBs, max
// user I/O) and Table 2 (user I/O per package)
const DS160 = {
  xc6slx4: [600, 4800, 75, 8, 12, 2, 0, 132, { tqg144: 102, cpg196: 106, csg225: 132 }],
  xc6slx9: [1430, 11440, 90, 16, 32, 2, 2, 200, { tqg144: 102, cpg196: 106, csg225: 160, ftg256: 186, csg324: 200 }],
  xc6slx16: [2278, 18224, 136, 32, 32, 2, 2, 232, { cpg196: 106, csg225: 160, ftg256: 186, csg324: 232 }],
  xc6slx25: [3758, 30064, 229, 38, 52, 2, 2, 266, { ftg256: 186, csg324: 226, fgg484: 266 }],
  xc6slx45: [6822, 54576, 401, 58, 116, 4, 2, 358, { csg324: 218, csg484: 320, fgg484: 316, fgg676: 358 }],
  xc6slx75: [11662, 93296, 692, 132, 172, 6, 4, 408, { csg484: 328, fgg484: 280, fgg676: 408 }],
  xc6slx25t: [3758, 30064, 229, 38, 52, 2, 2, 250, { csg324: 190, fgg484: 250 }],
  xc6slx45t: [6822, 54576, 401, 58, 116, 4, 2, 296, { csg324: 190, csg484: 296, fgg484: 296 }],
  xc6slx75t: [11662, 93296, 692, 132, 172, 6, 4, 348, { csg484: 292, fgg484: 268, fgg676: 348 }],
};

// ISE 14.7's device report of each part (xdl -report <part>, the sites only; #820, #821): the count of each
// site type of a resource, the slices, the bonded I/O of the package named
const ISE_SITES = {
  xc6slx4: { pkg: 'tqg144', SLICE: 600, IOB: 102, RAMB16BWER: 12, RAMB8BWER: 24, DSP48A1: 8, BUFGMUX: 16, BUFIO2: 32, BUFH: 128, DCM: 4, PLL_ADV: 2, MCB: 0 },
  xc6slx9: { pkg: 'tqg144', SLICE: 1430, IOB: 102, RAMB16BWER: 32, RAMB8BWER: 64, DSP48A1: 16, BUFGMUX: 16, BUFIO2: 32, BUFH: 128, DCM: 4, PLL_ADV: 2, MCB: 2 },
  xc6slx16: { pkg: 'csg324', SLICE: 2278, IOB: 232, RAMB16BWER: 32, RAMB8BWER: 64, DSP48A1: 32, BUFGMUX: 16, BUFIO2: 32, BUFH: 128, DCM: 4, PLL_ADV: 2, MCB: 2 },
  xc6slx25: { pkg: 'ftg256', SLICE: 3758, IOB: 186, RAMB16BWER: 52, RAMB8BWER: 104, DSP48A1: 38, BUFGMUX: 16, BUFIO2: 32, BUFH: 160, DCM: 4, PLL_ADV: 2, MCB: 2 },
  xc6slx45: { pkg: 'csg324', SLICE: 6822, IOB: 218, RAMB16BWER: 116, RAMB8BWER: 232, DSP48A1: 58, BUFGMUX: 16, BUFIO2: 32, BUFH: 256, DCM: 8, PLL_ADV: 4, MCB: 2 },
  xc6slx75: { pkg: 'fgg484', SLICE: 11662, IOB: 280, RAMB16BWER: 172, RAMB8BWER: 344, DSP48A1: 132, BUFGMUX: 16, BUFIO2: 32, BUFH: 384, DCM: 12, PLL_ADV: 6, MCB: 4 },
  xc6slx25t: { pkg: 'csg324', SLICE: 3758, IOB: 190, RAMB16BWER: 52, RAMB8BWER: 104, DSP48A1: 38, BUFGMUX: 16, BUFIO2: 32, BUFH: 160, DCM: 4, PLL_ADV: 2, MCB: 2 },
  xc6slx45t: { pkg: 'csg324', SLICE: 6822, IOB: 190, RAMB16BWER: 116, RAMB8BWER: 232, DSP48A1: 58, BUFGMUX: 16, BUFIO2: 32, BUFH: 256, DCM: 8, PLL_ADV: 4, MCB: 2 },
  xc6slx75t: { pkg: 'fgg484', SLICE: 11662, IOB: 268, RAMB16BWER: 172, RAMB8BWER: 344, DSP48A1: 132, BUFGMUX: 16, BUFIO2: 32, BUFH: 384, DCM: 12, PLL_ADV: 6, MCB: 4 },
  xc3s1600e: { pkg: 'fg320', SLICE: 14752, IOB: 250, RAMB16: 36, MULT18X18SIO: 36, BUFGMUX: 24, DCM: 8 },
  xc3s50: { pkg: 'vq100', SLICE: 768, IOB: 63, BUFGMUX: 8 },
  xc3s200: { pkg: 'ft256', SLICE: 1920, IOB: 173, BUFGMUX: 8 },
  xc3s50a: { pkg: 'vq100', SLICE: 704, BUFGMUX: 24 },
  xc3s200a: { pkg: 'ft256', SLICE: 1792, BUFGMUX: 24 },
  xc3sd1800a: { pkg: 'cs484', SLICE: 16640, BUFGMUX: 24 },
  xc4vlx15: { pkg: 'sf363', SLICE: 6144, BUFGCTRL: 32 },
};
// the model's resource of each site type
const SITE_RESOURCE = { SLICE: 'slices', IOB: 'iob', RAMB16BWER: 'ramb16bwer', RAMB8BWER: 'ramb8bwer', DSP48A1: 'dsp48a1', BUFGMUX: 'bufgmux', BUFGCTRL: 'bufgmux',
  BUFIO2: 'bufio2', BUFH: 'bufh', DCM: 'dcm', PLL_ADV: 'pll', MCB: 'mcb', RAMB16: 'ramb16', MULT18X18SIO: 'mult18x18' };

const counts = (part, pkg) => Object.fromEntries(resourcesOf(findPart(part), pkg).map(r => [r.id, r.count]));

test('Spartan-3E: every part\'s resources as DS312 gives them, the I/O of every package', () => {
  assert.deepEqual(partsOfFamily('spartan3e').map(p => p.part), Object.keys(DS312));
  for (const [part, [slices, distKb, brams, mults, dcms, maxIo, pkgs]] of Object.entries(DS312)) {
    assert.deepEqual(counts(part), { ffs: 2 * slices, luts: 2 * slices, slices, distRam: distKb * 1024, iob: maxIo,
      ramb16: brams, mult18x18: mults, bufgmux: 24, dcm: dcms }, part);
    assert.equal(Math.round((slices * 16) / 1024), distKb, `${part}: half the slices (SLICEM) with two 16-bit LUT RAMs (DS312 rounds to the Kb)`);
    for (const [pkg, io] of Object.entries(pkgs)) assert.equal(resourceCount(findPart(part), 'iob', pkg), io, `${part} ${pkg}`);
    assert.deepEqual(Object.keys(findPart(part).packages).sort(), Object.keys(pkgs).sort(), part);
  }
});

test('Spartan-6: every part\'s resources as DS160 gives them (a CMT 2 DCM + 1 PLL, an 18 Kb block two RAMB8BWER), the I/O of every package', () => {
  assert.deepEqual(partsOfFamily('spartan6').map(p => p.part), Object.keys(DS160));
  for (const [part, [slices, ffs, distKb, dsp, brams, cmts, mcb, maxIo, pkgs]] of Object.entries(DS160)) {
    assert.deepEqual(counts(part), { ffs, luts: 4 * slices, slices, distRam: distKb * 1024, iob: maxIo,
      ramb16bwer: brams, ramb8bwer: 2 * brams, dsp48a1: dsp, bufgmux: 16, bufio2: 32,
      bufh: ISE_SITES[part].BUFH, dcm: 2 * cmts, pll: cmts, mcb }, part);
    assert.equal(ffs, 8 * slices, part);
    for (const [pkg, io] of Object.entries(pkgs)) assert.equal(resourceCount(findPart(part), 'iob', pkg), io, `${part} ${pkg}`);
    assert.deepEqual(Object.keys(findPart(part).packages).sort(), Object.keys(pkgs).sort(), part);
  }
});

test('the Silinx toolchain\'s devices: the sites of each shipped device report equal to the model\'s counts', async () => {
  const { loadDeviceCache, SHIPPED_DEVICES_DIR } = await import('../packages/silinx-fpga/src/fpga/device-node.js');
  const { deviceSites } = await import('../packages/silinx-fpga/src/fpga/place.js');
  const shipped = fs.readdirSync(SHIPPED_DEVICES_DIR).filter(f => f.endsWith('.json.gz')).map(f => f.replace(/\.json\.gz$/, ''));
  // (the Spartan-6 ones, #723, their sites in a description of their own: core/fpga/s6, #826)
  assert.deepEqual(shipped.sort(), ['xc3s100ecp132-4', 'xc3s1200efg320-4', 'xc3s250ecp132-4', 'xc3s500efg320-4', 'xc6slx16csg324-3', 'xc6slx45csg324-3']);
  for (const name of shipped.filter(n => /^xc3s/.test(n))) {
    const [, part, pkg] = /^(xc3s\d+e)([a-z]+\d+)-\d$/.exec(name);
    const d = deviceSites(loadDeviceCache(name)), c = counts(part, pkg);
    assert.deepEqual({ slices: d.slices.size, iob: d.pads.size, bufgmux: d.bufgmux.length, ramb16: d.brams.length, mult18x18: d.mults.length, dcm: d.dcms.length },
      { slices: c.slices, iob: c.iob, bufgmux: c.bufgmux, ramb16: c.ramb16, mult18x18: c.mult18x18, dcm: c.dcm }, name);
  }
});

test('Spartan-6: the totals of ISE\'s MAP report of the LX16 and the LX45 (packages/silinx-fpga/research/s6/measured) equal to the model\'s, line by line', () => {
  const night1 = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../packages/silinx-fpga/research/s6/measured/night1.json', import.meta.url)), 'utf8'));
  for (const [key, part, pkg] of [['xc6slx16-csg324-3', 'xc6slx16', 'csg324'], ['xc6slx45-csg324-3', 'xc6slx45', 'csg324']]) {
    // every MAP line with a total, of every example built on the part (ISE's and the open synthesis's netlist)
    const totals = {};
    for (const b of Object.values(night1.boards).filter(x => x.part === key)) {
      for (const ex of Object.values(b.examples)) {
        for (const flow of [ex.hdl, ex.open]) for (const [k, v] of Object.entries(flow?.map || {})) if (v?.of != null) totals[`Number of ${k}`] = v.of;
      }
    }
    const model = resourcesOf(findPart(part), pkg).filter(r => r.report);
    const seen = model.filter(r => r.report in totals);
    assert.ok(seen.length >= 11, `${part}: ${seen.map(r => r.report)} of ${Object.keys(totals)}`);
    for (const r of seen) assert.equal(r.count, totals[r.report], `${part}: ${r.report}`);
    assert.deepEqual(model.filter(r => !(r.report in totals)).map(r => r.id), [], part);
  }
});

test('ISE\'s device reports: every Spartan-6 part\'s sites (BUFH, BUFGMUX, BUFIO2 and the others), the global buffers of the Spartan-3, 3A, 3A DSP, 3E and Virtex-4 equal to the model\'s counts (#820, #821)', () => {
  assert.deepEqual(Object.keys(ISE_SITES).filter(p => p.startsWith('xc6')), partsOfFamily('spartan6').map(p => p.part), 'every Spartan-6 part measured');
  for (const [part, { pkg, ...sites }] of Object.entries(ISE_SITES)) {
    for (const [type, n] of Object.entries(sites)) assert.equal(resourceCount(findPart(part), SITE_RESOURCE[type], pkg), n, `${part} ${type}`);
  }
});

const unisimNames = [...new Set([...UNISIM_SOURCE.text.matchAll(/^entity\s+(\w+)\s+is\b/gim)].map(m => m[1].toUpperCase()))];

test('primitives: every UNISIM primitive of a counted resource (block RAM, multiplier, DSP, DCM / PLL, clock buffer) mapped to it', () => {
  const counted = unisimNames.filter(n => /^(RAMB|MULT18X18|DSP48|DCM|PLL|BUFG|BUFIO2|BUFH|MCB)/.test(n));
  // (the PLL_BASE and BUFIO2 models: #791)
  assert.equal(counted.length, 27 + 3 + 1 + 2 + 6 + 2 + 1 + 1, counted.join(' '));
  for (const n of counted) assert.ok(RESOURCE_FAMILIES.some(f => resourceOfPrimitive(f, n)), n);
  // the families' own
  const s3e = n => resourceOfPrimitive('spartan3e', n), s6 = n => resourceOfPrimitive('spartan6', n);
  for (const n of counted.filter(x => /^RAMB16_S/.test(x))) { assert.equal(s3e(n), 'ramb16', n); assert.equal(s6(n), null, n); }
  assert.deepEqual(['RAMB16_S9_S9', 'MULT18X18SIO', 'DCM_SP', 'BUFGMUX', 'BUFG', 'DSP48A1', 'RAMB8BWER'].map(s3e), ['ramb16', 'mult18x18', 'dcm', 'bufgmux', 'bufgmux', null, null]);
  assert.deepEqual(['RAMB16BWER', 'RAMB8BWER', 'DSP48A1', 'DCM_SP', 'PLL_BASE', 'BUFG', 'BUFIO2', 'BUFH', 'MCB', 'MULT18X18SIO'].map(s6),
    ['ramb16bwer', 'ramb8bwer', 'dsp48a1', 'dcm', 'pll', 'bufgmux', 'bufio2', 'bufh', 'mcb', null]);
  // the common ones: LUT4 on both, LUT6 on the Spartan-6 only; flip-flops, distributed RAM, I/O
  assert.deepEqual(['LUT4', 'LUT6', 'FDCE', 'RAM16X1S', 'SRLC32E', 'IBUF', 'OBUFT'].map(s3e), ['luts', null, 'ffs', 'distRam', null, 'iob', 'iob']);
  assert.deepEqual(['LUT4', 'LUT6_D', 'FDCE', 'RAM64M', 'SRLC32E', 'IOBUF'].map(s6), ['luts', 'luts', 'ffs', 'distRam', 'distRam', 'iob']);
  assert.equal(resourceOfPrimitive('spartan3e', 'ramb16_s36_s36'), 'ramb16', 'any case');
  // a primitive using no counted resource, an unknown name
  for (const n of ['MUXCY', 'XORCY', 'CARRY4', 'GND', 'VCC', 'NOPE', '', null]) assert.equal(s6(n), null, String(n));
});

test('primitivesOf: each family\'s primitives once, in the resources\' order; every UNISIM model of the family\'s among them', () => {
  for (const f of RESOURCE_FAMILIES) {
    const list = primitivesOf(f), names = list.map(p => p.name);
    assert.equal(new Set(names).size, names.length, f);
    const order = familyResources(f).map(r => r.id);
    assert.deepEqual([...new Set(list.map(p => p.resource))], order.filter(id => familyResources(f).find(r => r.id === id).primitives.length), f);
    for (const p of list) assert.equal(resourceOfPrimitive(f, p.name), p.resource, `${f} ${p.name}`);
  }
  assert.equal(primitivesOf('spartan3e').filter(p => p.resource === 'ramb16').length, 27);
  assert.deepEqual(primitivesOf('spartan6').filter(p => p.resource === 'pll').map(p => p.name), ['PLL_BASE', 'PLL_ADV']);
  // the simulated ones: every UNISIM entity of a Spartan-6 resource is a Spartan-6 primitive
  for (const n of ['RAMB16BWER', 'RAMB8BWER', 'DSP48A1', 'DCM_SP', 'BUFG', 'BUFGMUX']) assert.ok(unisimNames.includes(n) && primitivesOf('spartan6').some(p => p.name === n), n);
});

test('familyResources: ids, labels in English and Portuguese, the MAP report\'s lines; copies, not the model itself', () => {
  assert.deepEqual(familyResources('spartan3e').map(r => r.id), ['ffs', 'luts', 'slices', 'distRam', 'iob', 'ramb16', 'mult18x18', 'bufgmux', 'dcm']);
  assert.deepEqual(familyResources('spartan6').map(r => r.id), ['ffs', 'luts', 'slices', 'distRam', 'iob', 'ramb16bwer', 'ramb8bwer', 'dsp48a1', 'bufgmux', 'bufio2', 'bufh', 'dcm', 'pll', 'mcb']);
  for (const f of [...RESOURCE_FAMILIES, 'artix7']) {
    for (const r of familyResources(f)) {
      assert.ok(r.label.en && r.label.pt, `${f} ${r.id}`);
      assert.ok(r.report === null || /^Number of /.test(r.report), `${f} ${r.id}`);
      assert.equal('count' in r, false);
    }
  }
  assert.deepEqual(familyResources('spartan3e').find(r => r.id === 'luts').label, { en: '4-input LUTs', pt: 'LUTs de 4 entradas' });
  assert.deepEqual(familyResources('spartan6').find(r => r.id === 'ramb8bwer').shares, { with: 'ramb16bwer', per: 2 });
  assert.equal(familyResources('spartan6').find(r => r.id === 'bufgmux').report, 'Number of BUFG/BUFGMUXs');
  const a = familyResources('spartan3e');
  a[5].primitives.length = 0; a[5].label = null;
  assert.equal(familyResources('spartan3e')[5].primitives.length, 27, 'a caller\'s change does not reach the model');
  assert.ok(familyResources('spartan3e')[5].label.en);
});

test('other families: the Spartan-3, 3A, 3A DSP and Virtex-4 the common resources and their global clock buffers (#821), the others the common ones only', () => {
  const COMMON = ['ffs', 'luts', 'slices', 'distRam', 'iob'];
  assert.deepEqual(RESOURCE_FAMILIES, ['spartan3e', 'spartan6'], 'the families with all their own resources: the others\' global buffers only (packages/silinx-fpga/src/resource-check.js checks a device change between the first)');
  for (const f of ['spartan3', 'spartan3a', 'spartan3adsp', 'virtex4']) {
    assert.deepEqual(familyResources(f).map(r => r.id), [...COMMON, 'bufgmux'], f);
    assert.equal(familyResources(f)[1].label.en, '4-input LUTs', f);
    assert.equal(familyResources(f)[1].report, 'Number of 4 input LUTs', f);
  }
  // the same count on every part of the family
  const bufg = { spartan3: 8, spartan3a: 24, spartan3adsp: 24, virtex4: 32 };
  for (const [f, n] of Object.entries(bufg)) for (const p of partsOfFamily(f)) assert.equal(resourceCount(p, 'bufgmux'), n, p.part);
  assert.equal(familyResources('spartan3')[5].report, 'Number of BUFGMUXs');
  assert.equal(familyResources('virtex4')[5].report, 'Number of BUFG/BUFGCTRLs');
  assert.equal(resourceOfPrimitive('virtex4', 'BUFGCTRL'), 'bufgmux');
  assert.equal(resourceOfPrimitive('spartan3', 'BUFGCTRL'), null);
  assert.equal(resourceOfPrimitive('spartan3', 'RAMB16_S9'), null, 'the Spartan-3\'s block RAMs not described yet');
  for (const f of ['virtex5', 'virtex6', 'artix7', 'kintex7', 'zynq', undefined]) {
    assert.deepEqual(familyResources(f).map(r => r.id), COMMON, String(f));
    assert.equal(familyResources(f)[1].label.en, '6-input LUTs', String(f));
    assert.equal(resourceCount(PARTS.find(p => p.family === (f || 'zynq')), 'bufgmux'), 0, String(f));
  }
  assert.deepEqual(counts('xc3s200', 'ft256'), { ffs: 3840, luts: 3840, slices: 1920, distRam: 30 * 1024, iob: 173, bufgmux: 8 });
  assert.deepEqual(counts('xc4vlx15', 'sf363'), { ffs: 12288, luts: 12288, slices: 6144, distRam: 96 * 1024, iob: 240, bufgmux: 32 });
  assert.equal(counts('xc7z010').distRam, null, 'DS190 lists no distributed RAM: not known');
  assert.deepEqual(primitivesOf('virtex5').map(p => p.resource).filter(x => !['ffs', 'luts', 'distRam', 'iob'].includes(x)), []);
  // every part of the database has its common resources
  for (const p of PARTS) for (const r of resourcesOf(p).filter(x => ['ffs', 'luts', 'slices', 'iob'].includes(x.id))) assert.ok(r.count > 0, `${p.part} ${r.id}`);
});

test('resourceCount: a resource the part lacks is 0, an unknown package or count null, an unknown id or a missing part an error', () => {
  const lx4 = findPart('xc6slx4'), s3e = findPart('xc3s250e');
  assert.equal(resourceCount(lx4, 'mcb'), 0, 'the LX4 has no memory controller');
  assert.equal(resourceCount(lx4, 'ramb8bwer'), 24);
  assert.equal(resourceCount(s3e, 'ramb16bwer'), 0, 'a Spartan-6 resource on a Spartan-3E');
  assert.equal(resourceCount(s3e, 'pll'), 0);
  assert.equal(resourceCount(lx4, 'mult18x18'), 0);
  assert.equal(resourceCount(s3e, 'bufgmux'), 24);
  assert.equal(resourceCount(lx4, 'bufgmux'), 16);
  assert.equal(resourceCount(lx4, 'bufh'), 128);
  assert.equal(resourceCount({ ...lx4, part: 'xc6slx150' }, 'bufh'), null, 'a part outside the device reports: not known');
  assert.equal(resourceCount(s3e, 'iob'), 172, 'no package: the maximum');
  assert.equal(resourceCount(s3e, 'iob', 'CP132'), 92, 'any case');
  assert.equal(resourceCount(s3e, 'iob', 'fg484'), null, 'a package the part is not made in');
  assert.equal(resourcesOf(s3e, 'fg484').find(r => r.id === 'iob').count, null);
  assert.throws(() => resourceCount(s3e, 'unicorns'), /unknown resource 'unicorns'/);
  assert.throws(() => resourceCount(s3e, undefined), RangeError);
  for (const bad of [null, undefined, 'xc3s250e', {}, 42]) {
    assert.throws(() => resourcesOf(bad), TypeError, String(bad));
    assert.throws(() => resourceCount(bad, 'luts'), /a part record is needed/);
  }
  // the page's records (S.devices.parts) are the same records sent as JSON
  const viaJson = JSON.parse(JSON.stringify(s3e));
  assert.deepEqual(resourcesOf(viaJson, 'cp132'), resourcesOf(s3e, 'cp132'));
});
