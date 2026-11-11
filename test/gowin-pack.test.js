// gowin_pack in JavaScript (#2303): Silinx's port of Apicula's gowin_pack, byte for byte against Apicula 0.32's own .fs (run
// offline; test/fixtures/gowin-pack/apicula-0.32.json keeps the SHA-256 of each example's routed design and .fs; the gates
// example's routed design is committed, the others are made by test/examples-gowin.test.js); its readers (.xz, MessagePack, the
// package's tar and zip) on known bytes; the chip database read from YoWASP's package, as the flow reads it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { unxz } from '../packages/silinx-fpga/src/fpga/gowin/xz.js';
import { unpack } from '../packages/silinx-fpga/src/fpga/gowin/msgpack.js';
import { tarFind, zipEntry } from '../packages/silinx-fpga/src/fpga/gowin/gowin-files.js';
import { loadChipdb, tableFuses, addAttrVal } from '../packages/silinx-fpga/src/fpga/gowin/chipdb.js';
import { gowinPack } from '../packages/silinx-fpga/src/fpga/gowin/pack.js';
import { nextpnrGowinNode, installedPackageFile } from '../packages/silinx-fpga/src/nextpnr-gowin-node.js';
import { apyculaDatabase } from '../packages/silinx-fpga/src/fpga/gowin/gowin-files.js';
import { gowinResourcePart } from '../packages/silinx-fpga/src/nextpnr-gowin-io.js';

