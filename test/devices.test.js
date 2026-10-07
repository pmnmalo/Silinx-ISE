import { test } from 'node:test';
import assert from 'node:assert/strict';

const dev = await import('../server/devices.js');

const FAMILY_IDS = ['spartan3', 'spartan3e', 'spartan3a', 'spartan3adsp', 'spartan6', 'virtex4', 'virtex5', 'virtex6', 'artix7', 'kintex7', 'zynq'];

test('families: the ISE 14.7 WebPACK families, with ISE names and I/O standards', () => {
  assert.deepEqual(dev.FAMILIES.map(f => f.id).sort(), [...FAMILY_IDS].sort());
  for (const f of dev.FAMILIES) {
    assert.equal(f.webpack, true, f.id);
    assert.ok(f.name && f.xiseFamily && f.displayName, f.id);
    assert.ok(Array.isArray(f.ioStandards) && f.ioStandards.length > 5, f.id);
    assert.equal(new Set(f.ioStandards).size, f.ioStandards.length, `duplicate I/O standard in ${f.id}`);
    assert.ok(dev.partsOfFamily(f.id).length > 0, `${f.id} has no parts`);
  }
  assert.equal(dev.findFamily('Spartan3A and Spartan3AN').id, 'spartan3a');
  assert.equal(dev.findFamily('spartan6').xiseFamily, 'Spartan6');
  assert.ok(dev.findFamily('spartan6').ioStandards.includes('TMDS_33'));
  assert.ok(!dev.findFamily('virtex6').ioStandards.includes('LVCMOS33'), 'Virtex-6 has no 3.3V I/O');
  assert.equal(dev.findFamily('virtex7'), null, 'Virtex-7 is not in WebPACK');
});

test('parts: every part has a known family, packages with user I/O and speed grades', () => {
  const names = dev.PARTS.map(p => p.part);
  assert.equal(new Set(names).size, names.length, 'duplicate part');
  for (const p of dev.PARTS) {
    assert.ok(FAMILY_IDS.includes(p.family), `${p.part}: family ${p.family}`);
    assert.equal(p.part, p.part.toLowerCase());
    assert.equal(dev.familyOf(p.part), p.family);
    assert.ok(Object.keys(p.packages).length > 0, p.part);
    for (const [k, pk] of Object.entries(p.packages)) {
      assert.ok(pk.userIo > 0 && pk.userIo <= p.maxUserIo, `${p.part}-${k} userIo ${pk.userIo} vs max ${p.maxUserIo}`);
      assert.ok(dev.PACKAGES[k], `no description for package ${k}`);
    }
    assert.ok(p.speeds.length > 0 && p.speeds.every(s => /^-\d+[LN]?$/.test(s)), `${p.part} speeds ${p.speeds}`);
    assert.ok(p.slices > 0 && p.luts > 0 && p.ffs > 0 && p.brams > 0, p.part);
  }
  // WebPACK limits (UG631 Table 2-1): parts outside WebPACK must not be offered.
  for (const missing of ['xc6slx100', 'xc6slx150t', 'xc3s2000', 'xc3sd3400a', 'xc4vlx40', 'xc5vsx35t', 'xc6vlx130t', 'xc7a35t', 'xc7k325t', 'xc7z015', 'xc7z045'])
    assert.equal(dev.findPart(missing), null, missing);
  assert.equal(dev.partsOfFamily('spartan6').length, 9);
  assert.equal(dev.partsOfFamily('Spartan3E').length, 5);
  assert.equal(dev.familyOf('xc7a35t'), 'artix7', 'name-based fallback for parts outside the DB');
});