const FIX = new URL('./fixtures/gowin-pack/', import.meta.url);
const REF = JSON.parse(fs.readFileSync(new URL('apicula-0.32.json', FIX), 'utf8'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const NAME = '@yowasp/nextpnr-himbaechel-gowin';
const database = () => apyculaDatabase(i => installedPackageFile(NAME, gowinResourcePart(i)), 'GW1N-9C');

test('xz: Python lzma\'s (preset 1, LZMA2, CRC64) read back; an empty stream; not an .xz refused', () => {
  // lzma.compress(b'Silinx gowin_pack ' * 40 + bytes(range(256)) * 3 + b'end', preset=1)
  const xz = Buffer.from('/Td6WFoAAATm1rRGAgAhARAAAACocI6G4AXSAQldACmaSYaxADw77nvEGfL874U0wzI3bJwJM5z2TqIYOfF+jiJ8gg2vAvb/2Bno6mzHq51txc64ARlZLEX2rZ1KIh+jY5ZseC1dVRMnwt7cNQHIMctjCdY2WYNzjJu6xzURNzRLUT36FCDxUaSjeja5Pk34kwC7qHNDvyosWCfbKjHxPL5ZALYucXewMlZrMyYgXrD3awpSvumjB5nIEz6htCd+Lf9VDeTIzFAaqE7BqfgvNwxGSyS7+jzViFJg3XsDKHCKcHeXUos3SuRpreo1fUrgYX7aW5tldDUXo/15tqUU/+m6OtT7qiTTEo26+2HORvqAYMeI/aiTOcVmCzlNYdgB+hK19m2RfgAAAAAAl80VgaC1KTgAAaUC0wsAAHb+8MixxGf7AgAAAAAEWVo=', 'base64');
  const want = Buffer.concat([Buffer.from('Silinx gowin_pack '.repeat(40)), ...[0, 1, 2].map(() => Buffer.from([...Array(256).keys()])), Buffer.from('end')]);
  assert.ok(Buffer.from(unxz(xz)).equals(want));
  assert.equal(unxz(Buffer.from('/Td6WFoAAATm1rRGAAAAABzfRCEftvN9AQAAAAAEWVo=', 'base64')).length, 0);
  assert.throws(() => unxz(new Uint8Array(16)), /not an \.xz file/);
});

test('MessagePack: maps as Map, tuple keys as their numbers joined, the integers, strings, bin, arrays, nil and booleans', () => {
  // {1: [1, -1, 300, -300], "a": {(2, -3): "x"}, "b": b"\x01\x02", "n": None, "t": True, "f": 1.5}
  const bytes = Uint8Array.from([0x86, 0x01, 0x94, 0x01, 0xFF, 0xCD, 0x01, 0x2C, 0xD1, 0xFE, 0xD4, 0xA1, 0x61, 0x81, 0x92, 0x02, 0xFD, 0xA1, 0x78,
    0xA1, 0x62, 0xC4, 0x02, 0x01, 0x02, 0xA1, 0x6E, 0xC0, 0xA1, 0x74, 0xC3, 0xA1, 0x66, 0xCB, 0x3F, 0xF8, 0, 0, 0, 0, 0, 0]);
  const m = unpack(bytes);
  assert.deepEqual(m.get(1), [1, -1, 300, -300]);
  assert.equal(m.get('a').get('2,-3'), 'x');
  assert.deepEqual([...m.get('b')], [1, 2]);
  assert.deepEqual([m.get('n'), m.get('t'), m.get('f')], [null, true, 1.5]);
  assert.throws(() => unpack(Uint8Array.from([0xC1])), /msgpack: type 0xc1/);
});

test('the fuse tables: a record\'s features all present, a negative one absent, 0 the end; a code of 0 is none', () => {
  const table = new Map([['1,2,0,9', [[0, 1]]], ['1,-3', [[2, 2]]], ['4', [[3, 3]]]]);
  assert.deepEqual(tableFuses(new Set([1, 2]), table), [[0, 1], [2, 2]]);
  assert.deepEqual(tableFuses(new Set([1, 2, 3, 4]), table), [[0, 1], [3, 3]]);
  const db = { logicinfo: new Map([['IOB', new Map([['0,1', 0], ['0,2', 7]])]]) }, a = new Set();
  addAttrVal(db, 'IOB', a, 0, 1); addAttrVal(db, 'IOB', a, 0, 2);
  assert.deepEqual([...a], [7]);
});

test('the package\'s files: Apicula\'s wheel in its resources, the GW1N-9C\'s database in the wheel, read as gowin_pack reads it', async () => {
  const xz = await database();
  const db = loadChipdb(xz);
  assert.deepEqual([db.rows, db.cols, db.simplio_rows, db.cmd_hdr.length, db.cmd_ftr.length], [29, 47, [9, 27], 10, 6]);
  assert.equal(db.tileAt(1, 1).get('width'), 60);
  assert.ok(db.bankTiles.size >= 4);
  // (the tar and zip readers on bytes of their own: a file found by its name, stored)
  const header = name => { const h = new Uint8Array(512); h.set(Buffer.from(name)); h.set(Buffer.from('00000000003\0'), 124); h[156] = 0x30; return h; };
  const tar = new Uint8Array(2048); tar.set(header('x/a.txt')); tar.set(Buffer.from('abc'), 512);
  assert.deepEqual([...tarFind([tar.subarray(0, 700), tar.subarray(700)], /a\.txt$/).bytes], [...Buffer.from('abc')]);
  assert.equal(tarFind([tar], /b\.txt$/), null);
  await assert.rejects(zipEntry(new Uint8Array(30), 'x'), /not a zip/);
});

test('gowin_pack on the gates example\'s routed design: Apicula 0.32\'s .fs, byte for byte; its text\'s shape', async () => {
  const routed = fs.readFileSync(new URL('gates.routed.json', FIX));
  assert.equal(sha(routed), REF.examples.gates.routed);
  const fsText = gowinPack(JSON.parse(routed), loadChipdb(await database()));
  assert.equal(fsText.length, REF.examples.gates.fsBytes);
  assert.equal(sha(fsText), REF.examples.gates.fs);
  const lines = fsText.trimEnd().split('\n');
  assert.ok(lines.every(l => /^[01]+$/.test(l)));
  assert.equal(lines[0], '1'.repeat(160));
});

test('io.nextpnr.gowin\'s pack: the same .fs from the routed text; a netlist not nextpnr-himbaechel-gowin\'s refused', async () => {
  const io = nextpnrGowinNode();
  const routed = fs.readFileSync(new URL('gates.routed.json', FIX), 'utf8');
  assert.equal(sha(await io.pack(routed, 'GW1N-9C')), REF.examples.gates.fs);
  assert.throws(() => gowinPack({ modules: { top: { settings: {} } } }, null), /only netlists made by nextpnr-himbaechel-gowin/);
  await assert.rejects(io.pack(routed, 'GW9X-1'), /no chip database of the GW9X-1 in apycula-/);
});