test('parts: spot checks against the data sheets', () => {
  const p = n => dev.findPart(n);
  // DS160
  assert.equal(p('xc6slx9').slices, 1430);
  assert.equal(p('xc6slx9').ffs, 11440);
  assert.equal(p('xc6slx9').packages.csg324.userIo, 200);
  assert.equal(p('xc6slx16').packages.csg324.userIo, 232);
  assert.equal(p('xc6slx45').packages.csg324.userIo, 218);
  assert.equal(p('xc6slx45').dsp, 58);
  assert.equal(p('xc6slx4').packages.cpg196.userIo, 106);
  assert.ok(!p('xc6slx4').speeds.includes('-3N'), 'XC6SLX4 has no -3N grade (DS162)');
  assert.ok(!p('xc6slx25t').speeds.includes('-1L'), 'LXT parts have no -1L grade');
  // DS312
  assert.equal(p('xc3s250e').slices, 2448);
  assert.equal(p('xc3s250e').packages.vq100.userIo, 66);
  // DS099
  assert.equal(p('xc3s200').slices, 1920);
  assert.equal(p('xc3s200').packages.ft256.userIo, 173);
  assert.equal(p('xc3s1500').brams, 32);
  // DS529 / DS557 / DS610
  assert.equal(p('xc3s50a').packages.tq144.userIo, 108);
  assert.equal(p('xc3s700a').slices, 5888);
  assert.equal(p('xc3s700a').packages.fg484.userIo, 372);
  assert.equal(p('xc3s700an').packages.fgg484.userIo, 372);
  assert.equal(p('xc3sd1800a').dsp, 84);
  // DS112 / DS100 / DS150 / DS180 / DS190
  assert.equal(p('xc4vlx25').slices, 10752);
  assert.equal(p('xc5vlx50t').brams, 60);
  assert.deepEqual(p('xc5vlx20t').speeds, ['-1', '-2']);
  assert.equal(p('xc6vlx75t').dsp, 288);
  assert.equal(p('xc7a100t').packages.csg324.userIo, 210);
  assert.equal(p('xc7a100t').slices, 15850);
  assert.equal(p('xc7k160t').brams, 325);
  assert.equal(p('xc7z020').luts, 53200);
  assert.equal(p('xc7z020').packages.clg484.userIo, 200);
  assert.equal(dev.findPart('XC6SLX9-2CSG324').part, 'xc6slx9');
});

test('validateDevice accepts every family and rejects bad package / speed / part', () => {
  assert.deepEqual(dev.validateDevice({ part: 'xc6slx9', package: 'csg324', speed: '-2' }), []);
  assert.deepEqual(dev.validateDevice({ family: 'spartan3e', part: 'xc6slx16', package: 'csg324', speed: '-3' }), [], 'a stale family field is ignored');
  assert.deepEqual(dev.validateDevice({ part: 'xc7z010', package: 'clg400', speed: '-1' }), []);
  assert.deepEqual(dev.validateDevice({ part: 'xc4vfx12', package: 'sf363', speed: '-10' }), []);
  assert.deepEqual(dev.validateDevice({ part: 'xc3s50a', package: 'tq144', speed: '4' }), [], 'speed without the dash');
  assert.equal(dev.validateDevice({ part: 'xc6slx9', package: 'fgg484', speed: '-2' }).length, 1);
  assert.equal(dev.validateDevice({ part: 'xc6slx75t', package: 'fgg484', speed: '-1L' }).length, 1);
  assert.equal(dev.validateDevice({ part: 'xc5vlx20t', package: 'ff323', speed: '-3' }).length, 1);
  assert.match(dev.validateDevice({ part: 'xc6slx150', package: 'fgg676', speed: '-2' })[0], /WebPACK/);
  assert.match(dev.validateDevice({ part: 'xc9999', package: 'x', speed: '-1' })[0], /unknown part/);
});

test('boards: devices exist with that package and speed, pins are unique, programmer + flash info', () => {
  const ids = dev.BOARDS.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['nexys3', 'atlys', 'mimas-v2', 'cmod-s6', 's3a-starter', 's3-starter', 'papilio-one', 'elbert-v2']) assert.ok(dev.findBoard(id), id);
  for (const b of dev.BOARDS) {
    for (const d of [b.device, ...(b.variants || []).map(v => v.device)]) {
      const p = dev.findPart(d.part);
      assert.ok(p, `${b.id}: part ${d.part}`);
      assert.ok(p.packages[d.package], `${b.id}: ${d.part} has no package ${d.package}`);
      assert.ok((p.packages[d.package].speeds || p.speeds).includes(d.speed), `${b.id}: speed ${d.speed}`);
      assert.equal(d.family, p.family, `${b.id}: device family`);
      assert.deepEqual(dev.validateDevice(d), [], b.id);
    }
    const pins = b.resources.flatMap(r => r.pins);
    assert.equal(new Set(pins).size, pins.length, `duplicate pin on ${b.id}: ${pins.filter((x, i) => pins.indexOf(x) !== i)}`);
    const fam = dev.findFamily(b.device.family);
    for (const r of b.resources) {
      assert.ok(r.name && r.pins.length > 0 && r.group, `${b.id}.${r.name}`);
      assert.ok(fam.ioStandards.includes(r.iostandard), `${b.id}.${r.name}: ${r.iostandard} not a ${fam.id} I/O standard`);
      assert.ok(['in', 'out', 'inout'].includes(r.dir), `${b.id}.${r.name} dir`);
    }
    assert.ok(b.resources.some(r => r.group === 'Clock' && r.extra?.period), `${b.id} has no clock with a period`);
    assert.ok(b.programmer?.preferred && b.programmer.tools[b.programmer.preferred], `${b.id} programmer`);
    for (const t of Object.keys(b.programmer.tools)) assert.ok(['openFPGALoader', 'xc3sprog', 'djtgcfg', 'impact', 'adepttool'].includes(t), `${b.id}: unknown tool ${t}`);
    assert.ok(b.flash && ['xcf', 'spi', 'bpi'].includes(b.flash.type), `${b.id} flash`);
    assert.equal(b.flash.xcf, b.flash.type === 'xcf', `${b.id} flash.xcf`);
    assert.ok(b.jtagChain.some(c => c.role === 'fpga'), `${b.id} jtag chain`);
    assert.equal(b.jtagChain.some(c => c.role === 'prom'), b.flash.type === 'xcf', `${b.id}: PROM in chain iff Platform Flash`);
  }
});

test('boards: key pins from the vendor files', () => {
  const pins = (id, name, opts) => dev.resolveBoard(id, opts).resources.find(r => r.name === name).pins;
  assert.deepEqual(pins('nexys3', 'clk'), ['V10']);
  assert.deepEqual(pins('nexys3', 'led'), ['U16', 'V16', 'U15', 'V15', 'M11', 'N11', 'R11', 'T11']);
  assert.deepEqual(pins('atlys', 'clk'), ['L15']);
  assert.deepEqual(pins('atlys', 'led'), ['U18', 'M14', 'N14', 'L14', 'M13', 'D4', 'P16', 'N12']);
  assert.deepEqual(pins('mimas-v2', 'clk'), ['V10']);
  assert.deepEqual(pins('s3a-starter', 'clk'), ['E12']);
  assert.deepEqual(pins('s3a-starter', 'led'), ['R20', 'T19', 'U20', 'U19', 'V19', 'V20', 'Y22', 'W21']);
  assert.deepEqual(pins('s3-starter', 'clk'), ['T9']);
  assert.deepEqual(pins('s3-starter', 'sw'), ['F12', 'G12', 'H14', 'H13', 'J14', 'J13', 'K14', 'K13']);
  assert.deepEqual(pins('papilio-one', 'clk'), ['P89']);
  assert.deepEqual(pins('elbert-v2', 'clk'), ['P129']);
  assert.equal(dev.resolveBoard('papilio-one', { part: 'xc3s250e' }).device.part, 'xc3s250e');
  assert.equal(dev.resolveBoard('s3a-starter', { variant: '700an' }).device.package, 'fgg484');
  assert.equal(dev.findBoard('papilio-one').programmer.tools.openFPGALoader.onboard, true);
  assert.equal(dev.findBoard('nexys3').programmer.tools.openFPGALoader.onboard, false);
  assert.deepEqual(dev.findBoard('basys2').flash, { type: 'xcf', part: 'xcf02s', xcf: true, verified: true });
});

test('getDeviceDb: every family by default, Spartan-3E-only view with { all: false }', () => {
  const db = dev.getDeviceDb({ all: false });
  assert.equal(db.family, 'spartan3e');
  assert.equal(db.parts.length, 5);
  assert.deepEqual(db.boards.map(b => b.id), dev.LEGACY_BOARD_IDS);
  assert.equal(db.families.length, FAMILY_IDS.length);
  assert.equal(db.allParts.length, dev.PARTS.length);
  assert.equal(db.allBoards.length, dev.BOARDS.length);
  assert.ok(db.iostandards.includes('LVCMOS33') && db.speeds['-4'] && db.packages.csg324);
  assert.ok(db.families.find(f => f.id === 'spartan6').parts.includes('xc6slx9'));
  const all = dev.getDeviceDb();
  assert.equal(all.parts.length, dev.PARTS.length);
  assert.equal(all.boards.length, dev.BOARDS.length);
  assert.ok(all.parts.some(p => p.family === 'zynq'));
});

test('core/version.js matches package.json', async () => {
  const fs = await import('node:fs');
  const { VERSION } = await import('../core/version.js');
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
});
